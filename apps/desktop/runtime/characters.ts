import type { TurnRecord } from "@d20/gm-core"
import type { TurnCharacter } from "@d20/gm-core/types/adventure"
import { adventurePatchSchema } from "@d20/gm-core/wiki-adventures/adventure-patch"
import { type CharacterUpdate, characterUpdateSchema } from "@d20/gm-core/wiki-adventures/character-updates"
import { z } from "zod"
import { strictModelSchema } from "../../desktop-spike/harness/strict-state.mjs"

export const desktopPatchSchema = strictModelSchema(adventurePatchSchema.omit({ characterUpdates: true })).extend({
  characterUpdates: z.array(characterUpdateSchema).max(100).optional(),
})
export type CharacterState = Pick<TurnCharacter, "healthPercent" | "status" | "equipment" | "effects" | "spells">
export type CharacterStates = Record<string, CharacterState>
const key = (name: string) => name.trim().toLowerCase()

export function characterState(c: CharacterState): CharacterState {
  return structuredClone({ healthPercent: c.healthPercent, status: c.status, equipment: c.equipment ?? [], effects: c.effects ?? [], spells: c.spells ?? [] })
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
    const c = result.find((c) => c.id === update.characterId)
    if (!c) throw new Error(`Unknown character in state update: ${update.characterId}`)
    if (update.healthPercent !== undefined) c.healthPercent = update.healthPercent
    if (update.status !== undefined) c.status = update.status.trim() || undefined
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
    const c = { ...structuredClone(next), ...(states[next.id] ?? characterState(next)), hasReplied: false, isComplete: false, rollRequired: undefined, rollResult: undefined }
    if (args.encounterChanged) c.spells = (c.spells ?? []).map((s) => ({ ...s, isUsed: false }))
    if (c.healthPercent === 0 || c.status === "dead" || c.status === "fled") c.isComplete = true
    states[c.id] = characterState(c)
    return c
  })
  return { characters, characterStates: states }
}

export function characterContext(characters: TurnCharacter[], patchInstructions = false) {
  const context = `\n\nCURRENT SAVED CHARACTER STATE (authoritative, after already resolved actions):\n${JSON.stringify(characters.map((c) => ({ id: c.id, name: c.name, ...characterState(c) })))}`
  if (!patchInstructions) return context
  return `${context}
Use exact character IDs and existing item/effect/spell names. State patches describe only additional changes established by resolved actions or your outcome narrative. Do not repeat changes already reflected above. Do not apply attempted actions that failed or still need a roll.
For each item received, add one inventoryChanges entry {op:"add",name,description?}. For each item spent, lost, or transferred, use {op:"remove",name}. A transfer removes from the giver and adds to the receiver. Each entry is one item, not a quantity or currency balance.
For effects use {op:"set",name,description,duration} to add or refresh, or {op:"remove",name} to end one. Duration is a positive number of rounds starting with the next round. Existing effects automatically lose one round on advance, so do not emit routine duration decrements. Empty status clears a status. Health values are absolute percentages, not damage deltas.
Spell changes are {name,isUsed} for known spells only. Spells automatically recharge upon entering a different encounter. Do not invent items, conditions, currency accounting, or spells absent from established events. Omit unchanged fields and return characterUpdates:[] when no change is needed.`
}
