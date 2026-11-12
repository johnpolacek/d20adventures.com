import assert from "node:assert/strict"
import { test } from "node:test"
import type { Sheet } from "../../src/sheet/sheet"
import type { PCTemplate } from "../../src/types/character"
import { buildLocalWikiTurnCharacters } from "../../src/wiki-adventures/characters"

const rules: Sheet = {
  class: "ranger",
  level: 1,
  species: "human",
  background: "soldier",
  abilityScores: { str: 13, dex: 17, con: 13, int: 11, wis: 13, cha: 10 },
  classSkills: ["stealth", "survival", "nature"],
}
const hero = (extra: Partial<PCTemplate> = {}): PCTemplate => ({
  id: "thalbern",
  type: "pc",
  name: "Thalbern",
  image: "",
  archetype: "Ranger",
  race: "Human",
  appearance: "",
  attributes: { strength: 13, dexterity: 17, constitution: 13, intelligence: 11, wisdom: 13, charisma: 10 },
  ...extra,
})
const start = (premade: PCTemplate, saved?: PCTemplate) =>
  buildLocalWikiTurnCharacters({
    artifacts: { manifest: {}, characterSheets: { premadeCharacters: { thalbern: { sheet: premade } }, npcs: {} } } as unknown as Parameters<typeof buildLocalWikiTurnCharacters>[0]["artifacts"],
    encounter: { npcRefs: [] } as unknown as Parameters<typeof buildLocalWikiTurnCharacters>[0]["encounter"],
    players: [{ userId: "user-1", characterId: "characters/user-1/thalbern.json" }],
    sheetsByCharacterId: saved ? { "characters/user-1/thalbern.json": saved } : undefined,
  })[0]

// Thalbern's 11 hit points are d10 + 1, for Constitution 13.
test("a game starts with the hero's rules sheet, at its maximum", () => {
  const started = start(hero({ sheet: rules }))
  assert.deepEqual(started.sheet, rules)
  assert.deepEqual([started.hitPoints, started.healthPercent], [11, 100])
})

test("a player's saved copy from before the rules takes the adventure's sheet and keeps its own state", () => {
  const started = start(hero({ sheet: rules }), hero({ hitPoints: 7, equipment: [{ name: "Owlbear Feather" }] }))
  assert.deepEqual(started.sheet, rules)
  assert.deepEqual([started.hitPoints, started.healthPercent], [7, 64])
  assert.deepEqual(started.equipment, [{ name: "Owlbear Feather" }])
})

test("a saved copy with its own sheet keeps it, and a hero with none anywhere cannot start", () => {
  const own: Sheet = { ...rules, level: 2 }
  assert.deepEqual(start(hero({ sheet: rules }), hero({ sheet: own })).sheet, own)
  assert.throws(() => start(hero(), hero()), /has no rules sheet/)
})
