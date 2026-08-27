// Encounter view (3D miniatures) asset catalog — pure data, no React.
// Every prop id maps 1:1 to a committed GLB under public/models/encounter/props/
// (except "campfire", rendered procedurally in components/encounterview/scene-prop.tsx),
// so the generation model can only ask for things we can render. Sources and licenses:
// public/models/encounter/LICENSES.md. Board coordinates are a 20x20-unit tabletop,
// 1 unit ≈ 1 meter; footprintRadius is the keep-clear radius in those units.

export type PropCategory = "natural" | "structure" | "dressing" | "grave"

export interface PropDefinition {
  id: string
  label: string
  category: PropCategory
  /** GLB path under /models/encounter/props, or null for procedural props. */
  file: string | null
  /** Keep-clear radius in board units, used for collision nudging. */
  footprintRadius: number
  /** Uniform scale applied on top of the authored GLB scale. */
  defaultScale: number
  /** Vertical offset in board units (most KayKit props sit on their origin). */
  yOffset: number
  /** Emits light at night (renderer adds a warm point light). */
  lightSource?: boolean
  /** One-line description used in the generation prompt so the model places props sensibly. */
  hint: string
}

// defaultScale/yOffset derived from measured GLB bounds (see wiki/plans notes):
// hexagon-pack props are authored tiny (tent 0.5u tall), dungeon props at 4u tile
// scale — scales normalize everything to real-world meters on the board. yOffset is
// the model's -minY in authored units; the renderer multiplies by the total scale.
export const PROP_CATALOG: PropDefinition[] = [
  // --- natural -------------------------------------------------------------
  { id: "tree-oak", label: "Oak Tree", category: "natural", file: "tree-oak.glb", footprintRadius: 1.3, defaultScale: 4.5, yOffset: 0.1, hint: "Broadleaf tree; cluster 2-4 along edges for forest" },
  { id: "tree-pine", label: "Pine Tree", category: "natural", file: "tree-pine.glb", footprintRadius: 1.6, defaultScale: 5.0, yOffset: 0.1, hint: "Conifer; wilderness perimeters and cold scenes" },
  { id: "tree-dead", label: "Dead Tree", category: "natural", file: "tree-dead.glb", footprintRadius: 1.1, defaultScale: 1.1, yOffset: 0.27, hint: "Bare twisted tree; eerie, blighted, or night scenes" },
  { id: "thicket", label: "Thicket", category: "natural", file: "thicket.glb", footprintRadius: 1.8, defaultScale: 2.4, yOffset: 0.02, hint: "Cluster of small trees and brush; soft cover" },
  { id: "stump", label: "Tree Stump", category: "natural", file: "stump.glb", footprintRadius: 0.4, defaultScale: 2.0, yOffset: 0.1, hint: "Cut stump; logging sites, campsites" },
  { id: "boulder", label: "Boulder", category: "natural", file: "boulder.glb", footprintRadius: 1.0, defaultScale: 5.0, yOffset: 0, hint: "Large low rock; blocks movement and sight" },
  { id: "rocks", label: "Rocks", category: "natural", file: "rocks.glb", footprintRadius: 0.5, defaultScale: 3.0, yOffset: 0, hint: "Small rock scatter; ground texture, cavern floors" },
  // --- structure -----------------------------------------------------------
  { id: "wall-stone", label: "Stone Wall", category: "structure", file: "wall-stone.glb", footprintRadius: 1.1, defaultScale: 0.5, yOffset: 0, hint: "Solid masonry run; orient with rotation" },
  { id: "wall-broken", label: "Broken Wall", category: "structure", file: "wall-broken.glb", footprintRadius: 1.1, defaultScale: 0.5, yOffset: 0, hint: "Crumbled wall fragment; ruins, waist-high cover" },
  { id: "pillar", label: "Pillar", category: "structure", file: "pillar.glb", footprintRadius: 0.5, defaultScale: 0.62, yOffset: 0, hint: "Stone column; rows make colonnades, ruins" },
  { id: "fence-wood", label: "Wooden Fence", category: "structure", file: "fence-wood.glb", footprintRadius: 1.0, defaultScale: 1.8, yOffset: 0.05, hint: "Fence run; farms, roadsides, camps" },
  { id: "tent", label: "Tent", category: "structure", file: "tent.glb", footprintRadius: 1.2, defaultScale: 4.2, yOffset: 0, hint: "Canvas tent; camps and war-camps" },
  { id: "shrine", label: "Shrine", category: "structure", file: "shrine.glb", footprintRadius: 0.7, defaultScale: 0.9, yOffset: 0, lightSource: true, hint: "Candle-lit shrine; ritual and holy sites" },
  { id: "crypt", label: "Crypt", category: "structure", file: "crypt.glb", footprintRadius: 2.2, defaultScale: 0.55, yOffset: 0, hint: "Small stone mausoleum; graveyards, one dominant landmark" },
  // --- dressing ------------------------------------------------------------
  { id: "barrel", label: "Barrel", category: "dressing", file: "barrel.glb", footprintRadius: 0.5, defaultScale: 0.45, yOffset: 0, hint: "Wooden barrel; camps, taverns, cargo" },
  { id: "crate", label: "Crates", category: "dressing", file: "crate.glb", footprintRadius: 0.8, defaultScale: 0.42, yOffset: 0, hint: "Stacked boxes; cargo areas, storerooms" },
  { id: "chest", label: "Chest", category: "dressing", file: "chest.glb", footprintRadius: 0.4, defaultScale: 0.45, yOffset: 0, hint: "Treasure chest; objective marker" },
  { id: "table", label: "Long Table", category: "dressing", file: "table.glb", footprintRadius: 1.2, defaultScale: 0.55, yOffset: 0, hint: "Wooden table; interiors, war rooms, taverns" },
  { id: "cart", label: "Cart", category: "dressing", file: "cart.glb", footprintRadius: 0.6, defaultScale: 2.0, yOffset: 0, hint: "Wheelbarrow cart; roads, farms, worksites" },
  { id: "campfire", label: "Campfire", category: "dressing", file: null, footprintRadius: 0.8, defaultScale: 1, yOffset: 0, lightSource: true, hint: "Ring of stones with fire; camp centerpiece, night light source" },
  { id: "torch", label: "Standing Torch", category: "dressing", file: "torch.glb", footprintRadius: 0.3, defaultScale: 1.15, yOffset: 0.4, lightSource: true, hint: "Lit torch; marks entrances and paths at night" },
  { id: "lantern", label: "Lantern", category: "dressing", file: "lantern.glb", footprintRadius: 0.3, defaultScale: 1.2, yOffset: 0, lightSource: true, hint: "Standing lantern; roadside or graveyard light" },
  { id: "banner", label: "Banner", category: "dressing", file: "banner.glb", footprintRadius: 0.4, defaultScale: 0.7, yOffset: 0, hint: "War banner; gates, camps, factions — place beside walls" },
  { id: "coins", label: "Coin Pile", category: "dressing", file: "coins.glb", footprintRadius: 0.4, defaultScale: 0.45, yOffset: 0, hint: "Treasure hoard; lairs and vaults" },
  { id: "rubble", label: "Rubble", category: "dressing", file: "rubble.glb", footprintRadius: 1.4, defaultScale: 0.35, yOffset: 0, hint: "Collapsed debris; ruins dressing, difficult ground" },
  // --- grave ---------------------------------------------------------------
  { id: "gravestone", label: "Gravestone", category: "grave", file: "gravestone.glb", footprintRadius: 0.5, defaultScale: 0.7, yOffset: 0, hint: "Headstone; scatter rows for a graveyard" },
  { id: "coffin", label: "Coffin", category: "grave", file: "coffin.glb", footprintRadius: 1.0, defaultScale: 0.65, yOffset: 0, hint: "Wooden coffin; crypts and open graves" },
  { id: "bones", label: "Bones", category: "grave", file: "bones.glb", footprintRadius: 0.4, defaultScale: 0.7, yOffset: 0.39, hint: "Ribcage and bone scatter; lairs, battlefields, crypts" },
  // --- generated props (asset-pipeline d8f3b13) ---
  // 21 props generated by the asset-pipeline repo, not a KayKit pack:
  // fal-ai/flux/schnell concept plate -> fal-ai/hunyuan3d-v3 on fal.ai (image-to-3D) -> Blender -> glTF Transform.
  // Every one passed the Phase 3 quality gate (`python -m runner gate`) at its class
  // triangle budget. Licensing is NOT CC0 — see public/models/encounter/LICENSES.md.
  //
  // Each GLB is authored 0.92 m tall with its base at y=0, so defaultScale is just
  // realHeight / 0.92 and footprintRadius is the shipping mesh's own half-extent at
  // that scale. Per-prop derivations and overrides: asset-pipeline dist/emission.json.
  // natural ---------------------------------------------------------------
  { id: "hedge", label: "Hedge", category: "natural", file: "hedge.glb", footprintRadius: 0.6, defaultScale: 1.52, yOffset: 0, hint: "Clipped hedge block; chain several in a run for garden mazes and courtyard borders" },
  // structure -------------------------------------------------------------
  { id: "building-facade", label: "Building Facade", category: "structure", file: "building-facade.glb", footprintRadius: 3.5, defaultScale: 7.61, yOffset: 0, hint: "Two-storey timber-framed housefront; line the board edge to wall in a street scene" },
  { id: "staircase", label: "Staircase", category: "structure", file: "staircase.glb", footprintRadius: 1.7, defaultScale: 2.17, yOffset: 0, hint: "Stone stair flight; put it against a wall or dais edge to imply a second level" },
  // defaultScale overridden off the 0.92 m authoring rule: a city gate has to read
  // as something a mounted rider passes under, so it is scaled to ~6 m tall.
  // footprintRadius stays 2.4 — the piers are what you actually collide with.
  { id: "gate-arch", label: "Gate Arch", category: "structure", file: "gate-arch.glb", footprintRadius: 2.4, defaultScale: 6.5, yOffset: 0, hint: "Free-standing stone arch, 6 m tall; one per scene as a city gate or courtyard threshold — put it at the board edge with the action in front of it" },
  { id: "door-heavy", label: "Heavy Door", category: "structure", file: "door-heavy.glb", footprintRadius: 0.8, defaultScale: 2.5, yOffset: 0, hint: "Iron-banded timber door; set flat against a wall as an entrance or a barred way out" },
  { id: "door-arcane", label: "Arcane Door", category: "structure", file: "door-arcane.glb", footprintRadius: 1.5, defaultScale: 2.83, yOffset: 0, hint: "Rune-sealed door in its own frame; vaults, sanctums and puzzle thresholds, one per scene" },
  { id: "boat", label: "Boat", category: "structure", file: "boat.glb", footprintRadius: 2.3, defaultScale: 3.26, yOffset: 0, hint: "Small open boat with a swept stern post; beach it at a shoreline or moor it beside a pier" },
  { id: "pier", label: "Pier", category: "structure", file: "pier.glb", footprintRadius: 1, defaultScale: 1.52, yOffset: 0, hint: "Planked pier section on pilings; run 2-3 end to end from shore into water for docks" },
  { id: "iron-gate", label: "Iron Gate", category: "structure", file: "iron-gate.glb", footprintRadius: 1, defaultScale: 2.17, yOffset: 0, hint: "Wrought-iron gate leaf on a low plinth; estate entries, garden walls and cell fronts" },
  { id: "balustrade", label: "Balustrade", category: "structure", file: "balustrade.glb", footprintRadius: 1.7, defaultScale: 1.2, yOffset: 0, hint: "Stone balustrade run; edge terraces, balconies and ballroom galleries, orient with rotation" },
  // dressing --------------------------------------------------------------
  { id: "market-stall", label: "Market Stall", category: "dressing", file: "market-stall.glb", footprintRadius: 1.4, defaultScale: 2.39, yOffset: 0, hint: "Covered trader's stall with a striped awning; line 2-3 down a market street or fairground" },
  { id: "chair", label: "Chair", category: "dressing", file: "chair.glb", footprintRadius: 0.3, defaultScale: 1.09, yOffset: 0, hint: "Wooden tavern chair; pair with tables, or set one alone for an interrogation" },
  { id: "beast-cage", label: "Beast Cage", category: "dressing", file: "beast-cage.glb", footprintRadius: 1, defaultScale: 1.96, yOffset: 0, hint: "Barred iron cage; menageries, auction floors and slaver camps - an objective, not scenery" },
  { id: "bookshelf", label: "Bookshelf", category: "dressing", file: "bookshelf.glb", footprintRadius: 0.6, defaultScale: 2.39, yOffset: 0, hint: "Tall filled bookshelf; line a wall in studies, libraries and back rooms" },
  { id: "bar-counter", label: "Bar Counter", category: "dressing", file: "bar-counter.glb", footprintRadius: 1.4, defaultScale: 2.72, yOffset: 0, hint: "Tavern bar with bottle shelves behind; put it against a wall, patrons on the open side" },
  { id: "desk", label: "Desk", category: "dressing", file: "desk.glb", footprintRadius: 0.4, defaultScale: 0.87, yOffset: 0, hint: "Small writing table with books and an inkpot; studies, offices and scriptoria" },
  { id: "candelabra", label: "Candelabra", category: "dressing", file: "candelabra.glb", footprintRadius: 0.5, defaultScale: 1.85, yOffset: 0, lightSource: true, hint: "Tall floor candelabra; flank doors, altars and aisles in pairs for interior light" },
  { id: "chandelier", label: "Chandelier", category: "dressing", file: "chandelier.glb", footprintRadius: 0.4, defaultScale: 1.09, yOffset: 2.02, lightSource: true, hint: "Iron chandelier that hangs in the air above tables and halls; place it over open floor, never on it" },
  { id: "dais", label: "Dais", category: "dressing", file: "dais.glb", footprintRadius: 1.7, defaultScale: 1.96, yOffset: 0, hint: "Raised timber platform with corner posts; thrones, auctions and speeches - the focal point of a hall" },
  { id: "altar", label: "Altar", category: "dressing", file: "altar.glb", footprintRadius: 0.7, defaultScale: 1.3, yOffset: 0, hint: "Warm-grey stone altar with a gilt rune band; temple and ritual centrepiece, leave it clear" },
  { id: "brazier", label: "Brazier", category: "dressing", file: "brazier.glb", footprintRadius: 0.5, defaultScale: 1.2, yOffset: 0, lightSource: true, hint: "Standing coal brazier; warms and lights tunnels, guard posts and night camps" },
  // Tier B set-pieces and crowd dressing (asset-pipeline 876f130)
  { id: "gatehouse", label: "Stone Gatehouse", category: "structure", file: "gatehouse.glb", footprintRadius: 7.3, defaultScale: 10.87, yOffset: 0, hint: "Monumental city gate; place at the board’s north edge, one per scene" },
  { id: "city-wall", label: "City Wall Section", category: "structure", file: "city-wall.glb", footprintRadius: 7, defaultScale: 6.52, yOffset: 0, hint: "Tall wall run; chain along board edges to enclose a city scene" },
  { id: "traveler", label: "Traveler", category: "dressing", file: "traveler.glb", footprintRadius: 0.4, defaultScale: 1.96, yOffset: 0, hint: "Crowd dressing: a standing traveler with pack and staff; cluster in queues at gates and roads, never blocking the action" },
  { id: "merchant", label: "Merchant", category: "dressing", file: "merchant.glb", footprintRadius: 0.4, defaultScale: 1.96, yOffset: 0, hint: "Crowd dressing: an aproned trader with a laden basket; cluster around market stalls, never blocking the action" },
  { id: "hooded-wanderer", label: "Hooded Wanderer", category: "dressing", file: "hooded-wanderer.glb", footprintRadius: 0.3, defaultScale: 1.96, yOffset: 0, hint: "Crowd dressing: a cloaked figure with hands clasped; stand one or two at the edge of a market or queue, never blocking the action" },
  { id: "town-guard", label: "Town Guard", category: "dressing", file: "town-guard.glb", footprintRadius: 0.4, defaultScale: 2.07, yOffset: 0, hint: "Crowd dressing: a spear-armed guard in a red-and-cream tabard; post in pairs at gates and doors, never blocking the action" },
  // --- end generated props (asset-pipeline d8f3b13) ---
]

