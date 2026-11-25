import type { EffectKind } from "../effects"

// Which of a figure's moves an attack or a spell plays, from what it looks like and what was used. Every weapon and
// spell shares a few moves, so a figure needs a clip for each move, not for each weapon: a dagger and a rapier both
// thrust, a warhammer and a greataxe both come down two-handed, and Magic Missile and Guiding Bolt are both a cast at
// someone. `using` is the attack's name as the rules give it ("Dagger", "Longbow", "Ray of Frost"), when it is known.
//
// The moves, by their names in a figure's spec (models.ts FigureSpec moves): a cut (melee), a thrust (stab), a blow
// with both hands (heavy), a staff's blow (staff), a shot (ranged), a blade or a spear thrown (throw), and a spell
// cast at someone or at a place (cast, area). Each is tried in turn: a figure with no thrust cuts, and one with no move
// for a spell over an area casts it as at someone. A thrown dagger is never played as a bow's shot.
export const MOVE_KINDS = ["melee", "stab", "heavy", "staff", "ranged", "throw", "cast", "area"] as const
export type MoveKind = (typeof MOVE_KINDS)[number]

const has = (using: string, words: string[]) => words.some((w) => using.includes(w))
const STABS = ["dagger", "rapier", "spear", "pike", "trident", "lance"]
const HEAVY = ["greataxe", "greatsword", "greatclub", "maul", "warhammer", "battleaxe", "halberd", "glaive", "war pick", "flail", "morningstar"]
const STAVES = ["quarterstaff", "staff", "club"]
const THROWN = ["dagger", "dart", "javelin", "handaxe", "light hammer", "spear", "trident"]
const SHOTS = ["bow", "sling", "crossbow", "blowgun"]

export function movesFor(kind: EffectKind, using?: string): MoveKind[] {
  const u = (using ?? "").toLowerCase()
  if (kind === "slash" || kind === "impact") {
    if (has(u, HEAVY)) return ["heavy", "melee"]
    if (has(u, STAVES) && !u.includes("greatclub")) return ["staff", "melee"]
    if (has(u, STABS)) return ["stab", "melee"]
    return ["melee"]
  }
  if (kind === "arrow") {
    if (!has(u, SHOTS) && has(u, THROWN)) return ["throw"]
    return ["ranged"]
  }
  if (kind === "burst" || kind === "mist") return ["area", "cast"]
  return ["cast"]
}

// The moves made with a weapon, and not a spell: the figure lunges into them (stage.ts body "strike").
export const WEAPON_MOVES: readonly MoveKind[] = ["melee", "stab", "heavy", "staff", "ranged", "throw"]
