import type { AbilityId, ConditionId, DamageTypeId, SkillId } from "@d20/srd"
import { classFeatureById } from "@d20/srd/class-features"
import { classById } from "@d20/srd/classes"
import { equipmentById } from "@d20/srd/equipment"
import { z } from "zod"
import { hasFled, isDead, isDown, isIncapacitated } from "../../utils/turn-actors"
import { type Attack, UNARMED_STRIKE } from "../attack"
import { type Check, checkAbility, checkBonus, combineModes, type Roller, resolveCheck } from "../check"
import { type Bearing, type ClassRules, classCheckModes, type Featured, type Felling, type RoundTurn, withTurnEffect } from "../class-rules"
import { CONDITION_SPANS } from "../condition-entry"
import { conditionName, hasCondition, withCondition, withoutCondition } from "../conditions"
import { deriveSheet } from "../derive"
import { hasFeature, usedThisTurn, usesLeft, withFeatureUsed } from "../feature-rules"
import { withHitPoints } from "../hit-points"
import { opportunityWeapon } from "../reactions"
import type { Sheet } from "../sheet"
import { areEnemies } from "../sides"
import { feetBetween, speedOf } from "../space"
import { endConcentration } from "../spell-effects"
import { type Castee, rollSave } from "../spells"
import type { TurnEffect } from "../turn-effect"

/**
 * The Barbarian's features in play, levels 1 to 20, with the Path of the Berserker.
 *
 * Rage: a Bonus Action, not in Heavy armor, with uses by the Rages column. While it lasts the hero resists
 * Bludgeoning, Piercing and Slashing damage, adds the Rage Damage column to the damage of an attack using Strength, has
 * Advantage on Strength checks and Strength saving throws, and cannot cast spells or keep Concentration: entering it
 * ends any. It is kept as the turn effect "rage", which lasts to the end of the hero's next turn. An attack roll
 * against an enemy on any turn of theirs extends it to the end of the next, and so does the Bonus Action taken while
 * raging, which spends no use. It ends early on the Incapacitated condition or at 0 hit points, and with the encounter.
 * Forcing an enemy to save is not counted apart: a Barbarian forces one with a weapon's mastery, which rides an attack
 * roll, or with Intimidating Presence, a Bonus Action. The ten minute limit is not counted, since a Rage ends with its
 * encounter. One use comes back on a Short Rest by the feature's own data (./rest).
 * Danger Sense (level 2): Advantage on Dexterity saving throws, unless Incapacitated.
 * Reckless Attack (level 2): chosen with the first attack of a turn. Advantage on attack rolls using Strength this
 * turn, and attack rolls against the hero have Advantage until their next turn.
 * Primal Knowledge (level 3): while raging, a check of Acrobatics, Intimidation, Perception, Stealth or Survival is
 * made as a Strength check, so Rage's Advantage holds for it. The engine makes that choice when the Strength
 * modifier is no lower than the skill's own.
 * Frenzy (Path of the Berserker, level 3): with Reckless Attack while raging, the first hit of the turn with an
 * attack using Strength deals as many extra d6 as the Rage Damage bonus, of the attack's damage type.
 * Mindless Rage (Path of the Berserker, level 6): while raging, the hero cannot be Charmed or Frightened, read from the
 * feature's typed immunities (../conditions `immuneTo`), and entering a Rage ends either.
 * Feral Instinct (level 7): Advantage on Initiative.
 * Instinctive Pounce (level 7): the Bonus Action that enters a Rage moves the hero up to half their Speed more.
 * Brutal Strike (level 9): with Reckless Attack, the first attack of the turn using Strength may give up any Advantage
 * for 1d10 more damage of its type on a hit, 2d10 from level 17, and one effect: Forceful Blow pushes the target 15
 * feet straight away, and Hamstring Blow takes 15 feet off its Speed until the hero's next turn. Improved Brutal Strike
 * adds Staggering Blow (Disadvantage on its saves and no Opportunity Attacks) and Sundering Blow (+5 to another's next
 * attack roll against it) at 13, and two different effects at 17. A roll with Disadvantage cannot be chosen
 * (../attack-roll). The move toward the target Forceful Blow allows is told. Staggering Blow's Disadvantage holds on
 * every save until the hero's next turn, where the text gives it to the next save whenever it comes.
 * Retaliation (Path of the Berserker, level 10): a Reaction, when a creature within 5 feet hurts the hero with an
 * attack, to make one melee attack back (../reactions). Damage from a spell or another effect is not answered.
 * Relentless Rage (level 11): dropped to 0 hit points while raging and not killed outright, a Constitution save
 * against DC 10, 5 higher for each use since the last rest, stands the hero at twice their level in hit points. The uses
 * are counted in `featureUses` and a Short or Long Rest clears them.
 * Intimidating Presence (Path of the Berserker, level 14): a Bonus Action. Each enemy within 30 feet makes a Wisdom save
 * against 8 + Strength modifier + Proficiency Bonus or is Frightened of the hero for a minute, saving again as each
 * round turns. Once a Long Rest, or again by spending a use of Rage. The engine takes every enemy in reach as chosen.
 * Persistent Rage (level 15): the first Initiative rolled with a Rage spent gives back every use, once a Long Rest, and
 * a Rage holds with no attack to extend it, ended only by Unconscious, 0 hit points or Heavy armor.
 * Indomitable Might (level 18): a Strength check or save totals at least the Strength score.
 * Extra Attack, Fast Movement, the Ability Score Improvements and Primal Champion are read from the data by
 * ../feature-rules and ../derive. The Epic Boon is a feat.
 */

