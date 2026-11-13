import type { SpellRules } from "../spell-rules"

/**
 * Spells cast once and used again on the caster's later turns, each held by its caster with the slot it was cast at
 * (./spells `againOf`, `castAgain`). Light they shed is the story's.
 */

/**
 * Flame Blade: "You evoke a fiery blade in your free hand ... As a Magic action, you can make a melee spell attack with
 * the fiery blade. On a hit, the target takes Fire damage equal to 3d6 plus your spellcasting ability modifier." The
 * blade strikes no one as it is evoked, and strikes with the action, the turn it is evoked or later.
 */
export const flameBlade: SpellRules = { spells: ["flame-blade"], held: { byCaster: true }, again: { takes: "action", onlyLater: true } }

/**
 * Produce Flame: "A flickering flame appears in your hand ... Until the spell ends, you can take a Magic action to hurl
 * fire at a creature or an object within 60 feet of you. Make a ranged spell attack. On a hit, the target takes 1d8 Fire
 * damage." It has no Concentration, so it is held while it lasts.
 */
export const produceFlame: SpellRules = { spells: ["produce-flame"], held: { byCaster: true }, again: { takes: "action", onlyLater: true, reach: 60 } }

/**
 * Arcane Sword: "When the sword appears, you make a melee spell attack against a target within 5 feet of the sword ... On
 * your later turns, you can take a Bonus Action to move the sword up to 30 feet to a spot you can see and repeat the
 * attack." The sword is not placed on the floor, so the one it strikes is not measured from it, as Spiritual Weapon's.
 */
export const arcaneSword: SpellRules = { spells: ["arcane-sword"], held: { byCaster: true }, again: { takes: "bonus-action", unplaced: true } }

/**
 * Sunbeam: "Until the spell ends, you can take a Magic action to create a new Line of radiance." Each new Line is cast
 * from the caster as the first was, and each creature in it makes the save again.
 */
export const sunbeam: SpellRules = {
  spells: ["sunbeam"],
  held: { byCaster: true },
  again: { takes: "action" },
  savedAtCast: (save) => save.when === "initial",
}

/**
 * Flaming Sphere: "As a Bonus Action, you can move the sphere up to 30 feet, rolling it along the ground. If you move the
 * sphere into a creature's space, that creature makes the save against the sphere, and the sphere stops moving for the
 * turn." It burns no one as it appears, and the ram is its use again, on the one named within 30 feet of where it
 * stands, and it stops beside them. Where it stands is held on the floor, with the save of one who ends its turn within
 * 5 feet of it (./lasting-areas).
 */
export const flamingSphere: SpellRules = {
  spells: ["flaming-sphere"],
  held: { byCaster: true },
  again: { takes: "bonus-action", onlyLater: true, reach: 30, parts: (part) => !!part.appliesWhen },
  savedAtCast: (_, again) => again,
}
