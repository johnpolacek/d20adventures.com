import type { MapMiniToken } from "@/components/adventure/miniatures-map"
import type { Encounter3DMap, EncounterCharacterRef } from "@/types/adventure-plan"
import type { Character } from "@/types/character"

function getTokenInitials(label: string) {
  const parts = label
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase()
}

export function buildPreviewNpcMapTokens({
  map,
  availableNpcs,
  encounterNpcRefs,
}: {
  map: Encounter3DMap
  availableNpcs: Record<string, Character>
  encounterNpcRefs: EncounterCharacterRef[]
}) {
  const npcRefsById = new Map(encounterNpcRefs.map((entry) => [entry.id, entry]))

  return map.tokenSlots.npc.flatMap((slot) => {
    const character = availableNpcs[slot.npcId]
    const npcRef = npcRefsById.get(slot.npcId)

    if (character) {
      return [
        {
          id: character.id,
          label: character.name,
          shortLabel: getTokenInitials(character.name),
          x: slot.x,
          y: slot.y,
          z: slot.z,
          facing: slot.facing,
          kind: "npc" as const,
          subtitle: npcRef?.behavior || character.behavior || "Encounter NPC",
        } satisfies MapMiniToken,
      ]
    }

    if (!npcRef) return []

    return [
      {
        id: `preview-npc-${npcRef.id}`,
        label: npcRef.id,
        shortLabel: "NPC",
        x: slot.x,
        y: slot.y,
        z: slot.z,
        facing: slot.facing,
        kind: "npc" as const,
        subtitle: npcRef.behavior || "Encounter NPC",
      } satisfies MapMiniToken,
    ]
  })
}
