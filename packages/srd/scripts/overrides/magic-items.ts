import type { Override } from "../lib/data"

const demonArmorSentence =
  "In addition, the armor’s clawed gauntlets allow your Unarmed Strikes to deal 1d8 Slashing damage instead of the usual Bludgeoning damage, and you gain a +1 bonus to the attack and damage rolls of your Unarmed Strikes."

export const overrides: Override[] = [
  {
    id: "demon-armor",
    path: "conditionalBonuses",
    value: [
      { to: "attack-rolls", value: 1, condition: "the attack and damage rolls of your Unarmed Strikes", text: demonArmorSentence },
      { to: "damage-rolls", value: 1, condition: "the attack and damage rolls of your Unarmed Strikes", text: demonArmorSentence },
    ],
    reason: "The bonus names two rolls of Unarmed Strikes in one phrase, which the sentence parser does not split. It applies only to Unarmed Strikes.",
    page: 218,
  },
]