// A hero who uses a feature, with the turn effects they bear.
type Raged = Featured & Bearing

const RAGE = "barbarian-rage"
const PERSISTENT = "barbarian-persistent-rage"
const RELENTLESS = "barbarian-relentless-rage"
const BRUTAL = "barbarian-brutal-strike"
const PRESENCE = "path-of-the-berserker-intimidating-presence"

// The feet Forceful Blow pushes and Hamstring Blow takes off a Speed, and Sundering Blow's bonus. The data does not
// type them, so they are read from the text (SRD 5.2.1, pages 29 and 30).
const FORCEFUL_FEET = 15
const HAMSTRING_FEET = 15
const SUNDERING_BONUS = 5

// The skills Primal Knowledge lets a raging Barbarian make as Strength checks. The data does not type the list, so it
// is read from the feature's text (SRD 5.2.1, page 29).
const PRIMAL_SKILLS: readonly SkillId[] = ["acrobatics", "intimidation", "perception", "stealth", "survival"]

const heavyArmored = (character: { sheet?: Sheet }): boolean => {
  const armor = character.sheet?.armor ? equipmentById.get(character.sheet.armor) : undefined
  return armor?.kind === "armor" && armor.category === "heavy"
}

/** The Rage Damage bonus at a Barbarian's level, from the class table's column. */
export const rageDamageOf = (sheet: Sheet): number => classById.get(sheet.class)?.levels[sheet.level - 1]?.rageDamage ?? 0

// The Rage a hero bears, while it still holds: through the turn it was entered or extended, and to the end of the
// hero's next turn. With Persistent Rage it holds with no extending.
const rageOf = (character: Bearing): TurnEffect | undefined =>
  character.turnEffects?.find((effect) => effect.id === "rage" && effect.by === character.id && (effect.turns > 1 || !character.isComplete || hasFeature(character, PERSISTENT)))

/**
 * Whether a hero is raging now: a Rage that holds, on one not Incapacitated, not down and not in Heavy armor. With
 * Persistent Rage only the Unconscious condition ends it, not Incapacitated.
 */
export const isRaging = (character: Bearing): boolean =>
  hasFeature(character, RAGE) &&
  !!rageOf(character) &&
  !isDown(character) &&
  !heavyArmored(character) &&
  (hasFeature(character, PERSISTENT) ? !hasCondition(character, "unconscious") : !isIncapacitated(character))

/**
 * Whether an attack uses Strength, as ../attack `weaponAttack` picks its ability: an Unarmed Strike and a melee weapon
 * do, thrown or not, a ranged weapon does not, and a Finesse weapon does when Strength is no lower than Dexterity.
 */
