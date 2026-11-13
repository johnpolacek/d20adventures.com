import type { AbilityId, CreatureType, DamageTypeId } from "@d20/srd"
import { monsterById } from "@d20/srd/monsters"
import type { Monster, MonsterFeature } from "@d20/srd/schema/monsters"
import { spellById } from "@d20/srd/spells"
import type { Shape } from "../types/character"

/**
 * The stat blocks the engine reads a creature's game statistics from: the SRD's own, and those a spell prints for the
 * creature it calls (SRD 5.2.1: Summon Dragon's Draconic Spirit, Giant Insect, Find Steed's Otherworldly Steed,
 * Animate Objects' Animated Object) or makes of another (Find Familiar's form, which is a Celestial, Fey or Fiend
 * and cannot attack). A spell's block takes numbers from the slot and its caster, so a summoned creature names its block
 * by an id that carries them: "summon-dragon:5:7:15:3:fire" is the spell, the slot, the caster's spell attack bonus,
 * spell save DC and Proficiency Bonus, and the caster's choice. The block is built from the spell's typed stat block,
 * its formulas read from the spell's text, once for each id. This file imports only the SRD data: every reader may.
 */

/** The stat block an NPC uses when it names none: the SRD's Commoner. */
export const DEFAULT_STAT_BLOCK = "commoner"

/** What a summoned creature's block is built with: the slot and the caster's numbers, and their choice. */
export type SummonedBlock = { spell: string; slot: number; attackBonus: number; saveDc: number; proficiency: number; choice?: string }

/** The id a summoned creature's stat block is named by. */
export const summonedBlockId = (block: SummonedBlock): string => [block.spell, block.slot, block.attackBonus, block.saveDc, block.proficiency, block.choice ?? ""].join(":")

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five"]
const average = (count: number, sides: number, plus: number) => Math.floor((count * (sides + 1)) / 2) + plus

// The six ability lines of a spell's typed block, as a monster's.
function abilitiesOf(spell: string): Monster["abilities"] | undefined {
  const printed = spellById.get(spell)?.statBlocks?.[0]?.abilities
  if (!printed) return undefined
  const line = (ability: AbilityId) => ({ score: printed[ability].score, mod: printed[ability].modifier, save: printed[ability].save })
  return { str: line("str"), dex: line("dex"), con: line("con"), int: line("int"), wis: line("wis"), cha: line("cha") }
}

// A melee or ranged attack the block prints with "Bonus equals your spell attack modifier".
function attackOf(name: string, text: string, kind: "melee" | "ranged", bonus: number, feet: number, damage: { count: number; sides: number; plus: number; type: DamageTypeId }[]): MonsterFeature {
  return {
    name,
    text,
    attack: { kind, bonus, ...(kind === "melee" ? { reach: feet } : { range: { normal: feet } }) },
    damage: damage.map((part) => ({
      dice: `${part.count}d${part.sides}${part.plus ? ` + ${part.plus}` : ""}`,
      average: average(part.count, part.sides, part.plus),
      type: part.type,
      on: "hit" as const,
    })),
  }
}

// What every summoned block shares: no Challenge Rating and no XP, the caster's Proficiency Bonus.
const base = (id: string, name: string, spell: string, block: SummonedBlock) => ({
  id,
  name,
  page: spellById.get(spell)?.page ?? 0,
  section: "Monsters A–Z" as const,
  cr: 0,
  xp: 0,
  pb: block.proficiency,
})

// Summon Dragon's Draconic Spirit: "AC 14 + the spell's level", "HP 50 + 10 for each spell level above 5", Rend "1d6 + 4
// + the spell's level Piercing", half the spell's level in Rends with its Breath Weapon, 2d6 of the chosen Resistance's
// type in a 30-foot Cone against the caster's spell save DC.
function draconicSpirit(id: string, block: SummonedBlock): Monster | undefined {
  const abilities = abilitiesOf(block.spell)
  const type = (block.choice ?? "fire") as DamageTypeId
  if (!abilities) return undefined
  const rends = NUMBER_WORDS[Math.floor(block.slot / 2)] ?? "four"
  return {
    ...base(id, "Draconic Spirit", block.spell, block),
    size: ["Large"],
    type: "dragon",
    alignment: "Neutral",
    ac: 14 + block.slot,
    initiative: { modifier: abilities.dex.mod, score: 10 + abilities.dex.mod },
    hp: { average: 50 + 10 * (block.slot - 5), formula: `${50 + 10 * (block.slot - 5)}` },
    speed: { walk: 30, fly: 60, swim: 30 },
    abilities,
    resistances: ["acid", "cold", "fire", "lightning", "poison"],
    conditionImmunities: ["charmed", "frightened", "poisoned"],
    senses: { blindsight: 30, darkvision: 60, passivePerception: 12 },
    languages: "Draconic, understands the languages you know",
    traits: spellById.get(block.spell)?.statBlocks?.[0]?.traits?.map((trait) => ({ name: trait.name, text: trait.text })),
    actions: [
      { name: "Multiattack", text: `The spirit makes ${rends} Rend attacks, and it uses Breath Weapon.` },
      attackOf("Rend", `Melee Attack Roll: +${block.attackBonus}, reach 10 ft. Hit: 1d6 + ${4 + block.slot} Piercing damage.`, "melee", block.attackBonus, 10, [
        { count: 1, sides: 6, plus: 4 + block.slot, type: "piercing" },
      ]),
      {
        name: "Breath Weapon",
        text: `Dexterity Saving Throw: DC ${block.saveDc}, each creature in a 30-foot Cone. Failure: 7 (2d6) ${type} damage. Success: Half damage.`,
        saves: [{ ability: "dex", dc: block.saveDc, targets: "each creature in a 30-foot Cone", failure: `7 (2d6) ${type} damage.`, success: "Half damage.", halfOnSuccess: true }],
        damage: [{ dice: "2d6", average: 7, type, on: "failure", save: 0 }],
        area: { shape: "cone", size: 30 },
      },
    ],
  } as Monster
}

