import { monsterRuleById } from "@d20/srd/monster-rules"
import { monsterById } from "@d20/srd/monsters"
import type { Monster } from "@d20/srd/schema/monsters"
import { hasFled, isDown, isIncapacitated } from "../utils/turn-actors"
import { actionId, attacksOf, averageDamage, type Strike } from "./attack"
import { attackable, attackRequirement, type InScene, nearestEnemy } from "./attack-roll"
import type { RollMode } from "./check"
import { hasCondition } from "./conditions"
import { afterHarm, type DeathRules } from "./death"
import { takeMove } from "./moves"
import type { EncounterFloor } from "./placement"
import { type Ask, attackWithReactions, moveWithReactions, type OpportunityAttackMade, type ReactionTaken } from "./reactions"
import { moveToward, sizeOf, solidAt, speedOf, stopShortFor } from "./space"
import { spellEffectsAfterMove } from "./spell-effects"

/**
 * Legendary Actions by the SRD 5.2.1 rules (page 257, and each block's section): a Legendary creature has a number of
 * uses a round, "3 (4 in Lair)", and "immediately after another creature's turn" it may spend one to take one of the
 * actions its block lists. It regains all of them at the start of each of its own turns, and takes none while
 * Incapacitated. The uses spent are kept on the character in `featureUses` under "Legendary Actions". The engine knows
 * no lair, so it counts the plain number, and the lair's is told only.
 *
 * The engine takes them by a plain rule, with no model call: after the turn of any creature but itself, while a use is
 * left, the option that is an attack on the nearest enemy in reach, else one that moves toward the nearest enemy and
 * attacks if that brings it in reach, else none. Its enemies are those the encounter puts on the other side
 * (./sides), so a bystander is never taken. It costs no model call a turn and cannot stall play.
 *
 * Each block's options are read from its words by a strict reader, since the data types only what they cast, save or
 * deal. Every option of 5.2.1 costs one use, so no cost is read. An option that casts a spell, forces a save, or uses
 * another of the block's actions (a breath, a Glare) is left unread with its reason, and so is any other word.
 */

/** Where a feature's uses are counted in `featureUses`. */
export const LEGENDARY_ACTIONS = "Legendary Actions"

/** How an option moves before its attack: up to half its Speed, with or without drawing Opportunity Attacks, or a Teleport of some feet. */
export type LegendaryMove = { kind: "walk"; disengaged?: true } | { kind: "teleport"; feet: number }

/** An option the engine can take: one attack, with any of the block's attacks it names, by id, after the move it gives. */
export type LegendaryOption = { name: string; attacks: string[]; move?: LegendaryMove }

/** Why an option is not read: it casts a spell, forces a saving throw, uses another of the block's actions, or has words left over. */
export type LegendaryUnread = { name: string; kind: "spell" | "save" | "action" | "words"; reason: string }

export type LegendaryActions = { uses: number; inLair?: number; options: LegendaryOption[]; skipped: LegendaryUnread[] }

// The rule of page 257: what stops a Legendary Action. Incapacitated, as typed, and the conditions that carry it.
const RULE = monsterRuleById.get("legendary-actions")
const BLOCKED_BY = RULE && "blockedBy" in RULE ? RULE.blockedBy : []

// A printed action name: capitalised words, "Channel Negative Energy", "Grave Strike".
const NAME = "[A-Z][\\w'’-]*(?: [A-Z][\\w'’-]*)*"

