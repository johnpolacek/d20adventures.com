import type { Override } from "../lib/data"

const demonArmorSentence =
  "In addition, the armor’s clawed gauntlets allow your Unarmed Strikes to deal 1d8 Slashing damage instead of the usual Bludgeoning damage, and you gain a +1 bonus to the attack and damage rolls of your Unarmed Strikes."
const lordlyMight = "This rod has a flanged head, and it functions as a magic Mace that grants a +3 bonus to attack rolls and damage rolls made with it."
const button2 =
  "Button 2. The rod’s flanged head folds down and two crescent-shaped blades spring out, transforming the rod into a magic Battleaxe that grants a +3 bonus to attack rolls and damage rolls made with it."
const button3 =
  "Button 3. The rod’s flanged head folds down, a spear point springs from the rod’s tip, and the rod’s handle lengthens into a 6-foot haft, transforming the rod into a magic Spear that grants a +3 bonus to attack rolls and damage rolls made with it."
const button5 = "Button 5. The rod transforms into a handheld battering ram and grants its user a +10 bonus to Strength (Athletics) checks made to break through doors, barricades, and other barriers."

export const overrides: Override[] = [
  {
    id: "demon-armor",
    path: "conditionalBonuses",
    value: [
      { to: "attack-rolls", value: 1, appliesWhen: "of your Unarmed Strikes", text: demonArmorSentence },
      { to: "damage-rolls", value: 1, appliesWhen: "of your Unarmed Strikes", text: demonArmorSentence },
    ],
    reason: "The bonus names two rolls of Unarmed Strikes in one phrase, which the sentence parser does not split. It applies only to Unarmed Strikes.",
    page: 218,
  },
  {
    id: "demon-armor",
    path: "damage.0.appliesWhen",
    value: "your Unarmed Strikes",
    reason: 'The 1d8 Slashing damage is the damage of the wearer\'s Unarmed Strikes only: "allow your Unarmed Strikes to deal 1d8 Slashing damage instead of the usual Bludgeoning damage".',
    page: 218,
  },
  {
    id: "rod-of-lordly-might",
    path: "bonuses",
    value: undefined,
    reason: "Every +3 of the rod is one form of it: the Mace is the normal form, Button 2 makes a Battleaxe and Button 3 a Spear, so none applies in every form.",
    page: 241,
  },
  {
    id: "rod-of-lordly-might",
    path: "conditionalBonuses",
    value: [
      { to: "attack-rolls", value: 3, appliesWhen: "it functions as a magic Mace", text: lordlyMight },
      { to: "damage-rolls", value: 3, appliesWhen: "it functions as a magic Mace", text: lordlyMight },
      { to: "attack-rolls", value: 3, appliesWhen: "transforming the rod into a magic Battleaxe", text: button2 },
      { to: "damage-rolls", value: 3, appliesWhen: "transforming the rod into a magic Battleaxe", text: button2 },
      { to: "attack-rolls", value: 3, appliesWhen: "transforming the rod into a magic Spear", text: button3 },
      { to: "damage-rolls", value: 3, appliesWhen: "transforming the rod into a magic Spear", text: button3 },
      { to: "athletics-checks", value: 10, appliesWhen: "made to break through doors, barricades, and other barriers", text: button5 },
    ],
    reason: "Button 2, 3 and 5 label their own paragraphs, which the sentence parser reads as separate sentences.",
    page: 241,
  },
  {
    id: "bag-of-tricks",
    path: "uses",
    value: [{ count: 3, recharge: "dawn" }],
    reason: '"Once three fuzzy objects have been pulled from the bag, the bag can’t be used again until the next dawn": three uses before the dawn reset.',
    page: 212,
  },
  {
    id: "hammer-of-thunderbolts",
    path: "saves.0.label",
    value: "thunderclap",
    reason:
      'The hammer has two Constitution saves with the same DC. The first is stated in the opening paragraph: "the weapon unleashes a thunderclap audible out to 300 feet. The target and every creature within 30 feet of it other than you must succeed on a DC 17 Constitution saving throw".',
    page: 224,
  },
  {
    id: "rod-of-lordly-might",
    path: "damage.0.appliesWhen",
    value: "the blade functions as a magic Longsword or Shortsword (your choice)",
    reason:
      "Button 1: \"the blade functions as a magic Longsword or Shortsword (your choice) that deals an extra 2d6 Fire damage on a hit\". The extra damage is the blade form's, not the rod's in its other forms.",
    page: 241,
  },
  {
    id: "mysterious-deck",
    path: "spells.0.group",
    value: "Moon",
    reason: 'The Moon card: "You gain the ability to cast Wish 1d3 times." The casting is in a card\'s paragraph, so the card names where it comes from.',
    page: 231,
  },
  {
    id: "oathbow",
    path: "damage.0.appliesWhen",
    value: "When you make a ranged attack roll with this weapon against your sworn enemy",
    reason:
      'The extra 3d6 Piercing damage is dealt only to the sworn enemy: "When you make a ranged attack roll with this weapon against your sworn enemy, you have Advantage on the roll. ... If the attack hits, your sworn enemy takes an extra 3d6 Piercing damage."',
    page: 233,
  },
  {
    id: "thunderous-greatclub",
    path: "saves.1.label",
    value: "each creature on the ground",
    reason:
      'Earthquake has three saves with the same DC family. The printed words that tell them apart are "each creature on the ground in that area", "also concentrating" and "on a spot where the fissure opens".',
    page: 249,
  },
  {
    id: "thunderous-greatclub",
    path: "saves.2.label",
    value: "also concentrating",
    reason: '"If that creature is also concentrating, it must succeed on a DC 20 Constitution saving throw".',
    page: 249,
  },
  {
    id: "thunderous-greatclub",
    path: "saves.3.label",
    value: "where the fissure opens",
    reason: '"Any creature on a spot where the fissure opens must make a DC 20 Dexterity saving throw".',
    page: 249,
  },
  {
    id: "vorpal-sword",
    path: "damage.0.appliesWhen",
    value:
      "A creature is immune to this effect if it has Immunity to Slashing damage, if it doesn’t have or need a head, or if the GM decides that the creature is too big for its head to be cut off with this weapon",
    reason: "The extra 30 Slashing damage falls only on a creature that cannot lose its head, as the sentence before says.",
    page: 250,
  },
  {
    id: "dust-of-dryness",
    path: "damage.0.appliesWhen",
    value: "an Elemental within 5 feet of yourself that is composed mostly of water",
    reason: 'The damage falls on the creature the sentence before names: "sprinkle a pinch of the dust on an Elemental within 5 feet of yourself that is composed mostly of water".',
    page: 219,
  },
  {
    id: "horn-of-blasting",
    path: "damage.2.appliesWhen",
    value: "Each use of the horn’s magic has a 20 percent chance of causing the horn to explode",
    reason: "The explosion that deals 10d6 Force damage to the user happens with the 20 percent chance the sentence before states.",
    page: 226,
  },
  {
    id: "shield-of-the-cavalier",
    path: "damage",
    value: [
      {
        dice: "2d6 + 2",
        type: "force",
        role: "base",
        text: "On a hit, the Shield deals Force damage to the target equal to 2d6 + 2 plus your Strength modifier, and if the target is a creature, you can push it up to 10 feet directly away from yourself.",
      },
    ],
    reason: 'The damage reads "Force damage to the target equal to 2d6 + 2", with the dice after the type, which the pattern for "dice Type damage" does not match.',
    page: 243,
  },
]