export const PROP_IDS = PROP_CATALOG.map((p) => p.id)

const catalogById = new Map(PROP_CATALOG.map((p) => [p.id, p]))

export function getPropDefinition(propId: string): PropDefinition | undefined {
  return catalogById.get(propId)
}

export function formatPropCatalogForPrompt(): string {
  const categories: PropCategory[] = ["natural", "structure", "dressing", "grave"]
  return categories
    .map((category) => {
      const props = PROP_CATALOG.filter((p) => p.category === category)
      return `${category}:\n${props.map((p) => `  - ${p.id}: ${p.hint}`).join("\n")}`
    })
    .join("\n")
}

// --- character miniatures ----------------------------------------------------

export interface CharacterModel {
  file: string
  scale: number
}

/** Tested against `${race} ${archetype}`.toLowerCase(); first match wins. */
const CHARACTER_MODEL_RULES: { match: RegExp; model: CharacterModel }[] = [
  { match: /skeleton.*(mage|sorcer|warlock|necroman)|.*(mage|sorcer|warlock|necroman).*skeleton/, model: { file: "skeleton-mage.glb", scale: 0.65 } },
  { match: /skeleton.*(rogue|scout|archer)|.*(rogue|scout|archer).*skeleton/, model: { file: "skeleton-rogue.glb", scale: 0.65 } },
  { match: /skeleton.*minion|minion.*skeleton/, model: { file: "skeleton-minion.glb", scale: 0.65 } },
  { match: /skeleton|undead|lich|zombie|ghoul|wight|revenant/, model: { file: "skeleton-warrior.glb", scale: 0.65 } },
  { match: /barbarian|berserk/, model: { file: "barbarian.glb", scale: 0.65 } },
  { match: /mage|wizard|sorcer|warlock|druid|cleric|priest|shaman|acolyte|cultist/, model: { file: "mage.glb", scale: 0.65 } },
  { match: /knight|paladin|fighter|warrior|soldier|guard|captain|mercenary/, model: { file: "knight.glb", scale: 0.65 } },
  { match: /rogue|thief|assassin|ranger|archer|hunter|scout|bandit|spy/, model: { file: "rogue-hooded.glb", scale: 0.65 } },
]

