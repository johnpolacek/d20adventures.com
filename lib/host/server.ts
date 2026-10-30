import type { Store } from "@d20/gm-core"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { assertPlayerCharacterControl } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"
import { serverStore } from "@/lib/gm-server/store"
import { hostWaits, hostWatches, openLeft, openSeats } from "@/lib/host/seats"
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

/**
 * Hosts a game with the host's characters and AI heroes seated, a seat held for each invited hero, and open seats for
 * guests' own heroes. AI heroes are the host's, played by the host's app. Without a character of their own, guests choose among the invited heroes and the host plays one they leave, or with
 * watch the host has no hero and the guests play.
 */
export async function createHostedAdventure(args: {
  userId: string
  deviceId: Id<"devices">
  planId: string
  characters?: HostCharacter[]
  invites?: HostCharacter[]
  ais?: HostCharacter[]
  open?: number
  // Whether the host approves each guest's own hero. Otherwise an open seat takes the guest at once.
  approve?: boolean
  watch?: boolean
  // Where guests choose first, how many heroes each guest may take.
  each?: number
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
  const mine = (args.characters ?? []).map(resolve)
  const held = (args.invites ?? []).map(resolve)
  const ais = (args.ais ?? []).map(resolve)
  const watch = Boolean(args.watch) && !mine.length
  if (!mine.length && !watch && held.length < 2) throw new HostError(400, "Choose a hero for yourself, or invite at least two.")
  const ids = [...mine.map((h) => h.id), ...held.map((h) => h.id), ...ais.map((h) => h.id)]
  if (new Set(ids).size !== ids.length) throw new HostError(400, "A hero can join the party only once.")
  const open = args.open ?? 0
  if (!Number.isInteger(open) || open < 0) throw new HostError(400, "The open seats are not valid.")
  if (watch && held.length + open < 1) throw new HostError(400, "Invite a hero to watch them play.")
  if (open && !manifest.availableCharacterOptions) throw new HostError(400, `${manifest.title} takes its own heroes only.`)
  if (manifest.maxPlayers && ids.length + open > manifest.maxPlayers) throw new HostError(400, `${manifest.title} seats ${manifest.maxPlayers} at most.`)
  const keyOf = (id: string) => `characters/${args.userId}/${id}.json`
  // A held roster hero's sheet waits in the host's account for the guest who takes the seat.
  await Promise.all([...mine, ...ais, ...held.filter((h) => !h.premade)].map((h) => updateJsonOnS3(keyOf(h.id), h.pc)))
  const seats = held.map((h) => ({ id: h.id, name: h.pc.name, ...(h.premade ? {} : { key: keyOf(h.id) }) }))
  const adventureId = await convex.mutation(api.adventure.createAdventure, {
    planId: args.planId,
    settingId: SETTING,
    ownerId: args.userId,
    runType: "campaign",
    playerIds: [args.userId],
    players: [...mine.map((h) => ({ userId: args.userId, characterId: keyOf(h.id) })), ...ais.map((h) => ({ userId: args.userId, characterId: keyOf(h.id), controlledBy: "ai" as const }))],
    status: "waitingForPlayers",
    title: manifest.title,
    startedAt: Date.now(),
    contentRef,
    currentEncounterId: manifest.startEncounterId,
    adventureSummaryMarkdown: manifest.summary,
  })
  await convex.mutation(api.hosting.setHost, { secret: serverSecret(), adventureId, userId: args.userId, deviceId: args.deviceId, seats, open, approve: args.approve, pick: !mine.length && !watch, ...(args.each ? { each: args.each } : {}) })
  return adventureId
}

/**
 * Where guests choose first, seats every held hero nobody chose as the game starts: the host's, or AI heroes where ais
 * names them. Without ais the host plays the first and AI the rest. A host who watches needs a guest at the table first.
 */
export async function seatHost(adventure: Doc<"adventures">, ais?: string[]) {
  const host = adventure.host
  if (hostWatches(adventure) && !adventure.players?.some((p) => p.controlledBy !== "ai")) throw new HostError(409, "Nobody has joined yet.")
  if (!host || !hostWaits(adventure)) return adventure
  const left = openSeats(adventure)
  if (!left.length) throw new HostError(409, "No hero is left for the host.")
  const ai = (id: string) => (ais ? ais.includes(id) : id !== left[0].id)
  if (left.every((s) => ai(s.id)) && !adventure.players?.some((p) => p.controlledBy !== "ai")) throw new HostError(409, "Nobody plays a hero yet.")
  const premades = left.some((s) => !s.key) ? (await loadWikiAdventureRuntime(adventure.settingId, adventure.planId)).artifacts.characterSheets.premadeCharacters : {}
  for (const seat of left) {
    const characterId = seat.key ?? `characters/${host.userId}/${seat.id}.json`
    if (!seat.key) {
      const pc = toPCTemplate(premades[seat.id]?.sheet)
      if (!pc) throw new HostError(500, `${seat.name}'s sheet could not be read.`)
      await updateJsonOnS3(characterId, pc)
    }
    await convex.mutation(api.hosting.seatHost, { secret: serverSecret(), adventureId: adventure._id, userId: host.userId, characterId, ...(ai(seat.id) ? { ai: true } : {}) })
  }
  return (await convex.query(api.adventure.getAdventureById, { adventureId: adventure._id })) ?? adventure
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
    // The guests at the table, whose hero sheets the host may open, each once with every hero they play.
    guests: guestsOf(adventure, names),
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
    seats: hostWaits(adventure) ? [] : openSeats(adventure).map((s) => ({ id: s.id, name: s.name, invite: `${inviteUrl(origin, adventure)}?as=${s.id}` })),
    // Where guests choose first and the host plays a hero they leave: the heroes nobody has chosen yet.
    left: hostWaits(adventure) ? openSeats(adventure).map((s) => s.name) : [],
    // The same heroes by id, which the host seats as their own or as AI heroes at Start.
    unchosen: hostWaits(adventure) ? openSeats(adventure).map((s) => ({ id: s.id, name: s.name })) : [],
    // The host has no hero and watches the guests play.
    watching: hostWatches(adventure),
    updatedAt: adventure.updatedAt,
  }
}
export type HostedSummary = Awaited<ReturnType<typeof hostedSummary>>

