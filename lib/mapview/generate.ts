// Mapview generation helpers — pure functions shared by the server action.
// Pipeline per wiki/plans/mapview.md: scene-kit inference → generateObject against
// encounter2dGenerationSchema → normalize/clamp → deterministic token placement.

import type { Encounter2DGeneration, Encounter2DMap, Encounter2DNpcStart, Encounter2DPartySlot, Encounter2DZone, MapSceneKit } from "@/types/encounter-map-2d"
import { encounter2dMapSchema } from "@/types/encounter-map-2d"
import { formatPieceCatalogForPrompt, getPieceDefinition } from "./piece-catalog"

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function snap(value: number) {
  return Math.round(value)
}

const SCENE_KIT_GUIDANCE: Record<MapSceneKit, string> = {
  generic: "A compact encounter space with one focal landmark, asymmetric cover clusters, and clear movement lanes.",
  checkpoint: "A fortified checkpoint: a stone-wall or fence line across a lane, a gate or gap as the choke point, crates and barrels as inspection dressing.",
  city_gate: "One dominant gate piece as the focal point, stone-wall runs flanking it, market stalls, wagons, and barrels dressing the approach. Avoid parallel repeated wall rows.",
  courtyard: "A formal courtyard: statue or well at the center, pillars in rows for colonnades, low fences or ruined walls framing the space.",
  ruins: "Broken ruins: ruined-wall fragments at odd angles, rubble patches, a pillar or statue as a surviving landmark, asymmetric cover lines.",
  shrine: "A sacred site: altar as the focal piece on one end, a processional lane toward it, statues or pillars flanking, campfire or rubble as dressing.",
  camp: "An encampment: tents clustered around a central campfire, crate stacks and barrels as supply dressing, a fence or wagon marking the perimeter.",
  road: "A travel route: a clear lane down the map, trees or boulders banking the sides, a wagon as the traveler focal point, ambush cover near the lane.",
  crypt: "A tomb: altar as the sarcophagus focal piece, pillars in aisles, rubble and pit hazards, oppressive stone-wall boundaries.",
  cavern: "A cave chamber: boulder and rock-cluster spurs, a pond or pit as the environmental hook, choke points between rock groups.",
  forest: "Deep woods: dense tree clusters (oak/pine) framing the space, bushes and boulders as undergrowth, a trail winding through toward the destination, small clearings as playable space.",
  grove: "A sacred clearing: monoliths arranged in a circle or arc as the focal point, trees ringing the perimeter, a trail entering the clearing.",
}