export function usesStrength(sheet: Sheet, attack: Attack): boolean {
  if (attack.id === UNARMED_STRIKE) return true
  const weapon = equipmentById.get(attack.id)
  if (weapon?.kind !== "weapon" || weapon.attackType === "ranged") return false
  if (!(weapon.properties ?? []).some((property) => property === "finesse")) return true
  const mods = deriveSheet(sheet).abilityModifiers
  return mods.str >= mods.dex
}

/** The ability a raging hero makes a check with by Primal Knowledge: Strength for its skills, when it is no worse. */
export function primalAbility(character: Bearing, check: Check): AbilityId | undefined {
  if (check.kind !== "skill" || !PRIMAL_SKILLS.includes(check.skill) || !character.sheet || !hasFeature(character, "barbarian-primal-knowledge") || !isRaging(character)) return undefined
  const mods = deriveSheet(character.sheet).abilityModifiers
  return mods.str >= mods[checkAbility(check)] ? "str" : undefined
}

// The Reckless Attack a hero chose this turn: given this round, by themselves.
const recklessNow = (character: Bearing): boolean => !!character.turnEffects?.some((effect) => effect.id === "reckless" && effect.by === character.id && effect.turns > 1)

// The conditions a raging hero cannot be given, from their features' typed immunities "while raging" (Mindless Rage).
const rageImmunities = (character: Bearing): ConditionId[] =>
  character.sheet
    ? deriveSheet(character.sheet).classFeatures.flatMap((id) => {
        const immune = classFeatureById.get(id)?.conditionImmunities
        return immune?.while === "raging" ? immune.conditions : []
      })
    : []

/** The Brutal Strike effects a hero may choose from at their level: two from level 9, four from 13. */
export function brutalEffects(character: Roller): string[] {
  if (!hasFeature(character, BRUTAL)) return []
  const own = classFeatureById.get(BRUTAL)?.options ?? []
  const improved = hasFeature(character, "barbarian-improved-brutal-strike") ? (classFeatureById.get("barbarian-improved-brutal-strike")?.options ?? []) : []
  return [...own, ...improved].map((option) => option.id)
}

/** What a hero may pick for Brutal Strike: one effect, and from level 17 two different ones, joined by "+". */
export function brutalChoices(character: Roller): string[] {
  const effects = brutalEffects(character)
  // "You can use two different Brutal Strike effects" from level 17, by the later text of Improved Brutal Strike.
  const two = !!character.sheet && character.sheet.level >= 17 && hasFeature(character, "barbarian-improved-brutal-strike")
  return [...effects, ...(two ? effects.flatMap((first, at) => effects.slice(at + 1).map((second) => `${first}+${second}`)) : [])]
}

/** Brutal Strike's extra dice at a hero's level, by the feature's data: 1d10, and 2d10 from level 17. */
export function brutalDice(sheet: Sheet): string {
  const feature = classFeatureById.get(BRUTAL)
  return feature?.diceByLevel?.filter((step) => step.level <= sheet.level).at(-1)?.dice ?? feature?.dice ?? "1d10"
}

/** The DC of a hero's Intimidating Presence: 8 + their Strength modifier + their Proficiency Bonus. */
export function presenceDc(sheet: Sheet): number {
  const derived = deriveSheet(sheet)
  return 8 + derived.abilityModifiers.str + derived.proficiencyBonus
}

/** The DC of a hero's next Relentless Rage save: 10, and 5 more for each use since their last rest, by the feature's data. */
export function relentlessDc(character: { featureUses?: Record<string, number> }): number {
  const save = classFeatureById.get(RELENTLESS)?.selfSave
  return (save?.dc ?? 10) + (save?.increasePerUse ?? 5) * (character.featureUses?.[RELENTLESS] ?? 0)
}

// Brutal Strike's effects in words, once they fell on the target.
const BRUTAL_WORDS: Record<string, (attacker: string, target: string) => string> = {
  "forceful-blow": (attacker, target) =>
    `${target} is pushed ${FORCEFUL_FEET} feet straight away by Forceful Blow, and ${attacker} may move up to half their Speed straight toward them without provoking Opportunity Attacks.`,
  "hamstring-blow": (attacker, target) => `Hamstring Blow takes ${HAMSTRING_FEET} feet off ${target}'s Speed until ${attacker}'s next turn.`,
  "staggering-blow": (attacker, target) => `Staggering Blow leaves ${target} reeling: Disadvantage on their saving throws and no Opportunity Attacks until ${attacker}'s next turn.`,
  "sundering-blow": (attacker, target) => `Sundering Blow breaks ${target}'s guard: the next attack roll against them by another before ${attacker}'s next turn has +${SUNDERING_BONUS}.`,
}

