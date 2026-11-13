import { spellById } from "@d20/srd/spells"
import { shovedTo } from "../floor-areas"
import type { Point } from "../space"
import type { SpellRules } from "../spell-rules"
import type { Castee } from "../spells"

/**
 * Spells that move a creature by force or carry their caster with no walk. A push stops at the first solid thing on
 * the floor in play and comes into the areas on its way (../floor-areas `shovedTo`, ../spell-rounds `areasForced`). A
 * teleport (`teleports`) crosses nothing, draws no Opportunity Attacks, and touches only an area it lands in.
 */

// "is pushed 10 feet away from you": the feet, from the spell's words.
const pushFeet = (description: string): number => Number(/pushed (\d+) feet away from you/.exec(description)?.[1] ?? 0)

/**
 * Thunderwave: "On a failed save, a creature takes 2d8 Thunder damage and is pushed 10 feet away from you." The
 * unsecured objects it pushes and its boom are the story's.
 */
export const thunderwave: SpellRules = {
  spells: ["thunderwave"],
  failedSave: (cast, target) => {
    const placed = (id: string) => cast.find(id) as (Castee & { position?: Point }) | undefined
    const from = placed(cast.caster.id)?.position
    const now = placed(target.id)
    const at = now?.position
    const feet = pushFeet(cast.spell.description)
    if (!from || !now || !at || now.dead || !feet) return
    cast.put({ ...now, position: shovedTo(cast.floor, cast.everyone(), at, from, feet) } as Castee)
    cast.facts.push(`${now.name} is pushed ${feet} feet away from ${cast.caster.name}.`)
  },
}

// "you teleport up to 30 feet": the feet, from the spell's words.
const MISTY_FEET = Number(/teleport up to (\d+) feet/.exec(spellById.get("misty-step")?.description ?? "")?.[1] ?? 30)

/** Misty Step: "you teleport up to 30 feet to an unoccupied space you can see." */
export const mistyStep: SpellRules = { spells: ["misty-step"], teleports: { feet: MISTY_FEET, sees: true } }

/**
 * Dimension Door: "You teleport to a location within range. You arrive at exactly the spot desired. It can be a place
 * you can see, one you can visualize, or one you can describe". Its 500 feet is its range. The engine puts its caster
 * on a clear spot only, so it never arrives where a creature or a solid thing stands. The one willing creature it
 * can take along is the game master's to tell.
 */
export const dimensionDoor: SpellRules = { spells: ["dimension-door"], teleports: {} }
