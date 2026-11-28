import {
  type GuestSeat,
  guestSeat,
  guestSeats,
  hostWaits,
  hostWatches,
  openLeft,
  openSeats,
  seatingOf,
  sheetId,
} from "@d20/gm-core/host/seating"
import type { Doc } from "@/convex/_generated/dataModel"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { toPCTemplate } from "@/lib/utils/character-mapping"
import type { PCTemplate } from "@/types/character"

// Server only. The heroes a hosted game holds for invited players.
// Seating policy logic lives in @d20/gm-core/host/seating so Convex mutations and server helpers share one source of truth.

type Seat = NonNullable<NonNullable<Doc<"adventures">["host"]>["seats"]>[number]

export { guestSeat, guestSeats, hostWaits, hostWatches, openLeft, openSeats, seatingOf, sheetId, type GuestSeat }

/** The message a Convex function threw, without the request id and stack around it. */
export const thrownMessage = (error: unknown, fallback: string) => /Uncaught Error: (.+?)(\n|$)/.exec(String(error))?.[1] ?? fallback

/** A held seat's hero: the sheet from the host's roster, or the adventure's premade. */
export async function seatHero(seat: Seat, premades: PCTemplate[] = []): Promise<PCTemplate | null> {
  if (!seat.key) return premades.find((pc) => pc.id === seat.id) ?? null
  return toPCTemplate(await readJsonFromS3(seat.key).catch(() => null))
}
