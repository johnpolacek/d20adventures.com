// The figures the game ships, and where they are served from.
//
// Who stands as which figure is data: each adventure's `figures.json` beside its stagings
// (packages/stage/src/stagings/<adventure>/figures.json), a cast id and the character (asset-library/characters) for
// them. How a figure moves is in its own `figure.json`, under `motion`. Thalbern's figure is Hi3D's (the owner,
// 2026-11-19: "muh better! let's use the new one") and so is the owlbear's (the owner, 2026-11-20), Wollandora's
// Rodin's. A look can still name another (looks.ts `figures`).
//
// The desktop app bundles every figure an adventure names (apps/desktop/scripts/build-runtime.ts). Node reads the
// adventures' files through cast.ts.

export const FIGURE_FILES = "/asset-library/characters"

// What the game is told of a character's figure, beside where its model is (packages/stage/src/figures/models.ts).
// A figure rig.py rigged plays the written clips (packages/stage/src/figures/clips.ts), so its moves alone are named.
// A figure with clips of its own names every one it plays, and when its blows land.
export interface Plays {
  idle?: string
  walk?: string
  hit?: string
  fall?: string
  // The moves it makes in a fight, by the clip each plays.
  moves?: { melee?: string; ranged?: string; dodge?: string }
  // When each of its own clips lands, in seconds: a written clip's is in clips.ts STRIKE.
  lands?: Record<string, number>
}
