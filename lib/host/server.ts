import type { Store } from "@d20/gm-core"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { assertPlayerCharacterControl } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"
import { serverStore } from "@/lib/gm-server/store"
import { openLeft, openSeats } from "@/lib/host/seats"
import { readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"
import { toPCTemplate } from "@/lib/utils/character-mapping"
import { isLocalWikiAdventure, loadWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"

// Server only. Hosted games keep their state on the website like any adventure, but their GM runs in the host's
// desktop app. These helpers answer that app, which proves itself with its device token.

const SETTING = "realm-of-myr"

export class HostError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
  }
}

// Host and access errors carry their status. Anything else is a server failure.
export const hostErrorResponse = (error: unknown) => {
  const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 500
  return NextResponse.json({ error: error instanceof Error ? error.message : "Host request failed." }, { status })
}

// The site's public origin, for invite links.
export const siteOrigin = (request: Request) => (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "")

export const inviteUrl = (origin: string, adventure: Pick<Doc<"adventures">, "_id" | "settingId" | "planId">) => `${origin}/settings/${adventure.settingId}/${adventure.planId}/${adventure._id}`

/** A character at a hosted table: a premade from the adventure, or a hero sheet from the host's app. */
export type HostCharacter = { premadeId: string } | { sheet: unknown }

/** Hosts a game with the host's character seated, a seat held for each invited hero, and open seats for guests' own heroes. */
export async function createHostedAdventure(args: {
  userId: string
  deviceId: Id<"devices">
  planId: string
  character: HostCharacter
  invites?: HostCharacter[]
  open?: number
  // Whether the host approves each guest's own hero. Otherwise an open seat takes the guest at once.
  approve?: boolean
}) {
  if (!isLocalWikiAdventure(SETTING, args.planId)) throw new HostError(404, "This adventure cannot be hosted.")
  const { artifacts, contentRef } = await loadWikiAdventureRuntime(SETTING, args.planId)
  const manifest = artifacts.manifest
  const resolve = (character: HostCharacter) => {
    if (!character || typeof character !== "object") throw new HostError(400, "The character sheet is not valid.")
    const premade = "premadeId" in character
    const sheet = premade ? artifacts.characterSheets.premadeCharacters[character.premadeId]?.sheet : character.sheet
    if (premade && !sheet) throw new HostError(400, "That character is not in this adventure.")
    const pc = toPCTemplate(sheet)
    const id = premade ? character.premadeId : pc?.id
    if (!pc || !id || !/^[a-z0-9-]{1,80}$/.test(id)) throw new HostError(400, "The character sheet is not valid.")
    return { id, pc, premade }
  }
  const mine = resolve(args.character)
  const held = (args.invites ?? []).map(resolve)
  const ids = [mine.id, ...held.map((h) => h.id)]
  if (new Set(ids).size !== ids.length) throw new HostError(400, "A hero can join the party only once.")
  const open = args.open ?? 0
  if (!Number.isInteger(open) || open < 0) throw new HostError(400, "The open seats are not valid.")
  if (open && !manifest.availableCharacterOptions) throw new HostError(400, `${manifest.title} takes its own heroes only.`)
  if (manifest.maxPlayers && ids.length + open > manifest.maxPlayers) throw new HostError(400, `${manifest.title} seats ${manifest.maxPlayers} at most.`)
  const keyOf = (id: string) => `characters/${args.userId}/${id}.json`
  const characterId = keyOf(mine.id)
  // A held roster hero's sheet waits in the host's account for the guest who takes the seat.
  await Promise.all([mine, ...held.filter((h) => !h.premade)].map((h) => updateJsonOnS3(keyOf(h.id), h.pc)))
  const seats = held.map((h) => ({ id: h.id, name: h.pc.name, ...(h.premade ? {} : { key: keyOf(h.id) }) }))
  const adventureId = await convex.mutation(api.adventure.createAdventure, {
    planId: args.planId,
    settingId: SETTING,
    ownerId: args.userId,
    runType: "campaign",
    playerIds: [args.userId],
    players: [{ userId: args.userId, characterId }],
    status: "waitingForPlayers",
    title: manifest.title,
    startedAt: Date.now(),
    contentRef,
    currentEncounterId: manifest.startEncounterId,
    adventureSummaryMarkdown: manifest.summary,
  })
  await convex.mutation(api.hosting.setHost, { secret: serverSecret(), adventureId, userId: args.userId, deviceId: args.deviceId, seats, open, approve: args.approve })
  return adventureId
}

/** The adventure, if this account hosts it. */
export async function hostedAdventure(adventureId: string, userId: string) {
  const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: adventureId as Id<"adventures"> }).catch(() => null)
  if (!adventure) throw new HostError(404, "Adventure not found.")
  if (adventure.host?.userId !== userId) throw new HostError(403, "You are not hosting this adventure.")
  return adventure
}

async function hostedTurn(turnId: string, userId: string) {
  const turn = await convex.query(api.adventure.getTurnById, { turnId: turnId as Id<"turns"> }).catch(() => null)
  if (!turn) throw new HostError(404, "Turn not found.")
  await hostedAdventure(turn.adventureId, userId)
  return turn
}

// The GM core's store operations the host's app may run, each limited to games it hosts. Creating adventures and
// legacy turns stay with the website.
const STORE_OPS = ["getTurn", "getAdventure", "getTurns", "getTurnByOrder", "submitReply", "updateTurn", "patchAdventure", "commitWikiTurnAdvance"] as const
export type HostStoreOp = (typeof STORE_OPS)[number]
export const isHostStoreOp = (op: unknown): op is HostStoreOp => STORE_OPS.includes(op as HostStoreOp)

