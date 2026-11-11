import { existsSync } from "node:fs"
import type { Class, ClassFeature, ClassLevel, FeatureOption, Subclass } from "../../src/schema/classes"
import { classFeatureSchema, classSchema, subclassSchema } from "../../src/schema/classes"
import type { Equipment } from "../../src/schema/equipment"
import type { Feat } from "../../src/schema/origins"
import type { Spell } from "../../src/schema/spells"
import { dataPath, readData, toId } from "../lib/data"
import { missingSentences, pages, squash } from "../lib/official"
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
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sorted = <T>(list: T[]) => [...list].sort()

/** Join PDF lines: a word broken at a line end ("Na-" "ture") closes up; "shape- " keeps its hyphen; a dash joins tight. */
function join(lines: (Line | string)[]): string {
  let out = ""
  let hard = false
  for (const entry of lines) {
    const raw = typeof entry === "string" ? entry : entry.raw
    const text = raw
      .replace(/\u00ad/g, "")
      .replace(/^[•\t ]+/, "")
      .trim()
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
      const text = raw.replace(/\u00ad/g, "").trim()
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

/** The phrases that state each condition a passive benefit holds under. */
const whilePhrase: Record<string, RegExp> = {
  raging: /while your Rage is active|While active, your Rage/,
  "no-heavy-armor": /while you aren’t wearing Heavy armor/,
  "in-aura-of-protection": /while in your Aura of Protection/,
}

/**
 * Mechanics against the text, both ways. Every typed value must be stated in `own`, the entry's own text. And where
 * `own` states uses, a recharge, a save, dice, damage types, resistances, immunities, an action or a condition in
 * the standard wording, the entry must hold it, and a printed list must be held whole.
 */
function mechanicsFailures(entry: Record<string, any>, own: string, related: string, classSkills: string[], name = ""): string[] {
  const failures: string[] = []
  const need = (ok: boolean, field: string) => {
    if (!ok) failures.push(field)
  }
  const has = (pattern: RegExp | string, text = own) => (typeof pattern === "string" ? text.includes(pattern) : pattern.test(text))

  // Activation: every action kind the text names for using it.
  const kinds: [string, RegExp][] = [
    ["bonus-action", /\b(?:[Aa]s|use) a Bonus Action/],
    ["reaction", /take a Reaction/],
    ["magic-action", /[Aa]s a Magic action/],
    ["no-action", /no action required/],
  ]
  const named = kinds.filter(([, pattern]) => has(pattern)).map(([kind]) => kind)
  need(same(sorted(entry.activation ?? []), sorted(named)), `activation ${JSON.stringify(entry.activation)}, the text names ${JSON.stringify(named)}`)

  // A later feature that changes this one's recharge, as Font of Inspiration does for Bardic Inspiration.
  const changed = name ? related.match(new RegExp(`Level (\\d+): [^:]*? You now regain all your expended uses of ${name} when you finish a Short or Long Rest`)) : null
  const recharges = changed ? [{ level: Number(changed[1]), recharge: "short-or-long-rest" }] : undefined
  need(same(entry.uses?.rechargeByLevel, recharges), `rechargeByLevel ${JSON.stringify(entry.uses?.rechargeByLevel)}, the text states ${JSON.stringify(recharges)}`)

  // Uses: the count, what restores it, and the Short Rest regain.
  const uses = entry.uses
  const statesUses =
    /You can (?:use (?:this feature|this class’s Channel Divinity|Wild Shape|this action)|enter your Rage|confer a Bardic Inspiration die|cast it) (?:twice|the number of times|a number of times)|(?:Once you use this feature, you can’t (?:use it|do so)|can’t use this feature) again until you finish|you regain all expended uses of this ability|Focus Points column|cast the spell once without expending|cast (?:it|the spell|Water Breathing) once without|cast each of them once|must finish a Long Rest before you can cast it|can’t do so in this way again until|arcanum spell once without/
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

  const resources: Record<string, (amount: number) => RegExp> = {
    "focus-points": (amount) => new RegExp(`${amount} Focus Points?`),
    "sorcery-points": (amount) => new RegExp(`${amount} Sorcery Points?`),
    "sneak-attack-dice": (amount) => new RegExp(`Cost: ${amount}d6`),
    "channel-divinity": (amount) => new RegExp(`${amount === 1 ? "(?:a|one)" : "-"} use of (?:your |this class’s )?Channel Divinity`),
    "wild-shape": (amount) => new RegExp(`${amount === 1 ? "(?:a|one)" : "-"} use of your Wild Shape`),
    "bardic-inspiration": (amount) => new RegExp(`${amount === 1 ? "(?:a|one)" : "-"} use of (?:your )?Bardic Inspiration`),
    "second-wind": (amount) => new RegExp(`${amount === 1 ? "(?:a|one)" : "-"} use of your Second Wind`),
    rage: (amount) => new RegExp(`${amount === 1 ? "(?:a|one)" : "-"} use of your Rage`),
  }
  // The main cost, both ways: a sentence that opens with the use, not a condition, an alternative or a restoration.
  // A printed "Cost:" label settles it; otherwise the first such sentence does.
  const label = own.match(/Cost: (\d+)(d6| Sorcery Points?)/)
  const costs = label
    ? [`${label[2] === "d6" ? "sneak-attack-dice" : "sorcery-points"}:${label[1]}`]
    : own
        .replace(/([.!?]) /g, "$1\n")
        .split("\n")
        .filter((sentence) => !/^(?:If|Alternatively|Additionally|In addition|Whenever|Once)\b/.test(sentence) && !/to restore your use|to redirect|to reroll|Points? to use /.test(sentence))
        .flatMap((sentence) => {
          const points = sentence.match(/expend (\d+) (Focus|Sorcery) Points?/)
          const use = sentence.match(/expend (?:a|one) use of (?:your |this class’s )?(Channel Divinity|Wild Shape|Bardic Inspiration|Second Wind|Rage)\b/)
          if (points) return [`${toId(points[2])}-points:${points[1]}`]
          if (use) return [`${toId(use[1])}:1`]
          return []
        })
  const spent = entry.spend ? `${entry.spend.resource}:${entry.spend.amount}` : undefined
  need(same(spent, costs[0]), `spend ${spent}, the text spends ${costs[0]}`)
  if (entry.spend) {
    need(has(resources[entry.spend.resource](entry.spend.amount)), `spend ${entry.spend.amount} ${entry.spend.resource}`)
    need(Boolean(entry.spend.keptOnFailure) === has(/isn’t expended/), "spend keptOnFailure")
  }

  // Dice, both ways: every roll the text states in the standard wording is held.
  const held = [
    entry.diceFromColumn ? "1d6" : undefined,
    entry.dice,
    entry.dicePerSlotLevel,
    entry.selfDamage?.dicePerSlotLevel,
    ...(entry.diceByLevel ?? []).map((step: { dice: string }) => step.dice),
  ].filter(Boolean)
  const stated = [...own.matchAll(/(?:extra|[Rr]oll|take|takes|taking|equal to|equals|add|increases to) (\d+d\d+)\b/g)].map((match) => match[1])
  for (const dice of stated) need(held.includes(dice), `the text rolls ${dice}, the data does not hold it`)
  if (entry.dice) need(has(entry.dice), `dice ${entry.dice}`)
  const perSlot = own.match(/another (\d+d\d+) per level of the spell slot/)?.[1]
  need(entry.dicePerSlotLevel === perSlot, `dicePerSlotLevel ${entry.dicePerSlotLevel}, the text adds ${perSlot} per slot level`)
  need(Boolean(entry.diceFromColumn) === has(/roll 1d6 in place of the normal damage|deal an extra 1d6 damage/), `diceFromColumn ${entry.diceFromColumn}`)
  if (entry.diceFromColumn) need(has(`${headings[entry.diceFromColumn]} column`), `diceFromColumn ${entry.diceFromColumn}`)
  // Dice by level, both ways: "Cleric levels 7 (2d8), 13 (3d8)" in its own text, or a later feature that raises it.
  const steps = [...own.matchAll(/(\d+) \((\d+d\d+)\)/g)].map((match) => ({ level: Number(match[1]), dice: match[2] }))
  const raised = name ? related.match(new RegExp(`Level (\\d+): [^:]*? The extra damage of your ${name} increases to (\\d+d\\d+)`)) : null
  if (!steps.length && raised) steps.push({ level: Number(raised[1]), dice: raised[2] })
  need(same(entry.diceByLevel, steps.length ? steps : undefined), `diceByLevel ${JSON.stringify(entry.diceByLevel)}, the text states ${JSON.stringify(steps)}`)
  const adds: string[] = []
  const after = own.match(/\d+d\d+ (?:plus your|and add your) ([^.]+?)(?:\.|,| \(| to )/)?.[1] ?? ""
  for (const [ability, id] of Object.entries(abilityByName)) if (after.includes(`${ability} modifier`)) adds.push(id)
  if (/level/.test(after)) adds.push("class-level")
  need(same(sorted(entry.rollAdds ?? []), sorted(adds)), `rollAdds ${JSON.stringify(entry.rollAdds)}, the text adds ${JSON.stringify(adds)}`)

  // Damage types, both ways: each printed list of types dealt is held whole.
  const dealt = [
    ...[...own.matchAll(new RegExp(`(?:\\d+d\\d+|take|takes|taking|deal|choice of|it deal) (${typeList}) damage`, "g"))].flatMap((match) => listOf(match[1])),
    // A list to choose a type from: "Choose one of those types: Acid, Cold, Fire, Lightning, or Poison."
    ...listOf(own.match(new RegExp(`Choose one of those types: (${typeList})`))?.[1] ?? ""),
  ]
  const typed = [...(entry.damageTypes ?? []), ...(entry.selfDamage ? [entry.selfDamage.damageType] : [])]
  for (const type of new Set(dealt)) need(typed.includes(type), `the text deals ${type} damage, the data does not hold it`)
  for (const type of typed) need(has(capital(type)), `damage type ${type}`)
  const spared = (own.match(/if it isn’t an? (\w+)/)?.[1] ?? "").toLowerCase()
  need(same(entry.damageNotTo ?? [], spared ? [spared] : []), `damageNotTo ${JSON.stringify(entry.damageNotTo)}, the text spares ${spared}`)
  if (entry.selfDamage) {
    const { dicePerSlotLevel, increasePerUse } = entry.selfDamage
    need(has(`take ${dicePerSlotLevel}`) && has(`for each level of the spell slot`) && has(`increases by ${increasePerUse}`) && has("The first time you do so, you suffer no adverse"), "selfDamage")
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
  const savesHeld = [entry.save?.ability, entry.selfSave?.ability].filter(Boolean)
  need(same([...new Set(saves)].sort(), sorted(savesHeld)), `saves ${JSON.stringify(savesHeld)}, the text has ${JSON.stringify([...new Set(saves)])}`)
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
  if (ranges.length === 1) expected.range = ranges[0]
  const area = own.match(/(\d+)-foot (Emanation|Cube)|(\d+)-foot-radius Sphere/)
  if (area) expected.area = area[3] ? { shape: "sphere", size: Number(area[3]) } : { shape: area[2].toLowerCase(), size: Number(area[1]) }
  const attacks = own.match(/attack (twice|three times|four times)[^.]*instead of once|confers (two) extra attacks rather than one/)
  if (attacks) expected.attacks = attacks[2] ? 3 : { twice: 2, "three times": 3, "four times": 4 }[attacks[1]]
  // A spell name: capitalized words, with the small words SRD spell names use ("Speak with Animals").
  const spell = "[A-Z][\\w’]*(?: (?:[A-Z][\\w’]*|with|of|the|from)\\b)*"
  const prepared = own.match(new RegExp(`always have the (${spell}(?: and ${spell})?) spells? prepared`))
  if (prepared) expected.alwaysPrepared = names(prepared[1])
  const free = [...own.matchAll(new RegExp(`cast (${spell}) (?:on yourself |once )?without (?:expending )?a spell slot`, "g"))].map((match) => toId(match[1]))
  if (/cast (?:it|the spell)\b[^.]*?without (?:expending )?a spell slot/.test(own)) {
    const named = own.match(new RegExp(`the (${spell}) spell\\b|cast (${spell})`))
    if (named) free.push(toId(named[1] ?? named[2]))
  }
  if (free.length) expected.freeCast = [...new Set(free)]
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
  if (expertise) expected.expertise = word[expertise[1] ?? expertise[2] ?? "one"]
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
  const critical = own.match(/Critical Hit on a roll of (19 or 20|18–20)/)
  if (critical) expected.criticalRange = critical[1] === "18–20" ? 18 : 19
  const sense = own.match(/(Blindsight|Truesight) with a range of (\d+) feet/)
  if (sense) expected.sense = { type: sense[1].toLowerCase(), range: Number(sense[2]) }
  const read = (field: string) => {
    const value = entry[field]
    if (field === "speedBonus") return value?.feet
    if (field === "skillProficiencies" && value?.from) return { ...value, from: sorted(value.from) }
    return value
  }
  for (const field of [
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
    "criticalRange",
    "sense",
  ])
    need(same(read(field), expected[field]), `${field} ${JSON.stringify(read(field))}, the text states ${JSON.stringify(expected[field])}`)

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
          for (const level of [feature.level, ...(feature.laterText ?? []).map((text) => text.level)]) {
            total++
            if (!headingsFound.some((heading) => `${owner}-${toId(heading.name)}` === feature.id && heading.level === level)) failures.push(`${feature.id} at level ${level} has no official heading`)
          }
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
      compare("feature", featureText.has(`${entry.id}-spellcasting`) ? `${entry.id}-spellcasting` : `${entry.id}-pact-magic`, data.feature)
      compare("ability", abilityByName[spellcasting.match(/(\w+) is (?:your|the) spellcasting ability for your \w+ spells/)?.[1] ?? ""], data.ability)
      const focus = spellcasting.match(/You can use (?:a |an )?(.+?) as a Spellcasting Focus for your/)?.[1] ?? ""
      compare(
        "focus",
        focus.split(/ or (?:your )?/).map((name) => toId(name)),
        data.focus
      )
      const restore = spellcasting.match(/You regain all expended (?:Pact Magic )?(?:spell )?slots when you finish an? (Short or Long|Long) Rest/)?.[1]
      compare("slotsRestore", restore === "Long" ? "long-rest" : restore ? "short-rest" : undefined, data.slotsRestore)
      compare("multiclassLevels", full.includes(entry.id) ? "all" : half.includes(entry.id) ? "half-round-up" : undefined, data.multiclassLevels)
      const changing = spellcasting.match(/Changing Your Prepared Spells\. (.+?\.)/)?.[1] ?? ""
      compare(
        "changePrepared",
        {
          when: /^Whenever you finish a Long Rest/.test(changing) ? "long-rest" : /^Whenever you gain a \w+ level/.test(changing) ? "level-up" : "?",
          ...(/replace one spell/.test(changing) ? { count: 1 } : {}),
        },
        data.changePrepared
      )
      const cantrip = spellcasting.match(/Whenever you (finish a Long Rest|gain a \w+ level), you can replace one of your cantrips/)?.[1]
      compare("changeCantrip", cantrip ? { when: cantrip.startsWith("finish") ? "long-rest" : "level-up", count: 1 } : undefined, data.changeCantrip)
      const ritual = featureText.get(`${entry.id}-ritual-adept`)
      compare("ritualFromSpellbook", ritual && /Ritual tag and the spell is in your spellbook/.test(ritual) ? true : undefined, data.ritualFromSpellbook)

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
        const cost = costed >= 0 ? owner.lines[costed].text.match(/\(Cost: (\d+)d6\)/) : at === titled ? owner.lines[at + 1]?.text.match(/^Cost: (\d+) Sorcery Points?$/) : null
        const official = cost ? { resource: costed >= 0 ? "sneak-attack-dice" : "sorcery-points", amount: Number(cost[1]) } : undefined
        total++
        // A printed cost must match. A cost only the prose states, such as Flurry of Blows, is read in the mechanics check.
        const printedOnly = option.spend?.resource === "sneak-attack-dice" || option.spend?.resource === "sorcery-points"
        if (official ? !same(official, option.spend) : printedOnly) failures.push(`${feature.id}/${option.id}: cost ${JSON.stringify(option.spend)}, official ${JSON.stringify(official)}`)
        if (at === titled) {
          const next = owner.lines[at + 1]?.text ?? ""
          const prerequisite = next.startsWith("Prerequisite: ")
            ? join([next.slice(14), ...owner.lines.slice(at + 2, at + 3).filter((line) => /^[A-Z][\w’]*(?: (?:[A-Z][\w’]*|a|an|of|the|via))*$/.test(line.text))])
            : undefined
          total++
          if (prerequisite !== option.prerequisite?.text)
            failures.push(`${feature.id}/${option.id}: prerequisite ${JSON.stringify(option.prerequisite?.text)}, official ${JSON.stringify(prerequisite)}`)
          if (prerequisite) {
            total++
            const level = prerequisite.match(/Level (\d+)\+/)?.[1]
            const invocation = prerequisite.match(/(Pact of the \w+|Thirsting Blade) Invocation/)?.[1]
            if (option.prerequisite?.level !== (level ? Number(level) : undefined) || option.prerequisite?.invocation !== (invocation ? toId(invocation) : undefined))
              failures.push(`${feature.id}/${option.id}: prerequisite fields ${JSON.stringify(option.prerequisite)}`)
            if (option.prerequisite?.invocation && !feature.options?.some((other) => other.id === option.prerequisite?.invocation))
              failures.push(`${feature.id}/${option.id}: prerequisite invocation does not resolve`)
          }
          total++
          const repeatable = squash(option.description).includes("repeatableyoucangainthisinvocationmorethanonce")
          if (repeatable !== Boolean(option.repeatable)) failures.push(`${feature.id}/${option.id}: repeatable ${option.repeatable}, official ${repeatable}`)
        }
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
      "damageNotTo",
      "diceByLevel",
      "damageTypes",
      "save",
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
      "criticalRange",
      "sense",
      "resistances",
      "conditionImmunities",
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
      for (const failure of mechanicsFailures(feature, body, related, skills, feature.name)) failures.push(`${feature.id}: ${failure} is not what its text says`)
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
        for (const failure of mechanicsFailures(option, text, `${text} ${own}`, skills)) failures.push(`${feature.id}/${option.id}: ${failure} is not what its text says`)
      }
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
    // Breaks the PDF text does not mark with a tab or bullet. On page 50 this sentence is its own paragraph.
    const unmarked = ["You gain the following benefits while you are un-"]
    const label = /^[A-Z][\w’]*(?: [A-Z][\w’]*)*\. [A-Z]/
    /** The squashed openings of the paragraphs a run of official lines prints. */
    const starts = (lines: Line[]) => {
      const out: string[] = []
      let bullet = false
      for (const [index, line] of lines.entries()) {
        const previous = lines[index - 1]?.text ?? ""
        const opens =
          line.raw.startsWith("\t") ||
          line.raw.startsWith("•") ||
          unmarked.includes(line.text) ||
          (/[.:]$/.test(previous) && label.test(line.text)) ||
          (bullet && /\.$/.test(previous) && /^[A-Z]/.test(line.text))
        if (opens) out.push(squash(line.text).slice(0, 24))
        if (line.raw.startsWith("•")) bullet = true
        else if (opens) bullet = false
      }
      return out
    }
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
          for (const id of [...(item.alwaysPrepared ?? []), ...(item.freeCast ?? [])]) resolve("spells", spells, feature.id, id)
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
