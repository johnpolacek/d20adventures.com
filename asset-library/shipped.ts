// The figures the game ships, where they are served from: every one a cast member of a played look needs (play.ts).
// The desktop app bundles these (apps/desktop/scripts/build-runtime.ts).
export const FIGURE_FILES = "/asset-library/characters"
// A cast member, and the character (asset-library/characters) who stands for them. All three are the pilot's figures:
// a generated model rigged by Hyper3D, with fingers and borrowed clips (pipeline/pilot.ts). Thalbern's is Hi3D's (the
// owner, 2026-11-19: "muh better! let's use the new one") and so is the owlbear's (the owner, 2026-11-20), Wollandora's
// Rodin's. The ones rig.py made are kept beside them as `thalbern`, `wollandora` and `owlbear`, and Rodin's Thalbern
// and owlbear as `thalbern-rodin` and `owlbear-rodin`: a look can still name one (looks.ts `figures`).
export const SHIPPED: Record<string, string> = { thalbern: "thalbern-hi3d", wollandora: "wollandora-rodin", owlbear: "owlbear-hi3d" }

// What the game is told of a character's figure, beside where its model is (packages/stage/src/figures/models.ts).
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
// A figure rig.py rigged plays the written clips (packages/stage/src/figures/clips.ts), so its moves alone are named.
// Thalbern cuts with a sword or shoots with a bow and gets out of the way; the owlbear swipes; Wollandora only dodges.
// A figure with clips of its own names every one it plays, and when its blows land: the cut as the sword hand comes
// through fastest, the shot as the string is let go (its brief's `drawn`).
const SWORD: Plays = { idle: "Idle", walk: "Walk", hit: "Hit", fall: "Fall", moves: { melee: "Swing", dodge: "Sidestep" }, lands: { Swing: 0.4 } }
const CASTER: Plays = { idle: "Idle", walk: "Walk", hit: "Hit", fall: "Fall", moves: { dodge: "Sidestep" } }
const BEAST: Plays = { idle: "Idle Heavy", walk: "Walk Heavy", hit: "Hit", fall: "Fall", moves: { melee: "Claw" }, lands: { Claw: 0.6 } }
const THALBERN: Plays = { idle: "Idle", walk: "Walk", hit: "Hit", fall: "Fall", moves: { melee: "Swing", ranged: "Shoot", dodge: "Sidestep" }, lands: { Swing: 0.4, Shoot: 1.5 } }
export const PLAYS: Record<string, Plays> = {
  thalbern: { moves: { melee: "Swing", ranged: "Shoot", dodge: "Dodge" } },
  wollandora: { moves: { dodge: "Dodge" } },
  owlbear: { moves: { melee: "Claw" } },
  "wollandora-rodin": CASTER,
  // The owlbear stands and walks hunched, as a beast does (its brief's Idle Heavy and Walk Heavy), and its swipe lands
  // as the right paw comes through fastest.
  "owlbear-rodin": BEAST,
  "thalbern-rodin": THALBERN,
  // Hi3D's model of him, with the same rig and the same borrowed clips.
  "thalbern-hi3d": THALBERN,
  // Hi3D's models of the other two, made the same way. The owlbear's is shipped. Wollandora's is not: a look can name
  // it (looks.ts `figures`).
  "wollandora-hi3d": CASTER,
  "owlbear-hi3d": BEAST,
  // Covert Cargo's cast, made the same way. No look of that adventure is played yet, so none is in SHIPPED.
  "lyra-hi3d": CASTER,
  "poppen-hi3d": SWORD,
  reinhard: SWORD,
  silas: SWORD,
  "elf-fighter": SWORD,
  "elf-archer": THALBERN,
  aelar: SWORD,
}