/** A block's Legendary Actions, read from its words, or none when it has none or its section's opening is not read. */
export function readLegendaryActions(monster: Monster): LegendaryActions | { unread: string } | undefined {
  const section = monster.legendaryActions
  if (!section) return undefined
  // "Legendary Action Uses: 3 (4 in Lair). Immediately after another creature’s turn, the dragon can expend a use to
  // take one of the following actions. The dragon regains all expended uses at the start of each of its turns."
  const opening =
    /^Legendary Action Uses: \d+(?: \(\d+ in Lair\))?\. Immediately after another creature[’']s turn, the ([a-z ]+) can expend a use to take one of the following actions\. The \1 regains all expended uses at the start of each of its turns\.$/.exec(
      section.text
    )
  if (!opening) return { unread: `"${section.text}" is not read` }
  const subject = `The ${opening[1]}`
  const attacks = new Map((monster.actions ?? []).filter((entry) => entry.attack).map((entry) => [entry.name, actionId(entry.name)]))
  const options: LegendaryOption[] = []
  const skipped: LegendaryUnread[] = []
  for (const feature of section.actions) {
    const { name, text } = feature
    const skip = (kind: LegendaryUnread["kind"], reason: string) => skipped.push({ name, kind, reason })
    if (feature.spellcasting) {
      skip("spell", "casts a spell, which a Legendary Action does not run")
      continue
    }
    if (feature.saves) {
      skip("save", "forces a saving throw, left to the actions with a save")
      continue
    }
    const used = new RegExp(`^${subject} uses (${NAME})\\.`).exec(text) ?? new RegExp(` it uses (${NAME})\\b`).exec(text)
    if (used) {
      skip("action", `uses ${used[1]}, another of its actions, left to the actions it names`)
      continue
    }
    // "The dragon makes one Rend attack.", "The mummy makes one Rotting Fist or Channel Negative Energy attack.",
    // "The dragon moves up to half its Speed, and it makes one Rend attack.", "The unicorn moves up to half its Speed
    // without provoking Opportunity Attacks, and it makes one Radiant Horn attack.", "The sphinx can teleport up to 30
    // feet to an unoccupied space it can see, and it makes one Claw attack."
    const found = new RegExp(
      `^${subject} (?:(moves up to half its Speed( without provoking Opportunity Attacks)?|can teleport up to (\\d+) feet to an unoccupied space it can see), and it )?makes one (${NAME}(?: or ${NAME})*) attack\\.$`
    ).exec(text)
    if (!found || feature.damage || feature.conditions || feature.area || feature.uses) {
      skip("words", `"${text}" is not read`)
      continue
    }
    const names = found[4].split(" or ")
    const missing = names.filter((entry) => !attacks.has(entry))
    if (missing.length) {
      skip("words", `${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} not among its attacks`)
      continue
    }
    const move: LegendaryMove | undefined = found[3] ? { kind: "teleport", feet: Number(found[3]) } : found[1] ? { kind: "walk", ...(found[2] ? { disengaged: true as const } : {}) } : undefined
    options.push({ name, attacks: names.map((entry) => attacks.get(entry) as string), ...(move ? { move } : {}) })
  }
  const { count, countInLair } = section.uses
  return { uses: count, ...(countInLair ? { inLair: countInLair } : {}), options, skipped }
}

type Holder = { type?: string; sheet?: unknown; statBlock?: string; featureUses?: Record<string, number> }

/**
 * An NPC's Legendary Actions, from its own stat block, with the uses left this round. A hero has none: a sheet carries
 * none, and no Beast a Druid can take the shape of is Legendary.
 */
export function legendaryActionsOf(character: Holder): (LegendaryActions & { left: number }) | undefined {
  if (character.type !== "npc" || character.sheet || !character.statBlock) return undefined
  const monster = monsterById.get(character.statBlock)
  const read = monster ? readLegendaryActions(monster) : undefined
  if (!read || "unread" in read) return undefined
  return { ...read, left: Math.max(0, read.uses - (character.featureUses?.[LEGENDARY_ACTIONS] ?? 0)) }
}

/** The creature as its own turn begins: every use regained. One with none spent comes back as it was. */
export function withLegendaryActionsRegained<T extends Holder>(character: T): T {
  if (!character.featureUses?.[LEGENDARY_ACTIONS]) return character
  const { [LEGENDARY_ACTIONS]: _, ...featureUses } = character.featureUses
  return { ...character, featureUses }
}

const withLegendaryActionSpent = <T extends Holder>(character: T): T => ({
  ...character,
  featureUses: { ...character.featureUses, [LEGENDARY_ACTIONS]: (character.featureUses?.[LEGENDARY_ACTIONS] ?? 0) + 1 },
})