// Giant Insect: "AC 11 + the spell's level", "HP 30 + 10 for each spell level above 4", a Fly Speed for the wasp, half
// the spell's level in attacks, Poison Jab "1d6 + 3 plus the spell's level Piercing damage plus 1d4 Poison damage", and
// the spider's Web Bolt "1d10 + 3 plus the spell's level Bludgeoning damage". Web Bolt's lost Speed and the centipede's
// Venomous Spew are in the text alone.
function giantInsect(id: string, block: SummonedBlock): Monster | undefined {
  const abilities = abilitiesOf(block.spell)
  const form = block.choice ?? "spider"
  if (!abilities) return undefined
  const count = NUMBER_WORDS[Math.floor(block.slot / 2)] ?? "four"
  const jab = attackOf("Poison Jab", `Melee Attack Roll: +${block.attackBonus}, reach 10 ft. Hit: 1d6 + ${3 + block.slot} Piercing damage plus 1d4 Poison damage.`, "melee", block.attackBonus, 10, [
    { count: 1, sides: 6, plus: 3 + block.slot, type: "piercing" },
    { count: 1, sides: 4, plus: 0, type: "poison" },
  ])
  const web = attackOf(
    "Web Bolt",
    `Ranged Attack Roll: +${block.attackBonus}, range 60 ft. Hit: 1d10 + ${3 + block.slot} Bludgeoning damage, and the target's Speed is reduced to 0 until the start of the insect's next turn.`,
    "ranged",
    block.attackBonus,
    60,
    [{ count: 1, sides: 10, plus: 3 + block.slot, type: "bludgeoning" }]
  )
  const printed = spellById.get(block.spell)?.statBlocks?.[0]
  return {
    ...base(id, `Giant ${form[0].toUpperCase()}${form.slice(1)}`, block.spell, block),
    size: ["Large"],
    type: "beast",
    alignment: "Unaligned",
    ac: 11 + block.slot,
    initiative: { modifier: abilities.dex.mod, score: 10 + abilities.dex.mod },
    hp: { average: 30 + 10 * (block.slot - 4), formula: `${30 + 10 * (block.slot - 4)}` },
    speed: { walk: 40, climb: 40, ...(form === "wasp" ? { fly: 40 } : {}) },
    abilities,
    senses: { darkvision: 60, passivePerception: 12 },
    languages: "Understands the languages you know",
    traits: printed?.traits?.map((trait) => ({ name: trait.name, text: trait.text })),
    actions: [
      { name: "Multiattack", text: form === "spider" ? `The insect makes ${count} attacks, using Poison Jab and Web Bolt in any combination.` : `The insect makes ${count} Poison Jab attacks.` },
      jab,
      ...(form === "spider" ? [web] : []),
    ],
    ...(form === "centipede" ? { bonusActions: printed?.bonusActions?.filter((entry) => entry.name.startsWith("Venomous Spew")).map((entry) => ({ name: "Venomous Spew", text: entry.text })) } : {}),
  } as Monster
}

// Find Steed's Otherworldly Steed: "AC 10 + 1 per spell level", "HP 5 + 10 per spell level", Speed 60 and a Fly Speed of
// 60 from a level 4 slot, and Otherworldly Slam "1d8 plus the spell's level of Radiant (Celestial), Psychic (Fey), or
// Necrotic (Fiend) damage". Its Bonus Actions and Life Bond are in the text alone.
function otherworldlySteed(id: string, block: SummonedBlock): Monster | undefined {
  const abilities = abilitiesOf(block.spell)
  const kind = (block.choice ?? "celestial") as "celestial" | "fey" | "fiend"
  if (!abilities) return undefined
  const type: DamageTypeId = kind === "fey" ? "psychic" : kind === "fiend" ? "necrotic" : "radiant"
  return {
    ...base(id, "Otherworldly Steed", block.spell, block),
    size: ["Large"],
    type: kind,
    alignment: "Neutral",
    ac: 10 + block.slot,
    initiative: { modifier: abilities.dex.mod, score: 10 + abilities.dex.mod },
    hp: { average: 5 + 10 * block.slot, formula: `${5 + 10 * block.slot}` },
    speed: { walk: 60, ...(block.slot >= 4 ? { fly: 60 } : {}) },
    abilities,
    senses: { passivePerception: 11 },
    languages: "Telepathy 1 mile (works only with you)",
    traits: spellById.get(block.spell)?.statBlocks?.[0]?.traits?.map((trait) => ({ name: trait.name, text: trait.text })),
    actions: [
      attackOf("Otherworldly Slam", `Melee Attack Roll: +${block.attackBonus}, reach 5 ft. Hit: 1d8 + ${block.slot} ${type} damage.`, "melee", block.attackBonus, 5, [
        { count: 1, sides: 8, plus: block.slot, type },
      ]),
    ],
  } as Monster
}

