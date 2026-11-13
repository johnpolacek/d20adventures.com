import { z } from "zod"
import type { GmPorts } from "../ports"
import type { Strike } from "../sheet/attack"
import type { CheckResult } from "../sheet/check"
import type { ReactionTaken } from "../sheet/reactions"
import type { ConcentrationSave } from "../sheet/spell-effects"
import type { RoundFact } from "../sheet/spell-rounds"
import type { Cast, SaveRoll } from "../sheet/spells"
import { isDown } from "../utils/turn-actors"
import { authoredStory } from "./authored"
import { type RollBeat, type StoryBeat, type StoryBy, storyOutputSchema } from "./beats"
import { cleanStory, type StoryScene } from "./clean"
import { characterStory, nameOf, type StoryNames, storyNames, storyParagraphs, storyText } from "./render"

type StoryTurn = {
  encounterId: string
  story: StoryBeat[]
  characters: readonly { id: string; name: string; type?: string; gender?: string; hitPoints?: number; healthPercent?: number }[]
}

// What a GM step returns when it writes story: its beats, alongside whatever else its schema asks for.
export const beatsField = { beats: storyOutputSchema }
export const storyOutputObject = z.object(beatsField)

// The scene a step writes for: the turn's characters, and the set's named places when the game has a 3D scene.
export async function sceneFor(ports: GmPorts, turn: Omit<StoryTurn, "story">): Promise<StoryScene> {
  const places = (await ports.content.places?.(turn.encounterId).catch(() => undefined)) ?? undefined
  return {
    cast: turn.characters.map((c) => ({ id: c.id, name: c.name, type: c.type, ...(c.gender ? { gender: c.gender } : {}), ...(isDown(c) ? { silent: true } : {}) })),
    ...(places?.length ? { places } : {}),
  }
}

// A turn's story as a script, for prompts.
export const turnScript = (turn: { story: StoryBeat[]; characters?: StoryTurn["characters"] }) => storyText(turn.story, storyNames(turn.characters ?? []))

// A turn's story as one character knows it, for prompts that play that character.
export const characterScript = (turn: { story: StoryBeat[]; characters?: StoryTurn["characters"] }, id: string) => storyText(characterStory(turn.story, id), storyNames(turn.characters ?? []))

// A turn's story with beats added.
export const withStory = (turn: { story: StoryBeat[] }, beats: readonly StoryBeat[]): { story: StoryBeat[] } => ({ story: [...turn.story, ...beats] })

// Beats as plain prose, paragraphs apart.
export const storyProse = (beats: readonly StoryBeat[]) =>
  storyParagraphs(beats)
    .map((p) => p.text)
    .join("\n\n")

// A resolved check as the story keeps it. Both dice are kept only when two were rolled.
export function rollBeat(
  by: StoryBy,
  roller: { id: string; name: string; image?: string },
  check: string,
  result: CheckResult,
  harm?: RollBeat["harm"],
  conditions?: RollBeat["conditions"]
): RollBeat {
  return {
    kind: "roll",
    by,
    character: roller.id,
    name: roller.name,
    check,
    natural: result.natural,
    ...(result.mode !== "normal" ? { dice: result.dice, mode: result.mode } : {}),
    modifier: result.bonus,
    total: result.total,
    dc: result.dc,
    success: result.success,
    ...(roller.image ? { image: roller.image } : {}),
    ...(harm?.length ? { harm } : {}),
    ...(conditions?.length ? { conditions } : {}),
    ...(result.inspired !== undefined ? { inspired: result.inspired } : {}),
    ...(result.adds?.length ? { adds: result.adds } : {}),
  }
}

// A turn that opens on an authored intro: its beats for the characters in it.
export const introTurn = (intro: string, scene: StoryScene): { story: StoryBeat[] } => ({ story: cleanStory(authoredStory(intro, scene), scene, { step: "intro" }) })

