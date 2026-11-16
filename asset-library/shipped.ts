// The figures the game ships, where they are served from: every one a cast member of a played look needs (play.ts).
// The desktop app bundles these (apps/desktop/scripts/build-runtime.ts).
export const FIGURE_FILES = "/asset-library/characters"
export const SHIPPED = ["thalbern", "wollandora", "owlbear"]
// The moves each makes in a fight, by the written clip it plays (packages/stage/src/figures/clips.ts). Thalbern cuts
// with a sword or shoots with a bow and gets out of the way; the owlbear swipes; Wollandora only dodges.
export const MOVES: Record<string, { melee?: string; ranged?: string; dodge?: string }> = {
  thalbern: { melee: "Swing", ranged: "Shoot", dodge: "Dodge" },
  wollandora: { dodge: "Dodge" },
  owlbear: { melee: "Claw" },
}
