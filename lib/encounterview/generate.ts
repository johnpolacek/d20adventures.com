// Encounter view scene generation — prompt building, normalization, and assembly.
// Pure functions; the server action in app/_actions/generate-encounter-scene.ts wires
// them to auth, Convex, and S3.

import { formatPropCatalogForPrompt, getPropDefinition, ENVIRONMENT_KITS } from "@/lib/encounterview/asset-catalog"
import type { EncounterScene3D, EncounterScene3DGeneration, SceneCharacter, SceneProp, SceneStance } from "@/types/encounter-scene-3d"
import { encounterScene3DSchema, environmentKitSchema } from "@/types/encounter-scene-3d"

export const SCENE_BOARD_SIZE = 20
const BOARD_MIN = 0.75
const BOARD_MAX = SCENE_BOARD_SIZE - 0.75
const MAX_PROPS = 18
const CHARACTER_RADIUS = 0.6

export function getEncounterScene3DStorageKey(settingId: string, adventureId: string, turnId: string): string {
  return `settings/${settingId}/scenes3d/${adventureId}/${turnId}.json`
}

export interface SceneRosterCharacter {
  id: string
  name: string
  type: "pc" | "npc"
  race?: string
  archetype?: string
  healthPercent?: number
}

export function buildScenePrompt(args: {
  encounterTitle?: string
  encounterIntro?: string
  previousNarratives: string[]
  currentNarrative: string
  roster: SceneRosterCharacter[]
}): string {
  const kitGuidance = (Object.keys(ENVIRONMENT_KITS) as (keyof typeof ENVIRONMENT_KITS)[]).map((kit) => `  - ${kit}: ${ENVIRONMENT_KITS[kit].guidance}`).join("\n")
  const truncate = (text: string, max = 1200) => (text.length > max ? `${text.slice(0, max)}…` : text)
  const previous = args.previousNarratives.length
    ? args.previousNarratives.map((narrative, i) => `Turn ${i + 1}:\n${truncate(narrative)}`).join("\n\n")
    : "(none — this is the first turn)"
  const roster = args.roster
    .map((c) => `  - characterId "${c.id}" | ${c.name} | ${c.type.toUpperCase()} | ${c.race ?? "unknown race"} ${c.archetype ?? ""} | health ${c.healthPercent ?? 100}%`)
    .join("\n")

  return `You are staging a diorama of painted D&D miniatures on a tabletop, capturing ONE moment of a fantasy adventure: the current turn. Return a single JSON object with EXACTLY this shape (these field names, coordinates as plain numbers at the top level of each item — never nested under "position"):

{"summary": "One atmospheric sentence.", "environment": {"kit": "forest", "ground": "grass", "timeOfDay": "night", "mood": "tense"}, "props": [{"id": "oak-1", "propId": "tree-oak", "x": 3.5, "z": 4, "rotation": 45, "scale": 1}], "characters": [{"characterId": "<id from the list below>", "x": 9.5, "z": 13, "facing": 20, "stance": "ready"}]}

The board is ${SCENE_BOARD_SIZE}x${SCENE_BOARD_SIZE} units, coordinates x (west→east) and z (north→south), both 0-${SCENE_BOARD_SIZE}. 1 unit ≈ 1 meter. The viewer looks from the south (high z) toward the north. rotation/facing are degrees clockwise from north (0 = facing north/away from viewer, 180 = facing the viewer).

Environment kits (pick the one the narrative implies):
${kitGuidance}

Props — place ONLY these propId values, nothing else:
${formatPropCatalogForPrompt()}

Rules:
- Stage ONLY the place the characters are AT during this turn. NEVER place landmarks they are merely traveling toward, remember, or hear about. Worked example: a note says "meet me at the Old Standing Stones at midnight" and the CURRENT TURN has the character still moving through dark woods — then the board is woods only: NO stones, NO pillars, NO shrine. The stones first appear on the turn the narrative says the party ARRIVES at them. Before you output, re-read the CURRENT TURN text and delete any prop that represents a place it does not put the party at right now.
- For wooded kits (forest, grove) a dense tree perimeter is added around the board automatically — do NOT build your own treeline along the edges. Place feature props only: a notable tree or two, boulders, stumps, and whatever the clearing itself contains.
- 6-${MAX_PROPS} props. Cluster them naturally (a camp has its tents together), keep the center third of the board mostly open for the characters. Use each prop's scale (0.5-2) for variety.
- Place EVERY character listed below exactly once, keyed by its characterId string. Stage the CURRENT narrative moment: who faces whom, who is confronting, sneaking, fleeing, or fallen. Allies group loosely; opponents face each other with a few units of tension between them. Keep characters at least 1.5 units apart.
- Keep continuity with earlier turns: terrain and structures that appeared earlier are still there; a campfire lit two turns ago still burns.
- stance per character: "down" if fallen or at 0% health, "hurt" if badly wounded, "attack" or "ready" if fighting or braced, else "idle".
- environment.timeOfDay and mood come from the narrative. summary is one atmospheric sentence describing the tableau.

Encounter: ${args.encounterTitle ?? "Untitled"}
Encounter intro:
${truncate(args.encounterIntro ?? "(none)")}

Earlier this encounter (oldest first):
${previous}

CURRENT TURN — stage this moment:
${truncate(args.currentNarrative, 2000)}

Characters (place each exactly once):
${roster}`
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const normalizeAngle = (value: number) => ((Math.round(value) % 360) + 360) % 360

/** Greedy radial push so minis and props don't interpenetrate. */
function nudgeApart(items: { x: number; z: number; radius: number }[]) {
  for (let pass = 0; pass < 5; pass++) {
    let moved = false
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i]
        const b = items[j]
        const dx = b.x - a.x
        const dz = b.z - a.z
        const dist = Math.hypot(dx, dz)
        const minDist = a.radius + b.radius
        if (dist >= minDist || dist === 0) continue
        const push = (minDist - dist) / 2 + 0.05
        const ux = dx / dist
        const uz = dz / dist
        a.x = clamp(a.x - ux * push, BOARD_MIN, BOARD_MAX)
        a.z = clamp(a.z - uz * push, BOARD_MIN, BOARD_MAX)
        b.x = clamp(b.x + ux * push, BOARD_MIN, BOARD_MAX)
        b.z = clamp(b.z + uz * push, BOARD_MIN, BOARD_MAX)
        moved = true
      }
    }
    if (!moved) break
  }
}

