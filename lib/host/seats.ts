import type { Doc } from "@/convex/_generated/dataModel"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { toPCTemplate } from "@/lib/utils/character-mapping"
import type { PCTemplate } from "@/types/character"

// Server only. The heroes a hosted game holds for invited players.

type Seated = Pick<Doc<"adventures">, "host" | "players">
type Seat = NonNullable<NonNullable<Doc<"adventures">["host"]>["seats"]>[number]

/** The message a Convex function threw, without the request id and stack around it. */
export const thrownMessage = (error: unknown, fallback: string) => /Uncaught Error: (.+?)(\n|$)/.exec(String(error))?.[1] ?? fallback

/** A character's sheet id, from its id or from its key in an account. */
export const sheetId = (characterId: string) => characterId.split("/").pop()?.replace(".json", "") ?? ""

/** How many seats still take a guest's own hero. Every guest whose hero the host did not hold sits in one. */
export function openLeft(adventure: Seated) {
  const host = adventure.host
  if (!host?.open) return 0
  const held = new Set((host.seats ?? []).map((s) => s.id))
  return host.open - (adventure.players ?? []).filter((p) => p.userId !== host.userId && !held.has(sheetId(p.characterId))).length
}

/** Whether the host still waits for a hero: guests choose first, and the host plays a held hero they leave. */
export const hostWaits = (adventure: Seated) => Boolean(adventure.host?.pick && !adventure.players?.some((p) => p.userId === adventure.host?.userId))

/**
 * What a guest sees of the seats: how many take a hero of their own, whether the host approves theirs, whether the
 * host removed them, how many held seats are kept for the host, and their own request with the host's answer.
 */
export function guestSeat(adventure: Seated, userId: string | null | undefined) {
  const host = adventure.host
  const request = userId ? host?.requests?.find((r) => r.userId === userId) : undefined
  const removed = Boolean(userId && host?.removed?.includes(userId))
  const keep = hostWaits(adventure) ? 1 : 0
  return { open: openLeft(adventure), approve: Boolean(host?.approve) || removed, removed, keep, request: request && { name: request.name, status: request.status, note: request.note } }
}
export type GuestSeat = ReturnType<typeof guestSeat>

/** The held seats nobody has taken yet. */
export const openSeats = (adventure: Seated): Seat[] => (adventure.host?.seats ?? []).filter((s) => !adventure.players?.some((p) => sheetId(p.characterId) === s.id))

/** The held seats a guest may take. While the host waits for a hero, the last one is theirs. */
export function guestSeats(adventure: Seated): Seat[] {
  const open = openSeats(adventure)
  return hostWaits(adventure) && open.length < 2 ? [] : open
}

/** A held seat's hero: the sheet from the host's roster, or the adventure's premade. */
export async function seatHero(seat: Seat, premades: PCTemplate[] = []): Promise<PCTemplate | null> {
  if (!seat.key) return premades.find((pc) => pc.id === seat.id) ?? null
  return toPCTemplate(await readJsonFromS3(seat.key).catch(() => null))
}