/**
 * Resolve a character to a miniature GLB, or null when nothing fits
 * (beasts, monsters) — the renderer then falls back to a portrait pawn.
 */
export function getCharacterModel(race: string, archetype: string, type: "pc" | "npc"): CharacterModel | null {
  const haystack = `${race} ${archetype}`.toLowerCase()
  for (const rule of CHARACTER_MODEL_RULES) {
    if (rule.match.test(haystack)) return rule.model
  }
  // Humanoid races get a generic mini; anything else falls back to a portrait pawn.
  if (/human|elf|dwarf|halfling|gnome|orc|goblin|hobgoblin|tiefling|dragonborn|half-/.test(haystack)) {
    return { file: type === "pc" ? "knight.glb" : "rogue-hooded.glb", scale: 1 }
  }
  return null
}

// --- environment kits ---------------------------------------------------------

export type EnvironmentKit = "forest" | "grove" | "road" | "camp" | "ruins" | "crypt" | "cavern" | "shrine" | "courtyard" | "checkpoint" | "generic"

export interface EnvironmentKitDefinition {
  /** Ground plane tint per ground type fallback; renderer blends with groundColors. */
  groundColor: string
  fogColor: string
  /** Prompt guidance for what belongs in this kind of scene. */
  guidance: string
}

export const ENVIRONMENT_KITS: Record<EnvironmentKit, EnvironmentKitDefinition> = {
  forest: { groundColor: "#4a6b3a", fogColor: "#2c3b2a", guidance: "Dense trees around the edges, thicket and boulders inside; keep a clearing" },
  grove: { groundColor: "#547844", fogColor: "#31402c", guidance: "A few broad trees, soft undergrowth; open and calm" },
  road: { groundColor: "#7a6a4f", fogColor: "#4a4238", guidance: "Open ground with a cart, fences and waymarkers; travel ambush territory" },
  camp: { groundColor: "#6b5f45", fogColor: "#3e382c", guidance: "Tents around a central campfire, crates and barrels; lived-in" },
  ruins: { groundColor: "#6e6a5e", fogColor: "#3c3a34", guidance: "Broken walls, fallen pillars and rubble; overgrown edges" },
  crypt: { groundColor: "#54525c", fogColor: "#26242e", guidance: "Gravestones, a crypt or coffins, bones and dead trees; sombre" },
  cavern: { groundColor: "#4e4a48", fogColor: "#211f1e", guidance: "Boulders and rock scatter, sparse light sources; enclosed feel" },
  shrine: { groundColor: "#5f6552", fogColor: "#32362c", guidance: "A shrine as the focal point, candles or lanterns, a pillar or two" },
  courtyard: { groundColor: "#6f6d64", fogColor: "#3b3a35", guidance: "Walls framing open flagstones, banners, a table or well-kept dressing" },
  checkpoint: { groundColor: "#71685a", fogColor: "#3d3830", guidance: "A barrier of walls/fences across the road, torches and a guard post" },
  generic: { groundColor: "#5e6350", fogColor: "#33352c", guidance: "Neutral open ground; place what the narrative demands" },
}

