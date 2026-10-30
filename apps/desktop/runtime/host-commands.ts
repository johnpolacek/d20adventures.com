import type { AdventureRecord, TurnRecord } from "@d20/gm-core"
import { z } from "zod"
import type { GuestHero, HostedSummary } from "../../../lib/host/server"
import type { Hero } from "./heroes"
import { selfRunning } from "./host"

// Hosting a game on the website. Rust adds the Keychain token to each command, as for account commands.
const token = z.string().optional()
const id = z.string().min(1).max(100)
export const hostCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hostList"), token }),
  // The host's characters, the heroes held for invited players, and AI heroes: premades of the adventure, or roster
  // heroes by id.
  // open is how many more seats take a guest's own hero. They are seated at once, unless approve is set: then the
  // host answers each one. Without a character, guests choose among the invited heroes and the host plays one they
  // leave, or with watch the host has no hero.
  z.object({
    kind: z.literal("hostCreate"),
    planId: id,
    characterIds: z.array(id).max(8).default([]),
    invites: z.array(id).max(8).default([]),
    ais: z.array(id).max(8).default([]),
    open: z.number().int().min(0).max(8).default(0),
    approve: z.boolean().default(false),
    watch: z.boolean().default(false),
    // Where guests choose first, how many heroes each guest may take.
    each: z.number().int().min(1).max(8).optional(),
    token,
  }),
  // The host removes a seated guest before the game starts, with an optional note for them.
  z.object({ kind: z.literal("hostRemove"), adventureId: id, userId: id, note: z.string().trim().max(300).optional(), token }),
  // A guest's hero sheet, for one asking to join or one at the table.
  z.object({ kind: z.literal("hostSheet"), adventureId: id, userId: id, token }),
  // The host's answer to a guest asking for an open seat. A rejection may carry a note for the guest.
  z.object({ kind: z.literal("hostAnswer"), adventureId: id, userId: id, approve: z.boolean(), note: z.string().trim().max(300).optional(), token }),
  z.object({ kind: z.literal("hostState"), adventureId: id, token }),
  // The host says something in the table chat.
  z.object({ kind: z.literal("hostChat"), adventureId: id, text: z.string().trim().min(1).max(1000), token }),
  // Where guests chose first, the heroes nobody chose that go to AI. The rest are the host's.
  z.object({ kind: z.literal("hostStart"), adventureId: id, ais: z.array(id).max(8).optional(), token }),
  // The host deletes the game, with its turns, chat, and GM jobs.
  z.object({ kind: z.literal("hostDelete"), adventureId: id, token }),
  z.object({
    kind: z.literal("hostAct"),
    adventureId: id,
    turnId: id,
    action: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("reply"), characterId: id, text: z.string().trim().min(1).max(4000) }),
      z.object({ kind: z.literal("roll"), characterId: id, result: z.number().int().min(1).max(20) }),
      z.object({ kind: z.literal("skip"), characterId: id }),
      z.object({ kind: z.literal("continue") }),
      // Replies the host's GM offers for the hero's turn. They come back on the job, by the id returned here.
      z.object({ kind: z.literal("suggest"), characterId: id }),
    ]),
    token,
  }),
])
export type HostCommand = z.infer<typeof hostCommandSchema>

export type HostedJob = {
  _id: string
  turnId: string
  kind: "reply" | "roll" | "continue" | "suggest" | "skip"
  characterId?: string
  status: "queued" | "running" | "done" | "failed"
  error?: string
  // A finished suggest job's replies.
  suggestions?: { label: string; text: string }[]
  createdAt: number
}
// A hosted game as the website keeps it, and who is asking, so the play view knows which heroes are theirs. A
// website from before table chat sends no chat.
export type HostedState = {
  adventure: AdventureRecord & { status?: string; currentTurnId?: string }
  turn: TurnRecord | null
  jobs: HostedJob[]
  chat?: { from: string; text: string; at: number }[]
  summary: HostedSummary
  userId: string
}
export type HostResponse = { hosted?: HostedSummary[]; created?: HostedSummary; state?: HostedState; sheet?: GuestHero; jobId?: string; error?: string }

