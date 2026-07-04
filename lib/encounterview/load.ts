// Server-side read of a stored per-turn 3D scene spec. Strict parse; any failure
// (missing, schema drift) returns null so the caller silently regenerates.

import { readJsonFromS3 } from "@/lib/s3-utils"
import type { EncounterScene3D } from "@/types/encounter-scene-3d"
import { encounterScene3DSchema } from "@/types/encounter-scene-3d"
import { getEncounterScene3DStorageKey } from "./generate"

export async function loadEncounterScene3D(settingId: string, adventureId: string, turnId: string): Promise<EncounterScene3D | null> {
  try {
    const raw = await readJsonFromS3(getEncounterScene3DStorageKey(settingId, adventureId, turnId))
    return encounterScene3DSchema.parse(raw)
  } catch {
    return null
  }
}