export function buildMap2DPrompt(args: {
  sectionTitle?: string
  sceneTitle?: string
  encounterTitle?: string
  encounterIntro?: string
  encounterInstructions?: string
  npcIds: string[]
  sceneKit: MapSceneKit
  ownerPrompt?: string
  existingMapJson?: string
}) {
  return `You are designing a top-down 2D battle map for a fantasy tabletop adventure app, in the style of a standard D&D encounter map.

Return a single JSON object matching the requested schema. The map is a static scene backdrop — it shows where the encounter takes place, not tactical state.

The board is a square grid (gridType "square"). Compose with pieces from this standard catalog ONLY (pieceId must be one of these ids). Footprints are width x height in grid cells; resizable pieces may set width/height, others should omit them:

${formatPieceCatalogForPrompt()}

Requirements:
- Board: pick columns (12-24) and rows (10-16) that fit the location; set cellSize to 48; pick the ground that matches the location.
- Strong composition: one clear focal area, a dressed perimeter, and 2-3 thematic landmarks. Avoid a large empty center — break it up with cover clusters.
- Cluster 2-4 related pieces (crates with barrels, trees in groves, rubble near ruined walls) instead of even spacing.
- Pieces must not overlap each other except intentional layering (rubble under ruined walls is fine). Keep placements inside the board.
- Use walls (line segments, in cell coordinates) only for long structural runs; use stone-wall/ruined-wall pieces for short fragments.
- Zones are INVISIBLE placement hints (not drawn): include 1 spawn zone where the party enters and 1 objective/interest zone at the focal area, as rectangles in cell coordinates.
- Labels ARE drawn as large text on the map — this is how the player reads the scene. Add 2-4 short labels: name the location/landmarks AND mark key narrative cues in place (e.g. "The Noise", "Watching Eyes", "To the Old Stones"). Put each label in open space near what it describes.
- NEVER put a character's name in a label — labels name PLACES and features, not people. Use generic, evocative place names: "Forest Path" not "Thalbern's Path"; "The Clearing" not "Wollandora's Grove"; "Ambush Point" not "Owlbear's Den".
- Choose "sceneKit" to match the NARRATIVE, not just keywords — a keyword heuristic suggests "${args.sceneKit}" (${SCENE_KIT_GUIDANCE[args.sceneKit]}), but override it freely if the story reads differently (e.g. moving through dark woods = forest, an ancient stone circle = grove).
- Set board.lighting from the narrative's time of day and mood: "night" for darkness/moonlight scenes, "dusk" for twilight, "day" otherwise.
- Tell the story spatially: use trail pieces to show the route the characters travel (add a label where it leads, even offscreen).
- Trails must form ONE continuous route: chain trail segments so each starts exactly where the previous ends. A trail runs along the centerline of its LONG axis — use a wide box (e.g. 5x1) for a horizontal run and a tall box (e.g. 1x5) for a vertical run; never rotate trails. Example route from bottom-left to top-right: {"pieceId":"trail","x":1,"y":11,"width":1,"height":3} then {"pieceId":"trail","x":1,"y":8,"width":6,"height":1} then {"pieceId":"trail","x":7,"y":2,"width":1,"height":6}. Never scatter isolated trail pieces.
- Forests and wilderness must feel DENSELY wooded: use MANY tree pieces (aim for 12+ tree pieces in a forest), a mix of tree-oak and tree-pine. Each tree piece renders as a small grove of several trees, so a 3x3 tree = a dense thicket. Ring the entire perimeter with overlapping tree clusters and scatter more trees through the interior, leaving only the trail and small clearings open.
- Keep the summary to one sentence describing the scene.
- Ground the layout in the encounter text below; convert story into spatial staging.

Encounter context:
- Section: ${args.sectionTitle || "Unknown"}
- Scene: ${args.sceneTitle || "Unknown"}
- Encounter: ${args.encounterTitle || "Unknown"}
- Intro: ${args.encounterIntro || "None"}
- Instructions: ${args.encounterInstructions || "None"}
- NPC ids present: ${args.npcIds.join(", ") || "None"}

${args.existingMapJson ? `Existing map JSON to revise (keep what works, change what the request asks):\n${args.existingMapJson}\n` : ""}${args.ownerPrompt ? `Designer request:\n${args.ownerPrompt}` : ""}`
}

/** Clamp and snap a generated map onto the board; drop pieces that cannot fit. */
export function normalizeGeneration(generation: Encounter2DGeneration): Encounter2DGeneration {
  const columns = clamp(snap(generation.board.columns), 8, 32)
  const rows = clamp(snap(generation.board.rows), 8, 24)

  const pieces = generation.pieces
    .filter((piece): piece is NonNullable<typeof piece> => Boolean(piece))
    .map((piece, index) => {
      const def = getPieceDefinition(piece.pieceId)
      if (!def) return null
      const width = clamp(snap(piece.width ?? def.footprint.width), 1, columns)
      const height = clamp(snap(piece.height ?? def.footprint.height), 1, rows)
      return {
        ...piece,
        id: piece.id || `piece-${index}`,
        x: clamp(snap(piece.x), 0, columns - width),
        y: clamp(snap(piece.y), 0, rows - height),
        width: def.resizable ? width : def.footprint.width,
        height: def.resizable ? height : def.footprint.height,
        rotation: (((Math.round((piece.rotation ?? 0) / 90) * 90) % 360) + 360) % 360,
      }
    })
    .filter((piece): piece is NonNullable<typeof piece> => piece !== null)

  return {
    ...generation,
    board: { ...generation.board, columns, rows, gridType: "square" },
    pieces,
    walls: generation.walls.filter(Boolean).map((wall, index) => ({
      ...wall,
      id: wall.id || `wall-${index}`,
      x1: clamp(snap(wall.x1), 0, columns),
      y1: clamp(snap(wall.y1), 0, rows),
      x2: clamp(snap(wall.x2), 0, columns),
      y2: clamp(snap(wall.y2), 0, rows),
    })),
    zones: generation.zones.filter(Boolean).map((zone, index) => {
      const width = clamp(snap(zone.width), 1, columns)
      const height = clamp(snap(zone.height), 1, rows)
      return {
        ...zone,
        id: zone.id || `zone-${index}`,
        x: clamp(snap(zone.x), 0, columns - width),
        y: clamp(snap(zone.y), 0, rows - height),
        width,
        height,
      }
    }),
    labels: generation.labels.filter(Boolean).map((label, index) => ({
      ...label,
      id: label.id || `label-${index}`,
      x: clamp(label.x, 0, columns),
      y: clamp(label.y, 0.6, rows),
    })),
  }
}

