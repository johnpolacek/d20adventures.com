import { existsSync } from "node:fs"
import type { Class, ClassFeature, ClassLevel, FeatureOption, Subclass } from "../../src/schema/classes"
import { classFeatureSchema, classSchema, subclassSchema } from "../../src/schema/classes"
import { creatureTypes } from "../../src/schema/common"
import type { Equipment } from "../../src/schema/equipment"
import type { Feat } from "../../src/schema/origins"
import type { Spell } from "../../src/schema/spells"
import { dataPath, readData, toId } from "../lib/data"
import { inOfficial, missingSentences, pages, squash } from "../lib/official"
import type { Report } from "../lib/report"
import { hasUpstream, readOpen5e } from "../lib/sources"

// Every check parses the official text on its own: the contents for names and pages, each class section line by
// line for core traits, the features table, headings, prose, inner tables and spell lists. None of it reuses the
// builder or the base source.

const category = "classes"
type Line = { raw: string; text: string; page: number }
type Owner = { id: string; name: string; lines: Line[]; heading: number }

const abilityByName: Record<string, string> = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" }
const abilityName = Object.fromEntries(Object.entries(abilityByName).map(([name, id]) => [id, name]))
const capital = (id: string) => id.replace(/(^|-)(\w)/g, (_, dash, letter) => `${dash ? " " : ""}${letter.toUpperCase()}`)
/** Equal as data: lists in order, object keys in any order. */
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical((value as Record<string, unknown>)[key])])
        )
      : value
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
const sorted = <T>(list: T[]) => [...list].sort()

/** Join PDF lines: a word broken at a line end ("Na-" "ture") closes up; "shape- " keeps its hyphen; a dash joins tight. */
function join(lines: (Line | string)[]): string {
  let out = ""
  let hard = false
  for (const entry of lines) {
    const raw = typeof entry === "string" ? entry : entry.raw
    const text = raw.replace(/^[•\t ]+/, "").trim()
    if (!text) continue
    if (!out) out = text
    else if (out.endsWith("-") && !hard) out = out.slice(0, -1) + text
    else if (out.endsWith("-") || out.endsWith("—")) out += text
    else out += ` ${text}`
    hard = /-\s+$/.test(raw)
  }
  return out.replace(/\s+/g, " ")
}

// The chapter

/** Contents entries from "Classes" to "Character Origins": name and page. A wrapped entry ends at the dot leader. */
function contents(): { name: string; page: number }[] {
  const text = pages[1] + pages[2]
  const start = text.indexOf("\nClasses.")
  const end = text.indexOf("\nCharacter Origins")
  const entries: { name: string; page: number }[] = []
  let pending = ""
  for (const line of text.slice(start + 1, end).split("\n")) {
    const match = line.match(/^(.*?)\.+\s*(\d+)$/)
    if (!match) {
      pending = `${pending} ${line.trim()}`.trim()
      continue
    }
    entries.push({ name: `${pending} ${match[1].trim()}`.trim().replace(/\.$/, ""), page: Number(match[2]) })
    pending = ""
  }
  return entries
}

function chapterLines(first: number, last: number): Line[] {
  const lines: Line[] = []
  for (let page = first; page <= last; page++) {
    for (const raw of pages[page - 1].split("\n")) {
      const text = raw.trim()
      if (text) lines.push({ raw, text, page })
    }
  }
  return lines
}

// Tables

const valueCell = /^(—|\+?\d+|\d+d\d+|D\d+|\+\d+ ft\.)$/

/** The visual column order of each features table after Level, Proficiency Bonus and Class Features. */
const columns: Record<string, string[]> = {
  barbarian: ["rages", "rageDamage", "weaponMastery"],
  bard: ["bardicDie", "cantrips", "preparedSpells", ...slots(9)],
  cleric: ["channelDivinity", "cantrips", "preparedSpells", ...slots(9)],
  druid: ["wildShape", "cantrips", "preparedSpells", ...slots(9)],
  fighter: ["secondWind", "weaponMastery"],
  monk: ["martialArts", "focusPoints", "unarmoredMovement"],
  paladin: ["channelDivinity", "preparedSpells", ...slots(5)],
  ranger: ["favoredEnemy", "preparedSpells", ...slots(5)],
  rogue: ["sneakAttack"],
  sorcerer: ["sorceryPoints", "cantrips", "preparedSpells", ...slots(9)],
  warlock: ["invocations", "cantrips", "preparedSpells", "pactSlots", "slotLevel"],
  wizard: ["cantrips", "preparedSpells", ...slots(9)],
}
function slots(count: number) {
  return Array.from({ length: count }, (_, index) => `slot${index + 1}`)
}
/** The printed heading of each column, to prove the column order above against the table head. */
const headings: Record<string, string> = {
  rages: "Rages",
  rageDamage: "Rage Damage",
  weaponMastery: "Weapon Mastery",
  bardicDie: "Bardic Die",
  channelDivinity: "Channel Divinity",
  wildShape: "Wild Shape",
  secondWind: "Second Wind",
  martialArts: "Martial Arts",
  focusPoints: "Focus Points",
  unarmoredMovement: "Unarmored Movement",
  favoredEnemy: "Favored Enemy",
  sneakAttack: "Sneak Attack",
  sorceryPoints: "Sorcery Points",
  invocations: "Eldritch Invocations",
  cantrips: "Cantrips",
  preparedSpells: "Prepared Spells",
  pactSlots: "Spell Slots",
  slotLevel: "Slot Level",
  slot1: "Spell Slots per Spell Level",
}

/** A printed cell as the data stores it: "+2" is 2, "D6" is 6, "+10 ft." is 10, "1d6" stays, "—" is absent. */
function cellValue(cell: string): number | string | undefined {
  if (cell === "—") return undefined
  const feet = cell.match(/^\+(\d+) ft\.$/)
  if (feet) return Number(feet[1])
  const die = cell.match(/^D(\d+)$/)
  if (die) return Number(die[1])
  if (/^\d+d\d+$/.test(cell)) return cell
  return Number(cell.replace("+", ""))
}

type TableRow = { level: number; pb: number; features: string[]; cells: string[] }

/** Parse a features table: rows of level, "+PB", feature lines, then exactly one cell per column. */
function featuresTable(lines: Line[], start: number, width: number): { rows: TableRow[]; head: string; end: number } {
  let first = start + 1
  while (!(lines[first].text === "1" && lines[first + 1]?.text === "+2")) first++
  const head = lines
    .slice(start + 1, first)
    .map((line) => line.text)
    .join(" ")
  const rows: TableRow[] = []
  let at = first
  for (let level = 1; level <= 20; level++) {
    if (lines[at].text !== String(level) || !/^\+\d$/.test(lines[at + 1].text)) throw new Error(`row ${level} does not start at "${lines[at].text}"`)
    const body = at + 2
    let split = body + 1
    const fits = (end: number) => {
      const cells = lines.slice(end, end + width)
      if (cells.length < width || !cells.every((line) => valueCell.test(line.text))) return false
      const next = lines[end + width]
      return level === 20 ? !next || next.page !== lines[at].page : next?.text === String(level + 1) && /^\+\d$/.test(lines[end + width + 1]?.text ?? "")
    }
    while (!fits(split)) {
      split++
      if (split > body + 6) throw new Error(`row ${level} has no cells that fit`)
    }
    rows.push({
      level,
      pb: Number(lines[at + 1].text),
      features: join(lines.slice(body, split))
        .split(", ")
        .map((name) => name.trim())
        .filter((name) => name !== "—"),
      cells: lines.slice(split, split + width).map((line) => line.text),
    })
    at = split + width
  }
  return { rows, head, end: at }
}

/**
 * A small table under a title, up to the next heading or land table (or the page end for Beast Shapes). Heading
 * lines come first. With `width`, rows are runs of that many cells; without it a row is a number and the lines after.
 */
function innerTable(lines: Line[], title: string, from: number, width?: number): { rows: string[][]; start: number; end: number } {
  const start = lines.findIndex((line, index) => index >= from && line.text === title)
  if (start < 0) throw new Error(`no table ${title}`)
  let end = start + 1
  while (end < lines.length && !/^Level \d+:/.test(lines[end].text) && !/^(Arid|Polar|Temperate|Tropical) Land$/.test(lines[end].text) && lines[end].page === lines[start].page) end++
  const cells = lines.slice(start + 1, end).map((line) => line.text)
  const first = cells.findIndex((cell) => /^(\d+|Arid|Polar|Temperate|Tropical)$/.test(cell))
  const body = cells.slice(first).filter((cell) => !/^(Land Type|Resistance)$/.test(cell))
  const rows: string[][] = []
  if (width) for (let index = 0; index < body.length; index += width) rows.push(body.slice(index, index + width))
  else for (const cell of body) /^\d+$/.test(cell) ? rows.push([cell]) : rows[rows.length - 1].push(cell)
  return { rows, start, end }
}

/** A spell list: level headings, then Spell, School, Special triples. */
function spellList(lines: Line[]): { level: number; name: string; school: string; special: string }[] {
  const schools = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"]
  const out: { level: number; name: string; school: string; special: string }[] = []
  let level = -1
  for (let index = 0; index < lines.length; index++) {
    const text = lines[index].text
    const head = text.match(/^(?:Cantrips \(Level 0 \w+ Spells\)|Level (\d) \w+ Spells)$/)
    if (head) {
      level = head[1] ? Number(head[1]) : 0
      continue
    }
    if (level < 0 || ["Spell", "School", "Special"].includes(text)) continue
    const school = lines[index + 1]?.text
    const special = lines[index + 2]?.text
    if (!schools.includes(school) || !/^(—|–|[CRM](, [CRM])*)$/.test(special)) throw new Error(`spell list misreads at "${text}"`)
    out.push({ level, name: text, school, special })
    index += 2
  }
  return out
}

/** A spell's own header in “Spells”: "Mind Spike" then "Level 2 Divination (Sorcerer, Warlock, Wizard)". */
function spellHeader(id: string): { level: number; classes: string[]; page: number } | undefined {
  for (const [index, page] of pages.entries()) {
    const lines = page.split("\n")
    for (const [at, line] of lines.entries()) {
      if (toId(line.trim()) !== id) continue
      const header = lines[at + 1]?.match(/^(?:Level (\d) \w+|\w+ Cantrip) \(([^)]+)\)$/)
      if (header) return { level: header[1] ? Number(header[1]) : 0, classes: header[2].split(", ").map(toId), page: index + 1 }
    }
  }
  return undefined
}

// Mechanics, read back from the text

const numberWord: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six" }

const typeNames = "Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder"
const typeList = `(?:${typeNames})(?:,? (?:or |and )?(?:${typeNames}))*`
const listOf = (text: string) => (text.match(new RegExp(typeNames, "g")) ?? []).map((type) => type.toLowerCase())
const conditionNames = "Blinded|Charmed|Deafened|Frightened|Grappled|Incapacitated|Invisible|Paralyzed|Petrified|Poisoned|Prone|Restrained|Stunned|Unconscious"

/**
 * Features whose one printed distance belongs to a part of the feature, not to the feature, read by hand. Heightened
 * Focus: the 5 feet is Step of the Wind’s. Dark One’s Blessing: the 10 feet is for an enemy someone else reduces.
 */
const subPartDistance: Record<string, number> = { "Heightened Focus": 5, "Dark One’s Blessing": 10 }

/** The phrases that state each condition a passive benefit holds under. */
const whilePhrase: Record<string, RegExp> = {
  raging: /while your Rage is active|While active, your Rage/,
  "no-heavy-armor": /while you aren’t wearing Heavy armor/,
  "in-aura-of-protection": /while in your Aura of Protection/,
}

/** Fields read by hand, by field name. `null` means the field must be absent: the text states it with a condition the shape cannot hold, or it belongs to something else. */
type HandReading = Record<string, unknown>

const channelDivinity = { resource: "channel-divinity", amount: 1 }

/**
 * Values read by hand from the official text for every entry where a plain reading would claim more than the text:
 * a chooser, a creature-type or size limit, a value that holds only for one option or one condition, or a value
 * that belongs to a summoned creature. Pages are where each reading comes from.
 */