export const GROUND_COLORS: Record<string, string> = {
  grass: "#4f7040",
  dirt: "#71583c",
  stone: "#6d6a62",
  sand: "#9a8a62",
  snow: "#b9c2c9",
  cave: "#4a4644",
}

// --- procedural forest (renderer-only, not in the LLM vocabulary) ------------
// A dense tree band is guaranteed in code for wooded kits — the mapview lesson:
// player-visible qualities like forest density can't be left to prompt wording.

export interface ForestAsset {
  file: string
  scale: number
  /** Selection weight in the mix. */
  weight: number
  /** Keep-clear radius in board units at scale 1 placement. */
  footprintRadius: number
}

export const FOREST_ASSETS: ForestAsset[] = [
  { file: "tree-oak.glb", scale: 4.5, weight: 3, footprintRadius: 1.3 },
  { file: "tree-pine.glb", scale: 5.0, weight: 3, footprintRadius: 1.6 },
  { file: "trees-clump-a-medium.glb", scale: 3.4, weight: 2, footprintRadius: 3.0 },
  { file: "trees-clump-a-large.glb", scale: 3.6, weight: 1, footprintRadius: 3.4 },
  { file: "trees-clump-b-medium.glb", scale: 3.4, weight: 2, footprintRadius: 3.0 },
  { file: "trees-clump-b-large.glb", scale: 3.6, weight: 1, footprintRadius: 3.4 },
]

