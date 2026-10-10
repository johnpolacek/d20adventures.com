import type { Doc } from "@/convex/_generated/dataModel"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { toPCTemplate } from "@/lib/utils/character-mapping"
import type { PCTemplate } from "@/types/character"

// Server only. The heroes a hosted game holds for invited players.

type Seated = Pick<Doc<"adventures">, "host" | "players">
type Seat = NonNullable<NonNullable<Doc<"adventures">["host"]>["seats"]>[number]

/** A character's sheet id, from its id or from its key in an account. */
export const sheetId = (characterId: string) => characterId.split("/").pop()?.replace(".json", "") ?? ""

/** The held seats nobody has taken yet. */
export const openSeats = (adventure: Seated): Seat[] => (adventure.host?.seats ?? []).filter((s) => !adventure.players?.some((p) => sheetId(p.characterId) === s.id))

/** A held seat's hero: the sheet from the host's roster, or the adventure's premade. */
export async function seatHero(seat: Seat, premades: PCTemplate[] = []): Promise<PCTemplate | null> {
  if (!seat.key) return premades.find((pc) => pc.id === seat.id) ?? null
  return toPCTemplate(await readJsonFromS3(seat.key).catch(() => null))
}