function guestsOf(adventure: Doc<"adventures">, names: string[]) {
  const guests = new Map<string, { userId: string; name: string; heroes: number }>()
  for (const [i, p] of (adventure.players ?? []).entries()) {
    if (!names[i] || p.userId === adventure.host?.userId) continue
    const guest = guests.get(p.userId)
    guests.set(p.userId, guest ? { ...guest, name: `${guest.name} & ${names[i]}`, heroes: guest.heroes + 1 } : { userId: p.userId, name: names[i], heroes: 1 })
  }
  return [...guests.values()]
}

/** A guest's hero as the host reads it: the hero they ask to bring, or the one they are seated with. */
export async function guestHero(adventure: Doc<"adventures">, userId: string) {
  const key = adventure.host?.requests?.find((r) => r.userId === userId)?.characterId ?? adventure.players?.find((p) => p.userId === userId && p.controlledBy !== "ai")?.characterId
  const pc = key?.startsWith("characters/") ? toPCTemplate(await readJsonFromS3(key).catch(() => null)) : null
  if (!pc) throw new HostError(404, "That hero's sheet could not be read.")
  const { name, race, archetype, gender, appearance, personality, background, motivation, attributes, skills, specialAbilities, spells, equipment } = pc
  return { name, race, archetype, gender, appearance, personality, background, motivation, attributes, skills, specialAbilities, spells, equipment }
}
export type GuestHero = Awaited<ReturnType<typeof guestHero>>

export type HostedAction =
  | { turnId: string; kind: "reply"; characterId: string; text: string; movement?: unknown }
  | { turnId: string; kind: "roll"; characterId: string; result: number }
  | { turnId: string; kind: "skip"; characterId: string }
  | { turnId: string; kind: "continue" }
  // Replies the host's GM offers for the player's hero. It changes nothing in the game.
  | { turnId: string; kind: "suggest"; characterId: string }

/** Queues a player's action for the host's GM, after checking the turn is current and the player controls the character. */
export async function queueAction(adventure: Doc<"adventures">, userId: string, action: HostedAction) {
  if (!adventure.host) throw new HostError(400, "This game is not hosted.")
  const turn = await convex.query(api.adventure.getTurnById, { turnId: action.turnId as Id<"turns"> }).catch(() => null)
  if (!turn || turn.adventureId !== adventure._id) throw new HostError(404, "Turn not found.")
  const base = { secret: serverSecret(), adventureId: adventure._id, turnId: turn._id, userId }
  if (action.kind === "continue") return convex.mutation(api.hosting.queueJob, { ...base, kind: "continue" })
  assertPlayerCharacterControl(userId, turn, action.characterId)
  if (action.kind === "suggest") return convex.mutation(api.hosting.queueJob, { ...base, kind: "suggest", characterId: action.characterId })
  if (action.kind === "skip") return convex.mutation(api.hosting.queueJob, { ...base, kind: "skip", characterId: action.characterId })
  if (action.kind === "reply") {
    const text = typeof action.text === "string" ? action.text.trim() : ""
    if (!text || text.length > 4000) throw new HostError(400, "Write an action of up to 4000 characters.")
    return convex.mutation(api.hosting.queueJob, { ...base, kind: "reply", characterId: action.characterId, text, movement: action.movement })
  }
  if (!Number.isInteger(action.result) || action.result < 1 || action.result > 20) throw new HostError(400, "A roll is a whole number from 1 to 20.")
  return convex.mutation(api.hosting.queueJob, { ...base, kind: "roll", characterId: action.characterId, result: action.result })
}
