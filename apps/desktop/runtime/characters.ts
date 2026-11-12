import type { TurnRecord } from "@d20/gm-core"
import { conditionsAtEncounterEnd, conditionWords, withoutCondition } from "@d20/gm-core/sheet/conditions"
import { atRoundStart } from "@d20/gm-core/sheet/death"
import type { TurnCharacter } from "@d20/gm-core/types/adventure"
import { hasFled, isDead, isDown } from "@d20/gm-core/utils/turn-actors"
import { adventurePatchSchema } from "@d20/gm-core/wiki-adventures/adventure-patch"
import { type CharacterUpdate, characterUpdateSchema } from "@d20/gm-core/wiki-adventures/character-updates"
import { z } from "zod"
import { strictModelSchema } from "../../desktop-spike/harness/strict-state.mjs"

export const desktopPatchSchema = strictModelSchema(adventurePatchSchema.omit({ characterUpdates: true })).extend({
  characterUpdates: z.array(characterUpdateSchema).max(100).optional(),
})
export type CharacterState = Pick<TurnCharacter, "hitPoints" | "healthPercent" | "conditions" | "dead" | "fled" | "deathSaves" | "equipment" | "effects" | "spells">
export type CharacterStates = Record<string, CharacterState>
const key = (name: string) => name.trim().toLowerCase()

export function characterState(c: CharacterState): CharacterState {
  return structuredClone({
    hitPoints: c.hitPoints,
    healthPercent: c.healthPercent,
    conditions: c.conditions,
    dead: c.dead,
    fled: c.fled,
    // Always set, so a hero brought back clears the saves a later spread would otherwise keep.
    deathSaves: c.deathSaves,
    equipment: c.equipment ?? [],
    effects: c.effects ?? [],
    spells: c.spells ?? [],
  })
}

/** Old saves bootstrap from their latest snapshots, never by replaying descriptive patches. */
export function rememberCharacters(turns: TurnRecord[], remembered: CharacterStates = {}): CharacterStates {
  const states = structuredClone(remembered)
  for (const turn of [...turns].sort((a, b) => a.order - b.order)) {
    for (const character of turn.characters) states[character.id] = characterState(character)
  }
  return states
}

/** Apply to copies so a bad reference cannot leave a partially changed live save. */
export function applyCharacterUpdates(characters: TurnCharacter[], input: unknown): TurnCharacter[] {
  const updates: CharacterUpdate[] = z
    .array(characterUpdateSchema)
    .max(100)
    .parse(input ?? [])
  const result = structuredClone(characters)
  const seen = new Set<string>()
  for (const update of updates) {
    if (seen.has(update.characterId)) throw new Error(`Duplicate character update: ${update.characterId}`)
    seen.add(update.characterId)
    const index = result.findIndex((c) => c.id === update.characterId)
    if (index < 0) throw new Error(`Unknown character in state update: ${update.characterId}`)
    // Hit points and conditions are the engine's: a round's patch can only end a condition its events ended with no roll.
    for (const id of update.conditionsEnded ?? []) result[index] = withoutCondition(result[index], id).character
    const c = result[index]
    for (const change of update.inventoryChanges ?? []) {
      c.equipment ??= []
      if (change.op === "add") c.equipment.push({ name: change.name, ...(change.description !== undefined ? { description: change.description } : {}) })
      else {
        const index = c.equipment.findIndex((item) => key(item.name) === key(change.name))
        if (index < 0) throw new Error(`${c.name} does not have ${change.name}.`)
        c.equipment.splice(index, 1)
      }
    }
    for (const change of update.effectChanges ?? []) {
      c.effects ??= []
      const index = c.effects.findIndex((effect) => key(effect.name) === key(change.name))
      if (change.op === "remove") {
        if (index < 0) throw new Error(`${c.name} does not have the effect ${change.name}.`)
        c.effects.splice(index, 1)
      } else {
        const effect = { name: change.name, description: change.description, duration: change.duration }
        if (index < 0) c.effects.push(effect)
        else c.effects[index] = effect
      }
    }
    for (const change of update.spellUseChanges ?? []) {
      const spell = c.spells?.find((spell) => key(spell.name) === key(change.name))
      if (!spell) throw new Error(`${c.name} does not know ${change.name}.`)
      spell.isUsed = change.isUsed
    }
  }
  return result
}

const deathState = (c: TurnCharacter) => ({ hitPoints: c.hitPoints, healthPercent: c.healthPercent, conditions: c.conditions, dead: c.dead, deathSaves: c.deathSaves })