const handReadings: Record<string, HandReading> = {
  // Page 30: "each creature of your choice in a 30-foot Emanation"; a use is restored by "a use of your Rage".
  "path-of-the-berserker-intimidating-presence": {
    activation: ["bonus-action"],
    area: { shape: "emanation", size: 30, selective: true },
    uses: { count: 1, recharge: "long-rest", restoredBy: { resource: "rage", amount: 1 } },
    // The Frightened condition and the repeated save at the end of each of its turns are not typed.
    untyped: ["conditions", "save"],
  },
  // Page 46: "Each creature of your choice in the Sphere"; "One creature of your choice in that area regains 2d6 Hit
  // Points", rising "to 3d6 at level 10 and 4d6 at level 14".
  "circle-of-the-land-lands-aid": {
    area: { shape: "sphere", size: 10, selective: true },
    healing: {
      dice: "2d6",
      diceByLevel: [
        { level: 10, dice: "3d6" },
        { level: 14, dice: "4d6" },
      ],
    },
  },
  // Page 37: the save and its damage types hold only if you choose harm over healing; the 1d8 total serves both.
  // Every Channel Divinity effect spends one use (page 37: "Each time you use this class’s Channel Divinity").
  "cleric-channel-divinity/divine-spark": { save: null, damage: null, healing: null, dice: "1d8", spend: channelDivinity, untyped: ["save", "damage", "healing"] },
  // Page 37: "Each Undead of your choice within 30 feet of you must make a Wisdom saving throw."
  "cleric-channel-divinity/turn-undead": { save: { ability: "wis", onlyCreatureTypes: ["undead"], selective: true, onSuccess: "none" }, spend: channelDivinity, untyped: ["conditions"] },
  // Page 72: the slotless casting is only "to contact your patron".
  "warlock-contact-patron": { freeCast: [{ spell: "contact-other-plane", usableWhen: "to contact your patron" }] },
  // Page 46: the Bonus Action only moves the Cube already in place; the Half Cover is for "You and your allies".
  "circle-of-the-land-natures-sanctuary": { activation: ["magic-action"], area: { shape: "cube", size: 15, allies: true } },
  // Page 55: "You and your allies in the aura gain a bonus"; Aura Expansion widens that same aura.
  // Page 55: "The aura is inactive while you have the Incapacitated condition"; its Charisma bonus to saves is not typed.
  // Page 55, Aura Expansion: "Your Aura of Protection is now a 30-foot Emanation", a step on the one aura, so the
  // Incapacitated rule still holds at level 18. Aura Expansion types no area of its own.
  "paladin-aura-of-protection": {
    area: { shape: "emanation", size: 10, allies: true, unless: "while you have the Incapacitated condition" },
    areaSizeByLevel: [{ level: 18, size: 30 }],
    untyped: ["bonus"],
  },
  "paladin-aura-expansion": { area: null },
  // Page 55: "you can target a number of creatures equal to your Charisma modifier (minimum of one creature)"; you choose who saves.
  "paladin-abjure-foes": { maxTargets: { ability: "cha", minimum: 1 }, save: { ability: "wis", selective: true, onSuccess: "none" }, untyped: ["conditions"] },
  // Page 66: "choose a number of those creatures up to your Charisma modifier (minimum of one creature)".
  "sorcerer-metamagic/careful-spell": { maxTargets: { ability: "cha", minimum: 1 } },
  // Page 55: Divine Sense is a Channel Divinity effect, so it spends one use.
  "paladin-channel-divinity/divine-sense": { spend: channelDivinity },
  // Page 37: Sear Undead harms only the Undead "that fails its saving throw against that use of Turn Undead".
  // Its roll is "a number of d8s equal to your Wisdom modifier (minimum of 1d8)".
  "cleric-sear-undead": {
    variableDice: { die: 8, count: { ability: "wis", minimum: 1 } },
    damage: { types: ["radiant"], appliesWhen: "that fails its saving throw against that use of Turn Undead" },
  },
  // Page 51: the redirect is a part with its own cost, condition and save, dealing "two rolls of your Martial Arts die
  // plus your Dexterity modifier". The damage-type limit holds until level 13, when Deflect Energy (page 51) lifts it.
  "monk-deflect-attacks": {
    usableWhen: "its damage includes Bludgeoning, Piercing, or Slashing damage",
    usableWhenUntilLevel: 13,
    save: null,
    parts: [
      {
        label: "redirect some of the attack’s force",
        usableWhen: "If you reduce the damage to 0",
        spend: { resource: "focus-points", amount: 1 },
        save: { ability: "dex", onSuccess: "none" },
        diceFromColumn: "martialArts",
        diceRolls: 2,
        rollAdds: ["dex"],
      },
    ],
  },
  // Page 28: "You can enter it as a Bonus Action if you aren’t wearing Heavy armor".
  "barbarian-rage": { usableWhen: "if you aren’t wearing Heavy armor" },
  // Healing, read from each feature's sentence. Page 48: "regain Hit Points equal to 1d10 plus your Fighter level".
  "fighter-second-wind": { healing: { dice: "1d10", rollAdds: ["class-level"] } },
  // Page 49: "you regain Hit Points equal to 5 plus your Constitution modifier if you are Bloodied and have at least 1 Hit Point".
  "champion-survivor": {
    healing: { amount: 5, rollAdds: ["con"], label: "Heroic Rally", timing: "At the start of each of your turns", appliesWhen: "if you are Bloodied and have at least 1 Hit Point" },
  },
  // Page 39: "restore a number of Hit Points equal to five times your Cleric level", divided, "no more than half".
  "life-domain-preserve-life": {
    healing: { perClassLevel: 5, divided: true, cap: "half-hit-point-maximum", appliesWhen: "Choose Bloodied creatures within 30 feet of yourself" },
  },
  // Page 39: "2 plus the spell slot’s level", for the target and for yourself.
  "life-domain-disciple-of-life": { healing: { amount: 2, plusSlotLevel: true } },
  "life-domain-blessed-healer": { healing: { amount: 2, plusSlotLevel: true } },
  // Page 39 and page 54: a rule on other healing, and the Lay On Hands pool, which `pool` holds.
  "life-domain-supreme-healing": { healing: null },
  "paladin-lay-on-hands": { healing: null },
  "paladin-restoring-touch": { healing: null },
  // Page 76: "Temporary Hit Points equal to your Charisma modifier plus your Warlock level (minimum of 1 Temporary Hit Point)".
  "fiend-patron-dark-ones-blessing": { healing: { temporary: true, rollAdds: ["cha", "class-level"], minimum: 1 } },
  // Page 51: "Temporary Hit Points equal to two rolls of your Martial Arts die", under Patient Defense.
  "monk-heightened-focus": { healing: { temporary: true, diceFromColumn: "martialArts", diceRolls: 2, label: "Patient Defense" } },
  // Page 50: the Bonus Action strike and the die hold only "while you are unarmed or wielding only Monk weapons and you aren’t wearing armor or wielding a Shield".
  "monk-martial-arts": { activation: null, diceFromColumn: null, dice: null, untyped: ["activation", "dice"] },
  // Page 52: the action and "(no action required)" only end the vibrations.
  // Page 49: weapons and Unarmed Strikes only.
  "champion-improved-critical": { criticalHit: { minRoll: 19 }, attacksWith: ["weapon", "unarmed-strike"] },
  "champion-superior-critical": { criticalHit: { minRoll: 18 }, attacksWith: ["weapon", "unarmed-strike"] },
  // Pages 73 and 74: the extra attacks are with the pact weapon only.
  "warlock-eldritch-invocations/thirsting-blade": { attacks: 2, attacksWith: ["pact-weapon"] },
  "warlock-eldritch-invocations/devouring-blade": { attacks: 3, attacksWith: ["pact-weapon"] },
  // The weapon or attack each feature works with (a limit, not its trigger), read from its own words.
  // Page 72: "you can expend a Pact Magic spell slot"; the Prone condition is not typed.
  "warlock-eldritch-invocations/eldritch-smite": { attacksWith: ["pact-weapon"], spend: { resource: "pact-magic-slot", amount: 1 }, untyped: ["conditions"] },
  // Page 73: the Hit Point Dice healing is not typed.
  "warlock-eldritch-invocations/lifedrinker": { attacksWith: ["pact-weapon"], untyped: ["healing"] },
  "warlock-eldritch-invocations/pact-of-the-blade": { attacksWith: ["pact-weapon"], damage: { types: ["necrotic", "psychic", "radiant"], orNormalType: true } }, // p. 74
  // Page 56: "its normal damage type or Radiant damage"; the Charisma bonus to attack rolls is not typed.
  "oath-of-devotion-sacred-weapon": { activation: null, attacksWith: ["imbued-weapon"], damage: { types: ["radiant"], orNormalType: true }, untyped: ["bonus"] },
  "monk-empowered-strikes": { attacksWith: ["unarmed-strike"], damage: { types: ["force"], orNormalType: true } }, // p. 51
  "monk-stunning-strike": { attacksWith: ["monk-weapon", "unarmed-strike"], untyped: ["conditions"] }, // "with a Monk weapon or an Unarmed Strike", p. 51
  "paladin-radiant-strikes": { attacksWith: ["melee-weapon", "unarmed-strike"] }, // "using a Melee weapon or an Unarmed Strike", p. 55
  // Pages 38 and 43: "The extra damage of your Divine Strike increases to 2d8" (level 14) and Primal Strike's (level
  // 15) are typed as a step on the base option, as Brutal Strike's 2d10 is, so the two amounts never stack.
  "cleric-blessed-strikes/divine-strike": { attacksWith: ["weapon"], dice: "1d8", diceByLevel: [{ level: 14, dice: "2d8" }] }, // "using a weapon", p. 38
  "cleric-improved-blessed-strikes/divine-strike": { dice: null },
  "druid-elemental-fury/primal-strike": { attacksWith: ["weapon", "beast-form-attack"], dice: "1d8", diceByLevel: [{ level: 15, dice: "2d8" }] }, // p. 43
  "druid-improved-elemental-fury/primal-strike": { dice: null },
  // Page 62: the Advantage-or-ally rule on the die is not typed.
  "rogue-sneak-attack": { attacksWith: ["finesse-weapon", "ranged-weapon"], untyped: ["dice"] }, // "uses a Finesse or a Ranged weapon"
  // Page 29: "one Strength-based attack roll of your choice on your turn": tied to your own turn.
  "barbarian-brutal-strike": { attacksWith: ["strength-based"], oncePerTurn: "own-turn" },
  // Page 66: "one Metamagic option on each of your turns".
  "sorcerer-arcane-apotheosis": { oncePerTurn: "own-turn" },
  // Page 70: the five types are a choice for a resistance and a damage bonus, not damage the feature deals.
  "draconic-sorcery-elemental-affinity": { damage: null, untyped: ["resistances", "damage"] },
  // Page 51: "while you aren’t wearing armor or wielding a Shield"; the bonus grows with the Monk table.
  "monk-unarmored-movement": {
    speedBonus: { feet: 10, appliesWhen: "while you aren’t wearing armor or wielding a Shield" },
    speedBonusByLevel: [
      { level: 6, feet: 15 },
      { level: 10, feet: 20 },
      { level: 14, feet: 25 },
      { level: 18, feet: 30 },
    ],
  },
  // Page 52: the save and the 10d12 come "When you end them", not on the hit.
  "warrior-of-the-open-hand-quivering-palm": {
    activation: null,
    attacksWith: ["unarmed-strike"],
    save: { ability: "con", onSuccess: "half", timing: "When you end them" },
    damage: { dice: "10d12", types: ["force"], timing: "When you end them" },
  },
  // Pages 51 and 52: the roll is the Martial Arts die.
  "monk-uncanny-metabolism": { diceFromColumn: "martialArts", rollAdds: ["class-level"], healing: { diceFromColumn: "martialArts", rollAdds: ["class-level"] } },
  "warrior-of-the-open-hand-wholeness-of-body": { diceFromColumn: "martialArts", rollAdds: ["wis"], healing: { diceFromColumn: "martialArts", rollAdds: ["wis"], minimum: 1 } },
  // Pages 59 and 43: the typed values describe one printed part.
  "ranger-tireless": { label: "Temporary Hit Points", healing: { temporary: true, dice: "1d8", rollAdds: ["wis"], minimum: 1, label: "Temporary Hit Points" } },
  "druid-archdruid": { label: "Nature Magician", activation: ["no-action"], uses: { count: 1, recharge: "long-rest" } },
  // Pages 72 to 74: the slotless castings, with "on yourself" and One with Shadows' condition.
  "warlock-eldritch-invocations/armor-of-shadows": { freeCast: [{ spell: "mage-armor", selfOnly: true }] },
  "warlock-eldritch-invocations/ascendant-step": { freeCast: [{ spell: "levitate", selfOnly: true }] },
  "warlock-eldritch-invocations/fiendish-vigor": { freeCast: [{ spell: "false-life", selfOnly: true }] },
  "warlock-eldritch-invocations/otherworldly-leap": { freeCast: [{ spell: "jump", selfOnly: true }] },
  "warlock-eldritch-invocations/one-with-shadows": { freeCast: [{ spell: "invisibility", selfOnly: true, usableWhen: "While you’re in an area of Dim Light or Darkness" }] },
  "warlock-eldritch-invocations/mask-of-many-faces": { freeCast: [{ spell: "disguise-self" }] },
  "warlock-eldritch-invocations/master-of-myriad-forms": { freeCast: [{ spell: "alter-self" }] },
  "warlock-eldritch-invocations/misty-visions": { freeCast: [{ spell: "silent-image" }] },
  "warlock-eldritch-invocations/visions-of-distant-realms": { freeCast: [{ spell: "arcane-eye" }] },
  "warlock-eldritch-invocations/whispers-of-the-grave": { freeCast: [{ spell: "speak-with-dead" }] },
  "warlock-eldritch-invocations/gift-of-the-depths": { freeCast: [{ spell: "water-breathing" }], untyped: ["speed"] },
  "warlock-eldritch-invocations/pact-of-the-chain": { freeCast: [{ spell: "find-familiar" }] },
  // Page 73: the familiar deals the Necrotic or Radiant damage, not you.
  "warlock-eldritch-invocations/investment-of-the-chain-master": { damage: null },
  // Page 73: the Magic action only erases a name.
  "warlock-eldritch-invocations/gift-of-the-protectors": { activation: null },
  // Page 63: "If the target is Large or smaller, it must succeed on a Dexterity saving throw".
  "rogue-cunning-strike/trip": { save: { ability: "dex", targetMaxSize: "Large", onSuccess: "none" }, untyped: ["conditions"] },
  // Page 63: "you must have a Poisoner’s Kit on your person"; Poisoned and its repeated save are not typed.
  "rogue-cunning-strike/poison": { requiresItem: "poisoners-kit", usableWhen: "you must have a Poisoner’s Kit on your person", untyped: ["conditions", "save"] },
  "rogue-devious-strikes/knock-out": { untyped: ["conditions", "save"] },
  "rogue-devious-strikes/obscure": { untyped: ["conditions"] },
  "warrior-of-the-open-hand-open-hand-technique/topple": { untyped: ["conditions"] },
  // Page 62: "You can use this feature only if you haven’t moved during this turn".
  "rogue-steady-aim": { usableWhen: "if you haven’t moved during this turn" },
  // The Incapacitated condition switches these off (pages 29, 51, 63).
  "barbarian-danger-sense": { unless: "you have the Incapacitated condition" },
  "monk-evasion": { unless: "if you have the Incapacitated condition" },
  "rogue-evasion": { unless: "if you have the Incapacitated condition" },
  "rogue-elusive": { unless: "you have the Incapacitated condition" },
  // Page 61: the 1d8 needs the target to be missing Hit Points as well as the hit.
  "hunter-hunters-prey/colossus-slayer": { dice: null, untyped: ["damage"] },
  // Page 64: the 1d6 is a chance roll inside the Charges benefit, not the feature's main roll.
  "thief-use-magic-device": { dice: null, untyped: ["dice"] },
  // Pages 57, 67 and 76: a use is restored by spending a resource.
  // Page 57: the Radiant damage is the "Radiant Damage" part's, at the start of an enemy's turn; its amount is not typed.
  "oath-of-devotion-holy-nimbus": {
    activation: ["bonus-action"],
    uses: { count: 1, recharge: "long-rest", restoredBy: { resource: "spell-slot", amount: 1, slotLevel: 5 } },
    parts: [{ label: "Radiant Damage", damage: { types: ["radiant"], timing: "Whenever an enemy starts its turn in the aura" } }],
    damage: null,
    untyped: ["damage"],
  },
  "draconic-sorcery-dragon-wings": { activation: ["bonus-action"], uses: { count: 1, recharge: "long-rest", restoredBy: { resource: "sorcery-points", amount: 3 } }, untyped: ["speed"] },
  "fiend-patron-hurl-through-hell": { activation: null, uses: { count: 1, recharge: "long-rest", restoredBy: { resource: "pact-magic-slot", amount: 1 } }, untyped: ["conditions"] },
  // Page 32: using it takes no action; the spell-slot restore it grants is typed on Bardic Inspiration from level 5.
  "bard-font-of-inspiration": { activation: ["no-action"] },
  "bard-bardic-inspiration": {
    uses: {
      count: { ability: "cha", minimum: 1 },
      recharge: "long-rest",
      rechargeByLevel: [{ level: 5, recharge: "short-or-long-rest" }],
      restoredBy: { resource: "spell-slot", amount: 1, fromLevel: 5 },
    },
  },
  // Page 43: Wild Resurgence's two parts have their own costs and limits. The first restores a Wild Shape use, typed
  // on Wild Shape from level 5, once on each of your turns, only with none left.
  "druid-wild-resurgence": {
    activation: ["no-action"],
    oncePerTurn: null,
    parts: [
      {
        label: "give yourself one use by expending a spell slot",
        spend: { resource: "spell-slot", amount: 1 },
        oncePerTurn: "own-turn",
        usableWhen: "if you have no uses of Wild Shape left",
      },
      { label: "to give yourself a level 1 spell slot", spend: { resource: "wild-shape", amount: 1 }, uses: { count: 1, recharge: "long-rest" } },
    ],
  },
  "druid-wild-shape": {
    uses: {
      count: { column: "wildShape" },
      recharge: "long-rest",
      shortRestRegain: 1,
      restoredBy: { resource: "spell-slot", amount: 1, fromLevel: 5, whenNoneLeft: true, oncePerTurn: "own-turn" },
    },
    // Page 42: "a number of Temporary Hit Points equal to your Druid level".
    healing: { temporary: true, perClassLevel: 1, label: "Temporary Hit Points", timing: "When you assume a Wild Shape form" },
  },
  // Spell slots spent in the standard wording that are not the feature's cost: an alternative or a higher-level casting.
  "druid-wild-companion": { spend: null },
  "wizard-signature-spells": { spend: null },
  "wizard-spell-mastery": { spend: null },
  // Use limits the shape cannot hold: 2d4 Long Rests after a Wish, and once-per-Long-Rest limits on one part.
  "cleric-divine-intervention": { untyped: ["uses"] },
  "cleric-greater-divine-intervention": { untyped: ["uses"] },
  "circle-of-the-land-natural-recovery": { untyped: ["uses"] },
  "barbarian-persistent-rage": { untyped: ["uses"] },
  // Page 30: "roll a number of d6s equal to your Rage Damage bonus"; the damage takes the weapon's type, not typed.
  "path-of-the-berserker-frenzy": { variableDice: { die: 6, count: { column: "rageDamage" } }, untyped: ["damage"] },
  // Typed nowhere: chosen or later resistances, extra movement modes, a condition given to yourself.
  "monk-superior-defense": { untyped: ["resistances"] },
  "fiend-patron-fiendish-resilience": { untyped: ["resistances"] },
  "hunter-superior-hunters-defense": { untyped: ["resistances"] },
  "ranger-roving": { untyped: ["speed"] },
  "thief-second-story-work": { untyped: ["speed"] },
  "ranger-natures-veil": { untyped: ["conditions"] },
}

/**
 * Mechanics against the text, both ways. Every typed value must be stated in `own`, the entry's own text. And where
 * `own` states uses, a recharge, a save, dice, damage types, resistances, immunities, an action or a condition in
 * the standard wording, the entry must hold it, and a printed list must be held whole.
 */
