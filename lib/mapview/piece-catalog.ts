// Mapview standard piece catalog — pure data, no React.
// SVG renderers for these pieces live in components/mapview/pieces.tsx, keyed by PieceId.
// The generation schema constrains the model to these ids; footprints are in grid cells.

export type PieceCategory = "natural" | "structure" | "dressing" | "hazard"

// Gameplay semantics carried over from the original 2D prototype (2d-maps branch).
export type PieceGameplayKind = "blocking" | "difficult" | "hazard" | "cover" | "open"

export interface PieceDefinition {
  id: string
  label: string
  category: PieceCategory
  /** Default gameplay semantics; a placed piece may override via `kind`. */
  defaultKind: PieceGameplayKind
  /** Default footprint in grid cells; placements may resize via width/height. */
  footprint: { width: number; height: number }
  /** Whether resizing beyond the footprint makes sense (ponds yes, wells no). */
  resizable: boolean
  /** One-line description used in the generation prompt so the model places pieces sensibly. */
  hint: string
}

export const PIECE_CATALOG: PieceDefinition[] = [
  // --- natural -------------------------------------------------------------
  { id: "tree-oak", label: "Oak Tree", category: "natural", defaultKind: "blocking", footprint: { width: 1, height: 1 }, resizable: true, hint: "Broadleaf tree; cluster 2-3 for a grove edge" },
  { id: "tree-pine", label: "Pine Tree", category: "natural", defaultKind: "blocking", footprint: { width: 1, height: 1 }, resizable: true, hint: "Conifer; good for wilderness perimeters" },
  { id: "boulder", label: "Boulder", category: "natural", defaultKind: "blocking", footprint: { width: 1, height: 1 }, resizable: true, hint: "Single large rock; blocks movement and sight" },
  { id: "rock-cluster", label: "Rock Cluster", category: "natural", defaultKind: "cover", footprint: { width: 2, height: 1 }, resizable: true, hint: "Low scattered rocks; partial cover" },
  { id: "bush", label: "Bush", category: "natural", defaultKind: "difficult", footprint: { width: 1, height: 1 }, resizable: true, hint: "Scrub or hedge; slows movement" },
  { id: "pond", label: "Pond", category: "natural", defaultKind: "difficult", footprint: { width: 3, height: 2 }, resizable: true, hint: "Still water; resize to fit the scene" },
  { id: "marsh", label: "Marsh Patch", category: "natural", defaultKind: "difficult", footprint: { width: 2, height: 2 }, resizable: true, hint: "Boggy ground; difficult terrain" },

  // --- structures ----------------------------------------------------------
  { id: "stone-wall", label: "Stone Wall", category: "structure", defaultKind: "blocking", footprint: { width: 3, height: 1 }, resizable: true, hint: "Solid masonry run; orient with rotation" },
  { id: "ruined-wall", label: "Ruined Wall", category: "structure", defaultKind: "cover", footprint: { width: 2, height: 1 }, resizable: true, hint: "Broken wall fragment; waist-high cover" },
  { id: "building-hut", label: "Hut", category: "structure", defaultKind: "blocking", footprint: { width: 3, height: 3 }, resizable: true, hint: "Small roofed building seen from above" },
  { id: "tent", label: "Tent", category: "structure", defaultKind: "blocking", footprint: { width: 2, height: 2 }, resizable: true, hint: "Canvas tent; camps and war-camps" },
  { id: "gate", label: "Gate", category: "structure", defaultKind: "blocking", footprint: { width: 4, height: 2 }, resizable: true, hint: "Gatehouse with doors; one dominant entrance" },
  { id: "bridge", label: "Bridge", category: "structure", defaultKind: "open", footprint: { width: 3, height: 2 }, resizable: true, hint: "Planked crossing; pair with water or a pit" },
  { id: "well", label: "Well", category: "structure", defaultKind: "blocking", footprint: { width: 1, height: 1 }, resizable: false, hint: "Round stone well; courtyard focal point" },
  { id: "statue", label: "Statue", category: "structure", defaultKind: "blocking", footprint: { width: 1, height: 1 }, resizable: false, hint: "Stone figure on a plinth; landmark" },
  { id: "altar", label: "Altar", category: "structure", defaultKind: "blocking", footprint: { width: 2, height: 1 }, resizable: false, hint: "Ceremonial altar; shrine focal point" },
  { id: "pillar", label: "Pillar", category: "structure", defaultKind: "blocking", footprint: { width: 1, height: 1 }, resizable: false, hint: "Column; place in rows for colonnades" },
  { id: "fence", label: "Fence", category: "structure", defaultKind: "cover", footprint: { width: 3, height: 1 }, resizable: true, hint: "Wooden fence run; low cover" },

  // --- dressing ------------------------------------------------------------
  { id: "crate-stack", label: "Crate Stack", category: "dressing", defaultKind: "cover", footprint: { width: 1, height: 1 }, resizable: true, hint: "Stacked wooden crates; cargo areas" },
  { id: "barrels", label: "Barrels", category: "dressing", defaultKind: "cover", footprint: { width: 1, height: 1 }, resizable: true, hint: "Barrel group; taverns, docks, camps" },
  { id: "campfire", label: "Campfire", category: "dressing", defaultKind: "hazard", footprint: { width: 1, height: 1 }, resizable: false, hint: "Ring of stones with fire; camp centerpiece" },
  { id: "wagon", label: "Wagon", category: "dressing", defaultKind: "cover", footprint: { width: 2, height: 1 }, resizable: false, hint: "Cart or wagon; roads and caravans" },
  { id: "rubble", label: "Rubble", category: "dressing", defaultKind: "difficult", footprint: { width: 2, height: 2 }, resizable: true, hint: "Collapsed debris; ruins dressing" },
  { id: "chest", label: "Chest", category: "dressing", defaultKind: "open", footprint: { width: 1, height: 1 }, resizable: false, hint: "Treasure chest; objective marker" },
  { id: "market-stall", label: "Market Stall", category: "dressing", defaultKind: "cover", footprint: { width: 2, height: 1 }, resizable: false, hint: "Awninged stall; gates and streets" },

  // --- hazards -------------------------------------------------------------
  { id: "pit", label: "Pit", category: "hazard", defaultKind: "hazard", footprint: { width: 2, height: 2 }, resizable: true, hint: "Open pit or chasm; deadly drop" },
  { id: "spikes", label: "Spikes", category: "hazard", defaultKind: "hazard", footprint: { width: 1, height: 1 }, resizable: true, hint: "Spike trap or stakes; area denial" },
]

export const PIECE_IDS = PIECE_CATALOG.map((piece) => piece.id)

const catalogById = new Map(PIECE_CATALOG.map((piece) => [piece.id, piece]))

export function getPieceDefinition(pieceId: string): PieceDefinition | undefined {
  return catalogById.get(pieceId)
}

export function formatPieceCatalogForPrompt(): string {
  const byCategory = new Map<PieceCategory, PieceDefinition[]>()
  for (const piece of PIECE_CATALOG) {
    const list = byCategory.get(piece.category) || []
    list.push(piece)
    byCategory.set(piece.category, list)
  }
  return Array.from(byCategory.entries())
    .map(
      ([category, pieces]) =>
        `${category}:\n${pieces.map((p) => `  - ${p.id} (${p.footprint.width}x${p.footprint.height}${p.resizable ? ", resizable" : ""}, ${p.defaultKind}): ${p.hint}`).join("\n")}`
    )
    .join("\n")
}
