/**
 * The labels of how much of each spell the engine runs, kept apart from ./spells so the item rules (./item-use) can
 * read them without loading the cast code.
 */

/**
 * How much of a spell the engine runs. "run": it resolves all the spell does, and the game master tells it from the
 * rolls. "partly": it resolves the part its rules hold, and the game master is given the spell's text for the rest,
 * which changes no one's hit points or conditions. "told": it checks the spell can be cast, spends what it costs and
 * holds its Concentration, and the game master tells it from its text. A spell is told unless it is named below.
 */
export type SpellLabel = "run" | "partly" | "told"

/**
 * Spells the engine runs in full, each checked against its SRD 5.2.1 text. Light, sound and burning objects that no one
 * holds are the story's. Divine Smite and Searing Smite are cast with the attack they ride (./classes/paladin).
 */
const RUN = new Set([
  // Cantrips.
  "acid-splash",
  "eldritch-blast",
  "fire-bolt",
  "guidance",
  "poison-spray",
  "sacred-flame",
  "sorcerous-burst",
  "vicious-mockery",
  // Level 1.
  "animal-friendship",
  "bane",
  "bless",
  "burning-hands",
  "color-spray",
  "cure-wounds",
  "divine-smite",
  "false-life",
  "guiding-bolt",
  "healing-word",
  "heroism",
  "inflict-wounds",
  "mage-armor",
  "magic-missile",
  "ray-of-sickness",
  "searing-smite",
  "shield",
  "shield-of-faith",
  // Level 2.
  "acid-arrow",
  "aid",
  "barkskin",
  "blur",
  "hold-person",
  "invisibility",
  "lesser-restoration",
  "mirror-image",
  "scorching-ray",
  "shatter",
  "spiritual-weapon",
  // Level 3.
  "counterspell",
  "fireball",
  "lightning-bolt",
  "mass-healing-word",
  "revivify",
  "vampiric-touch",
  // Levels 4 to 9: a save for half or healing, with nothing more.
  "hold-monster",
  "cone-of-cold",
  "flame-strike",
  "mass-cure-wounds",
  "circle-of-death",
  // Counted and shaped (./spell-mechanics/shapes): Chain Lightning's four targets within 30 feet of the first, Meteor
  // Swarm's four Spheres a mile off.
  "chain-lightning",
  "meteor-swarm",
  // A choice kept on the spell (./spell-mechanics/choices): Blindness/Deafness's condition, Protection from Energy's type.
  "blindness-deafness",
  "protection-from-energy",
  // Saves made again (./spell-mechanics/repeated-saves, later-harm, damage-saves): Phantasmal Killer's and Weird's
  // damage on each failure, Vitriolic Sphere's later burn, Hideous Laughter's save on taking damage.
  "phantasmal-killer",
  "weird",
  "vitriolic-sphere",
  "hideous-laughter",
  // Used again on later turns (./spell-mechanics/used-again): Flame Blade's and Produce Flame's strikes, Arcane Sword's,
  // Sunbeam's new Lines.
  "flame-blade",
  "produce-flame",
  "arcane-sword",
  "sunbeam",
  // Defences a spell gives (./spell-mechanics/wards): resistances, immunities, Advantage, and Death Ward's 1 hit point.
  // Heroes' Feast's day ends with a Long Rest, and its hour of eating passes in the story.
  "stoneskin",
  "protection-from-poison",
  "heroes-feast",
  "foresight",
  "death-ward",
  "greater-invisibility",
  // Thresholds and restoration (./spell-mechanics/thresholds, restoration): Divine Word's banished leave the fight, which
  // the engine takes to be on the Material Plane. Regenerate's body parts are the story's.
  "power-word-kill",
  "power-word-stun",
  "power-word-heal",
  "divine-word",
  "heal",
  "mass-heal",
  "harm",
  "spare-the-dying",
  "regenerate",
  // Areas that stay on the floor (./spell-mechanics/lasting-areas). Sleet Storm's doused flames are the story's.
  "grease",
  "sleet-storm",
])

