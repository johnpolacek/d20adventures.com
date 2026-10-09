import type { Store } from "@d20/gm-core"
import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { assertPlayerCharacterControl } from "@/lib/adventure-access"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"
import { serverStore } from "@/lib/gm-server/store"
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

export const hostErrorResponse = (error: unknown) =>
  error instanceof HostError
    ? NextResponse.json({ error: error.message }, { status: error.status })
    : NextResponse.json({ error: error instanceof Error ? error.message : "Host request failed." }, { status: 500 })

// The site's public origin, for invite links.
export const siteOrigin = (request: Request) => (process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin).replace(/\/$/, "")

export const inviteUrl = (origin: string, adventure: Pick<Doc<"adventures">, "_id" | "settingId" | "planId">) => `${origin}/settings/${adventure.settingId}/${adventure.planId}/${adventure._id}`

/** The host's character: a premade from the adventure, or a hero sheet from the host's app saved to their account. */
export type HostCharacter = { premadeId: string } | { sheet: unknown }

export async function createHostedAdventure(args: { userId: string; deviceId: Id<"devices">; planId: string; character: HostCharacter }) {
  if (!isLocalWikiAdventure(SETTING, args.planId)) throw new HostError(404, "This adventure cannot be hosted.")
  const { artifacts, contentRef } = await loadWikiAdventureRuntime(SETTING, args.planId)
  const manifest = artifacts.manifest
  let sheet: unknown
  let id: string
  if ("premadeId" in args.character) {
    id = args.character.premadeId
    sheet = artifacts.characterSheets.premadeCharacters[id]?.sheet
    if (!sheet) throw new HostError(400, "That character is not in this adventure.")
  } else {
    sheet = args.character.sheet
    id = (sheet as { id?: unknown })?.id as string
  }
  const pc = toPCTemplate(sheet)
  if (!pc || !/^[a-z0-9-]{1,80}$/.test(id)) throw new HostError(400, "The character sheet is not valid.")
  const characterId = `characters/${args.userId}/${id}.json`
  await updateJsonOnS3(characterId, pc)
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
  await convex.mutation(api.hosting.setHost, { secret: serverSecret(), adventureId, userId: args.userId, deviceId: args.deviceId })
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
    players: adventure.playerIds.length,
    invite: inviteUrl(origin, adventure),
    updatedAt: adventure.updatedAt,
  }
}
export type HostedSummary = Awaited<ReturnType<typeof hostedSummary>>

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