// Animate Objects' Animated Object, Medium or smaller: AC 15, 10 Hit Points, Speed 30, and Slam "1d4 + 3" Force, 1d4
// more for each slot level above 5.
function animatedObject(id: string, block: SummonedBlock): Monster | undefined {
  const abilities = abilitiesOf(block.spell)
  if (!abilities) return undefined
  const dice = 1 + Math.max(0, block.slot - 5)
  return {
    ...base(id, "Animated Object", block.spell, block),
    size: ["Medium"],
    type: "construct",
    alignment: "Unaligned",
    ac: 15,
    initiative: { modifier: abilities.dex.mod, score: 10 + abilities.dex.mod },
    hp: { average: 10, formula: "10" },
    speed: { walk: 30 },
    abilities,
    immunities: ["poison", "psychic"],
    conditionImmunities: ["charmed", "exhaustion", "frightened", "paralyzed", "poisoned"],
    senses: { blindsight: 30, passivePerception: 6 },
    languages: "Understands the languages you know",
    actions: [
      attackOf("Slam", `Melee Attack Roll: +${block.attackBonus}, reach 5 ft. Hit: ${dice}d4 + 3 Force damage.`, "melee", block.attackBonus, 5, [{ count: dice, sides: 4, plus: 3, type: "force" }]),
    ],
  } as Monster
}

// Find Familiar: the chosen form's own block, "though it is a Celestial, Fey, or Fiend (your choice) instead of a
// Beast", and "A familiar can't attack": its attacks are left out, and a Multiattack with them.
function familiar(id: string, block: SummonedBlock): Monster | undefined {
  const choice = block.choice ?? ""
  const form = choice.slice(0, choice.lastIndexOf("-"))
  const kind = choice.slice(choice.lastIndexOf("-") + 1)
  const monster = monsterById.get(form)
  if (!monster) return undefined
  const keep = (features: readonly MonsterFeature[] | undefined) => features?.filter((feature) => !feature.attack && feature.name !== "Multiattack")
  const actions = keep(monster.actions)
  const bonusActions = keep(monster.bonusActions)
  const { actions: _, bonusActions: __, ...rest } = monster
  return {
    ...rest,
    id,
    name: monster.name,
    type: (kind || "fey") as CreatureType,
    ...(actions?.length ? { actions } : {}),
    ...(bonusActions?.length ? { bonusActions } : {}),
  }
}

const BUILDERS: Record<string, (id: string, block: SummonedBlock) => Monster | undefined> = {
  "summon-dragon": draconicSpirit,
  "giant-insect": giantInsect,
  "find-steed": otherworldlySteed,
  "animate-objects": animatedObject,
  "find-familiar": familiar,
}

const built = new Map<string, Monster | undefined>()

// A summoned creature's block from its id, built once.
function summoned(id: string): Monster | undefined {
  if (built.has(id)) return built.get(id)
  const [spell, slot, attackBonus, saveDc, proficiency, choice] = id.split(":")
  const builder = BUILDERS[spell]
  const monster = builder?.(id, { spell, slot: Number(slot), attackBonus: Number(attackBonus), saveDc: Number(saveDc), proficiency: Number(proficiency), ...(choice ? { choice } : {}) })
  built.set(id, monster)
  return monster
}

/** A stat block by its id: one of the SRD's, or one a spell built for the creature it called. */
export const statBlockById = (id: string | undefined): Monster | undefined => (id === undefined ? undefined : (monsterById.get(id) ?? (id.includes(":") ? summoned(id) : undefined)))

type Blocked = { type?: string; sheet?: unknown; statBlock?: string; shape?: Shape }

/** An NPC's own stat block, the Commoner's when it names none: its creature type and Hit Points, which a changed shape keeps. */
export const ownBlockOf = (character: Blocked): Monster | undefined => statBlockById(character.statBlock ?? DEFAULT_STAT_BLOCK) ?? monsterById.get(DEFAULT_STAT_BLOCK)

/**
 * The stat block an NPC's game statistics come from now: a shape a spell gave it (Polymorph's Beast, ./shape), else its
 * own. A hero's shape is read by ./shape `shapeOf`.
 */
export function blockOf(character: Blocked): Monster | undefined {
  const form = !character.sheet && character.shape ? monsterById.get(character.shape.form) : undefined
  return form ?? ownBlockOf(character)
}
