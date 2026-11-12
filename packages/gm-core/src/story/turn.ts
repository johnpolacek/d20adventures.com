import { z } from "zod"
import type { GmPorts } from "../ports"
import type { Strike } from "../sheet/attack"
import type { CheckResult } from "../sheet/check"
import type { ConcentrationSave } from "../sheet/spell-effects"
import type { Cast } from "../sheet/spells"
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
  }
}

// Names as a sentence lists them: "Branka", "Branka and Milos", "Branka, Milos and Thalbern".
const listed = (names: string[]) => (names.length < 3 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`)

const ABILITY_NAMES = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" } as const

/**
 * A spell cast as the story keeps it. A spell attack is the caster's roll against Armor Class, with its damage. Each
 * target's saving throw is a roll of the target's own, with what it then lost or was given. A spell with no spell
 * attack opens on an entry of its own that names it, with what it dealt or healed with no roll.
 */
export function castBeats(
  by: StoryBy,
  caster: { id: string; name: string; image?: string },
  spell: { name: string },
  cast: Cast<{ id: string; name: string; image?: string }>,
  names: StoryNames
): StoryBeat[] {
  const beats: StoryBeat[] = []
  const struck = cast.attack
  // What the attack itself dealt is on its own beat. The rest belongs to the saves, or to the spell with no roll.
  const rest = struck?.damage ? cast.harm.slice(1) : cast.harm
  const saved = new Set(cast.saves.map((save) => save.target))
  if (struck) {
    const { roll } = struck
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
      ...(cast.conditions.some((change) => change.target === struck.target && !saved.has(change.target)) ? { conditions: cast.conditions.filter((change) => change.target === struck.target) } : {}),
    })
  } else {
    // Everyone the spell took. A spell on its caster alone names no one.
    const on = cast.targets.length === 1 && cast.targets[0] === caster.id ? [] : cast.targets
    const direct = rest.filter((harm) => !saved.has(harm.target))
    beats.push({
      kind: "feature",
      by,
      character: caster.id,
      name: spell.name,
      text: `${caster.name} casts ${spell.name}${on.length ? ` on ${listed(on.map((id) => nameOf(names, id)))}` : ""}.`,
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
  }
  return beats
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
