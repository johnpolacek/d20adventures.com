// Authored 3D sets, one per location. Each entry is a lazy import so the app's
// bundles only carry the set a page actually renders; `summary` is what the
// brief prompt shows the model when deciding whether an encounter reuses a set.

import type { SetDefinition } from "@/lib/scene-kit/set"

export interface SetManifestEntry {
  id: string
  title: string
  settingId: string
  summary: string
  load: () => Promise<SetDefinition>
}

export const SET_MANIFEST: SetManifestEntry[] = [
  {
    id: "kordavos-outer-gate",
    title: "The Gates of Kordavos",
    settingId: "realm-of-myr",
    summary:
      "Outside the city gatehouse: road, traveler queue with wagons, guard checkpoint with Garlan. Marks: checkpoint, queue, roadside, portal, captain. Cameras: queue, establishing, checkpoint, wagons. Toggle: timeOfDay.",
    load: () => import("./realm-of-myr/kordavos-outer-gate").then((m) => m.kordavosOuterGate),
  },
]

/** Which set an encounter plays on. Populated by the pipeline's resolve stage. */
export const ENCOUNTER_SETS: Record<string, { setId: string; camera: string; toggles?: Record<string, string | boolean> }> = {
  "the-gates-of-kordavos": { setId: "kordavos-outer-gate", camera: "queue" },
}

export function getSetEntry(setId: string): SetManifestEntry | undefined {
  return SET_MANIFEST.find((entry) => entry.id === setId)
}