// A resolved attack as the story keeps it: the roll against Armor Class, and on a hit the damage dice and what was lost.
export function attackBeat(by: StoryBy, roller: { id: string; name: string; image?: string }, target: string, blow: Strike): RollBeat {
  const { roll } = blow
  return {
    kind: "roll",
    by,
    character: roller.id,
    name: roller.name,
    check: blow.attack.name,
    natural: roll.natural,
    ...(roll.mode !== "normal" ? { dice: roll.dice, mode: roll.mode } : {}),
    modifier: roll.bonus,
    total: roll.total,
    dc: roll.armorClass,
    success: roll.hit,
    ...(roller.image ? { image: roller.image } : {}),
    attack: { target, ...(roll.critical ? { critical: true as const } : {}), ...(blow.damage ? { damage: blow.damage.parts, taken: blow.taken } : {}) },
    ...(blow.inspired !== undefined ? { inspired: blow.inspired } : {}),
    ...(roll.adds?.length ? { adds: roll.adds } : {}),
    ...(blow.conditions?.length ? { conditions: blow.conditions } : {}),
  }
}

// Names as a sentence lists them: "Branka", "Branka and Milos", "Branka, Milos and Thalbern".
const listed = (names: string[]) => (names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`)

const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" } as const

/**
 * A spell cast as the story keeps it. A spell attack is the caster's roll against Armor Class, with its damage, and
 * each of Scorching Ray's rays is a roll of its own. Each target's saving throw is a roll of the target's own, with
 * what it then lost or was given. A spell with no spell attack opens on an entry of its own that names it, with what
 * it dealt or healed with no roll.
 */
export function castBeats(
  by: StoryBy,
  caster: { id: string; name: string; image?: string },
  spell: { name: string },
  cast: Cast<{ id: string; name: string; image?: string }>,
  names: StoryNames,
  verb = "casts"
): StoryBeat[] {
  const beats: StoryBeat[] = []
  // Each spell attack the spell made: one, or each of Scorching Ray's rays in turn.
  const attacks = cast.rays ?? (cast.attack ? [cast.attack] : [])
  // What the attacks themselves dealt is on their own beats, in the order they fell. The rest belongs to the saves, or
  // to the spell with no roll.
  const rest = cast.harm.slice(attacks.filter((attack) => attack.damage).length)
  const saved = new Set(cast.saves.map((save) => save.target))
  // A condition the attacks gave is told once, on the first beat for its target.
  const told = new Set<string>()
  for (const struck of attacks) {
    const { roll } = struck
    const given = !saved.has(struck.target) && !told.has(struck.target) ? cast.conditions.filter((change) => change.target === struck.target) : []
    told.add(struck.target)
    beats.push({
      kind: "roll",
      by,
      character: caster.id,
      name: caster.name,
      check: spell.name,
      natural: roll.natural,
      ...(roll.mode !== "normal" ? { dice: roll.dice, mode: roll.mode } : {}),
      modifier: roll.bonus,
      total: roll.total,
      dc: roll.armorClass,
      success: roll.hit,
      ...(caster.image ? { image: caster.image } : {}),
      attack: { target: struck.target, ...(roll.critical ? { critical: true as const } : {}), ...(struck.damage ? { damage: struck.damage.parts, taken: struck.taken } : {}) },
      ...(roll.adds?.length ? { adds: roll.adds } : {}),
      spell: spell.name,
      ...(given.length ? { conditions: given } : {}),
    })
  }
  if (!attacks.length) {
    // Everyone the spell took. A spell on its caster alone names no one.
    const on = cast.targets.length === 1 && cast.targets[0] === caster.id ? [] : cast.targets
    const direct = rest.filter((harm) => !saved.has(harm.target))
    beats.push({
      kind: "feature",
      by,
      character: caster.id,
      name: spell.name,
      text: `${caster.name} ${verb} ${spell.name}${on.length ? ` on ${listed(on.map((id) => nameOf(names, id)))}` : ""}.`,
      ...(on.length === 1 ? { target: on[0] } : {}),
      ...(direct.length ? { harm: direct } : {}),
    })
  }
  for (const save of cast.saves) {
    const harm = rest.filter((entry) => entry.target === save.target)
    const conditions = cast.conditions.filter((change) => change.target === save.target)
    const target = cast.characters.find((character) => character.id === save.target)
    beats.push({
      kind: "roll",
      by,
      character: save.target,
      name: target?.name ?? nameOf(names, save.target),
      check: `${ABILITY_NAMES[save.ability]} Saving Throw`,
      natural: save.natural,
      ...(save.mode !== "normal" ? { dice: save.dice, mode: save.mode } : {}),
      modifier: save.bonus,
      total: save.total,
      dc: save.dc,
      success: save.success,
      ...(target?.image ? { image: target.image } : {}),
      ...(save.adds?.length ? { adds: save.adds } : {}),
      spell: spell.name,
      ...(harm.length ? { harm } : {}),
      ...(conditions.length ? { conditions } : {}),
    })
    // A failed save a Legendary creature chose to succeed on, told as the fact it is.
    if (save.legendary) {
      const name = target?.name ?? nameOf(names, save.target)
      beats.push({ kind: "feature", by, character: save.target, name: "Legendary Resistance", text: `${name} fails the saving throw and chooses to succeed instead.` })
    }
  }
  return beats
}

/**
 * The reactions a casting drew, as the story keeps them (../sheet/counterspell `reactionsToCast`): each reaction an
 * entry of its own, and each Constitution save its caster made against Counterspell a roll of theirs.
 */
export function castAnswerBeats(by: StoryBy, answered: { reactions: readonly ReactionTaken[]; saves: readonly SaveRoll[] }, names: StoryNames): StoryBeat[] {
  // Each Counterspell's save, in the order they were cast.
  let next = 0
  return answered.reactions.flatMap((taken): StoryBeat[] => {
    const save = taken.id === "counterspell" ? answered.saves[next++] : undefined
    const entry: StoryBeat = { kind: "feature", by, character: taken.by, name: taken.name, text: taken.text }
    if (!save) return [entry]
    return [
      entry,
      {
        kind: "roll",
        by,
        character: save.target,
        name: nameOf(names, save.target),
        check: "Constitution Saving Throw",
        natural: save.natural,
        ...(save.mode !== "normal" ? { dice: save.dice, mode: save.mode } : {}),
        modifier: save.bonus,
        total: save.total,
        dc: save.dc,
        success: save.success,
        ...(save.adds?.length ? { adds: save.adds } : {}),
        spell: taken.name,
      },
    ]
  })
}

/**
 * What lasting spells did as a round turned (../sheet/spell-rounds `roundTurns`), as the story keeps it: each fact an
 * entry of its own under the spell's name, about the one it fell on, and each Concentration save a roll of the caster's.
 */
export function roundBeats(turned: { told: readonly RoundFact[]; saves: readonly ConcentrationSave[] }, names: StoryNames): StoryBeat[] {
  return [
    ...turned.told.map((fact): StoryBeat => ({ kind: "feature", by: { step: "round", character: fact.character }, character: fact.character, name: fact.spell, text: fact.text })),
    ...turned.saves.map((save) => concentrationBeat({ step: "round", character: save.character }, save, names)),
  ]
}

/** A caster's saving throw to keep Concentration after taking damage, as the story keeps it. */
export function concentrationBeat(by: StoryBy, save: ConcentrationSave, names: StoryNames): RollBeat {
  return {
    kind: "roll",
    by,
    character: save.character,
    name: nameOf(names, save.character),
    check: "Constitution Saving Throw",
    natural: save.natural,
    modifier: save.bonus,
    total: save.total,
    dc: save.dc,
    success: save.success,
    spell: save.spell,
    concentration: true,
  }
}