// The turn effect each Brutal Strike effect leaves on the target.
const BRUTAL_MARKS: Record<string, string> = {
  "forceful-blow": "forceful-blow",
  "hamstring-blow": "hamstrung",
  "staggering-blow": "staggered",
  "sundering-blow": "sundered",
}

// The menu's words for each Brutal Strike effect.
const BRUTAL_PROMPT: Record<string, string> = {
  "forceful-blow": "a blow that hurls the foe back",
  "hamstring-blow": "one that cuts at their legs to slow them",
  "staggering-blow": "one that leaves them reeling",
  "sundering-blow": "one that breaks their guard open for others",
}

/**
 * A Frightened one's repeated save against the Intimidating Presence of the hero they are Frightened of, as a round
 * turns: that hero has the feature, and the condition has seen one of the bearer's turns.
 */
function shakenOff<T extends Roller & { id: string }>(character: T, round: RoundTurn | undefined): { character: T; told?: string } {
  const entry = character.conditions?.find((held) => held.id === "frightened" && held.source)
  const source = entry && round?.everyone.find((other) => other.id === entry.source)
  if (!entry || !round || !source?.sheet || !hasFeature(source, PRESENCE)) return { character }
  const standing = character as T & { hitPoints?: number; dead?: true }
  if (isDead(standing) || isDown(standing)) return { character }
  // Given after its turn this round, its first save comes at the end of its next turn.
  if ((entry.turns ?? 0) > CONDITION_SPANS.minute) return { character }
  const thrown = rollSave({
    target: character as unknown as Castee,
    ability: "wis",
    dc: presenceDc(source.sheet),
    d20: round.d20,
    roll: round.roll,
    characters: round.everyone as unknown as Castee[],
    against: ["frightened"],
    magical: false,
  })
  const told = `${character.name ?? "The creature"} makes a DC ${thrown.dc} Wisdom saving throw against ${source.name ?? "the Barbarian"}'s Intimidating Presence: ${thrown.total}, ${thrown.success ? "a success, and is no longer Frightened" : "a failure, and stays Frightened"}.`
  return { character: thrown.success ? withoutCondition(character, "frightened").character : character, told }
}

/**
 * Relentless Rage for a hero who was raging and has dropped to 0 hit points, not dead and not left Stable: a
 * Constitution save as they drop. On a success they stand at twice their level, their turn as it was before they
 * dropped. Either way the use is counted.
 */
function relentless<T extends Felling>(was: T, now: T, d20: () => number): { character: T; name: string; text: string } | undefined {
  const lying = now as T & { featureUses?: Record<string, number>; deathSaves?: { stable?: true } }
  if (!now.sheet || !hasFeature(was, RELENTLESS) || !isRaging(was) || lying.deathSaves?.stable) return undefined
  const dc = relentlessDc(lying)
  const check: Check = { kind: "save", ability: "con" }
  const mode = combineModes(classCheckModes(was, check).map((source) => source.mode))
  const save = resolveCheck({ dice: Array.from({ length: mode === "normal" ? 1 : 2 }, () => d20()), bonus: checkBonus(was, check), dc, mode })
  const featureUses = { ...lying.featureUses, [RELENTLESS]: (lying.featureUses?.[RELENTLESS] ?? 0) + 1 }
  const name = now.name ?? "The Barbarian"
  const rolled = `${name} makes a DC ${dc} Constitution saving throw for Relentless Rage: ${save.total}`
  if (!save.success) return { character: { ...lying, featureUses }, name: "Relentless Rage", text: `${rolled}, a failure, and stays down.` }
  // Twice the Barbarian level, which is the hero's level.
  const standing = now.sheet.level * 2
  type Turned = T & { deathSaves?: unknown; isComplete?: boolean; hasReplied?: boolean; rollRequired?: unknown }
  const { deathSaves: _, isComplete: __, hasReplied: ___, rollRequired: ____, ...rest } = lying as Turned
  const turn = was as Turned
  const flags = {
    ...(turn.isComplete !== undefined ? { isComplete: turn.isComplete } : {}),
    ...(turn.hasReplied !== undefined ? { hasReplied: turn.hasReplied } : {}),
    ...(turn.rollRequired !== undefined ? { rollRequired: turn.rollRequired } : {}),
  }
  const stood = withHitPoints({ ...rest, ...flags, featureUses } as unknown as Parameters<typeof withHitPoints>[0], standing) as unknown as T
  return { character: stood, name: "Relentless Rage", text: `${rolled}, a success. ${name} stays on their feet with ${standing} hit points.` }
}