type Legend = Parameters<typeof attackWithReactions>[0]["characters"][number] & InScene & { initiative?: number; featureUses?: Record<string, number> }

/** Whether a creature can take a Legendary Action now: up, here, not Incapacitated, and with a use left. */
export function canTakeLegendaryAction(character: Legend): boolean {
  if (isDown(character) || hasFled(character) || isIncapacitated(character) || BLOCKED_BY.some((id) => hasCondition(character, id))) return false
  return !!legendaryActionsOf(character)?.left
}

/** A Legendary Action taken: by whom, which, at whom, how it moved, what its move drew, and its blow. `text` tells it. */
export type LegendaryTaken = {
  by: string
  name: string
  target?: string
  moved?: number
  teleported?: true
  opportunity: OpportunityAttackMade[]
  blow?: Strike
  reactions: ReactionTaken[]
  text: string
}

// How a roll's mode ranks when the engine picks an attack: Advantage over none, none over Disadvantage.
const MODE_RANK: Record<RollMode, number> = { advantage: 2, normal: 1, disadvantage: 0 }

// The best attack of an option at one target from where the creature stands, as the roll for it: no Disadvantage over
// Disadvantage, then the most damage, then the longest reach. None when none reaches.
function bestAttack(legend: Legend, option: LegendaryOption, target: Legend, present: readonly Legend[], floor?: EncounterFloor) {
  return attacksOf(legend)
    .filter((attack) => option.attacks.includes(attack.id))
    .flatMap((attack) => {
      const asked = attackRequirement({ character: legend, target, attack, present, floor })
      return "roll" in asked ? [{ attack, roll: asked.roll }] : []
    })
    .sort((a, b) => MODE_RANK[b.roll.mode] - MODE_RANK[a.roll.mode] || averageDamage(b.attack) - averageDamage(a.attack) || (b.attack.reach ?? 0) - (a.attack.reach ?? 0))[0]
}

/**
 * The Legendary Actions taken right after a creature's turn ends: each Legendary creature that can, in Initiative
 * order, takes one by the plain rule above. None after a creature's own turn. A Walk moves up to half
 * its walking Speed toward the nearest enemy and draws Opportunity Attacks unless the option says it does not; a
 * Teleport goes straight toward them, through anything, to a point that is not solid. The attack is then made at the
 * nearest enemy it reaches, with the reactions that answer it. Every reaction is answered by `ask`. Everyone comes back
 * as the actions left them, each one's use spent.
 */