/**
 * Spells the engine runs in part. It rolls and applies what its rules hold, and the game master is given the spell's
 * text for the rest, which changes no one's hit points or conditions. What each leaves to the text: Chill Touch's bar
 * on healing, Shocking Grasp's bar on Opportunity Attacks, Ray of Frost's lost Speed, Starry Wisp's and Faerie Fire's
 * light against the Invisible, Charm Person's Advantage while it is fought, Chromatic Orb's leap, Command's words,
 * Dissonant Whispers' flight, Ensnaring Strike's escape check, whose DC the game master is told, Entangle's escape check and its sparing its caster, Hex's move, Hunter's
 * Mark's tracking and its move, Ice Knife's burst on those beside its target,
 * Sleep's shake awake, Thunderwave's push, Mind Spike's tracking, Moonbeam's undoing of a changed
 * shape, Shining Smite's light and its bar on the Invisible, Sunburst's end of Darkness, Mass Suggestion's
 * course of activity and its end when that is done, Enhance Ability's different ability for each target, Flesh to
 * Stone's Speed of 0 on a success and its lasting stone after the whole minute, Contagion's save when its Poisoned would
 * end and its 7 days, Befuddlement's bar on spells and the Magic action and its save every 30 days, the Dominate spells'
 * Advantage while the target is fought, their commands and their longer Concentration from a higher slot, Charm
 * Monster's Advantage while it is fought, Flaming Sphere's move that rams no one, over barriers and across pits,
 * Shillelagh's end when the weapon is let go and its working on a stat block's weapon. Mind
 * Blank's shield against sensing and scrying, Fire Shield's flames on one who hits it and its light, Protection from
 * Evil and Good's bar on being possessed, Charmed or Frightened by those creatures, Dispel Evil and Good's Break
 * Enchantment and Dismissal, Freedom of Movement's terrain, Swim Speed, Speed kept from magic and escape, Greater
 * Restoration's cursed item and lowered ability scores, Disintegrate's objects and creations of force, Finger of
 * Death's Zombie, and the raising of one who died before this round, whom the engine no longer holds, and True
 * Resurrection's new body and an Undead's living form, Resurrection's tax for one dead a year or more, and Warding
 * Bond's damage shared with its caster and its end. The areas that stay on the floor (./spell-mechanics/lasting-areas,
 * walls) leave: Web's anchoring, breaking free and burning, and its Lightly Obscured, Stinking Cloud's bar on actions and
 * the strong wind that ends it, Cloudkill's, Fog Cloud's and Incendiary Cloud's wind too, and the direction Incendiary
 * Cloud drifts, which the engine takes as straight away, Darkness on an object and the light it dispels, Spike Growth's
 * camouflage, Insect Plague's Lightly Obscured, Black Tentacles' escape check, Guardian of Faith's body in the way,
 * Call Lightning's storm already raging, the rings, domes and panels of the walls and how high they stand, Blade
 * Barrier's Three-Quarters Cover, and Wall of Force at an angle or afloat, against Disintegrate and the Ethereal Plane.
 */
const PARTLY = new Set([
  "chill-touch",
  "ray-of-frost",
  "shocking-grasp",
  "starry-wisp",
  "charm-person",
  "chromatic-orb",
  "command",
  "dissonant-whispers",
  "ensnaring-strike",
  "entangle",
  "faerie-fire",
  "hex",
  "hunters-mark",
  "ice-knife",
  "sleep",
  "thunderwave",
  "mind-spike",
  "moonbeam",
  "shining-smite",
  "enthrall",
  "heat-metal",
  "magic-weapon",
  "pass-without-trace",
  "phantasmal-force",
  "prayer-of-healing",
  "ray-of-enfeeblement",
  "suggestion",
  "warding-bond",
  "web",
  "bestow-curse",
  "fear",
  "haste",
  "hypnotic-pattern",
  "slow",
  "spirit-guardians",
  "stinking-cloud",
  "wind-wall",
  "beacon-of-hope",
  "remove-curse",
  "dispel-magic",
  "mass-suggestion",
  "sunburst",
  "enhance-ability",
  "flesh-to-stone",
  "contagion",
  "befuddlement",
  "dominate-beast",
  "dominate-person",
  "dominate-monster",
  "charm-monster",
  "flaming-sphere",
  "shillelagh",
  "mind-blank",
  "fire-shield",
  "protection-from-evil-and-good",
  "dispel-evil-and-good",
  "freedom-of-movement",
  "greater-restoration",
  "disintegrate",
  "finger-of-death",
  "raise-dead",
  "resurrection",
  "true-resurrection",
  "cloudkill",
  "fog-cloud",
  "darkness",
  "spike-growth",
  "insect-plague",
  "incendiary-cloud",
  "black-tentacles",
  "guardian-of-faith",
  "call-lightning",
  "wall-of-fire",
  "wall-of-force",
  "blade-barrier",
  "wall-of-thorns",
])

// Held as told for a fault the engine has, though their data is typed: Divine Favor would add its die to hits on its
// caster, Goodberry makes no berries, Hellish Rebuke is never offered as a Reaction, Sanctuary has the one warded save,
// and Resistance's die is taken off no damage. Above level 3 every spell
// not named above, until the owner's fourth step.

/** How much of a spell the engine runs (`SpellLabel`). */
export const spellLabel = (spell: { id: string }): SpellLabel => (RUN.has(spell.id) ? "run" : PARTLY.has(spell.id) ? "partly" : "told")

/** The spells named as run or partly run, by id, for the check that each is a spell of the SRD and named once. */
export const namedSpellIds = (): string[] => [...RUN, ...PARTLY]

/** Whether the engine resolves all a spell does. Any other is told by the game master from the spell's text, in full or in part. */
export const isEngineSpell = (spell: { id: string }): boolean => spellLabel(spell) === "run"
