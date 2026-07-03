// Compact text summary of the encounter battle map's token staging, injected into
// narration prompts so described distances/movement stay consistent with the map
// players see (wiki/plans/mapview.md — the map is a static backdrop, so this is the
// STARTING staging, not per-turn state).

import type { Encounter2DLabel, Encounter2DMap } from "@/types/encounter-map-2d"

// Standard battle-map scale. board.cellSize is render pixels, not world scale.
const FEET_PER_CELL = 5
// A label only reads as "nearby" within this many cells of a token.
const NEAR_LABEL_MAX_CELLS = 5

type Point = { x: number; y: number }

/** Grid (Chebyshev) distance in cells — matches square-grid movement. */
function cellDistance(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))
}

function nearestLabel(point: Point, labels: Encounter2DLabel[]): Encounter2DLabel | undefined {
  const sorted = [...labels].sort((a, b) => cellDistance(point, a) - cellDistance(point, b))
  const closest = sorted[0]
  return closest && cellDistance(point, closest) <= NEAR_LABEL_MAX_CELLS ? closest : undefined
}

function feet(cells: number): string {
  return `${cells} cell${cells === 1 ? "" : "s"} (~${cells * FEET_PER_CELL} ft)`
}

/**
 * Returns a short prompt-ready description of where each token starts on the
 * encounter's battle map, with pairwise party↔NPC distances, or null when the
 * map has no usable token placements.
 */
export function buildMapSpatialContext(
  map: Encounter2DMap,
  tokens: {
    /** Player characters in party-slot order (slot 0 first). */
    party: Array<{ name: string }>
    /** NPC display names keyed by the npcId used in the map's npcStarts. */
    npcs: Record<string, { name: string }>
  }
): string | null {
  const partyTokens = map.partySlots
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .flatMap((slot) => {
      const member = tokens.party[slot.slotIndex]
      return member ? [{ name: member.name, x: slot.x, y: slot.y }] : []
    })
  const npcTokens = map.npcStarts.map((start) => ({
    name: tokens.npcs[start.npcId]?.name ?? start.npcId,
    x: start.x,
    y: start.y,
  }))
  if (partyTokens.length === 0 && npcTokens.length === 0) return null

  const lines: string[] = []
  lines.push(`The players see a top-down battle map of this encounter (square grid, 1 cell = ${FEET_PER_CELL} ft). Starting positions:`)
  for (const token of [...partyTokens.map((t) => ({ ...t, kind: "party" })), ...npcTokens.map((t) => ({ ...t, kind: "NPC" }))]) {
    const label = nearestLabel(token, map.labels)
    lines.push(`- ${token.name} (${token.kind}) at cell (${token.x}, ${token.y})${label ? ` near "${label.text}"` : ""}`)
  }
  for (const pc of partyTokens) {
    for (const npc of npcTokens) {
      lines.push(`- Distance ${pc.name} to ${npc.name}: ${feet(cellDistance(pc, npc))}`)
    }
  }
  return lines.join("\n")
}