function mechanicsFailures(entry: Record<string, any>, own: string, related: string, classSkills: string[], name = "", hand: HandReading = {}): string[] {
  const failures: string[] = []
  const need = (ok: boolean, field: string) => {
    if (!ok) failures.push(field)
  }
  const has = (pattern: RegExp | string, text = own) => (typeof pattern === "string" ? text.includes(pattern) : pattern.test(text))
  // A field read by hand settles that field: the automatic reading below is skipped for it.
  const byHand = (field: string) => field in hand
  for (const [field, value] of Object.entries(hand)) need(same(entry[field], value ?? undefined), `${field} ${JSON.stringify(entry[field])}, read by hand ${JSON.stringify(value)}`)
  // Which attacks a feature works with, and the label of the part its values belong to, are read only by hand. A
  // feature with a typed triggered value whose text names a weapon or an attack must have its limit read by hand.
  if (!byHand("attacksWith")) {
    need(entry.attacksWith === undefined, "attacksWith not read by hand")
    const triggered = ["dice", "diceFromColumn", "damage", "save", "attacks", "criticalHit"].some((field) => entry[field] !== undefined)
    if (triggered)
      need(
        !/with (?:your|a|an) (?:pact weapon|Monk weapon|Unarmed Strike)|using a (?:Melee )?weapon|Finesse or a Ranged weapon|Strength-based attack|with that weapon|bonded weapon|weapons and Unarmed Strikes/.test(
          own
        ),
        "a weapon or attack limit not read by hand"
      )
  }
  if (!byHand("label")) need(entry.label === undefined, "label not read by hand")
  if (!byHand("speedBonusByLevel")) need(entry.speedBonusByLevel === undefined, "speedBonusByLevel not read by hand")
  // Parts, the untyped list and conditions on the feature itself are read only by hand.
  for (const field of ["parts", "untyped", "appliesWhen", "unless", "usableWhen", "usableWhenUntilLevel", "healing", "maxTargets", "variableDice", "areaSizeByLevel"])
    if (!byHand(field)) need(entry[field] === undefined, `${field} not read by hand`)
  need(entry.usableWhenUntilLevel === undefined || entry.usableWhen !== undefined, "usableWhenUntilLevel without usableWhen")
  // Statements that must be read by hand or listed untyped: healing, a target cap, a variable number of dice.
  const untypedList: string[] = entry.untyped ?? []
  if (has(/(?:regains?|gain|restore) (?:a number of |additional )?(?:Temporary )?Hit Points/)) need(byHand("healing") || untypedList.includes("healing"), "a healing statement not read by hand")
  if (has(/a number of (?:creatures|those creatures) (?:equal to|up to) your \w+ modifier/)) need(byHand("maxTargets"), "a target cap not read by hand")
  if (has(/roll a number of d\d+s equal to/)) need(byHand("variableDice"), "a variable number of dice not read by hand")
  // Which weapons the mastery properties are for: "Simple or Martial Melee weapons" or weapons "with which you have proficiency".
  const masteryWeapons = has(/mastery properties of \w+ kinds of Simple or Martial Melee weapons/)
    ? "melee"
    : has(/mastery properties of \w+ kinds of weapons of your choice with which you have proficiency/)
      ? "proficient"
      : undefined
  need(entry.masteryWeapons === masteryWeapons, `masteryWeapons ${entry.masteryWeapons}, the text states ${masteryWeapons}`)
  // Proficiency and training an option grants: "you gain proficiency with Martial weapons and training with Heavy armor".
  const weaponCategory = own.match(/gain proficiency with (Simple|Martial) weapons/)?.[1]
  need(same(entry.weaponProficiencies, weaponCategory ? [{ category: weaponCategory.toLowerCase() }] : undefined), `weaponProficiencies, the text states ${weaponCategory}`)
  const armorCategory = own.match(/training with (Light|Medium|Heavy) armor/)?.[1]
  need(same(entry.armorTraining, armorCategory ? [armorCategory.toLowerCase()] : undefined), `armorTraining, the text states ${armorCategory}`)
  const cantrips = own.match(/You know (one|two) extra cantrips? from the (\w+) spell list/)
  need(same(entry.extraCantrips, cantrips ? { count: cantrips[1] === "one" ? 1 : 2, spellList: cantrips[2].toLowerCase() } : undefined), `extraCantrips, the text states ${cantrips?.[0]}`)
  // "a bonus to your Intelligence (Arcana or Religion) checks. The bonus equals your Wisdom modifier (minimum of +1)".
  const checkBonus = own.match(/a bonus to your \w+ \((\w+) or (\w+)\) checks\. The bonus equals your (\w+) modifier \(minimum (?:bonus )?of \+1\)/)
  need(
    same(
      entry.rollBonus,
      checkBonus ? { to: [`${checkBonus[1].toLowerCase()}-checks`, `${checkBonus[2].toLowerCase()}-checks`], plusModifierOf: abilityByName[checkBonus[3]], minimum: 1 } : undefined
    ),
    `rollBonus, the text states ${checkBonus?.[0]}`
  )
  // A required item: "you must have a Poisoner’s Kit on your person".
  const required = own.match(/you must have an? ([A-Z][\w’ ]+?) on your person/)?.[1]
  if (!byHand("requiresItem")) need(entry.requiresItem === (required ? toId(required) : undefined), `requiresItem ${entry.requiresItem}, the text requires ${required}`)
  if (entry.requiresItem && required) need(entry.requiresItem === toId(required), "requiresItem")
  // Every quoted condition is one unbroken span of the entry's own text.
  const parts: Record<string, any>[] = entry.parts ?? []
  const spans = [
    entry,
    entry.save,
    entry.damage,
    entry.area,
    entry.speedBonus,
    entry.resistances,
    entry.conditionImmunities,
    entry.healing,
    ...(entry.freeCast ?? []),
    ...parts,
    ...parts.map((part) => part.save),
    ...parts.map((part) => part.damage),
  ].flatMap((item) => [item?.appliesWhen, item?.unless, item?.timing, item?.usableWhen, item?.label])
  if (!byHand("area")) need(!entry.area?.unless && !entry.area?.appliesWhen, "an area condition not read by hand")
  for (const field of ["damage", "speedBonus", "resistances", "conditionImmunities"])
    if (!byHand(field)) need(!entry[field]?.appliesWhen && !entry[field]?.unless, `a ${field} condition not read by hand`)
  for (const quote of spans.filter(Boolean)) need(has(quote), `appliesWhen “${quote}” is not an unbroken span of its text`)

  // Activation: every action kind the text names for using it.
  const kinds: [string, RegExp][] = [
    ["bonus-action", /\b(?:[Aa]s|use) a Bonus Action/],
    ["reaction", /take a Reaction/],
    ["magic-action", /[Aa]s a Magic action/],
  ]
  const named = kinds.filter(([, pattern]) => has(pattern)).map(([kind]) => kind)
  // "(no action required)" counts only where it is a way to use the feature, not to end, dismiss or restore it.
  const takesNoAction = own
    .replace(/([.!?]) /g, "$1\n")
    .split("\n")
    .some((sentence) => sentence.includes("no action required") && !/\b(?:end|ends|dismiss|restore)\b/.test(sentence))
  if (takesNoAction) named.push("no-action")
  // An action that only moves an effect already in place is not a way to use the feature.
  if (has(/As a Bonus Action, you can move the/) && !has(/\b(?:[Aa]s|use) a Bonus Action(?!, you can move the)/) && named.includes("bonus-action")) named.splice(named.indexOf("bonus-action"), 1)
  if (!byHand("activation")) need(same(sorted(entry.activation ?? []), sorted(named)), `activation ${JSON.stringify(entry.activation)}, the text names ${JSON.stringify(named)}`)

  // A later feature that changes this one's recharge, as Font of Inspiration does for Bardic Inspiration.
  const changed = name ? related.match(new RegExp(`Level (\\d+): [^:]*? You now regain all your expended uses of ${name} when you finish a Short or Long Rest`)) : null
  const recharges = changed ? [{ level: Number(changed[1]), recharge: "short-or-long-rest" }] : undefined
  need(same(entry.uses?.rechargeByLevel, recharges), `rechargeByLevel ${JSON.stringify(entry.uses?.rechargeByLevel)}, the text states ${JSON.stringify(recharges)}`)

  // Uses: the count, what restores it, and the Short Rest regain.
  const uses = entry.uses
  const statesUses =
    /You can (?:use (?:this feature|this class’s Channel Divinity|Wild Shape|this action)|enter your Rage|confer a Bardic Inspiration die|cast it) (?:twice|the number of times|a number of times)|(?:Once you use this (?:feature|benefit), you can’t (?:use it|do so)|can’t use this feature) again until you finish|you regain all expended uses of this ability|Focus Points column|Sorcery Points column|cast the spell once without expending|cast (?:it|the spell|Water Breathing) once without|cast each of them once|must finish a Long Rest before you can cast it|can’t do so in this way again until|arcanum spell once without/
  need(Boolean(uses) === has(statesUses), uses ? "uses, which the text does not state in the standard wording" : "no uses, though the text states them")
  if (uses) {
    const count = uses.count
    if (typeof count === "number") need(count === 1 ? /\bonce\b|again until you finish|before you can cast it/.test(own) : has(count === 2 ? /\btwice\b/ : numberWord[count]), `uses ${count}`)
    // A count read from a column: the text names the column, or the column is the feature's own (Paladin's Channel Divinity).
    else if (count.column) need(has(`${headings[count.column]} column`) || headings[count.column] === name, `uses column ${count.column}`)
    else if (count.ability) need(has(`${abilityName[count.ability]} modifier (minimum of once)`), `uses ${count.ability}`)
    else
      for (const [index, step] of count.byLevel.entries()) {
        const word = step.count === 1 ? /\bonce\b|again until/ : step.count === 2 ? /\btwice\b/ : new RegExp(`${numberWord[step.count]} times`)
        need(has(word) && (index === 0 || has(`level ${step.level}`)), `uses ${step.count} at level ${step.level}`)
      }
    // "per spell": the text gives each named spell its own use.
    need(Boolean(uses.per) === has(/(?:arcanum spell|each of them) once/), `per ${uses.per}`)
    const shortOrLong = has(/Short or Long Rest/)
    const longAlone = own.replace(/Short or Long Rest/g, "").includes("Long Rest")
    if (uses.recharge === "short-or-long-rest") need(shortOrLong, "recharge short-or-long-rest")
    else if (uses.recharge === "long-rest") need(longAlone && (!shortOrLong || Boolean(uses.shortRestRegain)), "recharge long-rest")
    else need(false, `recharge ${uses.recharge}`)
    need(Boolean(uses.shortRestRegain) === has(/regain one (?:of its )?expended uses? when you finish a Short Rest/), "shortRestRegain")
  }
  // A second way to restore a use, by spending a resource.
  const restore = own.match(
    /unless you (?:expend a use of your (Rage)|spend (\d+) (Sorcery) Points|expend a (Pact Magic) spell slot) \(no action required\) to restore your use of it|restore your use of it by expending a level (\d) spell slot/
  )
  const restoredBy = !restore
    ? undefined
    : restore[1]
      ? { resource: "rage", amount: 1 }
      : restore[2]
        ? { resource: "sorcery-points", amount: Number(restore[2]) }
        : restore[4]
          ? { resource: "pact-magic-slot", amount: 1 }
          : { resource: "spell-slot", amount: 1, slotLevel: Number(restore[5]) }
  if (!byHand("uses")) need(same(uses?.restoredBy, restoredBy), `uses.restoredBy ${JSON.stringify(uses?.restoredBy)}, the text states ${JSON.stringify(restoredBy)}`)

  const resources: Record<string, (amount: number) => RegExp> = {
    "focus-points": (amount) => new RegExp(`${amount} Focus Points?`),
    "sorcery-points": (amount) => new RegExp(`${amount} Sorcery Points?`),
    "sneak-attack-dice": (amount) => new RegExp(`Cost: ${amount}d6`),
    "spell-slot": () => /expend an? spell slot/,
    "pact-magic-slot": () => /expend a Pact Magic spell slot/,
    "channel-divinity": (amount) => new RegExp(`${amount === 1 ? "(?:a|one)" : "-"} use of (?:your |this class’s )?Channel Divinity`),
    "wild-shape": (amount) => new RegExp(`${amount === 1 ? "(?:a|one)" : "-"} use of your Wild Shape`),
    "bardic-inspiration": (amount) => new RegExp(`${amount === 1 ? "(?:a|one)" : "-"} use of (?:your )?Bardic Inspiration`),
    "second-wind": (amount) => new RegExp(`${amount === 1 ? "(?:a|one)" : "-"} use of your Second Wind`),
    rage: (amount) => new RegExp(`${amount === 1 ? "(?:a|one)" : "-"} use of your Rage`),
  }
  // The main cost, both ways: a sentence that opens with the use, not a condition, an alternative or a restoration.
  // A printed "Cost:" label settles it; otherwise the first such sentence does.
  // A printed "Cost:" is read in the options check against the hand table of costs.
  const labeled = /Cost: /.test(own)
  const costs = labeled
    ? [entry.spend ? `${entry.spend.resource}:${entry.spend.amount}` : "?"]
    : own
        .replace(/([.!?]) /g, "$1\n")
        .split("\n")
        .filter((sentence) => !/^(?:If|Alternatively|Additionally|In addition|Whenever|Once)\b/.test(sentence) && !/to restore your use|to redirect|to reroll|Points? to use /.test(sentence))
        .flatMap((sentence) => {
          const points = sentence.match(/expend (\d+) (Focus|Sorcery) Points?/)
          const use = sentence.match(/expend (?:a|one) use of (?:your |this class’s )?(Channel Divinity|Wild Shape|Bardic Inspiration|Second Wind|Rage)\b/)
          const slot = sentence.match(/expend an? (Pact Magic )?spell slot/)
          if (points) return [`${toId(points[2])}-points:${points[1]}`]
          if (slot) return [`${slot[1] ? "pact-magic-slot" : "spell-slot"}:1`]
          if (use) return [`${toId(use[1])}:1`]
          return []
        })
  const spent = entry.spend ? `${entry.spend.resource}:${entry.spend.amount}` : undefined
  if (!byHand("spend")) need(same(spent, costs[0]), `spend ${spent}, the text spends ${costs[0]}`)
  if (entry.spend && !byHand("spend")) {
    need(has(resources[entry.spend.resource](entry.spend.amount)), `spend ${entry.spend.amount} ${entry.spend.resource}`)
    need(Boolean(entry.spend.keptOnFailure) === has(/isn’t expended/), "spend keptOnFailure")
  }

  // Dice, both ways: every roll the text states in the standard wording is held.
  const held = [
    entry.diceFromColumn ? "1d6" : undefined,
    entry.dice,
    entry.damage?.dice,
    entry.dicePerSlotLevel,
    entry.selfDamage?.dicePerSlotLevel,
    ...(entry.diceByLevel ?? []).map((step: { dice: string }) => step.dice),
  ].filter(Boolean)
  const stated = [...own.matchAll(/(?:extra|[Rr]oll|take|takes|taking|equal to|equals|add|increases to) (\d+d\d+)\b/g)].map((match) => match[1])
  if (!byHand("dice")) for (const dice of stated) need(held.includes(dice), `the text rolls ${dice}, the data does not hold it`)
  if (entry.dice) need(has(entry.dice), `dice ${entry.dice}`)
  if (entry.damage?.dice) need(has(entry.damage.dice), `damage dice ${entry.damage.dice}`)
  // A roll printed as damage of a type ("an extra 1d8 Radiant damage") is the damage's dice, not a bare roll.
  if (!byHand("damage"))
    for (const match of own.matchAll(new RegExp(`(\\d+d\\d+) (${typeList}) damage`, "g")))
      need(
        match[1] === entry.damage?.dice ||
          match[1] === entry.selfDamage?.dicePerSlotLevel ||
          (entry.diceByLevel && match[1] === entry.dice) ||
          (entry.diceByLevel ?? []).some((step: { dice: string }) => step.dice === match[1]),
        `${match[1]} ${match[2]} damage is not the damage's dice`
      )
  const perSlot = own.match(/another (\d+d\d+) per level of the spell slot/)?.[1]
  need(entry.dicePerSlotLevel === perSlot, `dicePerSlotLevel ${entry.dicePerSlotLevel}, the text adds ${perSlot} per slot level`)
  const column = has(/roll 1d6 in place of the normal damage|roll your Martial Arts die/) ? "martialArts" : has(/deal an extra 1d6 damage/) ? "sneakAttack" : undefined
  if (!byHand("diceFromColumn")) need(entry.diceFromColumn === column, `diceFromColumn ${entry.diceFromColumn}, the text rolls ${column}`)
  if (entry.diceFromColumn) need(has(`${headings[entry.diceFromColumn]} column`) || has(`your ${headings[entry.diceFromColumn]} die`), `diceFromColumn ${entry.diceFromColumn}`)
  // Dice by level, both ways: "Cleric levels 7 (2d8), 13 (3d8)" in its own text, or a later feature that raises it.
  const steps = [...own.matchAll(/(\d+) \((\d+d\d+)\)/g)].map((match) => ({ level: Number(match[1]), dice: match[2] }))
  const raised = name ? related.match(new RegExp(`Level (\\d+): [^:]*? The extra damage of your ${name} increases to (\\d+d\\d+)`)) : null
  if (!steps.length && raised) steps.push({ level: Number(raised[1]), dice: raised[2] })
  if (!byHand("diceByLevel")) need(same(entry.diceByLevel, steps.length ? steps : undefined), `diceByLevel ${JSON.stringify(entry.diceByLevel)}, the text states ${JSON.stringify(steps)}`)
  const adds: string[] = []
  const after = own.match(/\d+d\d+ (?:plus your|and add your) ([^.]+?)(?:\.|,| \(| to )/)?.[1] ?? ""
  for (const [ability, id] of Object.entries(abilityByName)) if (after.includes(`${ability} modifier`)) adds.push(id)
  if (/level/.test(after)) adds.push("class-level")
  if (!byHand("rollAdds")) need(same(sorted(entry.rollAdds ?? []), sorted(adds)), `rollAdds ${JSON.stringify(entry.rollAdds)}, the text adds ${JSON.stringify(adds)}`)

  // Damage types, both ways: each printed list of types dealt is held whole.
  const dealt = [
    ...[...own.matchAll(new RegExp(`(?:\\d+d\\d+|take|takes|taking|deal|choice of|it deal) (${typeList}) damage`, "g"))].flatMap((match) => listOf(match[1])),
    // A list to choose a type from: "Choose one of those types: Acid, Cold, Fire, Lightning, or Poison."
    ...listOf(own.match(new RegExp(`Choose one of those types: (${typeList})`))?.[1] ?? ""),
  ]
  const typed = [...(entry.damage?.types ?? []), ...parts.flatMap((part) => part.damage?.types ?? []), ...(entry.selfDamage ? [entry.selfDamage.damageType] : [])]
  if (!byHand("damage")) {
    need(Boolean(entry.damage?.orNormalType) === has("its normal damage type"), `damage orNormalType ${entry.damage?.orNormalType}`)
    for (const type of new Set(dealt)) need(typed.includes(type), `the text deals ${type} damage, the data does not hold it`)
    for (const type of typed) need(has(capital(type)), `damage type ${type}`)
    need(!entry.damage?.appliesWhen && !entry.damage?.unless && !entry.damage?.timing, "a damage condition not read by hand")
  }
  const only = own.match(/Each (\w+) that fails its saving throw/)?.[1]
  const onlyTypes = only && (creatureTypes as readonly string[]).includes(toId(only)) ? [toId(only)] : undefined
  if (!byHand("damage"))
    need(same(entry.damage?.onlyCreatureTypes, onlyTypes), `damage onlyCreatureTypes ${JSON.stringify(entry.damage?.onlyCreatureTypes)}, the text states ${JSON.stringify(onlyTypes)}`)
  const spared = (own.match(/if it isn’t an? (\w+)/)?.[1] ?? "").toLowerCase()
  need(same(entry.damage?.notCreatureTypes ?? [], spared ? [spared] : []), `damage notCreatureTypes ${JSON.stringify(entry.damage?.notCreatureTypes)}, the text spares ${spared}`)
  need(!entry.damage?.targetMaxSize, "damage targetMaxSize: no class damage names a size")
  // Once per turn, both ways.
  // "Once on each of your turns" is your own turn, and so is "only once on a turn" for a feature used "On your turn"
  // (Action Surge, page 48). "Once per turn" and "only once per turn" are any turn.
  const onYourTurn = has(/^On your turn, you can|[.] On your turn, you can/)
  const oncePerTurn =
    has(/Once on each of your turns/) || (onYourTurn && has(/only once on a turn/)) ? "own-turn" : has(/Once per turn|only once per turn|only once on a turn/) ? "any-turn" : undefined
  if (!byHand("oncePerTurn")) need(entry.oncePerTurn === oncePerTurn, `oncePerTurn ${entry.oncePerTurn}, the text states ${oncePerTurn}`)
  if (entry.selfDamage) {
    const { dicePerSlotLevel, increaseAfterSecondUse } = entry.selfDamage
    need(
      has(`take ${dicePerSlotLevel}`) && has(`for each level of the spell slot`) && has(`increases by ${increaseAfterSecondUse}`) && has("The first time you do so, you suffer no adverse"),
      "selfDamage"
    )
  }

  // Saves, both ways: each ability whose saving throw the text forces or makes is held, with its DC.
  const dc = (value: unknown) =>
    value === "spell-save-dc"
      ? has(/spell save DC/)
      : typeof value === "number"
        ? has(`DC ${value}`)
        : has(`8 plus your ${abilityName[(value as { plusModifierOf: string }).plusModifierOf]} modifier and Proficiency Bonus`)
  const saves = [...own.matchAll(/(\w+) saving throw(?!s)/g)]
    .filter((match) => abilityByName[match[1]] && !/(?:allows you to make an?|check or) $/.test(own.slice(0, match.index)))
    .map((match) => abilityByName[match[1]])
  const savesHeld = [entry.save?.ability, entry.selfSave?.ability, ...parts.map((part) => part.save?.ability)].filter(Boolean)
  if (!byHand("save")) {
    need(same([...new Set(saves)].sort(), sorted(savesHeld)), `saves ${JSON.stringify(savesHeld)}, the text has ${JSON.stringify([...new Set(saves)])}`)
    // A condition, a creature-type limit or a chooser on a save is read only by hand.
    if (entry.save) {
      need(
        !entry.save.appliesWhen && !entry.save.unless && !entry.save.timing && !entry.save.onlyCreatureTypes && !entry.save.notCreatureTypes && !entry.save.selective,
        "a save condition not read by hand"
      )
      // What a success does: half damage, another stated outcome, or nothing.
      const outcome = has(/half as much damage on a successful/) ? "half" : has(/On a successful save,/) ? "other" : "none"
      need(entry.save.onSuccess === outcome, `save onSuccess ${entry.save.onSuccess}, the text gives ${outcome}`)
      const size = own.match(/If the target is (\w+) or smaller/)?.[1]
      need(entry.save.targetMaxSize === size, `save targetMaxSize ${entry.save.targetMaxSize}, the text gives ${size}`)
    }
  }
  if (entry.save?.dc !== undefined) need(dc(entry.save.dc), `save DC ${JSON.stringify(entry.save.dc)}`)
  const printedDc = own.match(/DC (\d+) \w+ saving throw|against your spell save DC|\(DC 8 plus your (\w+) modifier/)
  if (entry.save) need((entry.save.dc !== undefined) === Boolean(printedDc), "save DC presence")
  if (entry.selfSave) {
    need(dc(entry.selfSave.dc), `selfSave DC ${entry.selfSave.dc}`)
    need(
      Boolean(entry.selfSave.increasePerUse) === has(/the DC increases by/) && (!entry.selfSave.increasePerUse || has(`the DC increases by ${entry.selfSave.increasePerUse}`)),
      "selfSave increasePerUse"
    )
    need(entry.selfSave.resetOn === (has(/When you finish a Short or Long Rest, the DC resets/) ? "short-or-long-rest" : undefined), "selfSave resetOn")
  }
  // Fields read whole from the text, both ways: the data holds exactly what the standard wording states, and
  // nothing where the text states nothing.
  const word: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, twice: 2 }
  const names = (text: string) => text.split(" and ").map(toId)
  const expected: Record<string, unknown> = {}
  const dcText = own.match(/(?:the DC|The save DC) equals (?:the (spell save DC)|8 plus your (\w+) modifier and Proficiency Bonus)/)
  if (dcText) expected.saveDc = dcText[1] ? "spell-save-dc" : { plusModifierOf: abilityByName[dcText[2]] }
  const pool = own.match(/a total number of Hit Points equal to (\w+) times your \w+ level/)
  if (pool) expected.pool = { perLevel: word[pool[1]], recharge: has(/replenishes when you finish a Long Rest/) ? "long-rest" : "?" }
  const ranges = [...new Set([...own.matchAll(/within (\d+) feet of (?:you|yourself)\b/g)].map((match) => Number(match[1])))]
  if (ranges.length === 1 && !subPartDistance[name]) expected.range = ranges[0]
  if (subPartDistance[name]) need(ranges.includes(subPartDistance[name]), `the distance ${subPartDistance[name]} of a part of ${name}`)
  const hitPoints = own.match(/Hit Point maximum increases by (\d+), and it increases by (\d+) whenever you gain another/)
  if (hitPoints) expected.hitPointMaximum = { increase: Number(hitPoints[1]), perLevel: Number(hitPoints[2]), levelsCounted: "class" }
  const area = own.match(/(\d+)-foot (Emanation|Cube)|(\d+)-foot-radius Sphere/)
  const chooser = {
    ...(has(/creatures? of your choice in (?:a|the)\b/) ? { selective: true } : {}),
    ...(has(/You and your allies (?:in the aura|have)/) ? { allies: true } : {}),
  }
  if (area) expected.area = area[3] ? { shape: "sphere", size: Number(area[3]), ...chooser } : { shape: area[2].toLowerCase(), size: Number(area[1]), ...chooser }
  const attacks = own.match(/attack (twice|three times|four times)[^.]*instead of once|confers (two) extra attacks rather than one/)
  // Extra attacks for the pact weapon only are their own field, so `attacks` always means any weapon.
  if (attacks) expected.attacks = attacks[2] ? 3 : { twice: 2, "three times": 3, "four times": 4 }[attacks[1]]
  // A spell name: capitalized words, with the small words SRD spell names use ("Speak with Animals").
  const spell = "[A-Z][\\w’]*(?: (?:[A-Z][\\w’]*|with|of|the|from)\\b)*"
  const prepared = own.match(new RegExp(`always have the (${spell}(?: and ${spell})?) spells? prepared`))
  if (prepared) expected.alwaysPrepared = names(prepared[1])
  const free = [...own.matchAll(new RegExp(`cast (${spell}) (on yourself |once )?without (?:expending )?a spell slot`, "g"))].map((match) => ({
    spell: toId(match[1]),
    ...(match[2] === "on yourself " ? { selfOnly: true } : {}),
  }))
  if (/cast (?:it|the spell)\b[^.]*?without (?:expending )?a spell slot/.test(own)) {
    const named = own.match(new RegExp(`the (${spell}) spell\\b|cast (${spell})`))
    if (named) free.push({ spell: toId(named[1] ?? named[2]) })
  }
  if (free.length) expected.freeCast = free.filter((item, index) => free.findIndex((other) => other.spell === item.spell) === index)
  const featId = own.match(/gain the ([A-Z][\w ]*?) feat\b/)?.[1]
  const featCategory = own.match(/(Epic Boon|Fighting Style|Origin) feat\b/)?.[1]
  if (featId || featCategory) {
    const recommended = own.match(/([A-Z][\w’]*(?: (?:of|the|[A-Z][\w’]*))*) is recommended/)?.[1]
    expected.feat = {
      ...(featId ? { id: toId(featId) } : {}),
      ...(featCategory ? { category: toId(featCategory) } : {}),
      ...(recommended ? { recommended: toId(recommended) } : {}),
      ...(has("or another feat of your choice for which you qualify") ? { orAnother: true } : {}),
    }
  }
  const proficientSaves = own.match(/proficiency in (\w+) and (\w+) saving throws/)
  if (has("proficiency in all saving throws")) expected.savingThrowProficiencies = ["str", "dex", "con", "int", "wis", "cha"]
  else if (proficientSaves) expected.savingThrowProficiencies = [abilityByName[proficientSaves[1]], abilityByName[proficientSaves[2]]]
  const skillCount = own.match(/proficiency (?:in another skill of your choice from the skill list|with (\w+) skills of your choice)/)
  if (skillCount) expected.skillProficiencies = skillCount[1] ? { count: word[skillCount[1]] } : { count: 1, from: sorted(classSkills) }
  const expertise = own.match(/in (two|one) of your skill proficiencies of your choice|Choose (two|one) of your skill proficiencies with which you lack Expertise|Expertise in the chosen skill/)
  const expertiseFrom = own.match(/Choose one of the following skills in which you have proficiency: ([^.]+)\./)?.[1]
  if (expertise)
    expected.expertise = {
      count: word[expertise[1] ?? expertise[2] ?? "one"],
      ...(expertiseFrom ? { from: sorted(expertiseFrom.split(/, (?:or )?/).map(toId)) } : {}),
    }
  const speed = own.match(/[Ss]peed increases by (\d+) feet/)
  if (speed && !has("This bonus increases")) expected.speedBonus = Number(speed[1])
  const masteries = own.match(/mastery properties of (\w+) kinds/)
  if (masteries && !has("Weapon Mastery column")) expected.weaponMasteries = word[masteries[1]]
  const increase = own.match(/Your (\w+) and (\w+) scores increase by (\d+), to a maximum of (\d+)/)
  if (increase) expected.abilityIncrease = { abilities: [abilityByName[increase[1]], abilityByName[increase[2]]], amount: Number(increase[3]), maximum: Number(increase[4]) }
  const armor = own.match(/base Armor Class equals 10 plus your (\w+) and (\w+) modifiers/)
  if (armor) {
    const shield = has("You can use a Shield and still gain this benefit") ? true : has("or wielding a Shield") ? false : undefined
    expected.armorClass = { base: 10, abilities: [abilityByName[armor[1]], abilityByName[armor[2]]], ...(shield === undefined ? {} : { shield }) }
  }
  const critical = own.match(/Your attack rolls with weapons and Unarmed Strikes can (?:now )?score a Critical Hit on a roll of (19 or 20|18–20)/)
  if (critical) expected.criticalHit = { minRoll: critical[1] === "18–20" ? 18 : 19 }
  const sense = own.match(/(Blindsight|Truesight) with a range of (\d+) feet/)
  if (sense) expected.senses = [{ type: sense[1].toLowerCase(), range: Number(sense[2]) }]
  const read = (field: string) => {
    const value = entry[field]
    if (field === "speedBonus") return value?.feet
    if ((field === "skillProficiencies" || field === "expertise") && value?.from) return { ...value, from: sorted(value.from) }
    return value
  }
  for (const field of [
    "hitPointMaximum",
    "saveDc",
    "pool",
    "range",
    "area",
    "attacks",
    "alwaysPrepared",
    "freeCast",
    "feat",
    "savingThrowProficiencies",
    "skillProficiencies",
    "expertise",
    "speedBonus",
    "weaponMasteries",
    "abilityIncrease",
    "armorClass",
    "criticalHit",
    "senses",
  ])
    if (!byHand(field)) need(same(read(field), expected[field]), `${field} ${JSON.stringify(read(field))}, the text states ${JSON.stringify(expected[field])}`)

  // Resistances and immunities, both ways, whole lists, with the condition they hold under.
  const resisted = listOf(own.match(new RegExp(`Resistance to (${typeList}) damage`))?.[1] ?? "")
  need(same(sorted(entry.resistances?.damageTypes ?? []), sorted(resisted)), `resistances ${JSON.stringify(entry.resistances?.damageTypes)}, the text has ${JSON.stringify(resisted)}`)
  const immune = (own.match(new RegExp(`(?:Immunity to|immune to) the ((?:${conditionNames})(?: and (?:${conditionNames}))?) conditions?`))?.[1] ?? "")
    .split(" and ")
    .filter(Boolean)
    .map((name) => name.toLowerCase())
  need(
    same(sorted(entry.conditionImmunities?.conditions ?? []), sorted(immune)),
    `condition immunities ${JSON.stringify(entry.conditionImmunities?.conditions)}, the text has ${JSON.stringify(immune)}`
  )
  if (entry.conditionImmunities) need(Boolean(entry.conditionImmunities.allies) === has("You and your allies have Immunity"), "condition immunities allies")
  for (const field of ["resistances", "conditionImmunities", "speedBonus"]) {
    if (!entry[field]) continue
    const condition = entry[field].while
    const statedWhile = Object.entries(whilePhrase).find(([, pattern]) => has(pattern))?.[0]
    need(condition === statedWhile, `${field} while ${condition}, the text holds it while ${statedWhile}`)
  }
  return failures
}

// Core traits

function parseItems(text: string): { quantity: number; name: string; detail?: string }[] {
  return text
    .replace(/,? and (?=\d+ GP$)/, ", ")
    .split(", ")
    .map((part) => part.trim())
    .filter((part) => part && !/^\d+ GP$/.test(part))
    .map((part) => {
      const counted = part.match(/^(\d+) (.+)$/)
      const quantity = counted ? Number(counted[1]) : 1
      let name = counted ? counted[2] : part
      let detail: string | undefined
      const paren = name.match(/^(.+?) \((.+)\)$/)
      const trailing = name.match(/^(.+?) ((?:of your choice|chosen for .+))$/)
      if (paren) [, name, detail] = paren
      else if (trailing) [, name, detail] = trailing
      return { quantity, name, ...(detail ? { detail } : {}) }
    })
}

const toolKind: Record<string, string> = { "Musical Instruments": "musical-instrument", "Musical Instrument": "musical-instrument", "Artisan’s Tools": "artisans-tools" }

type Gear = Equipment
// Fields of other categories' entries, read through their exported types so a rename breaks the type check.
const membersOf = (entry?: Equipment) => (entry?.kind === "group" ? entry.members : undefined)
const variantsOf = (entry?: Equipment) => (entry?.kind === "tool" ? entry.variants : undefined)
const bundleOf = (entry?: Equipment) => (entry?.kind === "ammunition" ? entry.bundleSize : undefined)
const alsoQuarterstaff = (entry?: Equipment) => entry?.kind === "focus" && entry.alsoQuarterstaff === true

/**
 * A printed starting item against a data line. "Musical Instrument of your choice" and "Holy Symbol" are choices
 * from a group. "Arcane Focus (crystal)" is the group member the note names. "Book (occult lore)" is the item with a
 * note. A line of ammunition counts single pieces. Without equipment data, group membership and ammunition go unread.
 */
function itemMatches(printed: { quantity: number; name: string; detail?: string }, line: Record<string, any>, gear: Map<string, Gear>): boolean {
  if (printed.quantity !== line.quantity) return false
  const id = toId(printed.name)
  const singular = [id, toId(printed.name.replace(/e?s$/, "")), toId(printed.name.replace(/s$/, ""))]
  const chooses = (ids: string[]) => JSON.stringify(line.chooseFrom) === JSON.stringify(ids)
  if (printed.name.includes(" or ")) return chooses(printed.name.split(" or ").map((name) => toolKind[name])) && line.note === printed.detail
  if (printed.detail === "of your choice") return chooses([id]) && line.note === undefined
  const ammunition = gear.get(line.item ?? "")?.kind === "ammunition"
  if (gear.size && Boolean(line.unit) !== ammunition) return false
  const bundle = bundleOf(gear.get(line.item))
  if (ammunition && (!bundle || printed.quantity % bundle !== 0)) return false
  if (printed.detail) {
    if (line.note !== printed.detail) return false
    const group = gear.get(id)
    const member = gear.get(line.item)
    const named = member?.name.toLowerCase() === printed.detail.toLowerCase() || (printed.detail === "Quarterstaff" && alsoQuarterstaff(member))
    if (group?.kind === "group") return Boolean(membersOf(group)?.includes(line.item) && named)
    return line.item === id || !gear.size
  }
  if (line.note !== undefined) return false
  if (gear.get(id)?.kind === "group") return chooses([id])
  return singular.includes(line.item)
}

function weaponsFrom(text: string): unknown[] {
  if (text === "Simple and Martial weapons") return [{ category: "simple" }, { category: "martial" }]
  const match = text.match(/^Simple weapons(?: and Martial weapons that have the (.+) property)?$/)
  if (!match) return [{ unread: text }]
  return [{ category: "simple" }, ...(match[1] ? [{ category: "martial", withProperty: match[1].split(" or ").map((name) => name.toLowerCase()) }] : [])]
}

function armorFrom(text: string): string[] | undefined {
  if (text === "None") return undefined
  const match = text.match(/^(.+?) armor(?: and (Shields))?$/)
  if (!match) return [`unread: ${text}`]
  return [
    ...match[1]
      .replace(/,? and /, ", ")
      .split(", ")
      .map((kind) => kind.toLowerCase()),
    ...(match[2] ? ["shields"] : []),
  ]
}

const capitalize = (id: string) =>
  id
    .split("-")
    .map((word, index) => (index && ["of", "the"].includes(word) ? word : word[0].toUpperCase() + word.slice(1)))
    .join(" ")

/** Option costs read by hand: the "(Cost: Nd6)" labels on pages 63 and 64, the "Cost:" lines on pages 66 and 67. */
const costByHand: Record<string, { resource: string; amount: number }> = {
  "rogue-cunning-strike/poison": { resource: "sneak-attack-dice", amount: 1 },
  "rogue-cunning-strike/trip": { resource: "sneak-attack-dice", amount: 1 },
  "rogue-cunning-strike/withdraw": { resource: "sneak-attack-dice", amount: 1 },
  "rogue-devious-strikes/daze": { resource: "sneak-attack-dice", amount: 2 },
  "rogue-devious-strikes/knock-out": { resource: "sneak-attack-dice", amount: 6 },
  "rogue-devious-strikes/obscure": { resource: "sneak-attack-dice", amount: 3 },
  "thief-supreme-sneak/stealth-attack": { resource: "sneak-attack-dice", amount: 1 },
  "sorcerer-metamagic/careful-spell": { resource: "sorcery-points", amount: 1 },
  "sorcerer-metamagic/distant-spell": { resource: "sorcery-points", amount: 1 },
  "sorcerer-metamagic/empowered-spell": { resource: "sorcery-points", amount: 1 },
  "sorcerer-metamagic/extended-spell": { resource: "sorcery-points", amount: 1 },
  "sorcerer-metamagic/heightened-spell": { resource: "sorcery-points", amount: 2 },
  "sorcerer-metamagic/quickened-spell": { resource: "sorcery-points", amount: 2 },
  "sorcerer-metamagic/seeking-spell": { resource: "sorcery-points", amount: 1 },
  "sorcerer-metamagic/subtle-spell": { resource: "sorcery-points", amount: 1 },
  "sorcerer-metamagic/transmuted-spell": { resource: "sorcery-points", amount: 1 },
  "sorcerer-metamagic/twinned-spell": { resource: "sorcery-points", amount: 1 },
}

/** Eldritch Invocations read by hand from pages 72 to 74: the prerequisite level, invocation and further words, and the Repeatable mark. */
const invocationsByHand: Record<string, { level?: number; invocation?: string; also?: string; repeatable?: true }> = {
  "agonizing-blast": { level: 2, also: "a Warlock Cantrip That Deals Damage", repeatable: true },
  "armor-of-shadows": {},
  "ascendant-step": { level: 5 },
  "devils-sight": { level: 2 },
  "devouring-blade": { level: 12, invocation: "thirsting-blade" },
  "eldritch-mind": {},
  "eldritch-smite": { level: 5, invocation: "pact-of-the-blade" },
  "eldritch-spear": { level: 2, also: "a Warlock Cantrip That Deals Damage", repeatable: true },
  "fiendish-vigor": { level: 2 },
  "gaze-of-two-minds": { level: 5 },
  "gift-of-the-depths": { level: 5 },
  "gift-of-the-protectors": { level: 9, invocation: "pact-of-the-tome" },
  "investment-of-the-chain-master": { level: 5, invocation: "pact-of-the-chain" },
  "lessons-of-the-first-ones": { level: 2, repeatable: true },
  lifedrinker: { level: 9, invocation: "pact-of-the-blade" },
  "mask-of-many-faces": { level: 2 },
  "master-of-myriad-forms": { level: 5 },
  "misty-visions": { level: 2 },
  "one-with-shadows": { level: 5 },
  "otherworldly-leap": { level: 2 },
  "pact-of-the-blade": {},
  "pact-of-the-chain": {},
  "pact-of-the-tome": {},
  "repelling-blast": { level: 2, also: "a Warlock Cantrip That Deals Damage via an Attack Roll", repeatable: true },
  "thirsting-blade": { level: 5, invocation: "pact-of-the-blade" },
  "visions-of-distant-realms": { level: 9 },
  "whispers-of-the-grave": { level: 7 },
  "witch-sight": { level: 15 },
}

/**
 * Spellcasting read by hand from the official text, pages 31 to 78, with the sentences each value comes from. The
 * check confirms each quote is printed in that class's feature, then compares the values with the data.
 */
type SpellcastingRead = {
  feature: string
  ability: string
  focus: string[]
  slotsRestore: string
  changePrepared: { when: string; count?: 1 }
  changeCantrip?: { when: string; count: 1 }
  ritualFromSpellbook?: true
  quotes: string[]
}
const longRestSlots = "You regain all expended slots when you finish a Long Rest."
const cantripOnLevel = (name: string) => `Whenever you gain a ${name} level, you can replace one of your cantrips`
const spellcastingByHand: Record<string, SpellcastingRead> = {
  bard: {
    feature: "bard-spellcasting",
    ability: "cha",
    focus: ["musical-instrument"],
    slotsRestore: "long-rest",
    changePrepared: { when: "level-up", count: 1 },
    changeCantrip: { when: "level-up", count: 1 },
    quotes: [
      "Charisma is your spellcasting ability for your Bard spells.",
      "You can use a Musical Instrument as a Spellcasting Focus for your Bard spells.",
      longRestSlots,
      "Whenever you gain a Bard level, you can replace one spell on your list with another Bard spell",
      cantripOnLevel("Bard"),
    ],
  },
  cleric: {
    feature: "cleric-spellcasting",
    ability: "wis",
    focus: ["holy-symbol"],
    slotsRestore: "long-rest",
    changePrepared: { when: "long-rest" },
    changeCantrip: { when: "level-up", count: 1 },
    quotes: [
      "Wisdom is your spellcasting ability for your Cleric spells.",
      "You can use a Holy Symbol as a Spellcasting Focus for your Cleric spells.",
      longRestSlots,
      "Whenever you finish a Long Rest, you can change your list of prepared spells, replacing any of the spells there",
      cantripOnLevel("Cleric"),
    ],
  },
  druid: {
    feature: "druid-spellcasting",
    ability: "wis",
    focus: ["druidic-focus"],
    slotsRestore: "long-rest",
    changePrepared: { when: "long-rest" },
    changeCantrip: { when: "level-up", count: 1 },
    quotes: [
      "Wisdom is your spellcasting ability for your Druid spells.",
      "You can use a Druidic Focus as a Spellcasting Focus for your Druid spells.",
      longRestSlots,
      "Whenever you finish a Long Rest, you can change your list of prepared spells, replacing any of the spells with other Druid spells",
      cantripOnLevel("Druid"),
    ],
  },
  paladin: {
    feature: "paladin-spellcasting",
    ability: "cha",
    focus: ["holy-symbol"],
    slotsRestore: "long-rest",
    changePrepared: { when: "long-rest", count: 1 },
    quotes: [
      "Charisma is your spellcasting ability for your Paladin spells.",
      "You can use a Holy Symbol as a Spellcasting Focus for your Paladin spells.",
      longRestSlots,
      "Whenever you finish a Long Rest, you can replace one spell on your list with another Paladin spell",
    ],
  },
  ranger: {
    feature: "ranger-spellcasting",
    ability: "wis",
    focus: ["druidic-focus"],
    slotsRestore: "long-rest",
    changePrepared: { when: "long-rest", count: 1 },
    quotes: [
      "Wisdom is your spellcasting ability for your Ranger spells.",
      "You can use a Druidic Focus as a Spellcasting Focus for your Ranger spells.",
      longRestSlots,
      "Whenever you finish a Long Rest, you can replace one spell on your list with another Ranger spell",
    ],
  },
  sorcerer: {
    feature: "sorcerer-spellcasting",
    ability: "cha",
    focus: ["arcane-focus"],
    slotsRestore: "long-rest",
    changePrepared: { when: "level-up", count: 1 },
    changeCantrip: { when: "level-up", count: 1 },
    quotes: [
      "Charisma is your spellcasting ability for your Sorcerer spells.",
      "You can use an Arcane Focus as a Spellcasting Focus for your Sorcerer spells.",
      longRestSlots,
      "Whenever you gain a Sorcerer level, you can replace one spell on your list with another Sorcerer spell",
      cantripOnLevel("Sorcerer"),
    ],
  },
  warlock: {
    feature: "warlock-pact-magic",
    ability: "cha",
    focus: ["arcane-focus"],
    slotsRestore: "short-or-long-rest",
    changePrepared: { when: "level-up", count: 1 },
    changeCantrip: { when: "level-up", count: 1 },
    quotes: [
      "Charisma is the spellcasting ability for your Warlock spells.",
      "You can use an Arcane Focus as a Spellcasting Focus for your Warlock spells.",
      "You regain all expended Pact Magic spell slots when you finish a Short or Long Rest.",
      "Whenever you gain a Warlock level, you can replace one spell on your list with another Warlock spell",
      cantripOnLevel("Warlock"),
    ],
  },
  wizard: {
    feature: "wizard-spellcasting",
    ability: "int",
    focus: ["arcane-focus", "spellbook"],
    slotsRestore: "long-rest",
    changePrepared: { when: "long-rest" },
    changeCantrip: { when: "long-rest", count: 1 },
    ritualFromSpellbook: true,
    quotes: [
      "Intelligence is your spellcasting ability for your Wizard spells.",
      "You can use an Arcane Focus or your spellbook as a Spellcasting Focus for your Wizard spells.",
      longRestSlots,
      "Whenever you finish a Long Rest, you can change your list of prepared spells, replacing any of the spells there with spells from your spellbook.",
      "Whenever you finish a Long Rest, you can replace one of your cantrips from this feature with another Wizard cantrip",
    ],
  },
}

export default function verify(report: Report) {
  const classes = readData<Class>("classes")
  const features = readData<ClassFeature>("class-features")
  const subclasses = readData<Subclass>("subclasses")
  const featureById = new Map(features.map((feature) => [feature.id, feature]))
  const subclassById = new Map(subclasses.map((subclass) => [subclass.id, subclass]))

  // Every entry as shipped passes its strict schema, so a value outside a field's literal or enum fails here.
  {
    const failures: string[] = []
    const parse = (schema: { safeParse: (value: unknown) => { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } } }, list: { id: string }[]) => {
      for (const entry of list) {
        const result = schema.safeParse(entry)
        if (!result.success) failures.push(`${entry.id}: ${result.error?.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`)
      }
    }
    parse(classSchema, classes)
    parse(classFeatureSchema, features)
    parse(subclassSchema, subclasses)
    report.check(category, "every class, feature and subclass passes its strict schema", classes.length + features.length + subclasses.length, failures)
  }

  // Names and pages from the contents.
  const entries = contents()
  const chapterPage = entries[0].page
  const classEntries = entries.slice(1).filter((entry) => !/Subclass:|Spell List$|Options$/.test(entry.name))
  const subclassEntries = entries.filter((entry) => /Subclass:/.test(entry.name)).map((entry) => ({ ...entry, className: entry.name.split(" ")[0], name: entry.name.replace(/^\w+ Subclass: /, "") }))
  const originsPage = Number((pages[1] + pages[2]).match(/Character Origins\.+\s*(\d+)/)?.[1])
  const lines = chapterLines(chapterPage, originsPage - 1)

  {
    const failures: string[] = []
    const official = classEntries.map((entry) => entry.name)
    for (const name of official) if (!classes.some((entry) => entry.name === name)) failures.push(`${name} is in the official contents but not in the data`)
    for (const entry of classes) {
      if (!official.includes(entry.name)) failures.push(`${entry.id} is not a class in the official contents`)
      const listed = classEntries.find((item) => item.name === entry.name)
      if (listed && listed.page !== entry.page) failures.push(`${entry.id}: page ${entry.page}, the contents say ${listed.page}`)
    }
    report.check(category, `classes match the official contents both ways, with pages (official count ${official.length})`, official.length + classes.length, failures)
  }
  {
    const failures: string[] = []
    for (const entry of subclassEntries) {
      const data = subclasses.find((subclass) => subclass.name === entry.name)
      if (!data) failures.push(`${entry.name} is in the official contents but not in the data`)
      else {
        if (data.page !== entry.page) failures.push(`${data.id}: page ${data.page}, the contents say ${entry.page}`)
        if (data.class !== toId(entry.className)) failures.push(`${data.id}: class ${data.class}, the contents say ${entry.className}`)
        if (data.id !== toId(entry.name)) failures.push(`${data.id}: the id should be ${toId(entry.name)}`)
      }
    }
    for (const subclass of subclasses) if (!subclassEntries.some((entry) => entry.name === subclass.name)) failures.push(`${subclass.id} is not a subclass in the official contents`)
    report.check(category, `subclasses match the official contents both ways, with pages and classes (official count ${subclassEntries.length})`, subclassEntries.length + subclasses.length, failures)
  }

  // Split the chapter into class sections.
  const sectionOf = new Map<string, Line[]>()
  for (const [index, entry] of classEntries.entries()) {
    const start = lines.findIndex((line, at) => line.text === entry.name && lines[at + 1]?.text === `Core ${entry.name} Traits`)
    const next = classEntries[index + 1]
    const end = next ? lines.findIndex((line, at) => line.text === next.name && lines[at + 1]?.text === `Core ${next.name} Traits`) : lines.length
    sectionOf.set(toId(entry.name), lines.slice(start, end))
  }

  // Core traits and multiclass traits.
  const officialTraits = new Map<string, { hitDie: number; savingThrows: string[] }>()
  {
    const failures: string[] = []
    let total = 0
    const labels = ["Primary Ability", "Hit Point Die", "Saving Throw Proficiencies", "Skill Proficiencies", "Weapon Proficiencies", "Tool Proficiencies", "Armor Training", "Starting Equipment"]
    for (const entry of classes) {
      const section = sectionOf.get(entry.id) ?? []
      const fail = (field: string, official: unknown, data: unknown) => failures.push(`${entry.id} ${field}: official ${JSON.stringify(official)}, data ${JSON.stringify(data)}`)
      const compare = (field: string, official: unknown, data: unknown) => {
        total++
        if (!same(official, data)) fail(field, official, data)
      }
      const becoming = section.findIndex((line) => line.text.startsWith(`Becoming a ${entry.name}`))
      const block = join(section.slice(2, becoming))
      const traits = new Map<string, string>()
      const pattern = new RegExp(`(${labels.join("|")}) `, "g")
      const marks = [...block.matchAll(pattern)]
      for (const [index, mark] of marks.entries()) traits.set(mark[1], block.slice((mark.index ?? 0) + mark[0].length, marks[index + 1]?.index).trim())

      const primary = traits.get("Primary Ability") ?? ""
      const abilities = primary.split(/ and | or /).map((name) => abilityByName[name])
      compare("primaryAbility", / or /.test(primary) ? { any: abilities } : { all: abilities }, entry.primaryAbility)
      compare("hitDie", Number(traits.get("Hit Point Die")?.match(new RegExp(`^D(\\d+) per ${entry.name} level$`))?.[1]), entry.hitDie)
      const saves = (traits.get("Saving Throw Proficiencies") ?? "").split(" and ").map((name) => abilityByName[name])
      compare("savingThrows", saves, entry.savingThrows)
      officialTraits.set(entry.id, { hitDie: Number(traits.get("Hit Point Die")?.match(/^D(\d+)/)?.[1]), savingThrows: saves })
      const skills = traits.get("Skill Proficiencies") ?? ""
      const anySkills = skills.match(/^Choose any (\d+) skills/)
      const listed = skills.match(/^Choose (\d+): (.+)$/)
      compare(
        "skills",
        anySkills ? { count: Number(anySkills[1]) } : { count: Number(listed?.[1]), from: sorted((listed?.[2] ?? "").split(/, (?:or )?/).map(toId)) },
        entry.skills.from ? { count: entry.skills.count, from: entry.skills.from } : entry.skills
      )
      compare("weapons", weaponsFrom(traits.get("Weapon Proficiencies") ?? ""), entry.weapons)
      compare("armor", armorFrom(traits.get("Armor Training") ?? ""), entry.armor)
      const tool = traits.get("Tool Proficiencies")
      const choice = tool?.match(/^Choose (\d+|one) (?:type of )?(.+?) \(see “Equipment”\)$/)
      const tools = !tool ? undefined : choice ? [{ choose: choice[1] === "one" ? 1 : Number(choice[1]), from: choice[2].split(" or ").map((name) => toolKind[name]) }] : [{ tool: toId(tool) }]
      compare("tools", tools, entry.tools)

      const equipment = traits.get("Starting Equipment") ?? ""
      const options = [...equipment.matchAll(/\(([ABC])\) (.+?)(?=;? (?:or )?\([ABC]\) |$)/g)]
      const gear = new Map(existsSync(dataPath("equipment")) ? readData<Gear>("equipment").map((item) => [item.id, item] as [string, Gear]) : [])
      total++
      if (options.length !== entry.startingEquipment.length) fail("startingEquipment options", options.length, entry.startingEquipment.length)
      for (const [index, option] of options.entries()) {
        const data = entry.startingEquipment[index]
        const gp = Number(option[2].match(/(\d+) GP$/)?.[1])
        const printed = parseItems(option[2])
        total++
        if (!data || data.option !== option[1] || !same(data.money, { amount: gp, unit: "gp" })) fail(`startingEquipment ${option[1]} money`, gp, data?.money)
        const items = data?.items ?? []
        total++
        if (printed.length !== items.length || printed.some((item, at) => !itemMatches(item, items[at] as Record<string, any>, gear))) fail(`startingEquipment ${option[1]} items`, printed, items)
      }

      // As a Multiclass Character: "Gain the following traits from the Core X Traits table: A, B, and C."
      const multiclassText = join(section.slice(becoming)).match(
        /As a Multiclass Character (?:Gain|• Gain) (?:the following traits from the Core \w+ Traits table: (.+?)\.|the Hit Point Die (?:trait )?from)/
      )
      const gains = (multiclassText?.[1] ?? "Hit Point Die").split(/,? and (?=(?:training|proficiency) )|, /)
      const official: Record<string, unknown> = { hitPointDie: true }
      for (const gain of gains) {
        if (gain === "Hit Point Die") continue
        const weapon = gain.match(/^proficiency with (Martial) weapons$/)
        const armor = gain.match(/^training with (.+)$/)
        const skill = gain.match(/^proficiency in one skill of your choice( from the \w+’s skill list)?$/)
        const instrument = gain.match(/^proficiency with one Musical Instrument of your choice$/)
        if (weapon) official.weapons = [{ category: "martial" }]
        else if (armor) official.armor = /armor/.test(armor[1]) ? armorFrom(armor[1]) : ["shields"]
        else if (skill) official.skills = skill[1] ? { count: 1, from: entry.skills.from } : { count: 1 }
        else if (instrument) official.tools = [...((official.tools as unknown[]) ?? []), { choose: 1, from: ["musical-instrument"] }]
        else if (gain === "proficiency with Thieves’ Tools") official.tools = [...((official.tools as unknown[]) ?? []), { tool: "thieves-tools" }]
        else official[`unread ${gain}`] = true
      }
      const keys = ["hitPointDie", "weapons", "armor", "skills", "tools"]
      compare(
        "multiclass",
        Object.fromEntries(keys.filter((key) => official[key] !== undefined).map((key) => [key, official[key]])),
        Object.fromEntries(keys.filter((key) => (entry.multiclass as Record<string, unknown>)[key] !== undefined).map((key) => [key, (entry.multiclass as Record<string, unknown>)[key]]))
      )
    }
    report.check(category, "core traits and multiclass traits match the official Core Traits tables and Becoming text, field by field", total, failures)
  }

  // The features tables, every cell.
  const tables = new Map<string, { rows: TableRow[]; start: number; end: number }>()
  {
    const failures: string[] = []
    let total = 0
    for (const entry of classes) {
      const section = sectionOf.get(entry.id) ?? []
      const start = section.findIndex((line) => line.text === `${entry.name} Features`)
      const spec = columns[entry.id]
      let parsed: ReturnType<typeof featuresTable>
      try {
        parsed = featuresTable(section, start, spec.length)
      } catch (error) {
        failures.push(`${entry.id}: the features table does not parse: ${(error as Error).message}`)
        continue
      }
      tables.set(entry.id, { rows: parsed.rows, start, end: parsed.end })
      for (const key of spec.filter((key) => !/^slot[2-9]$/.test(key))) {
        total++
        if (!squash(parsed.head).includes(squash(headings[key]))) failures.push(`${entry.id}: the table head has no ${headings[key]} column`)
      }
      if (entry.levels.length !== 20) failures.push(`${entry.id}: ${entry.levels.length} level rows`)
      for (const row of parsed.rows) {
        const data = entry.levels[row.level - 1] as ClassLevel | undefined
        const fail = (field: string, official: unknown, value: unknown) => failures.push(`${entry.id} level ${row.level} ${field}: official ${JSON.stringify(official)}, data ${JSON.stringify(value)}`)
        total += 2
        if (!data || data.level !== row.level) {
          fail("level", row.level, data?.level)
          continue
        }
        if (data.proficiencyBonus !== row.pb) fail("proficiencyBonus", row.pb, data.proficiencyBonus)
        const slotsData = data.spellSlots ?? []
        for (const [index, key] of spec.entries()) {
          total++
          const official = cellValue(row.cells[index])
          const slot = key.match(/^slot(\d)$/)
          const value = slot ? slotsData[Number(slot[1]) - 1] : (data as Record<string, unknown>)[key]
          if (slot ? value !== (official ?? 0) : value !== official) fail(key, row.cells[index], value)
        }
        const allowed = new Set(["level", "proficiencyBonus", "features", "subclassFeature", "spellSlots", ...spec])
        total++
        for (const key of Object.keys(data)) if (!allowed.has(key)) fail(`extra field ${key}`, undefined, (data as Record<string, unknown>)[key])
        const slotCount = spec.filter((key) => /^slot\d$/.test(key)).length
        if (slotsData.length !== slotCount) fail("spellSlots length", slotCount, slotsData.length)
        // Features column: "Subclass feature" marks a subclass level; a parenthetical is checked with the feature.
        const names = row.features.filter((name) => name !== "Subclass feature")
        const ids = names.map((name) => `${entry.id}-${toId(name.replace(/ \(.+\)$/, ""))}`)
        total += 2
        if (!same(sorted(ids), sorted(data.features ?? []))) fail("features", ids, data.features)
        if (row.features.includes("Subclass feature") !== Boolean(data.subclassFeature)) fail("subclassFeature", row.features.includes("Subclass feature"), data.subclassFeature)
      }
    }
    report.check(category, "every cell of the twelve class features tables matches the official table (20 rows, every column)", total, failures)
  }

  // Feature headings, both ways, with levels and pages.
  const owners: Owner[] = []
  const featureText = new Map<string, string>()
  const blockLines = new Map<string, Line[]>()
  {
    const failures: string[] = []
    let total = 0
    for (const entry of classes) {
      const section = sectionOf.get(entry.id) ?? []
      const subclassStart = section.findIndex((line) => line.text.startsWith(`${entry.name} Subclass:`))
      const subclass = subclasses.find((item) => item.class === entry.id)
      const ends = [
        section.findIndex((line) => line.text === `${entry.name} Spell List`),
        section.findIndex((line) => /^(Metamagic|Eldritch Invocation) Options$/.test(line.text)),
        subclassStart,
      ].filter((index) => index >= 0)
      const parts: [string, number, number][] = [
        [entry.id, 0, Math.min(...ends)],
        [subclass?.id ?? "?", subclassStart, section.length],
      ]
      for (const [owner, from, to] of parts) {
        const headingsFound: { level: number; name: string; index: number; page: number }[] = []
        for (let index = from; index < to; index++) {
          const match = section[index].text.match(/^Level (\d+): (.+)$/)
          if (match) headingsFound.push({ level: Number(match[1]), name: match[2], index, page: section[index].page })
        }
        for (const [k, heading] of headingsFound.entries()) {
          const id = `${owner}-${toId(heading.name)}`
          const end = headingsFound[k + 1]?.index ?? to
          const block = section.slice(heading.index + 1, end)
          blockLines.set(`${id}@${heading.level}`, block)
          featureText.set(id, `${featureText.get(id) ?? ""} ${section[heading.index].text} ${join(block)}`.trim())
          const data = featureById.get(id)
          total++
          if (!data) {
            failures.push(`Level ${heading.level}: ${heading.name} (${owner}) is in the official text but not in the data`)
            continue
          }
          const later = data.laterText?.find((text) => text.level === heading.level)
          if (data.level === heading.level) {
            if (data.name !== heading.name) failures.push(`${id}: name ${data.name}, official ${heading.name}`)
            if (data.page !== heading.page) failures.push(`${id}: page ${data.page}, the heading is on ${heading.page}`)
          } else if (!later) failures.push(`${id}: no entry at level ${heading.level}`)
          else if (later.page !== heading.page) failures.push(`${id} at ${heading.level}: page ${later.page}, the heading is on ${heading.page}`)
        }
        for (const feature of features.filter((item) => (owner === entry.id ? item.class === entry.id && !item.subclass : item.subclass === owner))) {
          const levels = [feature.level, ...(feature.laterText ?? []).map((text) => text.level)]
          const printed = headingsFound.filter((heading) => `${owner}-${toId(heading.name)}` === feature.id).map((heading) => heading.level)
          total++
          // One entry per heading: the first level, then one later text for each later heading, no more.
          if (!same(levels, printed)) failures.push(`${feature.id}: headings at ${levels}, the official text prints them at ${printed}`)
        }
      }
      owners.push({ id: entry.id, name: entry.name, lines: section, heading: subclassStart })
    }
    report.check(category, `every official feature heading is in the data at its level and page, and every data feature has its heading (official count ${blockLines.size})`, total, failures)
  }

  // Feature levels against the tables and the text.
  {
    const failures: string[] = []
    let total = 0
    for (const feature of features) {
      total++
      const table = tables.get(feature.class)
      if (feature.subclass) {
        if (!same(feature.levels, [feature.level])) failures.push(`${feature.id}: levels ${feature.levels}, a subclass feature has only its heading level`)
        continue
      }
      const listed = (table?.rows ?? []).filter((row) => row.features.some((name) => toId(name.replace(/ \(.+\)$/, "")) === feature.id.slice(feature.class.length + 1))).map((row) => row.level)
      if (!same(feature.levels, listed)) failures.push(`${feature.id}: levels ${feature.levels}, the table lists it at ${listed}`)
      // "You gain this feature again at Barbarian levels 8, 12, and 16."
      const again = (featureText.get(feature.id) ?? "").match(/gain this feature again at \w+ levels ([\d, and]+)\./)
      if (again) {
        total++
        const levels = [feature.level, ...again[1].match(/\d+/g)!.map(Number)]
        if (!same(feature.levels, levels)) failures.push(`${feature.id}: levels ${feature.levels}, the text says ${levels}`)
      }
    }
    for (const subclass of subclasses) {
      total++
      const table = tables.get(subclass.class)
      const official = [subclass.level, ...(table?.rows ?? []).filter((row) => row.features.includes("Subclass feature")).map((row) => row.level)]
      const data = subclass.features.map((group) => group.level)
      if (!same(official, data)) failures.push(`${subclass.id}: feature levels ${data}, the class table gives ${official}`)
      for (const group of subclass.features) {
        for (const id of group.features) {
          total++
          if (featureById.get(id)?.level !== group.level || featureById.get(id)?.subclass !== subclass.id) failures.push(`${subclass.id}: ${id} at ${group.level} does not match its feature`)
        }
      }
      total++
      const all = features.filter((feature) => feature.subclass === subclass.id).map((feature) => feature.id)
      if (!same(sorted(all), sorted(subclass.features.flatMap((group) => group.features))))
        failures.push(`${subclass.id}: features ${subclass.features.flatMap((group) => group.features)}, data has ${all}`)
      total++
      const choice = featureById.get(`${subclass.class}-${toId(`${capital(subclass.class)} Subclass`)}`)
      if (choice?.level !== subclass.level) failures.push(`${subclass.id}: level ${subclass.level}, the class grants a subclass at ${choice?.level}`)
    }
    report.check(category, "feature levels match the class table rows and the text, and subclass features match the subclass levels", total, failures)
  }

  // Subclass taglines: the line after the subclass heading, whose name the contents give.
  {
    const failures: string[] = []
    for (const subclass of subclasses) {
      const owner = owners.find((item) => item.id === subclass.class) as Owner
      const printed = subclassEntries.find((entry) => toId(entry.name) === subclass.id)?.name ?? ""
      let at = owner.heading
      let heading = owner.lines[at].text.replace(/^\w+ Subclass:/, "").trim()
      while (squash(heading) !== squash(printed) && at < owner.heading + 3) heading = `${heading} ${owner.lines[++at].text}`.trim()
      const tagline = owner.lines[at + 1]?.text
      if (subclass.tagline !== tagline) failures.push(`${subclass.id}: tagline ${JSON.stringify(subclass.tagline)}, official ${JSON.stringify(tagline)}`)
    }
    report.check(category, "every subclass tagline is the line the official text prints under its heading", subclasses.length, failures)
  }

  // Table parentheticals: "Action Surge (two uses)" and "Mystic Arcanum (level 7 spell)".
  {
    const failures: string[] = []
    let total = 0
    const words: Record<string, number> = { one: 1, two: 2, three: 3 }
    for (const [classId, table] of tables) {
      for (const row of table.rows) {
        for (const name of row.features) {
          const note = name.match(/^(.+) \((.+)\)$/)
          if (!note) continue
          total++
          const feature = featureById.get(`${classId}-${toId(note[1])}`)
          const uses = note[2].match(/^(one|two|three) uses?$/)
          const spell = note[2].match(/^level (\d) spell$/)
          const byLevel = (feature?.uses?.count as { byLevel?: { level: number; count: number }[] })?.byLevel
          if (uses && !byLevel?.some((step) => step.level === row.level && step.count === words[uses[1]])) failures.push(`${classId} level ${row.level}: ${name}, data ${JSON.stringify(byLevel)}`)
          else if (spell && !feature?.spellLevels?.some((step) => step.level === row.level && step.spellLevel === Number(spell[1])))
            failures.push(`${classId} level ${row.level}: ${name}, data ${JSON.stringify(feature?.spellLevels)}`)
          else if (!uses && !spell) failures.push(`${classId} level ${row.level}: unread note ${name}`)
        }
      }
    }
    for (const feature of features) {
      const byLevel = (feature.uses?.count as { byLevel?: { level: number }[] })?.byLevel
      // Each table note is one step, so no step may repeat.
      for (const steps of [byLevel, feature.spellLevels]) {
        if (!steps) continue
        total++
        if (new Set(steps.map((step) => step.level)).size !== steps.length) failures.push(`${feature.id}: a step repeats a level`)
      }
      for (const step of [...(byLevel ?? []), ...(feature.spellLevels ?? [])]) {
        total++
        const row = tables.get(feature.class)?.rows[step.level - 1]
        if (!row?.features.some((name) => name.startsWith(`${feature.name} (`))) failures.push(`${feature.id}: a step at level ${step.level} has no table note`)
      }
    }
    report.check(category, "uses and spell levels by class level match the table notes, such as Indomitable (two uses)", total, failures)
  }

  // Inner tables: Beast Shapes, Creating Spell Slots, Nature’s Ward, always-prepared spells.
  const innerRanges: [number, number, string][] = []
  {
    const failures: string[] = []
    let total = 0
    const owner = (id: string) => owners.find((item) => item.id === id) as Owner
    const druid = owner("druid").lines
    const beast = innerTable(druid, "Beast Shapes", 0, 4)
    innerRanges.push([beast.start, beast.end, "druid"])
    const forms = beast.rows.map((row) => ({ level: Number(row[0]), known: Number(row[1]), maxCr: row[2] === "1/4" ? 0.25 : row[2] === "1/2" ? 0.5 : Number(row[2]), flySpeed: row[3] === "Yes" }))
    total++
    if (!same(forms, featureById.get("druid-wild-shape")?.forms))
      failures.push(`druid-wild-shape forms: official ${JSON.stringify(forms)}, data ${JSON.stringify(featureById.get("druid-wild-shape")?.forms)}`)
    const sorcerer = owner("sorcerer").lines
    const creating = sorcerer.findIndex((line) => line.text === "Creating Spell Slots")
    const numbers = sorcerer.slice(creating + 1).findIndex((line) => /^\d+$/.test(line.text))
    const cells = sorcerer.slice(creating + 1 + numbers, creating + 1 + numbers + 15).map((line) => Number(line.text))
    innerRanges.push([creating, creating + 1 + numbers + 15, "sorcerer"])
    const slotCreation = Array.from({ length: 5 }, (_, index) => ({ slotLevel: cells[index * 3], cost: cells[index * 3 + 1], minLevel: cells[index * 3 + 2] }))
    total++
    if (!same(slotCreation, featureById.get("sorcerer-font-of-magic")?.slotCreation)) failures.push(`sorcerer-font-of-magic slotCreation: official ${JSON.stringify(slotCreation)}`)
    for (const subclass of subclasses) {
      const lines = owner(subclass.class).lines
      const titles = [`${subclass.name} Spells`, "Draconic Spells", "Fiend Spells", "Arid Land", "Polar Land", "Temperate Land", "Tropical Land"]
      const official: { level: number; spells: string[]; land?: string }[] = []
      for (const title of titles) {
        const start = lines.findIndex((line, index) => index > owner(subclass.class).heading && line.text === title)
        if (start < 0) continue
        const table = innerTable(lines, title, start)
        innerRanges.push([table.start, table.end, subclass.class])
        const land = title.match(/^(\w+) Land$/)?.[1].toLowerCase()
        for (const row of table.rows) official.push({ level: Number(row[0]), spells: join(row.slice(1)).split(", ").map(toId), ...(land ? { land } : {}) })
      }
      if (subclass.id === "circle-of-the-land") {
        const ward = innerTable(lines, "Nature’s Ward", 0, 2)
        innerRanges.push([ward.start, ward.end, subclass.class])
        const resistances = ward.rows.map((row) => ({ land: row[0].toLowerCase(), damageType: row[1].toLowerCase() }))
        total++
        if (!same(resistances, featureById.get("circle-of-the-land-natures-ward")?.landResistances))
          failures.push(`circle-of-the-land-natures-ward landResistances: official ${JSON.stringify(resistances)}`)
      }
      total++
      if (!same(official.length ? official : undefined, subclass.alwaysPrepared))
        failures.push(`${subclass.id} alwaysPrepared: official ${JSON.stringify(official)}, data ${JSON.stringify(subclass.alwaysPrepared)}`)
    }
    report.check(category, "the tables inside features match: Beast Shapes, Creating Spell Slots, Nature’s Ward and every always-prepared spell table", total, failures)
  }

  // Spellcasting fields and the spell lists.
  const spellWaivers: string[] = []
  const spellRanges: [number, number, string][] = []
  {
    const failures: string[] = []
    let total = 0
    const page25 = join(pages[24].split("\n"))
    const full = (page25.match(/All your levels in the (.+?) classes/)?.[1] ?? "")
      .replace(/,? and /, ", ")
      .split(", ")
      .map(toId)
    const half = (page25.match(/Half your levels \(round up\) in the (.+?) classes/)?.[1] ?? "").split(" and ").map(toId)
    for (const entry of classes) {
      const owner = owners.find((item) => item.id === entry.id) as Owner
      const spellcasting = featureText.get(`${entry.id}-spellcasting`) ?? featureText.get(`${entry.id}-pact-magic`)
      total++
      if (!spellcasting) {
        if (entry.spellcasting) failures.push(`${entry.id}: spellcasting in the data, none in the official text`)
        continue
      }
      const data = entry.spellcasting
      if (!data) {
        failures.push(`${entry.id}: no spellcasting in the data`)
        continue
      }
      const compare = (field: string, official: unknown, value: unknown) => {
        total++
        if (!same(official, value)) failures.push(`${entry.id} spellcasting ${field}: official ${JSON.stringify(official)}, data ${JSON.stringify(value)}`)
      }
      // Read by hand from each Spellcasting or Pact Magic feature, with the sentence that states each value. The
      // builder reads the base source; this table is a separate reading of the official text.
      const read = spellcastingByHand[entry.id]
      for (const quote of read.quotes) {
        total++
        if (!squash(spellcasting).includes(squash(quote))) failures.push(`${entry.id} spellcasting: the hand table quotes “${quote}”, which its feature does not print`)
      }
      const { quotes: _, ...expected } = read
      compare("fields", expected, {
        feature: data.feature,
        ability: data.ability,
        focus: data.focus,
        slotsRestore: data.slotsRestore,
        changePrepared: data.changePrepared,
        ...(data.changeCantrip ? { changeCantrip: data.changeCantrip } : {}),
        ...(data.ritualFromSpellbook ? { ritualFromSpellbook: data.ritualFromSpellbook } : {}),
      })
      compare("multiclassLevels", full.includes(entry.id) ? "all" : half.includes(entry.id) ? "half-round-up" : undefined, data.multiclassLevels)

      // The spell list printed in the class section.
      const start = owner.lines.findIndex((line) => line.text === `${entry.name} Spell List`)
      const end = owner.heading
      spellRanges.push([start, end, entry.id])
      let list: ReturnType<typeof spellList> = []
      try {
        list = spellList(owner.lines.slice(start + 1, end))
      } catch (error) {
        failures.push(`${entry.id}: ${(error as Error).message}`)
      }
      const official = [...new Set(list.map((spell) => spell.level))].map((level) => ({ level, spells: sorted(list.filter((spell) => spell.level === level).map((spell) => toId(spell.name))) }))
      const value = data.spellList.map((group) => ({ level: group.level, spells: sorted(group.spells) }))
      total += list.length
      for (const group of official) {
        const mine = value.find((item) => item.level === group.level)?.spells ?? []
        for (const spell of group.spells) if (!mine.includes(spell)) failures.push(`${entry.id} spell list level ${group.level}: ${spell} is official but not in the data`)
        for (const spell of mine) {
          if (group.spells.includes(spell)) continue
          const own = spellHeader(spell)
          if (own?.classes.includes(entry.id) && own.level === group.level)
            spellWaivers.push(
              `${entry.id} ${spell}: the printed Level ${group.level} ${entry.name} Spells list (page ${owner.lines.find((line) => line.text === `Level ${group.level} ${entry.name} Spells`)?.page}) omits it, but the spell’s own header (page ${own.page}) names ${entry.name}. The text contradicts itself and the spell’s own block wins.`
            )
          else failures.push(`${entry.id} spell list level ${group.level}: ${spell} is in the data but not the official list`)
        }
      }
      for (const group of value) if (!official.some((item) => item.level === group.level)) failures.push(`${entry.id} spell list: level ${group.level} is not in the official list`)
    }
    report.check(
      category,
      "spellcasting ability, focus, slot recovery, preparation, multiclass levels and every spell of every class spell list match the official text",
      total,
      failures,
      spellWaivers
    )
  }

  // Options: every option against its official title or label, with prerequisites and costs.
  {
    const failures: string[] = []
    let total = 0
    for (const feature of features) {
      for (const option of feature.options ?? []) {
        total++
        const owner = owners.find((item) => item.id === feature.class) as Owner
        const from = owner.lines.findIndex((line) => line.text === `Level ${feature.level}: ${feature.name}`)
        const titled = owner.lines.findIndex((line, index) => index > from && line.text === option.name)
        const labeled = owner.lines.findIndex((line, index) => index > from && line.raw.startsWith("\t") && line.text.startsWith(`${option.name}.`))
        const costed = owner.lines.findIndex((line, index) => index > from && line.raw.startsWith("\t") && line.text.startsWith(`${option.name} (Cost: `))
        const at = [labeled, costed, titled].find((index) => index >= 0) ?? -1
        if (at < 0) {
          failures.push(`${feature.id}: option ${option.name} has no official title or label`)
          continue
        }
        if (owner.lines[at].page !== option.page) failures.push(`${feature.id}/${option.id}: page ${option.page}, official ${owner.lines[at].page}`)
        if (option.id !== toId(option.name)) failures.push(`${feature.id}/${option.id}: the id should be ${toId(option.name)}`)
        // Costs and prerequisites come from tables read by hand, each confirmed against the printed line.
        const cost = costByHand[`${feature.id}/${option.id}`]
        total++
        if (!same(cost, option.spend?.resource === "sneak-attack-dice" || option.spend?.resource === "sorcery-points" ? option.spend : undefined))
          failures.push(`${feature.id}/${option.id}: cost ${JSON.stringify(option.spend)}, read by hand ${JSON.stringify(cost)}`)
        if (cost) {
          total++
          const printed =
            cost.resource === "sneak-attack-dice"
              ? owner.lines[costed]?.text.includes(`(Cost: ${cost.amount}d6)`)
              : owner.lines[titled + 1]?.text === `Cost: ${cost.amount} Sorcery Point${cost.amount > 1 ? "s" : ""}`
          if (!printed) failures.push(`${feature.id}/${option.id}: the hand cost ${cost.amount} is not the printed one`)
        }
        if (feature.id !== "warlock-eldritch-invocations") continue
        const read = invocationsByHand[option.id]
        total += 3
        if (!read) {
          failures.push(`${feature.id}/${option.id}: not in the hand table of invocations`)
          continue
        }
        const text = read.level ? [`Level ${read.level}+ Warlock`, ...(read.invocation ? [`${capitalize(read.invocation)} Invocation`] : []), ...(read.also ? [read.also] : [])].join(", ") : undefined
        if (option.prerequisite?.text !== text) failures.push(`${feature.id}/${option.id}: prerequisite ${JSON.stringify(option.prerequisite?.text)}, read by hand ${JSON.stringify(text)}`)
        if (option.prerequisite?.level !== read.level || option.prerequisite?.invocation !== read.invocation)
          failures.push(`${feature.id}/${option.id}: prerequisite fields ${JSON.stringify(option.prerequisite)}`)
        if (text && !squash(join(owner.lines.slice(titled + 1, titled + 3))).startsWith(squash(`Prerequisite: ${text}`)))
          failures.push(`${feature.id}/${option.id}: the hand prerequisite is not the printed one`)
        if (Boolean(read.repeatable) !== Boolean(option.repeatable)) failures.push(`${feature.id}/${option.id}: repeatable ${option.repeatable}, read by hand ${read.repeatable}`)
        if (read.repeatable && !squash(option.description).includes("repeatableyoucangainthisinvocationmorethanonce")) failures.push(`${feature.id}/${option.id}: no Repeatable paragraph`)
        // The Repeatable text is the printed paragraph after its label, word for word.
        const printedRepeatable = option.description
          .split("\n")
          .find((paragraph) => paragraph.startsWith("Repeatable. "))
          ?.slice("Repeatable. ".length)
        if (option.repeatable && (option.repeatable.text !== printedRepeatable || !inOfficial(option.repeatable.text)))
          failures.push(`${feature.id}/${option.id}: repeatable text is not its printed paragraph`)
      }
    }
    // Every title in the options sections is an option in the data.
    for (const owner of owners) {
      const start = owner.lines.findIndex((line) => /^(Metamagic|Eldritch Invocation) Options$/.test(line.text))
      if (start < 0) continue
      const end = owner.lines.findIndex((line) => line.text === `${owner.name} Spell List`)
      const feature = features.find((item) => item.class === owner.id && item.name === (owner.id === "sorcerer" ? "Metamagic" : "Eldritch Invocations"))
      const titles = owner.lines.slice(start + 1, end).filter((line, index, list) => /^(Cost|Prerequisite): /.test(list[index + 1]?.text ?? "") && !/[.:]/.test(line.text))
      for (const title of titles) {
        total++
        if (!feature?.options?.some((option) => option.name === title.text)) failures.push(`${owner.id}: option ${title.text} is official but not in the data`)
      }
    }
    report.check(category, "every option matches its official title or label, page, cost, prerequisite and repeatable mark", total, failures)
  }

  // Mechanics against each feature's and option's own official text.
  {
    const failures: string[] = []
    let total = 0
    const keys = [
      "activation",
      "uses",
      "spend",
      "dice",
      "diceFromColumn",
      "dicePerSlotLevel",
      "rollAdds",
      "selfSave",
      "selfDamage",
      "oncePerTurn",
      "speedBonusByLevel",
      "hitPointMaximum",
      "diceByLevel",
      "damage",
      "save",
      "saveDc",
      "pool",
      "range",
      "area",
      "attacks",
      "attacksWith",
      "label",
      "parts",
      "untyped",
      "requiresItem",
      "appliesWhen",
      "unless",
      "usableWhen",
      "alwaysPrepared",
      "freeCast",
      "feat",
      "savingThrowProficiencies",
      "skillProficiencies",
      "expertise",
      "speedBonus",
      "weaponMasteries",
      "abilityIncrease",
      "armorClass",
      "criticalHit",
      "senses",
      "resistances",
      "conditionImmunities",
      "usableWhenUntilLevel",
      "healing",
      "maxTargets",
      "variableDice",
      "areaSizeByLevel",
      "masteryWeapons",
      "weaponProficiencies",
      "armorTraining",
      "extraCantrips",
      "rollBonus",
    ]
    // No field goes unread: every key is an entry field, a mechanic read here, or a table read above.
    const known = new Set([...keys, "id", "name", "page", "class", "subclass", "level", "levels", "description", "options", "laterText", "forms", "slotCreation", "spellLevels", "landResistances"])
    const optionKnown = new Set([...keys, "id", "name", "page", "description", "prerequisite", "repeatable"])
    for (const feature of features) {
      for (const key of Object.keys(feature)) if (!known.has(key)) failures.push(`${feature.id}: ${key} is not checked`)
      for (const option of feature.options ?? []) for (const key of Object.keys(option)) if (!optionKnown.has(key)) failures.push(`${feature.id}/${option.id}: ${key} is not checked`)
    }
    const classText = (classId: string) => features.filter((feature) => feature.class === classId).map((feature) => featureText.get(feature.id) ?? "")
    // A feature's own text: its first heading's block, without the class table set in it. Later headings are related text.
    const firstBlock = (feature: ClassFeature) => {
      const owner = owners.find((item) => item.id === feature.class) as Owner
      const table = tables.get(owner.id)
      const lines = (blockLines.get(`${feature.id}@${feature.level}`) ?? []).filter((line) => {
        const index = owner.lines.indexOf(line)
        return !table || index < table.start || index >= table.end
      })
      return `Level ${feature.level}: ${feature.name} ${join(lines)}`
    }
    for (const feature of features) {
      const own = firstBlock(feature)
      const related = [featureText.get(feature.id) ?? "", ...classText(feature.class).filter((text) => text.includes(feature.name))].join(" ")
      const skills = classes.find((entry) => entry.id === feature.class)?.skills.from ?? []
      const optionNames = (feature.options ?? []).map((option) => option.name)
      // A feature's own mechanics are read from its text before its options begin.
      const firstOption = optionNames.length ? Math.min(...optionNames.map((name) => own.search(new RegExp(`${name}(?: \\(Cost|\\.)`))).filter((index) => index >= 0)) : own.length
      const body = own.slice(0, firstOption)
      total += keys.filter((key) => (feature as Record<string, unknown>)[key] !== undefined).length
      for (const failure of mechanicsFailures(feature, body, related, skills, feature.name, handReadings[feature.id])) failures.push(`${feature.id}: ${failure} is not what its text says`)
      for (const option of feature.options ?? []) {
        const owner = owners.find((item) => item.id === feature.class) as Owner
        const titled = owner.lines.findIndex((line) => line.text === option.name)
        let text: string
        if (feature.id === "sorcerer-metamagic" || feature.id === "warlock-eldritch-invocations") {
          const names = (feature.options ?? []).map((item) => item.name)
          let end = titled + 1
          while (end < owner.lines.length && !names.includes(owner.lines[end].text) && owner.lines[end].text !== `${owner.name} Spell List`) end++
          text = join(owner.lines.slice(titled, end))
        } else {
          const start = own.search(new RegExp(`${option.name}(?: \\(Cost|\\.)`))
          const after = optionNames.map((name) => own.slice(start + 1).search(new RegExp(`${name}(?: \\(Cost|\\.)`))).filter((index) => index >= 0)
          text = own.slice(start, after.length ? start + 1 + Math.min(...after) : own.length)
        }
        total += keys.filter((key) => (option as Record<string, unknown>)[key] !== undefined).length
        for (const failure of mechanicsFailures(option, text, `${text} ${own}`, skills, "", handReadings[`${feature.id}/${option.id}`]))
          failures.push(`${feature.id}/${option.id}: ${failure} is not what its text says`)
      }
    }
    // Unarmored Movement's steps against the Monk Features table as the data holds it (checked cell by cell above).
    const monk = classes.find((entry) => entry.id === "monk")
    const movement = featureById.get("monk-unarmored-movement")
    const tableSteps = (monk?.levels ?? [])
      .filter((row, index, rows) => row.unarmoredMovement !== undefined && row.unarmoredMovement !== rows[index - 1]?.unarmoredMovement)
      .map((row) => ({ level: row.level, feet: row.unarmoredMovement }))
    total++
    if (!same([{ level: movement?.level, feet: movement?.speedBonus?.feet }, ...(movement?.speedBonusByLevel ?? [])], tableSteps))
      failures.push(`monk-unarmored-movement: speed bonus steps ${JSON.stringify(movement?.speedBonusByLevel)}, the Monk table gives ${JSON.stringify(tableSteps)}`)
    // Overchannel, read by hand on page 82: no damage the first time, 2d12 per slot level the second, and 1d12 more
    // per slot level each time after. The data's two dice must give these per-use totals.
    const self = featureById.get("evoker-overchannel")?.selfDamage
    const byUse: Record<number, string> = { 2: "2d12", 3: "3d12", 4: "4d12" }
    for (const [use, dice] of Object.entries(byUse)) {
      total++
      const count = self ? Number(self.dicePerSlotLevel.split("d")[0]) + (Number(use) - 2) * Number(self.increaseAfterSecondUse.split("d")[0]) : 0
      if (!self || `${count}d12` !== dice || self.from !== "second-use")
        failures.push(`evoker-overchannel: use ${use} deals ${self ? `${count}d12` : "nothing"} per slot level, the text gives ${dice}`)
    }
    for (const quote of [
      "The first time you do so, you suffer no adverse effect.",
      "you take 2d12 Necrotic damage for each level of the spell slot",
      "the Necrotic damage per spell level increases by 1d12",
    ]) {
      total++
      if (!squash(featureText.get("evoker-overchannel") ?? "").includes(squash(quote))) failures.push(`evoker-overchannel: the hand reading quotes “${quote}”, which the feature does not print`)
    }
    report.check(
      category,
      "every typed mechanic of every feature and option is stated in its own text, and every standard statement of uses, recharge, saves, dice, damage types, resistances, immunities and actions is typed",
      total,
      failures
    )
  }

  // Paragraphs: every paragraph start the official block prints is a paragraph start in the data, and the reverse.
  {
    const failures: string[] = []
    let total = 0
    // A paragraph starts at a tab or a bullet. The PDF text marks no other break, so the rest are read by hand: the
    // lines below each open a paragraph (pages 29, 43, 50 and 66).
    const unmarked = [
      "Each time the Rage is extended, it lasts until the end",
      "Temporary Hit Points. When you assume a Wild",
      "Game Statistics. Your game statistics are replaced",
      "No Spellcasting. You can’t cast spells, but shape-",
      "Objects. Your ability to handle objects is deter-",
      "You gain the following benefits while you are un-",
      "You can use this feature twice, and you regain all",
    ]
    /** The squashed openings of the paragraphs a run of official lines prints. */
    const starts = (lines: Line[]) => lines.filter((line) => line.raw.startsWith("\t") || line.raw.startsWith("•") || unmarked.includes(line.text)).map((line) => squash(line.text).slice(0, 24))
    const opening = (paragraph: string) => squash(paragraph).slice(0, 24)
    const compare = (where: string, lines: Line[], paragraphs: string[], firsts: string[]) => {
      total++
      const official = starts(lines).filter((start) => !firsts.some((first) => start.startsWith(first.slice(0, start.length)) && first.startsWith(start.slice(0, first.length))))
      const data = paragraphs.map(opening)
      for (const start of official)
        if (!data.some((open) => open.startsWith(start.slice(0, open.length)) && start.startsWith(open.slice(0, start.length))))
          failures.push(`${where}: the official paragraph “${start}…” does not start a paragraph in the data`)
      for (const open of data)
        if (!official.some((start) => open.startsWith(start.slice(0, open.length)) && start.startsWith(open.slice(0, start.length))))
          failures.push(`${where}: the data paragraph “${open}…” is not an official paragraph start`)
    }
    for (const owner of owners) {
      const table = tables.get(owner.id)
      const outside = (lines: Line[]) =>
        lines.filter((line) => {
          const index = owner.lines.indexOf(line)
          return !(table && index >= table.start && index < table.end) && !innerRanges.some(([start, end, id]) => id === owner.id && index >= start && index < end)
        })
      const sidebarLines = new Set<Line>()
      for (const sidebar of classes.find((entry) => entry.id === owner.id)?.sidebars ?? []) {
        const start = owner.lines.findIndex((line) => line.text === sidebar.name)
        let end = start + 1
        while (end < owner.lines.length && squash(join(owner.lines.slice(start + 1, end))) !== squash(sidebar.text)) end++
        for (const line of owner.lines.slice(start, end)) sidebarLines.add(line)
        total++
        if (owner.lines[start]?.page !== sidebar.page) failures.push(`${owner.id} sidebar ${sidebar.name}: page ${sidebar.page}, its title is on ${owner.lines[start]?.page}`)
        compare(`${owner.id} sidebar ${sidebar.name}`, owner.lines.slice(start + 1, end), sidebar.text.split("\n").slice(1), [opening(sidebar.text)])
      }
      for (const feature of features.filter((item) => item.class === owner.id)) {
        const titled = feature.id === "sorcerer-metamagic" || feature.id === "warlock-eldritch-invocations"
        const labels = titled
          ? []
          : (feature.options ?? []).map((option) => opening(`${option.name}${option.spend?.resource === "sneak-attack-dice" ? ` (Cost: ${option.spend.amount}d6)` : ""} ${option.description}`))
        const optionParagraphs = titled ? [] : (feature.options ?? []).flatMap((option) => option.description.split("\n").slice(1))
        const blocks = [{ level: feature.level, text: feature.description }, ...(feature.laterText ?? []).map((later) => ({ level: later.level, text: later.description }))]
        for (const block of blocks) {
          const lines = outside(blockLines.get(`${feature.id}@${block.level}`) ?? []).filter((line) => !sidebarLines.has(line))
          const paragraphs = block.text.split("\n")
          compare(`${feature.id}@${block.level}`, lines, [...paragraphs.slice(1), ...(block.level === feature.level ? optionParagraphs : [])], [opening(paragraphs[0]), ...labels])
        }
        if (!titled) continue
        const names = (feature.options ?? []).map((option) => option.name)
        for (const option of feature.options ?? []) {
          let start = owner.lines.findIndex((line) => line.text === option.name) + 1
          while (/^(Cost|Prerequisite): /.test(owner.lines[start].text) || option.prerequisite?.text.endsWith(owner.lines[start].text)) start++
          let end = start
          while (end < owner.lines.length && !names.includes(owner.lines[end].text) && owner.lines[end].text !== `${owner.name} Spell List`) end++
          const paragraphs = option.description.split("\n")
          compare(`${feature.id}/${option.id}`, owner.lines.slice(start, end), paragraphs.slice(1), [opening(paragraphs[0])])
        }
      }
      const subclass = subclasses.find((item) => item.class === owner.id)
      if (subclass) {
        const end = owner.lines.findIndex((line, index) => index > owner.heading && /^Level \d+: /.test(line.text))
        const paragraphs = subclass.description.split("\n")
        compare(subclass.id, owner.lines.slice(owner.heading + 3, end), paragraphs.slice(1), [opening(paragraphs[0])])
      }
    }
    report.check(category, "every official paragraph start in each feature, option, later text, sidebar and subclass description is a paragraph start in the data, and the reverse", total, failures)
  }

  // Prose: data sentences are official, and every official prose line is in the data.
  {
    const failures: string[] = []
    let total = 0
    const texts: { owner: string; where: string; text: string; page?: number }[] = []
    for (const feature of features) {
      texts.push({ owner: feature.class, where: feature.id, text: feature.description })
      for (const option of feature.options ?? []) texts.push({ owner: feature.class, where: `${feature.id}/${option.id}`, text: option.description })
      for (const later of feature.laterText ?? []) texts.push({ owner: feature.class, where: `${feature.id}@${later.level}`, text: later.description })
    }
    for (const entry of classes) for (const sidebar of entry.sidebars ?? []) texts.push({ owner: entry.id, where: `${entry.id} sidebar ${sidebar.name}`, text: `${sidebar.name}. ${sidebar.text}` })
    for (const subclass of subclasses) texts.push({ owner: subclass.class, where: subclass.id, text: subclass.description })
    // The class text without its tables, so a sentence the PDF breaks around a table still reads whole.
    const clean = new Map<string, string>()
    for (const owner of owners) {
      const table = tables.get(owner.id)
      const ranges = [...(table ? [[table.start, table.end, owner.id] as [number, number, string]] : []), ...innerRanges, ...spellRanges].filter(([, , id]) => id === owner.id)
      clean.set(owner.id, squash(join(owner.lines.filter((_, index) => !ranges.some(([start, end]) => index >= start && index < end)))))
    }
    for (const item of texts) {
      total++
      const missing = missingSentences(item.text.replace(/^• /gm, "")).filter((sentence) => !clean.get(item.owner)?.includes(squash(sentence)))
      for (const sentence of missing) failures.push(`${item.where}: not official: "${sentence}"`)
    }
    // Each feature's sentences sit under its own heading, so no text is filed under the wrong feature.
    const sentences = (text: string) =>
      text
        .replace(/([.!?])\s+/g, "$1\n")
        .split(/\n+/)
        .map(squash)
        .filter((sentence) => sentence.length >= 12)
    for (const owner of owners) {
      const table = tables.get(owner.id)
      const ranges = [...(table ? [[table.start, table.end, owner.id] as [number, number, string]] : []), ...innerRanges, ...spellRanges].filter(([, , id]) => id === owner.id)
      const cleanText = (lines: Line[]) => squash(join(lines.filter((line) => !ranges.some(([start, end]) => owner.lines.indexOf(line) >= start && owner.lines.indexOf(line) < end))))
      const optionsStart = owner.lines.findIndex((line) => /^(Metamagic|Eldritch Invocation) Options$/.test(line.text))
      const optionsText =
        optionsStart >= 0
          ? cleanText(
              owner.lines.slice(
                optionsStart,
                owner.lines.findIndex((line) => line.text === `${owner.name} Spell List`)
              )
            )
          : ""
      for (const feature of features.filter((item) => item.class === owner.id)) {
        const own = (level: number) => cleanText(blockLines.get(`${feature.id}@${level}`) ?? [])
        check(feature.id, feature.description, own(feature.level))
        for (const later of feature.laterText ?? []) check(`${feature.id}@${later.level}`, later.description, own(later.level))
        const titled = feature.id === "sorcerer-metamagic" || feature.id === "warlock-eldritch-invocations"
        for (const option of feature.options ?? []) check(`${feature.id}/${option.id}`, option.description, titled ? optionsText : own(feature.level))
      }
      const subclass = subclasses.find((item) => item.class === owner.id)
      const firstSubclassHeading = owner.lines.findIndex((line, index) => index > owner.heading && /^Level \d+: /.test(line.text))
      if (subclass) check(subclass.id, subclass.description, cleanText(owner.lines.slice(owner.heading, firstSubclassHeading)))
      function check(where: string, text: string, block: string) {
        total++
        for (const sentence of sentences(text)) if (!block.includes(sentence)) failures.push(`${where}: a sentence is not in its own section: "${sentence.slice(0, 60)}"`)
      }
    }
    // Option names and printed costs are prose too where the text sets them as run-in labels.
    for (const feature of features)
      for (const option of feature.options ?? [])
        texts.push({ owner: feature.class, where: "", text: `${option.name}${option.spend?.resource === "sneak-attack-dice" ? ` (Cost: ${option.spend.amount}d6)` : ""}. ${option.description}` })
    // Every official line in a class section must be accounted for: parsed as a field or table, or held in prose.
    for (const owner of owners) {
      const prose = squash(
        texts
          .filter((item) => item.owner === owner.id)
          .map((item) => item.text)
          .join(" ")
      )
      const table = tables.get(owner.id)
      const firstHeading = owner.lines.findIndex((line) => /^Level \d+: /.test(line.text))
      const covered = (index: number) =>
        index < firstHeading || // core traits and Becoming, compared field by field above
        (table && index >= table.start && index < table.end) ||
        innerRanges.some(([start, end, id]) => id === owner.id && index >= start && index < end) ||
        spellRanges.some(([start, end, id]) => id === owner.id && index >= start && index < end)
      const subclass = subclasses.find((item) => item.class === owner.id)
      for (const [index, line] of owner.lines.entries()) {
        if (covered(index)) continue
        const text = line.text
        if (/^Level \d+: /.test(text)) continue
        if (index >= owner.heading && index <= owner.heading + 3 && subclass && squash(`${owner.name} Subclass: ${subclass.name} ${subclass.tagline}`).includes(squash(text))) continue
        if (/^(Cost|Prerequisite): /.test(text)) continue
        // The options sections open with a line on their order, "presented in alphabetical order", a reading aid.
        const optionsStart = owner.lines.findIndex((item) => /^(Metamagic|Eldritch Invocation) Options$/.test(item.text))
        const firstTitle = owner.lines.findIndex((_, at) => at > optionsStart && /^(Cost|Prerequisite): /.test(owner.lines[at + 1]?.text ?? ""))
        if (optionsStart >= 0 && index >= optionsStart && index < firstTitle) continue
        const optionTitle = features.some((feature) => feature.class === owner.id && feature.options?.some((option) => option.name === text || option.prerequisite?.text.endsWith(text)))
        if (optionTitle) continue
        total++
        if (!prose.includes(squash(text).replace(/^(.{0,3})$/, "$1"))) failures.push(`${owner.id} page ${line.page}: official line not in the data: "${text}"`)
      }
    }
    report.check(category, "every description, option, later text, sidebar and subclass description is official wording, and every official prose line of the chapter is in the data", total, failures)
  }

  // References inside the data, and to other categories where their data exists.
  {
    const failures: string[] = []
    let total = 0
    for (const entry of classes) {
      for (const row of entry.levels) {
        for (const id of row.features ?? []) {
          total++
          if (featureById.get(id)?.class !== entry.id) failures.push(`${entry.id} level ${row.level}: ${id} does not resolve to a ${entry.id} feature`)
        }
      }
      for (const id of entry.subclasses) {
        total++
        if (subclassById.get(id)?.class !== entry.id) failures.push(`${entry.id}: subclass ${id} does not resolve`)
      }
      if (entry.spellcasting) {
        total++
        if (featureById.get(entry.spellcasting.feature)?.class !== entry.id) failures.push(`${entry.id}: spellcasting feature ${entry.spellcasting.feature} does not resolve`)
      }
    }
    for (const feature of features) {
      total++
      if (!classes.some((entry) => entry.id === feature.class)) failures.push(`${feature.id}: class ${feature.class} does not resolve`)
      if (feature.subclass && subclassById.get(feature.subclass)?.class !== feature.class) failures.push(`${feature.id}: subclass ${feature.subclass} does not resolve`)
    }

    const resolve = (name: string, ids: Set<string>, where: string, id: string) => {
      total++
      if (!ids.has(id)) failures.push(`${where}: ${id} is not in data/${name}.json`)
    }
    if (existsSync(dataPath("spells"))) {
      const spells = new Set(readData<Spell>("spells").map((spell) => spell.id))
      for (const entry of classes) for (const group of entry.spellcasting?.spellList ?? []) for (const id of group.spells) resolve("spells", spells, `${entry.id} spell list`, id)
      for (const subclass of subclasses) for (const group of subclass.alwaysPrepared ?? []) for (const id of group.spells) resolve("spells", spells, `${subclass.id} always prepared`, id)
      for (const feature of features) {
        for (const item of [feature, ...(feature.options ?? [])] as (ClassFeature | FeatureOption)[]) {
          for (const id of [...(item.alwaysPrepared ?? []), ...(item.freeCast ?? []).map((cast) => cast.spell)]) resolve("spells", spells, feature.id, id)
        }
      }
    }
    if (existsSync(dataPath("feats"))) {
      const feats = new Set(readData<Feat>("feats").map((feat) => feat.id))
      for (const feature of features) for (const id of [feature.feat?.id, feature.feat?.recommended].filter(Boolean) as string[]) resolve("feats", feats, feature.id, id)
    }
    const waived: string[] = []
    if (existsSync(dataPath("equipment"))) {
      const gear = new Map(readData<Gear>("equipment").map((item) => [item.id, item] as [string, Gear]))
      // The SRD describes the Wizard’s spellbook in the Spellcasting feature (page 78), not in “Equipment”.
      const item = (where: string, id: string) => {
        total++
        if (id === "spellbook") waived.push(`${where} spellbook: the SRD describes it in the Wizard’s Spellcasting feature (page 78), not in “Equipment”, so it has no equipment entry`)
        else if (!gear.has(id)) failures.push(`${where}: ${id} is not in data/equipment.json`)
      }
      // A choice resolves to a group with members or a tool with variants.
      const choice = (where: string, id: string) => {
        total++
        const entry = gear.get(id)
        if (!membersOf(entry)?.length && !variantsOf(entry)?.length) failures.push(`${where}: ${id} is not a group or a tool with variants in data/equipment.json`)
      }
      for (const entry of classes) {
        for (const option of entry.startingEquipment) {
          for (const line of option.items ?? []) {
            if (line.item) item(`${entry.id} starting equipment ${option.option}`, line.item)
            for (const from of line.chooseFrom ?? []) choice(`${entry.id} starting equipment ${option.option}`, from)
          }
        }
        for (const tool of [...(entry.tools ?? []), ...(entry.multiclass.tools ?? [])]) {
          if ("tool" in tool) item(`${entry.id} tools`, tool.tool)
          else for (const id of tool.from) choice(`${entry.id} tools`, id)
        }
        for (const focus of entry.spellcasting?.focus ?? []) item(`${entry.id} focus`, focus)
      }
    }
    report.check(category, "references resolve: features, subclasses, and spells, feats and equipment where that data exists", total, failures, waived)
  }

  // Class spell lists against the spells data, where it exists.
  if (existsSync(dataPath("spells"))) {
    const failures: string[] = []
    let total = 0
    const spells = readData<Spell>("spells")
    for (const entry of classes) {
      if (!entry.spellcasting) continue
      for (const group of entry.spellcasting.spellList) {
        for (const id of group.spells) {
          total++
          const spell = spells.find((item) => item.id === id)
          if (spell && spell.level !== group.level) failures.push(`${entry.id}: ${id} is level ${group.level} in the class list, ${spell.level} in spells`)
          if (spell && !spell.classes?.includes(entry.id)) failures.push(`${entry.id}: ${id} is on the class list, but spells does not list ${entry.id}`)
        }
      }
      for (const spell of spells.filter((item) => item.classes?.includes(entry.id))) {
        total++
        if (!entry.spellcasting.spellList.some((group) => group.spells.includes(spell.id))) failures.push(`${entry.id}: spells lists ${spell.id} for ${entry.id}, the class list does not`)
      }
    }
    report.check(category, "class spell lists agree with the classes field of the spells data", total, failures)
  }

  // Open5e as a second opinion. A disagreement the official text settles in the data's favor is noted, not failed.
  const open5eCheck = "Open5e agrees on hit dice, saves, caster type, every table column and feature levels, or the official text settles it"
  if (!hasUpstream("open5e")) report.skip(category, open5eCheck)
  else {
    const failures: string[] = []
    const waived: string[] = []
    let total = 0
    const characterClasses = readOpen5e<{ hit_dice: string | null; saving_throws: string[]; caster_type: string }>("CharacterClass")
    for (const entry of classes) {
      const row = characterClasses.find((item) => item.pk === `srd-2024_${entry.id}`)?.fields
      if (!row) continue
      total += 3
      const official = officialTraits.get(entry.id)
      const settle = (field: string, theirs: unknown, ours: unknown, printed: unknown) => {
        if (same(theirs, ours)) return
        if (same(ours, printed)) waived.push(`${entry.id} ${field}: Open5e reads ${JSON.stringify(theirs)}; the official text and the data agree on ${JSON.stringify(ours)}`)
        else failures.push(`${entry.id} ${field}: Open5e ${JSON.stringify(theirs)}, data ${JSON.stringify(ours)}`)
      }
      settle("hit die", row.hit_dice, `D${entry.hitDie}`, `D${official?.hitDie}`)
      settle("saving throws", sorted(row.saving_throws), sorted(entry.savingThrows), sorted(official?.savingThrows ?? []))
      const caster = !entry.spellcasting ? "NONE" : entry.id === "warlock" ? "PACT" : entry.spellcasting.multiclassLevels === "all" ? "FULL" : "HALF"
      if (row.caster_type !== caster) failures.push(`${entry.id}: Open5e caster type ${row.caster_type}, data ${caster}`)
    }
    const suffix: Record<string, string> = {
      "proficiency-bonus": "proficiencyBonus",
      rages: "rages",
      "rage-damage": "rageDamage",
      "weapon-mastery-count": "weaponMastery",
      "bardic-die": "bardicDie",
      cantrips: "cantrips",
      "prepared-spells": "preparedSpells",
      "channel-divinity-uses": "channelDivinity",
      "wild-shape-uses": "wildShape",
      "second-wind-uses": "secondWind",
      "focus-points": "focusPoints",
      "martial-arts-dice": "martialArts",
      "unarmored-movement": "unarmoredMovement",
      "favored-enemy-uses": "favoredEnemy",
      "sneak-attack-column-data": "sneakAttack",
      "sorcery-points": "sorceryPoints",
      "eldritch-invocation-count": "invocations",
      "slot-level": "slotLevel",
      "spell-slots": "pactSlots",
    }
    const ordinals = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"]
    for (const item of readOpen5e<{ column_value: string | null; level: number; parent: string; detail: string | null }>("ClassFeatureItem")) {
      const { column_value: value, level, parent } = item.fields
      const match = parent.match(/^srd-2024_([a-z]+)_(.+)$/)
      const entry = match && classes.find((candidate) => candidate.id === match[1])
      if (!entry || !match) continue
      if (value === null) {
        // A feature's level: compare with the data feature of that name.
        const feature = featureById.get(`${entry.id}-${match[2]}`)
        if (!feature || feature.subclass) continue
        total++
        if (!feature.levels.includes(level)) {
          const official = tables.get(entry.id)?.rows[level - 1]?.features.some((name) => toId(name.replace(/ \(.+\)$/, "")) === match[2])
          if (official) failures.push(`${feature.id}: Open5e and the official table list level ${level}, the data does not`)
          else waived.push(`${feature.id}: Open5e lists level ${level}; the official table does not, and the data follows it`)
        }
        continue
      }
      const slot = match[2].match(/^slots-(\d(?:st|nd|rd|th))$/)
      const key = slot ? `slot${ordinals.indexOf(slot[1]) + 1}` : suffix[match[2]]
      if (!key) continue
      const row = entry.levels[level - 1] as Record<string, any> | undefined
      if (!row) continue
      total++
      const data = slot ? row.spellSlots?.[ordinals.indexOf(slot[1])] : row[key]
      const theirs = cellValue(value.trim().replace(/^(\d)(?:st|nd|rd|th)$/, "$1"))
      if (!same(slot ? (theirs ?? 0) : theirs, data)) {
        const tableRow = tables.get(entry.id)?.rows[level - 1]
        const index = columns[entry.id].indexOf(key)
        const official = key === "proficiencyBonus" ? tableRow?.pb : index >= 0 && tableRow ? cellValue(tableRow.cells[index]) : undefined
        if (same(slot ? (official ?? 0) : official, data)) waived.push(`${entry.id} level ${level} ${key}: Open5e reads ${value}; the official table and the data agree on ${data}`)
        else failures.push(`${entry.id} level ${level} ${key}: Open5e ${value}, data ${data}`)
      }
    }
    report.crossCheck(category, open5eCheck, total, failures, waived)
  }
}