export function nextCharacterState(args: { current: TurnCharacter[]; next: TurnCharacter[]; remembered: CharacterStates; updates: unknown; encounterChanged: boolean }): {
  characters: TurnCharacter[]
  characterStates: CharacterStates
} {
  const updates = z.array(characterUpdateSchema).parse(args.updates ?? [])
  const updated = applyCharacterUpdates(args.current, updates)
  const states = structuredClone(args.remembered)
  for (const c of updated) states[c.id] = characterState(c)
  // A new/refreshed effect lasts its full stated duration starting with the new round.
  for (const [id, state] of Object.entries(states)) {
    const refreshed = new Set(
      updates
        .find((u) => u.characterId === id)
        ?.effectChanges?.filter((e) => e.op === "set")
        .map((e) => key(e.name))
    )
    state.effects = (state.effects ?? []).map((e) => ({ ...e, duration: e.duration - (refreshed.has(key(e.name)) ? 0 : 1) })).filter((e) => e.duration > 0)
  }
  // Keep fallen PCs in the party sheet, even though the shared turn builder omits them.
  const roster = [...args.next, ...args.current.filter((c) => c.type === "pc" && !args.next.some((n) => n.id === c.id))]
  const characters = roster.map((next) => {
    // The rescue brings a hero at 0 back as the round turns, unless the round's patch already did.
    const before = args.current.find((c) => c.id === next.id)
    const revived = before && isDown(before) && !isDown(next) && isDown(states[next.id] ?? before) ? deathState(next) : {}
    const kept = { ...structuredClone(next), ...(states[next.id] ?? characterState(next)), ...revived, rollRequired: undefined, rollResult: undefined }
    // A new encounter ends the conditions of a fight's moment, and the lasting ones come along.
    const c = args.encounterChanged ? conditionsAtEncounterEnd(kept) : kept
    if (!c.deathSaves) delete c.deathSaves
    if (args.encounterChanged) c.spells = (c.spells ?? []).map((s) => ({ ...s, isUsed: false }))
    // A dying hero's turn is their Death Saving Throw. The dead, the Stable and the fled take none.
    const ready = hasFled(c) ? { ...c, hasReplied: false, isComplete: true } : atRoundStart(c)
    states[c.id] = characterState(ready)
    return ready
  })
  return { characters, characterStates: states }
}

// Who is dead, said outright: a poisoned Thaddeus died on his own turn, then gasped on one knee in the next outcome.
const dead = (characters: TurnCharacter[]) => {
  const names = characters.filter(isDead).map((c) => c.name)
  return names.length ? `\nDead: ${names.join(", ")}. The dead stay dead: they do not act, speak or move, and no one describes them alive.` : ""
}

// The saved state every GM prompt carries. A prompt that plays one character, its `viewer`, reads that character's own
// gear, effects and spells, and of the others only what shows: how hurt they are and their condition.
export function characterContext(characters: TurnCharacter[], patchInstructions = false, viewer?: string) {
  const shown = (c: TurnCharacter) => {
    const state = characterState(c)
    return viewer === undefined || c.id === viewer ? state : { healthPercent: c.healthPercent, conditions: conditionWords(c) || undefined, fled: c.fled }
  }
  const context = `\n\nCURRENT SAVED CHARACTER STATE (authoritative, after already resolved actions):\n${JSON.stringify(characters.map((c) => ({ id: c.id, name: c.name, ...shown(c) })))}${dead(characters)}`
  if (!patchInstructions) return context
  return `${context}
Use exact character IDs and existing item/effect/spell names. State patches describe only additional changes established by resolved actions or your outcome narrative. Do not repeat changes already reflected above. Do not apply attempted actions that failed or still need a roll.
For each item received, add one inventoryChanges entry {op:"add",name,description?}. For each item spent, lost, or transferred, use {op:"remove",name}. A transfer removes from the giver and adds to the receiver. Each entry is one item, not a quantity or currency balance.
For effects use {op:"set",name,description,duration} to add or refresh, or {op:"remove",name} to end one. Duration is a positive number of rounds starting with the next round. Existing effects automatically lose one round on advance, so do not emit routine duration decrements. Conditions are the game's: never give one. End one only when the round's events ended it with no roll, by id in conditionsEnded. Hit points and health are the game's: it rolls every wound and every healing, so never give a health value and never tell of harm or healing the state above does not show.
Spell changes are {name,isUsed} for known spells only. Spells automatically recharge upon entering a different encounter. Do not invent items, conditions, currency accounting, or spells absent from established events. Omit unchanged fields and return characterUpdates:[] when no change is needed.`
}