export function normalizeSceneGeneration(generation: EncounterScene3DGeneration, roster: SceneRosterCharacter[]): { environment: EncounterScene3D["environment"]; props: SceneProp[]; characters: SceneCharacter[]; summary: string } {
  const kit = environmentKitSchema.catch("generic").parse(generation.environment.kit)

  const props: SceneProp[] = []
  for (const raw of generation.props) {
    if (!raw || props.length >= MAX_PROPS) continue
    const def = getPropDefinition(raw.propId)
    if (!def) continue
    props.push({
      id: raw.id || `prop-${props.length + 1}`,
      propId: raw.propId,
      x: clamp(raw.x, BOARD_MIN, BOARD_MAX),
      z: clamp(raw.z, BOARD_MIN, BOARD_MAX),
      rotation: normalizeAngle(raw.rotation),
      scale: clamp(raw.scale || 1, 0.5, 2),
    })
  }

  const rosterById = new Map(roster.map((c) => [c.id, c]))
  const characters: SceneCharacter[] = []
  const placed = new Set<string>()
  for (const raw of generation.characters) {
    if (!raw) continue
    const rosterEntry = rosterById.get(raw.characterId)
    if (!rosterEntry || placed.has(raw.characterId)) continue
    placed.add(raw.characterId)
    const stance: SceneStance = rosterEntry.healthPercent === 0 ? "down" : (raw.stance ?? "idle")
    characters.push({
      characterId: raw.characterId,
      x: clamp(raw.x, BOARD_MIN, BOARD_MAX),
      z: clamp(raw.z, BOARD_MIN, BOARD_MAX),
      facing: normalizeAngle(raw.facing),
      stance,
    })
  }

  // Deterministic repair: any roster character the model missed still gets a mini —
  // PCs on an arc near the south (viewer) edge facing north, NPCs mirrored north.
  const missing = roster.filter((c) => !placed.has(c.id))
  missing.forEach((c, index) => {
    const arc = (index - (missing.length - 1) / 2) * 2
    const isPc = c.type === "pc"
    characters.push({
      characterId: c.id,
      x: clamp(SCENE_BOARD_SIZE / 2 + arc, BOARD_MIN, BOARD_MAX),
      z: isPc ? SCENE_BOARD_SIZE - 4 : 4,
      facing: isPc ? 0 : 180,
      stance: c.healthPercent === 0 ? "down" : "idle",
    })
  })

  const collidables = [
    ...characters.map((c) => ({ x: c.x, z: c.z, radius: CHARACTER_RADIUS, ref: c as SceneCharacter | SceneProp })),
    ...props.map((p) => ({ x: p.x, z: p.z, radius: (getPropDefinition(p.propId)?.footprintRadius ?? 0.5) * p.scale, ref: p as SceneCharacter | SceneProp })),
  ]
  nudgeApart(collidables)
  for (const item of collidables) {
    item.ref.x = item.x
    item.ref.z = item.z
  }

  return {
    environment: { kit, ground: generation.environment.ground, timeOfDay: generation.environment.timeOfDay, mood: generation.environment.mood },
    props,
    characters,
    summary: generation.summary || "",
  }
}

export function assembleEncounterScene3D(normalized: ReturnType<typeof normalizeSceneGeneration>, args: { turnId: string }): EncounterScene3D {
  return encounterScene3DSchema.parse({
    ...normalized,
    version: 2,
    turnId: args.turnId,
    generatedAt: new Date().toISOString(),
  })
}