export async function runHostStoreOp(op: HostStoreOp, args: Record<string, unknown>, userId: string) {
  if ("turnId" in args) await hostedTurn(String(args.turnId), userId)
  else if ("adventureId" in args) await hostedAdventure(String(args.adventureId), userId)
  else throw new HostError(400, "Store operations need a turn or adventure.")
  if (op === "commitWikiTurnAdvance" && "expectedCurrentTurnId" in args) await hostedTurn(String(args.expectedCurrentTurnId), userId)
  const run = serverStore[op] as (a: unknown) => ReturnType<Store[HostStoreOp]>
  return run(args)
}

/** A hosted game as the host's home screen lists it. */
export async function hostedSummary(adventure: Doc<"adventures">, origin: string) {
  const turn = adventure.currentTurnId ? await convex.query(api.adventure.getTurnById, { turnId: adventure.currentTurnId }).catch(() => null) : null
  const names = await Promise.all(
    (adventure.players ?? []).map(async (p) => {
      const sheet = p.characterId.startsWith("characters/") ? ((await readJsonFromS3(p.characterId).catch(() => null)) as { name?: string } | null) : null
      return sheet?.name ?? p.characterId.split("/").pop()?.replace(".json", "") ?? ""
    })
  )
  return {
    adventureId: adventure._id,
    planId: adventure.planId,
    title: adventure.title,
    status: adventure.status ?? "waitingForPlayers",
    round: turn?.order ?? 0,
    turnTitle: turn?.title ?? "",
    party: names.filter(Boolean),
    // The guests at the table, whose hero sheets the host may open.
    guests: (adventure.players ?? []).map((p, i) => ({ userId: p.userId, name: names[i] })).filter((g) => g.name && g.userId !== adventure.host?.userId),
    players: adventure.playerIds.length,
    invite: inviteUrl(origin, adventure),
    // How many seats the host set aside for guests, held heroes and open ones together, then the held seats nobody
    // has taken, each with the link that joins as that hero.
    held: (adventure.host?.seats?.length ?? 0) + (adventure.host?.open ?? 0),
    // Seats still open to a guest's own hero, their link, and the guests waiting on the host's answer.
    open: openLeft(adventure),
    approval: Boolean(adventure.host?.approve),
    openInvite: `${inviteUrl(origin, adventure)}?as=any`,
    requests: (adventure.host?.requests ?? [])
      .filter((r) => r.status === "pending" && !adventure.playerIds.includes(r.userId))
      .map((r) => ({ userId: r.userId, player: r.player, name: r.name, race: r.race, archetype: r.archetype })),
    seats: openSeats(adventure).map((s) => ({ id: s.id, name: s.name, invite: `${inviteUrl(origin, adventure)}?as=${s.id}` })),
    updatedAt: adventure.updatedAt,
  }
}
export type HostedSummary = Awaited<ReturnType<typeof hostedSummary>>

/** A guest's hero as the host reads it: the hero they ask to bring, or the one they are seated with. */
export async function guestHero(adventure: Doc<"adventures">, userId: string) {
  const key = adventure.host?.requests?.find((r) => r.userId === userId)?.characterId ?? adventure.players?.find((p) => p.userId === userId)?.characterId
  const pc = key?.startsWith("characters/") ? toPCTemplate(await readJsonFromS3(key).catch(() => null)) : null
  if (!pc) throw new HostError(404, "That hero's sheet could not be read.")
  const { name, race, archetype, gender, appearance, personality, background, motivation, attributes, skills, specialAbilities, spells, equipment } = pc
  return { name, race, archetype, gender, appearance, personality, background, motivation, attributes, skills, specialAbilities, spells, equipment }
}
export type GuestHero = Awaited<ReturnType<typeof guestHero>>

export type HostedAction =
  | { turnId: string; kind: "reply"; characterId: string; text: string; movement?: unknown }
  | { turnId: string; kind: "roll"; characterId: string; result: number }
  | { turnId: string; kind: "continue" }

/** Queues a player's action for the host's GM, after checking the turn is current and the player controls the character. */
export async function queueAction(adventure: Doc<"adventures">, userId: string, action: HostedAction) {
  if (!adventure.host) throw new HostError(400, "This game is not hosted.")
  const turn = await convex.query(api.adventure.getTurnById, { turnId: action.turnId as Id<"turns"> }).catch(() => null)
  if (!turn || turn.adventureId !== adventure._id) throw new HostError(404, "Turn not found.")
  const base = { secret: serverSecret(), adventureId: adventure._id, turnId: turn._id, userId }
  if (action.kind === "continue") return convex.mutation(api.hosting.queueJob, { ...base, kind: "continue" })
  assertPlayerCharacterControl(userId, turn, action.characterId)
  if (action.kind === "reply") {
    const text = typeof action.text === "string" ? action.text.trim() : ""
    if (!text || text.length > 4000) throw new HostError(400, "Write an action of up to 4000 characters.")
    return convex.mutation(api.hosting.queueJob, { ...base, kind: "reply", characterId: action.characterId, text, movement: action.movement })
  }
  if (!Number.isInteger(action.result) || action.result < 1 || action.result > 20) throw new HostError(400, "A roll is a whole number from 1 to 20.")
  return convex.mutation(api.hosting.queueJob, { ...base, kind: "roll", characterId: action.characterId, result: action.result })
}