export const DEAD_FOREST_ASSETS: ForestAsset[] = [{ file: "tree-dead.glb", scale: 1.1, weight: 1, footprintRadius: 1.1 }]

/** How much automatic tree perimeter each kit gets (0 = none, 1 = dense forest). */
export const KIT_FOREST_DENSITY: Record<EnvironmentKit, number> = {
  forest: 1,
  grove: 0.8,
  road: 0.4,
  camp: 0.4,
  ruins: 0.3,
  crypt: 0.35,
  cavern: 0,
  shrine: 0.35,
  courtyard: 0,
  checkpoint: 0.3,
  generic: 0.25,
}

// --- procedural urban dressing (renderer-only, not in the LLM vocabulary) -----
// The forest lesson applied to built-up kits: a checkpoint or a courtyard has to
// read as enclosed even when the model returns a thin prop list, so the backdrop
// is guaranteed in code the same way the treeline is. Facades line the north (far)
// edge as a street front; wall runs close the east/west edges. The south edge is
// left open — that is the camera's side of the diorama.

export const URBAN_FACADE_ASSETS: ForestAsset[] = [{ file: "building-facade.glb", scale: 7.61, weight: 1, footprintRadius: 3.5 }]

export const URBAN_WALL_ASSETS: ForestAsset[] = [
  { file: "wall-stone.glb", scale: 0.5, weight: 4, footprintRadius: 1.1 },
  { file: "wall-broken.glb", scale: 0.5, weight: 1, footprintRadius: 1.1 },
]

