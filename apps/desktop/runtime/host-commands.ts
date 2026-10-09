import { z } from "zod"
import type { HostedSummary } from "../../../lib/host/server"
import type { Hero } from "./heroes"

// Hosting a game on the website. Rust adds the Keychain token to each command, as for account commands.
const token = z.string().optional()
const id = z.string().min(1).max(100)
export const hostCommandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("hostList"), token }),
  // The host's character: a premade of the adventure, or a hero from the roster by id.
  z.object({ kind: z.literal("hostCreate"), planId: id, characterId: id, token }),
  z.object({ kind: z.literal("hostState"), adventureId: id, token }),
  z.object({ kind: z.literal("hostStart"), adventureId: id, token }),
  z.object({
    kind: z.literal("hostAct"),
    adventureId: id,
    turnId: id,
    action: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("reply"), characterId: id, text: z.string().trim().min(1).max(4000) }),
      z.object({ kind: z.literal("roll"), characterId: id, result: z.number().int().min(1).max(20) }),
      z.object({ kind: z.literal("continue") }),
    ]),
    token,
  }),
])
export type HostCommand = z.infer<typeof hostCommandSchema>

export type HostedJob = { _id: string; turnId: string; kind: "reply" | "roll" | "continue"; characterId?: string; status: "queued" | "running" | "done" | "failed"; error?: string; createdAt: number }
export type HostedState = { adventure: Record<string, unknown> & { _id: string; status?: string }; turn: (Record<string, unknown> & { _id: string }) | null; jobs: HostedJob[]; summary: HostedSummary }
export type HostResponse = { hosted?: HostedSummary[]; created?: HostedSummary; state?: HostedState; error?: string }

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
        const hero = heroes().find((h) => h.id === command.characterId)
        // Roster heroes travel as their sheet, without the stock figure and painting that only this app uses.
        const character = hero ? { sheet: (({ figure: _f, painted: _p, ...sheet }) => sheet)(hero) } : { premadeId: command.characterId }
        return { created: ((await call("/api/desktop/host", { planId: command.planId, character })) as { hosted: HostedSummary }).hosted }
      }
      case "hostState":
        return { state: (await call(`/api/desktop/host/${command.adventureId}`)) as HostedState }
      case "hostStart":
        await call(`/api/desktop/host/${command.adventureId}`, { action: "start" })
        return { state: (await call(`/api/desktop/host/${command.adventureId}`)) as HostedState }
      case "hostAct":
        await call(`/api/desktop/host/${command.adventureId}/jobs`, { op: "queue", turnId: command.turnId, ...command.action })
        return { state: (await call(`/api/desktop/host/${command.adventureId}`)) as HostedState }
    }
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Hosting failed." }
  }
}
