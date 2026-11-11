import type { Override } from "../lib/data"

export const languageOverrides: Override[] = [{ id: "druidic", path: "rarity", value: "rare", reason: "The Rare Languages table lists Druidic. The base source marks it standard.", page: 20 }]

export const conditionOverrides: Override[] = [
  {
    id: "charmed",
    path: "description",
    value:
      "While you have the Charmed condition, you experience the following effects.\n**Can’t Harm the Charmer.** You can’t attack the charmer or target the charmer with damaging abilities or magical effects.\n**Social Advantage.** The charmer has Advantage on any ability check to interact with you socially.",
    reason: "Social Advantage reads: any ability check to interact with you socially. The base source paraphrases it.",
    page: 178,
  },
  {
    id: "frightened",
    path: "description",
    value:
      "While you have the Frightened condition, you experience the following effects.\n**Ability Checks and Attacks Affected.** You have Disadvantage on ability checks and attack rolls while the source of fear is within line of sight.\n**Can’t Approach.** You can’t willingly move closer to the source of fear.",
    reason: "Can’t Approach reads: the source of fear. The base source adds a word.",
    page: 182,
  },
  {
    id: "grappled",
    path: "description",
    value:
      "While you have the Grappled condition, you experience the following effects.\n**Speed 0.** Your Speed is 0 and can’t increase.\n**Attacks Affected.** You have Disadvantage on attack rolls against any target other than the grappler.\n**Movable.** The grappler can drag or carry you when it moves, but every foot of movement costs it 1 extra foot unless you are Tiny or two or more sizes smaller than it.",
    reason: "Movable ends: two or more sizes smaller than it. The base source drops the last words.",
    page: 182,
  },
  {
    id: "petrified",
    path: "description",
    value:
      "While you have the Petrified condition, you experience the following effects.\n**Turned to Inanimate Substance.** You are transformed, along with any nonmagical objects you are wearing and carrying, into a solid inanimate substance (usually stone). Your weight increases by a factor of ten, and you cease aging.\n**Incapacitated.** You have the Incapacitated condition.\n**Speed 0.** Your Speed is 0 and can’t increase.\n**Attacks Affected.** Attack rolls against you have Advantage.\n**Saving Throws Affected.** You automatically fail Strength and Dexterity saving throws.\n**Resist Damage.** You have Resistance to all damage.\n**Poison Immunity.** You have Immunity to the Poisoned condition.",
    reason: "The base source repeats the last three effects.",
    page: 186,
  },
  {
    id: "unconscious",
    path: "description",
    value:
      "While you have the Unconscious condition, you experience the following effects.\n**Inert.** You have the Incapacitated and Prone conditions, and you drop whatever you’re holding. When this condition ends, you remain Prone.\n**Speed 0.** Your Speed is 0 and can’t increase.\n**Attacks Affected.** Attack rolls against you have Advantage.\n**Saving Throws Affected.** You automatically fail Strength and Dexterity saving throws.\n**Automatic Critical Hits.** Any attack roll that hits you is a Critical Hit if the attacker is within 5 feet of you.\n**Unaware.** You’re unaware of your surroundings.",
    reason: "Inert is one paragraph that ends: When this condition ends, you remain Prone. The base source splits it and breaks the markup.",
    page: 191,
  },
]
