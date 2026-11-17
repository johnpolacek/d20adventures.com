// The figures the game ships, where they are served from: every one a cast member of a played look needs (play.ts).
// The desktop app bundles these (apps/desktop/scripts/build-runtime.ts).
export const FIGURE_FILES = "/asset-library/characters"
// A cast member, and the character (asset-library/characters) who stands for them. Thalbern and Wollandora are the
// pilot's figures: Rodin's model rigged by Hyper3D, with fingers and borrowed clips (pipeline/pilot.ts). The ones
// rig.py made are kept beside them as `thalbern` and `wollandora`, and a look can still name one (looks.ts `figures`).
export const SHIPPED: Record<string, string> = { thalbern: "thalbern-rodin", wollandora: "wollandora-rodin", owlbear: "owlbear" }

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
export const PLAYS: Record<string, Plays> = {
  thalbern: { moves: { melee: "Swing", ranged: "Shoot", dodge: "Dodge" } },
  wollandora: { moves: { dodge: "Dodge" } },
  owlbear: { moves: { melee: "Claw" } },
  "wollandora-rodin": { idle: "Idle", walk: "Walk", hit: "Hit", fall: "Fall", moves: { dodge: "Sidestep" } },
  // Not stood yet: its model is still to be made (pipeline/pilot.ts, the owner's to pay for).
  "owlbear-rodin": { idle: "Idle", walk: "Walk", hit: "Hit", fall: "Fall", moves: { melee: "Claw" } },
  "thalbern-rodin": { idle: "Idle", walk: "Walk", hit: "Hit", fall: "Fall", moves: { melee: "Swing", ranged: "Shoot", dodge: "Sidestep" }, lands: { Swing: 0.4, Shoot: 1.5 } },
}