export const barbarian: ClassRules = {
  class: "barbarian",
  bonusActions: [
    {
      id: "barbarian-rage",
      feature: RAGE,
      note: "barbarian-rage is for a character who flies into a Rage, a battle fury, beside the action, when the player's words call for it.",
      // Instinctive Pounce: entering a Rage moves the hero up to half their Speed more.
      moveBonus: (character) =>
        hasFeature(character, "barbarian-instinctive-pounce") && !isRaging(character) && !heavyArmored(character) && usesLeft(character, RAGE) > 0
          ? Math.floor((speedOf(character) ?? 0) / 2)
          : 0,
      use: ({ characters, actor: featured, action }) => {
        const actor = featured as Raged
        if (heavyArmored(actor)) return { characters }
        const put = (now: Raged, from: readonly Featured[]) => from.map((character) => (character.id === now.id ? now : character))
        // Taken while raging, it extends the Rage and spends no use.
        if (isRaging(actor)) {
          const kept = withTurnEffect(actor, "rage", actor.id)
          return { characters: put(kept, characters), use: { feature: action.id, name: action.name, fact: `${actor.name} keeps the Rage going.` } }
        }
        // A raging hero keeps no Concentration.
        const ended = endConcentration(characters as Parameters<typeof endConcentration>[0], actor.id)
        const after = ended.characters as Raged[]
        let raging = withTurnEffect(withFeatureUsed(after.find((character) => character.id === actor.id) ?? actor, RAGE), "rage", actor.id)
        // Mindless Rage: Charmed and Frightened end as the Rage begins.
        const freed: string[] = []
        for (const id of rageImmunities(raging)) {
          const without = withoutCondition(raging, id)
          if (!without.ended) continue
          raging = without.character
          freed.push(conditionName(id))
        }
        return {
          characters: put(raging, after),
          use: {
            feature: action.id,
            name: action.name,
            fact: `${actor.name} flies into a Rage.${ended.ended ? ` Their Concentration on ${ended.ended} ends.` : ""}${freed.length ? ` They are no longer ${freed.join(" or ")}.` : ""}`,
          },
        }
      },
    },
    {
      id: "intimidating-presence",
      feature: PRESENCE,
      // Named apart, it counts no uses on the menu: it has its one use, or a use of Rage to restore it.
      name: "Intimidating Presence",
      offer: (character) => usesLeft(character, PRESENCE) > 0 || usesLeft(character, RAGE) > 0,
      note: "intimidating-presence is for a character who strikes terror into the foes around them, a roar or a menacing display, beside the action, when the player's words call for it.",
      use: ({ characters, actor, action, roll }) => {
        if (!actor.sheet) return { characters }
        // Once a Long Rest, unless a use of Rage restores it.
        const restores = usesLeft(actor, PRESENCE) < 1
        if (restores && usesLeft(actor, RAGE) < 1) return { characters }
        const user = withFeatureUsed(restores ? withFeatureUsed(actor, RAGE) : actor, PRESENCE)
        const dc = presenceDc(actor.sheet)
        // Each enemy within the 30-foot Emanation, up and here. One with no place on the floor is taken to be in it.
        const reach = classFeatureById.get(PRESENCE)?.area?.size ?? 30
        let now = characters.map((character) => (character.id === actor.id ? user : character))
        const told: string[] = []
        for (const target of characters) {
          if (target.id === actor.id || !areEnemies(target, actor) || isDead(target) || isDown(target) || hasFled(target)) continue
          const apart = feetBetween(actor as Parameters<typeof feetBetween>[0], target as Parameters<typeof feetBetween>[0])
          if (apart !== undefined && apart > reach) continue
          const thrown = rollSave({
            target: target as unknown as Castee,
            ability: "wis",
            dc,
            d20: () => roll(20),
            roll,
            characters: now as unknown as Castee[],
            against: ["frightened"],
            stakes: { conditions: ["frightened"] },
            magical: false,
          })
          if (thrown.success) {
            told.push(`${target.name} succeeds (${thrown.total}).`)
            continue
          }
          const given = withCondition(target, { id: "frightened", source: actor.id, span: "minute" }, { acted: !!(target as { isComplete?: boolean }).isComplete })
          if (given.given) now = now.map((character) => (character.id === target.id ? given.character : character))
          told.push(given.given ? `${target.name} fails (${thrown.total}) and is Frightened of ${actor.name}.` : `${target.name} fails (${thrown.total}) but cannot be Frightened.`)
        }
        const paid = restores ? ", spending a use of Rage to restore it" : ""
        const fact = `${actor.name} strikes terror with Intimidating Presence${paid}: a DC ${dc} Wisdom saving throw.${told.length ? ` ${told.join(" ")}` : " No enemy is near enough."}`
        return { characters: now, use: { feature: action.id, name: action.name, fact } }
      },
    },
  ],
  choices: [
    {
      key: "reckless",
      offer: (character) => (hasFeature(character, "barbarian-reckless-attack") ? true : undefined),
      prompt: () =>
        `   - RECKLESS ATTACK: with an attack, "reckless" is true when the player's words throw aside all care for defense to strike all out, such as a wild or reckless swing. Leave it out otherwise.
`,
      field: () => z.boolean().optional().describe("True when the player's words attack recklessly with Reckless Attack"),
      rides: "turn",
      attackModes: (character, attack) => (character.sheet && usesStrength(character.sheet, attack) ? [{ mode: "advantage", from: "Reckless Attack" }] : []),
      apply: (characters, actorId) => {
        const actor = characters.find((character) => character.id === actorId)
        return {
          characters: characters.map((character) => (character.id === actorId ? withTurnEffect(character as Raged, "reckless", actorId) : character)),
          told: {
            name: "Reckless Attack",
            text: `${actor?.name ?? "The Barbarian"} attacks recklessly: Advantage on attacks using Strength this turn, and attacks against them have Advantage until their next turn.`,
          },
        }
      },
    },
    {
      key: "brutal",
      offer: (character) => {
        const values = brutalChoices(character)
        return values.length ? values : undefined
      },
      prompt: (values) => {
        const listed = Array.isArray(values) ? values : []
        const single = listed.filter((value) => !value.includes("+"))
        return `   - BRUTAL STRIKE: with a reckless attack, "brutal" is the effect the player's words call for when they give up a sure swing for one crushing blow: ${single.map((value) => `${value} (${BRUTAL_PROMPT[value] ?? value})`).join(", ")}.${listed.length > single.length ? ' Two different effects are joined by "+" when the words call for both.' : ""} Leave it out otherwise.
`
      },
      field: (values) =>
        z
          .enum((Array.isArray(values) ? values : []) as [string, ...string[]])
          .optional()
          .describe("The Brutal Strike effect the player's words call for"),
      rides: "attack",
      // Only with Reckless Attack, chosen now or earlier this turn, and an attack using Strength.
      forgoesAdvantage: (character, attack, chosen) => !!character.sheet && usesStrength(character.sheet, attack) && (!!chosen?.reckless || recklessNow(character)),
    },
  ],
  hits: [
    {
      id: "rage",
      damage: ({ attacker, attack }) => {
        const sheet = attacker.sheet
        if (!sheet || !isRaging(attacker) || !usesStrength(sheet, attack)) return undefined
        return { name: "Rage", damage: { amount: rageDamageOf(sheet), type: attack.damage[0]?.type ?? "bludgeoning" } }
      },
    },
    {
      id: "brutal-strike",
      // 1d10 of the weapon's type, 2d10 from level 17, on the attack Brutal Strike was chosen for, once a turn.
      damage: ({ attacker, attack, turnOf, choices }) => {
        const sheet = attacker.sheet
        if (!sheet || !choices?.brutal || !attacker.id || turnOf !== attacker.id || !hasFeature(attacker, BRUTAL)) return undefined
        if (!recklessNow(attacker) || !usesStrength(sheet, attack) || usedThisTurn(attacker, "brutal-strike", turnOf)) return undefined
        return { name: "Brutal Strike", damage: { dice: brutalDice(sheet), type: attack.damage[0]?.type ?? "bludgeoning" }, once: "brutal-strike" }
      },
      // Each effect chosen falls on a target still up, as a turn effect the attacker gives.
      after: ({ attacker, target, added, choices }) => {
        if (!added.includes("Brutal Strike") || !choices?.brutal || !attacker.id || isDown(target) || target.dead) return undefined
        const by = attacker.id
        const effects = [...new Set(choices.brutal.split("+"))].filter((effect) => brutalEffects(attacker).includes(effect))
        let struck = target
        for (const effect of effects) {
          // "A target can be affected by only one Hamstring Blow at a time": the most recent.
          if (effect === "hamstring-blow") struck = { ...struck, turnEffects: (struck.turnEffects ?? []).filter((held) => held.id !== "hamstrung") }
          struck = withTurnEffect(struck, BRUTAL_MARKS[effect], by)
        }
        return effects.length ? { target: struck, rider: { id: "brutal-strike", effect: effects.join("+"), took: true }, conditions: [] } : undefined
      },
      words: (attacker, target, rider) =>
        ` ${rider.effect
          .split("+")
          .map((effect) => BRUTAL_WORDS[effect]?.(attacker, target) ?? "")
          .join(" ")}`,
    },
    {
      id: "frenzy",
      damage: ({ attacker, attack, turnOf }) => {
        const sheet = attacker.sheet
        if (!sheet || !attacker.id || turnOf !== attacker.id || !hasFeature(attacker, "path-of-the-berserker-frenzy")) return undefined
        if (!isRaging(attacker) || !recklessNow(attacker) || !usesStrength(sheet, attack) || usedThisTurn(attacker, "frenzy", turnOf)) return undefined
        // As many d6 as the Rage Damage bonus, by the feature's data.
        const die = classFeatureById.get("path-of-the-berserker-frenzy")?.variableDice?.die ?? 6
        return { name: "Frenzy", damage: { dice: `${rageDamageOf(sheet)}d${die}`, type: attack.damage[0]?.type ?? "bludgeoning" }, once: "frenzy" }
      },
    },
  ],
  turnEffects: [
    { id: "rage", span: 2, words: () => "Raging" },
    {
      id: "reckless",
      span: 2,
      words: () => "Reckless",
      // Advantage on the bearer's own attacks using Strength, on the turn it was chosen.
      attacking: (effect, bearer, _target, attack) => (effect.turns > 1 && attack && bearer.sheet && usesStrength(bearer.sheet, attack) ? [{ mode: "advantage", from: "Reckless Attack" }] : []),
      against: (_effect, _attacker, bearer) => [{ mode: "advantage", from: `${bearer.name} Attacking Recklessly` }],
    },
    { id: "frenzy", span: 1 },
    { id: "brutal-strike", span: 1 },
    { id: "forceful-blow", span: 1, pushes: FORCEFUL_FEET },
    { id: "hamstrung", span: 2, words: () => "Hamstrung", slowsBy: HAMSTRING_FEET },
    {
      id: "staggered",
      span: 2,
      words: () => "Staggered",
      checking: (_effect, _bearer, check) => (check.kind === "save" ? [{ mode: "disadvantage", from: "Staggering Blow" }] : []),
      barsOpportunityAttacks: true,
    },
    {
      id: "sundered",
      span: 2,
      words: () => "Sundering Blow",
      attackedBonus: (effect, attacker) => (attacker.id && attacker.id !== effect.by ? SUNDERING_BONUS : 0),
      endsWhenAttacked: "by-others",
    },
  ],
  checkModes: (character, check) => [
    ...(check.kind === "save" && check.ability === "dex" && hasFeature(character, "barbarian-danger-sense") && !isIncapacitated(character)
      ? [{ mode: "advantage" as const, from: "Danger Sense" }]
      : []),
    ...(isRaging(character) && (checkAbility(check) === "str" || primalAbility(character, check) === "str") ? [{ mode: "advantage" as const, from: "Rage" }] : []),
  ],
  resistances: (character) => (isRaging(character) ? ((classFeatureById.get(RAGE)?.resistances?.damageTypes ?? []) as readonly DamageTypeId[]) : []),
  checkAbility: primalAbility,
  castingBarred: (character) => (isRaging(character) ? `${character.name ?? "A raging hero"} cannot cast spells while raging.` : undefined),
  conditionImmunities: (character) => (isRaging(character) ? rageImmunities(character) : []),
  initiativeAdvantage: (character) => hasFeature(character, "barbarian-feral-instinct"),
  // Persistent Rage: every use of Rage back as Initiative is rolled, the first time one is spent, once a Long Rest. The
  // use is kept under the feature's id, which a Long Rest clears.
  initiative: (character) => {
    const uses = character.featureUses ?? {}
    if (!hasFeature(character, PERSISTENT) || !uses[RAGE] || uses[PERSISTENT]) return character
    const { [RAGE]: _, ...rest } = uses
    return { ...character, featureUses: { ...rest, [PERSISTENT]: 1 } }
  },
  // Indomitable Might: a Strength check or save totals at least the Strength score, a skill made with Strength by
  // Primal Knowledge among them.
  totalFloor: (character, check) =>
    character.sheet && hasFeature(character, "barbarian-indomitable-might") && (checkAbility(check) === "str" || primalAbility(character, check) === "str")
      ? deriveSheet(character.sheet).abilityScores.str
      : undefined,
  downed: ({ was, now, d20 }) => relentless(was, now, d20),
  // Relentless Rage's DC is back to 10 after a Short Rest. A Long Rest clears every use.
  shortRest: (character) => {
    if (!character.featureUses?.[RELENTLESS]) return { character, facts: [] }
    const { [RELENTLESS]: _, ...rest } = character.featureUses
    const { featureUses: __, ...others } = character
    return { character: { ...others, ...(Object.keys(rest).length ? { featureUses: rest } : {}) } as typeof character, facts: [`${character.name ?? "The Barbarian"}'s Relentless Rage is back to DC 10.`] }
  },
  reactions: [
    {
      id: "retaliation",
      name: "Retaliation",
      has: (character) => hasFeature(character, "path-of-the-berserker-retaliation"),
      // One melee attack, with a weapon or an Unarmed Strike: the one an Opportunity Attack would take.
      strikesBack: ({ target }) => opportunityWeapon(target as Parameters<typeof opportunityWeapon>[0])?.id,
    },
  ],
  // An attack roll against an enemy on the hero's own turn extends a Rage that still holds to the end of their next turn.
  attackRolled: (attacker) => (attacker.id && isRaging(attacker) ? withTurnEffect(attacker, "rage", attacker.id) : attacker),
  // A Rage not extended this round ends as the next begins, and so does one whose bearer is Incapacitated or down. A
  // Persistent Rage is kept going while it holds. One Frightened by Intimidating Presence saves again.
  roundStart: (character, round) => {
    const shaken = shakenOff(character, round)
    const fear = shaken.told ? { told: { name: "Intimidating Presence", text: shaken.told } } : {}
    const borne = (shaken.character as Bearing).turnEffects
    const rage = borne?.find((effect) => effect.id === "rage")
    if (rage && hasFeature(shaken.character, PERSISTENT) && isRaging(shaken.character)) return { character: withTurnEffect(shaken.character as typeof character & Bearing, "rage", character.id) }
    if (!rage || (rage.turns > 1 && isRaging(shaken.character))) return { character: shaken.character, ...fear }
    const turnEffects = (borne ?? []).filter((effect) => effect.id !== "rage")
    return { character: { ...shaken.character, turnEffects }, told: { name: "Rage", text: `${character.name ?? "The Barbarian"}'s Rage ends.` } }
  },
}
