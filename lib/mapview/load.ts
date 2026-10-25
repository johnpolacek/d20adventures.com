// Public server-side read of a stored encounter map (wiki/plans/mapview.md).
// Maps are adventure content, not secrets — no auth gate; generation stays admin-only.

import { readJsonFromS3 } from "@/lib/s3-utils"
import type { Encounter2DMap } from "@/types/encounter-map-2d"
import { encounter2dMapSchema } from "@/types/encounter-map-2d"
import { getEncounterMap2DStorageKey } from "./generate"

export async function loadEncounterMap2D(settingId: string, adventurePlanId: string, encounterId: string | undefined): Promise<Encounter2DMap | null> {
  if (!encounterId) return null
  try {
    const raw = await readJsonFromS3(getEncounterMap2DStorageKey(settingId, adventurePlanId, encounterId))
    return encounter2dMapSchema.parse(raw)
  } catch {
    return null
  }
}