/** Ruined kits get the same runs built from collapsed masonry. */
export const RUINED_WALL_ASSETS: ForestAsset[] = [{ file: "wall-broken.glb", scale: 0.5, weight: 1, footprintRadius: 1.1 }]

export interface UrbanDressing {
  /** Wall run along the east/west edges (0 = none, 1 = continuous). */
  walls: number
  /** Building facades along the north edge (0 = none, 1 = a solid street front). */
  facades: number
  /** Build the wall runs from broken masonry instead of intact stone. */
  ruined?: boolean
}

/** How much automatic building/wall enclosure each kit gets. */
export const KIT_URBAN_DRESSING: Record<EnvironmentKit, UrbanDressing> = {
  forest: { walls: 0, facades: 0 },
  grove: { walls: 0, facades: 0 },
  road: { walls: 0.25, facades: 0 },
  camp: { walls: 0, facades: 0 },
  ruins: { walls: 0.55, facades: 0, ruined: true },
  crypt: { walls: 0.3, facades: 0, ruined: true },
  cavern: { walls: 0, facades: 0 },
  shrine: { walls: 0.25, facades: 0 },
  courtyard: { walls: 0.9, facades: 0.5 },
  checkpoint: { walls: 0.8, facades: 0.7 },
  generic: { walls: 0, facades: 0 },
}