export function legendaryActionsAfter<T extends Legend>(args: {
  characters: readonly T[]
  endedId: string
  floor?: EncounterFloor
  d20: () => number
  roll: (sides: number) => number
  rules?: DeathRules
  ask: Ask
}): { characters: T[]; taken: LegendaryTaken[] } {
  let characters = [...args.characters]
  const taken: LegendaryTaken[] = []
  const ended = characters.find((character) => character.id === args.endedId)
  if (!ended) return { characters, taken }
  const find = (id: string) => characters.find((character) => character.id === id) as T
  const put = (changed: T) => {
    characters = characters.map((character) => (character.id === changed.id ? changed : character))
  }
  const legends = [...characters].sort((a, b) => (b.initiative ?? 0) - (a.initiative ?? 0)).filter((character) => character.id !== args.endedId && legendaryActionsOf(character))
  for (const { id } of legends) {
    const legend = find(id)
    const read = legendaryActionsOf(legend)
    if (!read || !canTakeLegendaryAction(legend)) continue
    const enemies = characters.filter((other) => attackable(legend, other))
    // The nearest enemy an option's attack reaches now, with no move.
    const reached = read.options.flatMap((option) =>
      enemies.flatMap((target) => {
        const best = bestAttack(legend, option, target, characters, args.floor)
        return best ? [{ option, target, ...best }] : []
      })
    )
    const near = nearestEnemy(
      legend,
      reached.map((entry) => entry.target)
    )
    const now = near && reached.find((entry) => entry.target.id === near.id)
    // Otherwise an option that moves, toward the nearest enemy who stands on the floor.
    const goal = now ? undefined : nearestEnemy(legend, args.floor && legend.position ? enemies.filter((other) => other.position) : [])
    const mover = goal && read.options.find((option) => option.move)
    const option = now?.option ?? mover
    if (!option) continue
    put(withLegendaryActionSpent(legend))
    const left = read.left - 1
    const name = legend.name
    const opportunity: OpportunityAttackMade[] = []
    let moved: number | undefined
    let teleported: true | undefined
    let fell = false
    if (!now && goal && option.move && args.floor) {
      const reach = Math.max(0, ...attacksOf(legend).flatMap((attack) => (option.attacks.includes(attack.id) ? [attack.reach ?? 0] : [])))
      if (option.move.kind === "walk") {
        const half = Math.floor((speedOf(legend) ?? 0) / 2)
        const step = takeMove({
          floor: args.floor,
          mover: find(id),
          others: characters.filter((other) => other.id !== id),
          ask: { to: goal.id, feet: half },
          close: { target: goal.id, reach: reach || 5 },
        })
        if (step) {
          const went = moveWithReactions({ characters, moverId: id, path: step.path, disengaged: option.move.disengaged, ask: args.ask, d20: args.d20, roll: args.roll, rules: args.rules })
          characters = went.characters.map((character) => afterHarm(character))
          opportunity.push(...went.attacks)
          moved = step.feet
          fell = went.stopped
        }
      } else if (legend.position && goal.position) {
        const to = moveToward(legend.position, goal.position, option.move.feet, stopShortFor(sizeOf(legend), sizeOf(goal), reach || 5))
        if (to.used >= 0.5 && !solidAt(args.floor.solids, to.at)) {
          put(spellEffectsAfterMove({ ...find(id), position: to.at }))
          moved = Math.round(to.used)
          teleported = true
        }
      }
    }
    // The attack, at the nearest enemy it now reaches.
    const after = find(id)
    const attacked = fell
      ? undefined
      : (now ??
        (() => {
          const targets = characters.filter((other) => attackable(after, other))
          const hit = targets.flatMap((target) => {
            const best = bestAttack(after, option, target, characters, args.floor)
            return best ? [{ option, target, ...best }] : []
          })
          const nearest = nearestEnemy(
            after,
            hit.map((entry) => entry.target)
          )
          return nearest && hit.find((entry) => entry.target.id === nearest.id)
        })())
    let blow: Strike | undefined
    const reactions: ReactionTaken[] = []
    if (attacked) {
      const { roll } = attacked
      const made = attackWithReactions({
        characters,
        attackerId: id,
        targetId: attacked.target.id,
        weapon: attacked.attack.id,
        dice: roll.mode === "normal" ? [args.d20()] : [args.d20(), args.d20()],
        mode: roll.mode,
        roll: args.roll,
        rules: args.rules,
        cover: roll.attack.cover,
        ask: args.ask,
      })
      characters = made.characters.map((character) => (character.id === attacked.target.id ? afterHarm(character) : character))
      blow = made.blow
      reactions.push(...made.reactions)
    }
    const goes = moved ? (teleported ? ` It teleports ${moved} feet` : ` It moves ${moved} feet`) : ""
    const toward = goes && (attacked?.target ?? goal) ? ` toward ${(attacked?.target ?? goal)?.name}` : ""
    const strikes = attacked ? `${goes ? " and makes" : " It makes"} one ${attacked.attack.name} attack at ${attacked.target.name}.` : goes ? "." : ""
    const lair = read.inLair ? ` (${read.inLair} in its lair)` : ""
    taken.push({
      by: id,
      name: option.name,
      ...(attacked || goal ? { target: (attacked?.target ?? goal)?.id } : {}),
      ...(moved ? { moved } : {}),
      ...(teleported ? { teleported } : {}),
      opportunity,
      ...(blow ? { blow } : {}),
      reactions,
      text: `${name} takes a Legendary Action after ${ended.name}'s turn: ${option.name}.${goes}${toward}${strikes} ${left} of ${read.uses} uses left this round${lair}.`,
    })
  }
  return { characters, taken }
}
