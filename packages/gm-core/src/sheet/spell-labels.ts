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
])

/**
 * Spells the engine runs in part. It rolls and applies what its rules hold, and the game master is given the spell's
 * text for the rest, which changes no one's hit points or conditions. What each leaves to the text: Chill Touch's bar
 * on healing, Shocking Grasp's bar on Opportunity Attacks, Ray of Frost's lost Speed, Starry Wisp's and Faerie Fire's
 * light against the Invisible, Charm Person's Advantage while it is fought, Chromatic Orb's leap, Command's words,
 * Dissonant Whispers' flight, Entangle's and Grease's ground, Grease's later falls, Hex's move, Hunter's
 * Mark's tracking and its move, Hideous Laughter's save on damage, Ice Knife's burst on those beside its target,
 * Sleep's shake awake, Thunderwave's push, Mind Spike's tracking, Moonbeam's later
 * burns and its move, Shining Smite's light and its bar on the Invisible, Sunburst's end of Darkness, Mass Suggestion's
 * course of activity and its end when that is done, Enhance Ability's different ability for each target.
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
  "entangle",
  "faerie-fire",
  "grease",
  "hex",
  "hideous-laughter",
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
  "sleet-storm",
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
])

// Held as told for a fault the engine has, though their data is typed: Divine Favor would add its die to hits on its
// caster, Goodberry makes no berries, Call Lightning strikes one creature once, Flame Blade and Produce Flame attack as
// they are cast and deal nothing, Hellish Rebuke is never offered as a Reaction, Sanctuary has the one warded save,
// Resistance's die is taken off no damage, and Ensnaring Strike has no hit to ride (./castableOnTurn). Above level 3 every spell
// not named above, until the owner's fourth step.

/** How much of a spell the engine runs (`SpellLabel`). */
export const spellLabel = (spell: { id: string }): SpellLabel => (RUN.has(spell.id) ? "run" : PARTLY.has(spell.id) ? "partly" : "told")

/** The spells named as run or partly run, by id, for the check that each is a spell of the SRD and named once. */
export const namedSpellIds = (): string[] => [...RUN, ...PARTLY]

/** Whether the engine resolves all a spell does. Any other is told by the game master from the spell's text, in full or in part. */
export const isEngineSpell = (spell: { id: string }): boolean => spellLabel(spell) === "run"
