import type { Override } from "../lib/data"

const elements = ["acid", "cold", "fire", "lightning"]

/**
 * Corrections to the base source and to the mechanics the builder reads from the official wording. The builder finds
 * saves, damage, conditions and areas by pattern. These entries fix what a pattern cannot read: a damage type named
 * apart from its dice, a save whose success has a stated outcome, a condition the spell ends or prevents rather than
 * gives, and a size that is a limit rather than an area of effect.
 */
export const overrides: Override[] = [
  // Header fields the base source gets wrong.
  { id: "protection-from-evil-and-good", path: "duration.concentration", value: true, reason: "Duration reads “Concentration up to 10 minutes”", page: 157 },

  // Areas: the size is a limit on an object or illusion, a portion of a target, or one of several pieces, not the spell's area of effect.
  { id: "alarm", path: "range.area", value: undefined, reason: "“an area within range that is no larger than a 20-foot Cube” is a limit", page: 107 },
  { id: "creation", path: "range.area", value: undefined, reason: "“The object must be no larger than a 5-foot Cube” is a limit", page: 121 },
  { id: "disintegrate", path: "range.area", value: undefined, reason: "“disintegrates a 10-foot-Cube portion of it” is part of a target", page: 124 },
  { id: "fabricate", path: "range.area", value: undefined, reason: "the raw materials fit “within a 10-foot Cube”, a limit", page: 129 },
  { id: "fire-storm", path: "range.area", value: undefined, reason: "the area is “up to ten 10-foot Cubes”, not one Cube", page: 132 },
  { id: "heroes-feast", path: "range.area", value: undefined, reason: "the feast appears “in an unoccupied 10-foot Cube”, not an area of effect", page: 140 },
  { id: "magnificent-mansion", path: "range.area", value: undefined, reason: "the dwelling “can’t exceed 50 contiguous 10-foot Cubes”, a limit", page: 147 },
  { id: "major-image", path: "range.area", value: undefined, reason: "the image is “no larger than a 20-foot Cube”, a limit", page: 147 },
  { id: "minor-illusion", path: "range.area", value: undefined, reason: "the image “must be no larger than a 5-foot Cube”, a limit", page: 149 },
  { id: "phantasmal-force", path: "range.area", value: undefined, reason: "the phantasm is “no larger than a 10-foot Cube”, a limit", page: 151 },
  { id: "programmed-illusion", path: "range.area", value: undefined, reason: "the illusion is “no larger than a 30-foot Cube”, a limit", page: 156 },
  { id: "silent-image", path: "range.area", value: undefined, reason: "the image is “no larger than a 15-foot Cube”, a limit", page: 162 },
  { id: "gust-of-wind", path: "range.area", value: { shape: "line", size: 60, width: 10 }, reason: "“A Line of strong wind 60 feet long and 10 feet wide”", page: 138 },

  // Damage the patterns cannot read, or read as two rolls where the text gives one roll of a chosen type.
  {
    id: "chromatic-orb",
    path: "damage",
    value: [{ dice: "3d8", types: ["acid", "cold", "fire", "lightning", "poison", "thunder"], perSlot: "1d8" }],
    reason: "“Choose Acid, Cold, Fire, Lightning, Poison, or Thunder” and “the target takes 3d8 damage of the chosen type”",
    page: 115,
  },
  {
    id: "conjure-elemental",
    path: "damage",
    value: [
      { dice: "8d8", types: ["lightning", "thunder", "fire", "cold"], perSlot: "1d8" },
      { dice: "4d8", types: ["lightning", "thunder", "fire", "cold"], perSlot: "1d8" },
    ],
    reason: "“air (Lightning), earth (Thunder), fire (Fire), or water (Cold)”, “8d8 damage of the spirit’s type” and “4d8 damage of the spirit’s type”",
    page: 118,
  },
  {
    id: "conjure-minor-elementals",
    path: "damage",
    value: [{ dice: "2d8", types: elements, perSlot: "1d8" }],
    reason: "“an extra 2d8 damage … This damage is Acid, Cold, Fire, or Lightning”",
    page: 118,
  },
  {
    id: "delayed-blast-fireball",
    path: "damage",
    value: [{ dice: "12d6", types: ["fire"], perSlot: "1d6" }],
    reason: "“A creature takes Fire damage”, “The spell’s base damage is 12d6”, and the base damage increases by 1d6 per slot level above 7",
    page: 122,
  },
  {
    id: "dragons-breath",
    path: "damage",
    value: [{ dice: "3d6", types: ["acid", "cold", "fire", "lightning", "poison"], perSlot: "1d6" }],
    reason: "“choose Acid, Cold, Fire, Lightning, or Poison” and “3d6 damage of the chosen type”",
    page: 126,
  },
  {
    id: "sorcerous-burst",
    path: "damage",
    value: [{ dice: "1d8", types: ["acid", "cold", "fire", "lightning", "poison", "psychic", "thunder"], cantrip: { 5: "2d8", 11: "3d8", 17: "4d8" } }],
    reason: "“1d8 damage of a type you choose: Acid, Cold, Fire, Lightning, Poison, Psychic, or Thunder”",
    page: 163,
  },
  {
    id: "fire-shield",
    path: "damage",
    value: [{ dice: "2d8", types: ["fire", "cold"] }],
    reason: "“2d8 Fire damage from a warm shield or 2d8 Cold damage from a chill shield” is one roll by the shield chosen",
    page: 132,
  },
  {
    id: "spirit-guardians",
    path: "damage",
    value: [{ dice: "3d8", types: ["radiant", "necrotic"], perSlot: "1d8" }],
    reason: "“3d8 Radiant damage (if you are good or neutral) or 3d8 Necrotic damage (if you are evil)” is one roll",
    page: 165,
  },
  { id: "guardian-of-faith", path: "damage", value: [{ amount: 20, types: ["radiant"] }], reason: "“taking 20 Radiant damage on a failed save”", page: 137 },
  {
    id: "meld-into-stone",
    path: "damage",
    value: [
      { dice: "6d6", types: ["force"] },
      { amount: 50, types: ["force"] },
    ],
    reason: "“deals 6d6 Force damage to you” and “deals 50 Force damage to you”",
    page: 148,
  },
  {
    id: "arcane-hand",
    path: "damage",
    value: [
      { dice: "5d8", types: ["force"], perSlot: "2d8" },
      { dice: "4d6", types: ["bludgeoning"], modifier: true, perSlot: "2d6" },
    ],
    reason: "“the damage of the Clenched Fist increases by 2d8 and the damage of the Grasping Hand increases by 2d6”",
    page: 110,
  },
  { id: "glyph-of-warding", path: "damage.0.perSlot", value: "1d8", reason: "“The damage of an explosive rune increases by 1d8 for each spell slot level above 3”", page: 137 },
  { id: "vitriolic-sphere", path: "damage.1.perSlot", value: undefined, reason: "“The initial damage increases by 2d4”, so the later 5d4 does not scale", page: 172 },
  { id: "wall-of-ice", path: "damage.0.perSlot", value: "2d6", reason: "“The damage the wall deals when it appears increases by 2d6”", page: 173 },
  { id: "wall-of-ice", path: "damage.1.perSlot", value: "1d6", reason: "“the damage from passing through the sheet of frigid air increases by 1d6”", page: 173 },
  { id: "wish", path: "damage", value: undefined, reason: "“1d10 Necrotic damage per level of that spell” is the stress on the caster, scaled by other spells", page: 175 },

  // Healing the patterns cannot read.
  { id: "heal", path: "healing", value: { amount: 70, perSlotAmount: 10 }, reason: "“restoring 70 Hit Points” and “The healing increases by 10 for each spell slot level above 6”", page: 139 },
  { id: "goodberry", path: "healing", value: { amount: 1 }, reason: "“Eating a berry restores 1 Hit Point”", page: 137 },
  {
    id: "heroism",
    path: "healing",
    value: { modifier: true, temporary: true },
    reason: "“gains Temporary Hit Points equal to your spellcasting ability modifier at the start of each of its turns”",
    page: 140,
  },
  { id: "false-life", path: "healing.perSlotAmount", value: 5, reason: "“You gain 5 additional Temporary Hit Points for each spell slot level above 1”", page: 129 },

  // Saves: the outcome of a success, and spells with more than one save.
  {
    id: "antipathy-sympathy",
    path: "saves",
    value: [{ ability: "wis", onSuccess: "none" }],
    reason: "“Your choice of antipathy or sympathy determines what happens to a creature when it fails that save”, and a success has no effect",
    page: 109,
  },
  {
    id: "earthquake",
    path: "saves",
    value: [
      { ability: "dex", onSuccess: "none" },
      { ability: "dex", onSuccess: "half" },
    ],
    reason: "“On a failed save, a creature has the Prone condition”, then by a collapsing structure “On a successful save, the creature takes half as much damage only”",
    page: 127,
  },
  { id: "enlarge-reduce", path: "saves.0.onSuccess", value: "none", reason: "“On a successful save, the spell has no effect”", page: 128 },
  { id: "ensnaring-strike", path: "saves.0.onSuccess", value: "none", reason: "“On a successful save, the vines shrivel away, and the spell ends”", page: 128 },
  { id: "fear", path: "saves.0.onSuccess", value: "none", reason: "“must succeed on a Wisdom saving throw or drop whatever it is holding and have the Frightened condition”", page: 130 },
  { id: "forcecage", path: "saves.0.onSuccess", value: "none", reason: "“On a successful save, the creature can use that magic to exit the cage”", page: 134 },
  { id: "hideous-laughter", path: "saves.0.onSuccess", value: "none", reason: "“On a failed save, it has the Prone and Incapacitated conditions”, and a success has no effect", page: 140 },
  { id: "imprisonment", path: "saves.0.onSuccess", value: "none", reason: "“On a successful save, the target is unaffected”", page: 142 },
  {
    id: "magic-jar",
    path: "saves",
    value: [{ ability: "cha", onSuccess: "none" }],
    reason: "“On a successful save, the target resists your efforts to possess it”. The other save is the caster’s own",
    page: 146,
  },
  {
    id: "prismatic-spray",
    path: "saves",
    value: [
      { ability: "dex", onSuccess: "other" },
      { ability: "con", onSuccess: "other" },
      { ability: "wis", onSuccess: "other" },
    ],
    reason:
      "a Dexterity save whose success depends on the ray, then “makes a Constitution saving throw at the end of each of its turns” for Indigo and “makes a Wisdom saving throw at the start of your next turn” for Violet in the Prismatic Rays table",
    page: 155,
  },
  {
    id: "prismatic-wall",
    path: "saves",
    value: [
      { ability: "con", onSuccess: "none" },
      { ability: "dex", onSuccess: "other" },
      { ability: "con", onSuccess: "other" },
      { ability: "wis", onSuccess: "other" },
    ],
    reason:
      "“must succeed on a Constitution saving throw or have the Blinded condition”, “Each layer forces the creature to make a Dexterity saving throw”, then the Indigo layer’s Constitution saves and the Violet layer’s Wisdom save in the Prismatic Layers table",
    page: 155,
  },
  { id: "scrying", path: "saves.0.onSuccess", value: "none", reason: "“On a successful save, the target isn’t affected”", page: 160 },
  {
    id: "storm-of-vengeance",
    path: "saves",
    value: [
      { ability: "con", onSuccess: "none" },
      { ability: "dex", onSuccess: "half" },
    ],
    reason: "“must succeed on a Constitution saving throw or take 2d6 Thunder damage”, then “10d6 Lightning damage on a failed save or half as much damage on a successful one”",
    page: 165,
  },
  {
    id: "symbol",
    path: "saves",
    value: [
      { ability: "con", onSuccess: "half" },
      { ability: "wis", onSuccess: "none" },
      { ability: "con", onSuccess: "none" },
    ],
    reason:
      "Death reads “half as much damage on a successful save”, Discord, Fear, Sleep and Stunning are Wisdom saves, and Pain reads “must succeed on a Constitution saving throw or have the Incapacitated condition”",
    page: 167,
  },
  {
    id: "tsunami",
    path: "saves",
    value: [
      { ability: "str", onSuccess: "half" },
      { ability: "str", onSuccess: "none" },
    ],
    reason: "“6d10 Bludgeoning damage on a failed save or half as much damage on a successful one”, then “must succeed on a Strength saving throw or take 5d10 Bludgeoning damage”",
    page: 171,
  },
  { id: "vitriolic-sphere", path: "saves.0.onSuccess", value: "half", reason: "“On a successful save, a creature takes half the initial damage only”", page: 172 },

  // Contact Other Plane's save, damage and condition fall on the caster against a fixed DC 15.
  { id: "contact-other-plane", path: "saves", value: undefined, reason: "“make a DC 15 Intelligence saving throw” is the caster’s own save", page: 119 },
  { id: "contact-other-plane", path: "damage", value: undefined, reason: "“you take 6d6 Psychic damage” on the caster’s failed save", page: 119 },
  { id: "contact-other-plane", path: "conditions", value: undefined, reason: "on the caster’s failed save, “you take 6d6 Psychic damage and have the Incapacitated condition”", page: 119 },

  // Conditions the text ends, prevents or names without giving.
  { id: "dispel-evil-and-good", path: "conditions", value: undefined, reason: "Break Enchantment: “The target is no longer possessed, Charmed, or Frightened by such creatures”", page: 124 },
  { id: "find-steed", path: "conditions", value: undefined, reason: "“If you have the Incapacitated condition” is a state of the caster", page: 130 },
  { id: "freedom-of-movement", path: "conditions", value: undefined, reason: "effects can’t “cause the target to have the Paralyzed or Restrained conditions”", page: 134 },
  { id: "hallow", path: "conditions", value: ["frightened"], reason: "Fear reads “have the Frightened condition while in the area”, and Hallowed Ward ends Charmed and Frightened", page: 139 },
  { id: "haste", path: "conditions", value: ["incapacitated"], reason: "“When the spell ends, the target is Incapacitated”", page: 139 },
  { id: "magic-circle", path: "conditions", value: undefined, reason: "targets “can’t be possessed by or gain the Charmed or Frightened condition”", page: 146 },
  { id: "mass-heal", path: "conditions", value: undefined, reason: "“also have the Blinded, Deafened, and Poisoned conditions removed from them”", page: 147 },
  { id: "mind-spike", path: "conditions", value: undefined, reason: "“if it has the Invisible condition, it gains no benefit from that condition against you”", page: 149 },
  { id: "mirror-image", path: "conditions", value: undefined, reason: "“A creature is unaffected by this spell if it has the Blinded condition”", page: 150 },
  { id: "power-word-heal", path: "conditions", value: undefined, reason: "“If the creature has the Charmed, Frightened, Paralyzed, Poisoned, or Stunned condition, the condition ends”", page: 154 },
  { id: "protection-from-evil-and-good", path: "conditions", value: undefined, reason: "the target “can’t be possessed by or gain the Charmed or Frightened conditions”", page: 157 },
  { id: "see-invisibility", path: "conditions", value: undefined, reason: "“you see creatures and objects that have the Invisible condition as if they were visible”", page: 160 },
]
