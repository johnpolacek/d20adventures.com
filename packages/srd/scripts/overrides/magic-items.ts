import type { Override } from "../lib/data"

const demonArmorSentence =
  "In addition, the armor’s clawed gauntlets allow your Unarmed Strikes to deal 1d8 Slashing damage instead of the usual Bludgeoning damage, and you gain a +1 bonus to the attack and damage rolls of your Unarmed Strikes."

export const overrides: Override[] = [
  {
    id: "demon-armor",
    path: "bonuses",
    value: [
      {
        to: "armor-class",
        value: 1,
        text: "While wearing this armor, you gain a +1 bonus to Armor Class, and you know Abyssal.",
      },
      { to: "unarmed-strike-attack-rolls", value: 1, text: demonArmorSentence },
      { to: "unarmed-strike-damage-rolls", value: 1, text: demonArmorSentence },
    ],
    reason: "The bonus names two rolls of Unarmed Strikes in one phrase, which the sentence parser does not split.",
    page: 218,
  },
]