export async function hostCommand(command: HostCommand, site: string, heroes: () => Hero[], fetchImpl: typeof fetch = fetch): Promise<HostResponse> {
  if (!command.token) return { error: "Link this computer to your D20 Adventures account to host a game." }
  const call = async (path: string, body?: unknown) => {
    const res = await fetchImpl(`${site}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${command.token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    }).catch(() => null)
    if (!res) throw new Error("D20 Adventures cannot be reached.")
    const json = (await res.json().catch(() => ({}))) as { error?: string }
    if (!res.ok) throw new Error(json.error ?? "The website could not do that.")
    return json
  }
  try {
    switch (command.kind) {
      case "hostList":
        return { hosted: ((await call("/api/desktop/host")) as { hosted: HostedSummary[] }).hosted }
      case "hostCreate": {
        const roster = heroes()
        // Roster heroes travel as their sheet, without the stock figure and painting that only this app uses.
        const character = (characterId: string) => {
          const hero = roster.find((h) => h.id === characterId)
          return hero ? { sheet: (({ figure: _f, painted: _p, ...sheet }) => sheet)(hero) } : { premadeId: characterId }
        }
        const body = {
          planId: command.planId,
          characters: command.characterIds.map(character),
          // An older website takes the host's one character.
          character: command.characterIds[0] ? character(command.characterIds[0]) : undefined,
          invites: command.invites.map(character),
          ais: command.ais.map(character),
          open: command.open,
          approve: command.approve,
          watch: command.watch,
          each: command.each,
        }
        return { created: ((await call("/api/desktop/host", body)) as { hosted: HostedSummary }).hosted }
      }
      case "hostState":
        return { state: (await call(`/api/desktop/host/${command.adventureId}`)) as HostedState }
      case "hostSheet":
        return { sheet: ((await call(`/api/desktop/host/${command.adventureId}`, { action: "sheet", userId: command.userId })) as { sheet: GuestHero }).sheet }
      case "hostRemove":
        await call(`/api/desktop/host/${command.adventureId}`, { action: "remove", userId: command.userId, note: command.note })
        return { state: (await call(`/api/desktop/host/${command.adventureId}`)) as HostedState }
      case "hostAnswer":
        await call(`/api/desktop/host/${command.adventureId}`, { action: "answer", userId: command.userId, approve: command.approve, note: command.note })
        return { state: (await call(`/api/desktop/host/${command.adventureId}`)) as HostedState }
      case "hostDelete":
        await call(`/api/desktop/host/${command.adventureId}`, { action: "delete" })
        return { hosted: ((await call("/api/desktop/host")) as { hosted: HostedSummary[] }).hosted }
      case "hostChat":
        await call(`/api/desktop/host/${command.adventureId}`, { action: "chat", text: command.text })
        return { state: (await call(`/api/desktop/host/${command.adventureId}`)) as HostedState }
      case "hostStart": {
        await call(`/api/desktop/host/${command.adventureId}`, { action: "start", ais: command.ais })
        const state = (await call(`/api/desktop/host/${command.adventureId}`)) as HostedState
        // An opening turn that belongs to an NPC or AI hero runs on its own.
        if (!state.turn || !selfRunning(state.turn.characters)) return { state }
        await call(`/api/desktop/host/${command.adventureId}/jobs`, { op: "queue", turnId: state.turn._id, kind: "continue" }).catch(() => {})
        return { state: (await call(`/api/desktop/host/${command.adventureId}`)) as HostedState }
      }
      case "hostAct": {
        const { jobId } = (await call(`/api/desktop/host/${command.adventureId}/jobs`, { op: "queue", turnId: command.turnId, ...command.action })) as { jobId?: string }
        return { jobId, state: (await call(`/api/desktop/host/${command.adventureId}`)) as HostedState }
      }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Hosting failed." }
  }
}