function cellIsOccupied(generation: Encounter2DGeneration, x: number, y: number) {
  return generation.pieces.some((piece) => {
    const def = getPieceDefinition(piece.pieceId)
    const w = piece.width ?? def?.footprint.width ?? 1
    const h = piece.height ?? def?.footprint.height ?? 1
    const kind = piece.kind ?? def?.defaultKind ?? "blocking"
    if (kind === "open") return false
    return x >= piece.x && x < piece.x + w && y >= piece.y && y < piece.y + h
  })
}

function findOpenCells(generation: Encounter2DGeneration, zone: Encounter2DZone | undefined, count: number, fallbackRow: number): Array<{ x: number; y: number }> {
  const { columns, rows } = generation.board
  const cells: Array<{ x: number; y: number }> = []
  const tryCell = (x: number, y: number) => {
    if (cells.length >= count) return
    if (x < 0 || y < 0 || x >= columns || y >= rows) return
    if (cellIsOccupied(generation, x, y)) return
    if (cells.some((cell) => cell.x === x && cell.y === y)) return
    cells.push({ x, y })
  }

  if (zone) {
    for (let y = zone.y; y < zone.y + zone.height && cells.length < count; y++) {
      for (let x = zone.x; x < zone.x + zone.width && cells.length < count; x++) {
        tryCell(x, y)
      }
    }
  }
  // fallback sweep along the given row, then adjacent rows
  for (let offset = 0; offset < rows && cells.length < count; offset++) {
    const y = clamp(fallbackRow + (offset % 2 === 0 ? offset / 2 : -(offset + 1) / 2), 0, rows - 1)
    for (let x = 1; x < columns - 1 && cells.length < count; x++) {
      tryCell(x, snap(y))
    }
  }
  return cells
}

const SPAWN_LABEL = /\b(spawn|entrance|entry|start|arrival|party|approach)\b/i

/** Place party slots in/near the spawn zone and NPC starts away from it, deterministically.
 *  The model doesn't reliably use the `spawn` zone kind (often labels the entry "interest"),
 *  so infer the spawn zone by kind → label → bottom-most, and keep NPCs in a different zone. */
export function placeTokens(generation: Encounter2DGeneration, maxPartySize: number, npcIds: string[]): { partySlots: Encounter2DPartySlot[]; npcStarts: Encounter2DNpcStart[] } {
  const { rows } = generation.board
  const zones = generation.zones

  const spawnZone = zones.find((zone) => zone.kind === "spawn") || zones.find((zone) => SPAWN_LABEL.test(zone.label || "")) || [...zones].sort((a, b) => b.y + b.height - (a.y + a.height))[0]

  // NPCs go to the objective, else an interest zone that ISN'T the spawn, else the
  // zone farthest from spawn — never on top of the party.
  const focusZone =
    zones.find((zone) => zone.kind === "objective") ||
    zones.find((zone) => zone.kind === "interest" && zone !== spawnZone) ||
    (spawnZone ? [...zones].filter((zone) => zone !== spawnZone).sort((a, b) => Math.abs(b.y - spawnZone.y) - Math.abs(a.y - spawnZone.y))[0] : undefined)

  const partyCells = findOpenCells(generation, spawnZone, clamp(maxPartySize, 1, 8), rows - 2)
  const partySlots = partyCells.map((cell, index) => ({ id: `party-${index}`, slotIndex: index, x: cell.x, y: cell.y }))
  const partyTaken = new Set(partyCells.map((cell) => `${cell.x},${cell.y}`))

  const npcCells = findOpenCells(generation, focusZone, Math.min(npcIds.length, 8), 2).filter((cell) => !partyTaken.has(`${cell.x},${cell.y}`))
  const npcStarts = npcIds.slice(0, npcCells.length).map((npcId, index) => ({ id: `npc-${index}`, npcId, x: npcCells[index].x, y: npcCells[index].y }))

  return { partySlots, npcStarts }
}

export function assembleEncounter2DMap(generation: Encounter2DGeneration, args: { maxPartySize: number; npcIds: string[]; prompt?: string; previousPromptHistory?: string[] }): Encounter2DMap {
  const normalized = normalizeGeneration(generation)
  const { partySlots, npcStarts } = placeTokens(normalized, args.maxPartySize, args.npcIds)
  return encounter2dMapSchema.parse({
    ...normalized,
    version: 2,
    partySlots,
    npcStarts,
    notes: [],
    promptHistory: [...(args.previousPromptHistory || []), ...(args.prompt ? [args.prompt] : [])],
  })
}

export function getEncounterMap2DStorageKey(settingId: string, adventurePlanId: string, encounterId: string) {
  return `settings/${settingId}/maps2d/${adventurePlanId}/${encounterId}.json`
}
