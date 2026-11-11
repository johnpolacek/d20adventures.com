import type { Cost } from "../../src/schema/common"
import { coinSchema, equipmentRuleSchema, equipmentSchema, poisonSchema, weaponMasterySchema, weaponPropertySchema } from "../../src/schema/equipment"
import { applyOverrides, toId, writeData } from "../lib/data"
import { pages } from "../lib/official"
import { readBase } from "../lib/sources"
import { equipmentOverrides } from "../overrides/equipment"

type Row = Record<string, unknown>
type Line = { text: string; page: number }

// Reading the official text ------------------------------------------------------------------------------------

/** The lines of a page range, each with its page. The PDF's tab-indented lines start a new paragraph. */
function linesOf(from: number, to = from): Line[] {
  const out: Line[] = []
  for (let page = from; page <= to; page++) for (const text of pages[page - 1].split("\n")) out.push({ text: text.replace(/\u00a0/g, " "), page })
  return out
}

/** Join PDF lines into paragraphs: hyphenated line ends are mended, real hyphens ("15-foot") kept, one newline between paragraphs. */
function prose(lines: Line[]): string {
  const paragraphs: string[] = []
  for (const { text } of lines) {
    const line = text.replace(/\t/g, " ").trim()
    if (!line) continue
    if (!paragraphs.length || text.startsWith("\t")) {
      paragraphs.push(line)
      continue
    }
    const last = paragraphs[paragraphs.length - 1]
    if (last.endsWith("-")) paragraphs[paragraphs.length - 1] = /(\d|foot)-$/.test(last) ? last + line : last.slice(0, -1) + line
    else paragraphs[paragraphs.length - 1] = `${last} ${line}`
  }
  // The PDF text gives the glass bottle's 1½ pints as "11/2". The SRD prints a vulgar fraction.
  return paragraphs
    .join("\n")
    .replace(/'/g, "’")
    .replace(/\b11\/2 pints/g, "1½ pints")
}

const costOf = (text: string): Cost => {
  const match = /^([\d,]+) ([CSGEP])P$/.exec(text.trim())
  if (!match) throw new Error(`Not a cost: ${text}`)
  return { amount: Number(match[1].replace(/,/g, "")), unit: `${match[2].toLowerCase()}p` as Cost["unit"] }
}

/** Pounds, with the PDF's fractions: "1/4 lb.", "58½ lb.". A dash or "Varies" is no weight. */
function weightOf(text: string): number | undefined {
  const match = /^(\d+)?\s*(½|\d+\/\d+)?\s*lb\./.exec(text.trim())
  if (!match) return undefined
  let value = match[1] ? Number(match[1]) : 0
  if (match[2] === "½") value += 0.5
  else if (match[2]) value += Number(match[2].split("/")[0]) / Number(match[2].split("/")[1])
  return value
}

const titleCase = (text: string) => text.replace(/(^|[ -])([a-z])/g, (_, lead, letter) => lead + letter.toUpperCase()).replace(/ Of /g, " of ")

const abilityOf: Record<string, string> = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" }

const std = { base: 8, ability: "dex", proficiencyBonus: true } as const
const dexSave = { ability: "dex", dc: std } as const
const fixedDexSave = (dc: number) => ({ ability: "dex", dc: { fixed: dc } })
const piercing1 = { fixed: 1, type: "piercing" } as const
const fire5 = { fixed: 5, type: "fire" } as const
const unboundable = ["grappled", "incapacitated", "restrained"] as const
const extremeCold = "saving throws against extreme cold"

// Weapons and armor --------------------------------------------------------------------------------------------

/** Split a Properties cell at commas outside parentheses. */
const splitTop = (text: string) =>
  text
    .split(/,\s*(?![^()]*\))/)
    .map((part) => part.trim())
    .filter(Boolean)

function weapons(): Row[] {
  const lines = linesOf(91).map((line) => line.text)
  let i = lines.indexOf("Cost") + 1
  let category = ""
  let attackType = ""
  const rows: Row[] = []
  while (i < lines.length) {
    const header = /^(Simple|Martial) (Melee|Ranged) Weapons$/.exec(lines[i].trim())
    if (header) {
      category = header[1].toLowerCase()
      attackType = header[2].toLowerCase()
      i++
      continue
    }
    if (!lines[i].trim()) {
      i++
      continue
    }
    const name = lines[i].trim()
    const damage = /^(\d+d\d+|\d+) (Bludgeoning|Piercing|Slashing)$/.exec(lines[i + 1].trim())
    if (!damage) throw new Error(`Weapons: no damage after ${name}`)
    i += 2
    let cell = lines[i++]
    while (cell.trim().endsWith(",")) cell += ` ${lines[i++]}`
    const mastery = lines[i++].trim()
    const weight = weightOf(lines[i++])
    const cost = costOf(lines[i++])
    const id = toId(name)
    const row: Row = {
      id,
      name,
      page: 91,
      kind: "weapon",
      category,
      attackType,
      damage: { ...(damage[1].includes("d") ? { dice: damage[1] } : { fixed: Number(damage[1]) }), type: damage[2].toLowerCase() },
      properties: [] as string[],
      mastery: toId(mastery),
      cost,
      ...(weight === undefined ? {} : { weight }),
    }
    for (const part of cell.trim() === "—" ? [] : splitTop(cell)) {
      const match = /^([A-Za-z-]+)(?: \((.+)\))?$/.exec(part)
      if (!match) throw new Error(`Weapons: ${name} property ${part}`)
      const property = toId(match[1])
      ;(row.properties as string[]).push(property)
      const detail = match[2]
      if (property === "versatile") row.versatileDamage = detail
      else if (property === "thrown") row.range = rangeOf(detail as string)
      else if (property === "ammunition") {
        const [range, kind] = (detail as string).split("; ")
        row.range = rangeOf(range)
        // The table says "Bullet" for the Sling and for firearms, and the Ammunition table lists Bullets, Firearm and Bullets, Sling.
        row.ammunition = kind === "Bullet" ? (id === "sling" ? "bullets-sling" : "bullets-firearm") : { Arrow: "arrows", Bolt: "bolts", Needle: "needles" }[kind]
      } else if (property === "two-handed" && detail === "unless mounted") row.twoHandedUnlessMounted = true
    }
    rows.push(row)
  }
  return rows
}

const rangeOf = (text: string) => {
  const match = /^Range (\d+)\/(\d+)$/.exec(text)
  if (!match) throw new Error(`Not a range: ${text}`)
  return { normal: Number(match[1]), long: Number(match[2]) }
}

function armor(): Row[] {
  const lines = linesOf(92).map((line) => line.text.trim())
  let i = lines.indexOf("Cost", lines.indexOf("Stealth")) + 1
  const rows: Row[] = []
  let times: { don?: number; doff?: number; action?: boolean } = {}
  let category = ""
  while (i < lines.length && lines[i]) {
    const header = /^(Light|Medium|Heavy) Armor \((.+)\)$/.exec(lines[i])
    const shield = /^Shield \((.+)\)$/.exec(lines[i])
    if (header || shield) {
      category = header ? header[1].toLowerCase() : "shield"
      const text = (header?.[2] ?? shield?.[1]) as string
      const both = /^(\d+) Minutes? to Don or Doff$/.exec(text)
      const split = /^(\d+) Minutes? to Don and (\d+) Minutes? to Doff$/.exec(text)
      times = both ? { don: Number(both[1]), doff: Number(both[1]) } : split ? { don: Number(split[1]), doff: Number(split[2]) } : { action: true }
      i++
      continue
    }
    const [name, ac, strength, stealth, weight, cost] = lines.slice(i, i + 6)
    i += 6
    const row: Row = { id: toId(name), name, page: 92, kind: "armor", category, cost: costOf(cost), weight: weightOf(weight) }
    if (category === "shield") row.acBonus = Number(ac.slice(1))
    else {
      const match = /^(\d+)(?: \+ Dex modifier(?: \(max (\d+)\))?)?$/.exec(ac)
      if (!match) throw new Error(`Armor: ${name} AC ${ac}`)
      row.baseAc = Number(match[1])
      row.addsDexModifier = ac.includes("Dex")
      if (match[2]) row.dexModifierCap = Number(match[2])
    }
    if (strength !== "—") row.strengthRequired = Number(strength.replace("Str ", ""))
    if (stealth === "Disadvantage") row.stealthDisadvantage = true
    if (times.action) row.donDoffAction = "utilize"
    else {
      row.donMinutes = times.don
      row.doffMinutes = times.doff
    }
    rows.push(row)
  }
  return rows
}

// Gear and tools -----------------------------------------------------------------------------------------------

/** Name to id, for the items that Craft lines and pack contents name. Table names read "Bottle, Glass", the lists say "Glass Bottle". */
class Names {
  private map = new Map<string, string>()
  add(name: string, id: string) {
    const key = (text: string) => text.toLowerCase().replace(/’/g, "'")
    this.map.set(key(name), id)
    const comma = name.indexOf(", ")
    if (comma > 0) this.map.set(key(`${name.slice(comma + 2)} ${name.slice(0, comma)}`), id)
  }
  get(name: string): string | undefined {
    const key = (text: string) => text.toLowerCase().replace(/’/g, "'")
    const plain = name.replace(/^(flasks|days|sheets) of /, "")
    return this.map.get(key(plain)) ?? this.map.get(key(plain.replace(/es$/, ""))) ?? this.map.get(key(plain.replace(/s$/, "")))
  }
  resolve(name: string): string {
    const id = this.get(name)
    if (!id) throw new Error(`Equipment: no item named ${name}`)
    return id
  }
}

const gearMechanics: Record<string, Row> = {
  acid: { hazard: { rangeFeet: 20, save: dexSave, damage: { dice: "2d6", type: "acid" } } },
  "alchemists-fire": { hazard: { rangeFeet: 20, save: dexSave, damage: { dice: "1d4", type: "fire" }, burning: true } },
  antitoxin: { modifiers: [{ effect: "advantage", on: "save", againstCondition: "poisoned", durationHours: 1, when: "to avoid or end the Poisoned condition" }] },
  backpack: { capacity: { pounds: 30, cubicFeet: 1 } },
  "ball-bearings": { hazard: { areaSideFeet: 10, withinFeet: 10, save: fixedDexSave(10), condition: "prone", recoverMinutes: 10 } },
  barrel: { capacity: { gallons: 40, cubicFeet: 4 } },
  basket: { capacity: { pounds: 40, cubicFeet: 2 } },
  bedroll: { sleeps: 1, modifiers: [{ effect: "automatic-success", on: "save", when: extremeCold }] },
  bell: { audibleFeet: 60 },
  blanket: { modifiers: [{ effect: "advantage", on: "save", when: extremeCold }] },
  "block-and-tackle": { liftMultiplier: 4 },
  book: { modifiers: [{ effect: "bonus", on: "check", ability: "int", skills: ["arcana", "history", "nature", "religion"], amount: 5, when: "an accurate nonfiction Book about its topic" }] },
  "bottle-glass": { capacity: { pints: 1.5 } },
  bucket: { capacity: { cubicFeet: 0.5 } },
  caltrops: { hazard: { areaSideFeet: 5, withinFeet: 5, save: fixedDexSave(15), damage: piercing1, speedToZero: true, recoverMinutes: 10 } },
  candle: { light: { shape: "radius", brightFeet: 5, dimFeet: 5, durationHours: 1 } },
  "case-crossbow-bolt": { capacity: { holds: [{ item: "bolts", quantity: 20 }] } },
  "case-map-or-scroll": {
    capacity: {
      holds: [
        { item: "paper", quantity: 10 },
        { item: "parchment", quantity: 5 },
      ],
    },
  },
  chain: {
    binding: { requiresAnyCondition: unboundable, appliesCondition: "restrained" },
    checks: [
      { use: "bind", ability: "str", skill: "athletics", dc: 13, rangeFeet: 5 },
      { use: "escape", ability: "dex", skill: "acrobatics", dc: 18 },
      { use: "burst", ability: "str", skill: "athletics", dc: 20 },
    ],
  },
  chest: { capacity: { cubicFeet: 12 } },
  "climbers-kit": { anchorFeet: 25 },
  costume: { modifiers: [{ effect: "advantage", on: "check", when: "to impersonate the person or type of person it represents" }] },
  crowbar: { modifiers: [{ effect: "advantage", on: "check", ability: "str", when: "where the Crowbar’s leverage can be applied" }] },
  flask: { capacity: { pints: 1 } },
  "grappling-hook": { checks: [{ use: "catch", ability: "dex", skill: "acrobatics", dc: 13, rangeFeet: 50 }] },
  "healers-kit": { uses: 10, stabilize: { requiresCondition: "unconscious", atHitPoints: 0, replacesCheck: { ability: "wis", skill: "medicine" } } },
  "holy-water": { hazard: { rangeFeet: 20, save: dexSave, damage: { dice: "2d8", type: "radiant" }, onlyAgainst: ["fiend", "undead"] } },
  "hunting-trap": {
    hazard: { save: fixedDexSave(13), damage: { dice: "1d4", type: "piercing" }, speedToZero: true, chainFeet: 3, failedFreeAttemptDamage: piercing1 },
    checks: [{ use: "free", ability: "str", skill: "athletics", dc: 13 }],
  },
  jug: { capacity: { gallons: 1 } },
  ladder: { heightFeet: 10 },
  lamp: { light: { shape: "radius", brightFeet: 15, dimFeet: 30, fuel: "oil" } },
  "lantern-bullseye": { light: { shape: "cone", brightFeet: 60, dimFeet: 60, fuel: "oil" } },
  "lantern-hooded": { light: { shape: "radius", brightFeet: 30, dimFeet: 30, fuel: "oil", loweredHoodDimRadiusFeet: 5 } },
  lock: { checks: [{ use: "pick", ability: "dex", skill: "sleight-of-hand", dc: 15 }] },
  "magnifying-glass": { modifiers: [{ effect: "advantage", on: "check", when: "to appraise or inspect a highly detailed item" }] },
  manacles: {
    binding: { requiresAnyCondition: unboundable, appliesCondition: "restrained", sizes: ["Small", "Medium"] },
    checks: [
      { use: "bind", ability: "dex", skill: "sleight-of-hand", dc: 13, rangeFeet: 5 },
      { use: "escape", ability: "dex", skill: "sleight-of-hand", dc: 20 },
      { use: "burst", ability: "str", skill: "athletics", dc: 25 },
      { use: "pick", ability: "dex", skill: "sleight-of-hand", dc: 15 },
    ],
  },
  map: { modifiers: [{ effect: "bonus", on: "check", ability: "wis", skills: ["survival"], amount: 5, when: "to find your way in the place represented on it" }] },
  net: {
    hazard: { rangeFeet: 15, save: dexSave, condition: "restrained", succeedsAutomaticallyIfSizeAtLeast: "Huge" },
    checks: [{ use: "escape", ability: "str", skill: "athletics", dc: 10, rangeFeet: 5 }],
    object: { ac: 10, hp: 5, immunities: ["bludgeoning", "poison", "psychic"] },
  },
  oil: {
    fuelHours: 6,
    hazard: { rangeFeet: 20, save: dexSave, dryAfterMinutes: 1, extraFireDamage: fire5 },
    spaceHazard: { areaSideFeet: 5, withinFeet: 5, burnsUntilRoundsAfterLit: 2, damage: fire5 },
  },
  perfume: { modifiers: [{ effect: "advantage", on: "check", ability: "cha", skills: ["persuasion"], durationHours: 1, when: "to influence an Indifferent Humanoid within 5 feet of yourself" }] },
  "poison-basic": {
    coating: { action: "bonus", ammunitionPieces: 3, triggerDamageTypes: ["piercing", "slashing"], extraDamage: { dice: "1d4", type: "poison" }, potencyMinutes: 1 },
  },
  pole: { lengthFeet: 10, modifiers: [{ effect: "advantage", on: "check", ability: "str", skills: ["athletics"], when: "as part of a High or Long Jump" }] },
  "pot-iron": { capacity: { gallons: 1 } },
  "potion-of-healing": { healing: { dice: "2d4 + 2", action: "bonus", rangeFeet: 5 } },
  pouch: { capacity: { pounds: 6, cubicFeet: 0.2 } },
  quiver: { capacity: { holds: [{ item: "arrows", quantity: 20 }] } },
  "ram-portable": {
    modifiers: [
      { effect: "bonus", on: "check", ability: "str", amount: 4, when: "to break down doors" },
      { effect: "advantage", on: "check", when: "One other character can help you use the ram" },
    ],
  },
  rope: {
    binding: { requiresAnyCondition: unboundable, appliesCondition: "restrained" },
    checks: [
      { use: "knot", ability: "dex", skill: "sleight-of-hand", dc: 10 },
      { use: "burst", ability: "str", skill: "athletics", dc: 20 },
      { use: "escape", ability: "dex", skill: "acrobatics", dc: 15 },
    ],
  },
  sack: { capacity: { pounds: 30, cubicFeet: 1 } },
  shovel: { dig: { sideFeet: 5, hours: 1 } },
  "signal-whistle": { audibleFeet: 600 },
  "spell-scroll-cantrip": { spellScroll: { spellLevel: 0, saveDc: 13, attackBonus: 5 } },
  "spell-scroll-level-1": { spellScroll: { spellLevel: 1, saveDc: 13, attackBonus: 5 } },
  spyglass: { magnification: 2 },
  string: { lengthFeet: 10 },
  tent: { sleeps: 2 },
  tinderbox: { ignite: { action: "bonus", otherFireMinutes: 1 } },
  torch: { light: { shape: "radius", brightFeet: 20, dimFeet: 20, durationHours: 1 }, attackDamage: { fixed: 1, type: "fire" } },
  vial: { capacity: { ounces: 4 } },
  waterskin: { capacity: { pints: 4 } },
}

/** Heading of a description block: "Acid (25 GP)", "Ammunition (Varies)". */
const headingOf = (text: string) => /^([^()]+?) \((Varies|[\d,]+ [CSGEP]P)\)$/.exec(text.trim())

type Block = { name: string; page: number; cost?: string; lines: Line[] }

/** Split lines into description blocks at headings. The wrapped Spell Scroll heading counts as one. */
function blocks(lines: Line[]): Block[] {
  const out: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text.trim()
    if (text.startsWith("Spell Scroll (Cantrip, 30 GP;")) {
      out.push({ name: "Spell Scroll", page: lines[i].page, lines: [] })
      i++
      continue
    }
    const heading = headingOf(text)
    if (heading) out.push({ name: heading[1], page: lines[i].page, cost: heading[2], lines: [] })
    else out.at(-1)?.lines.push(lines[i])
  }
  return out
}

/** Table rows of three cells after a header, in a run of lines that ends at the first line that is not a row. */
const triples = (lines: string[], header: string[]): string[][] => {
  const start = lines.findIndex((_line, index) => header.every((cell, offset) => lines[index + offset]?.trim() === cell))
  if (start < 0) throw new Error(`No table with header ${header.join(" | ")}`)
  const rows: string[][] = []
  for (let i = start + header.length; i + 2 < lines.length; i += 3) rows.push([lines[i], lines[i + 1], lines[i + 2]].map((cell) => cell.trim()))
  return rows.filter((row) => row[0])
}

const usedBy = { arcane: ["sorcerer", "warlock", "wizard"], druidic: ["druid", "ranger"], holy: ["cleric", "paladin"] }

function gearAndTools(names: Names, ids: Set<string>): Row[] {
  const rows: Row[] = []

  // Tools, pages 93 and 94.
  const toolLines = linesOf(93, 94)
  const toolEnd = toolLines.findIndex((line) => line.text.trim() === "Adventuring Gear")
  const toolStart = toolLines.findIndex((line) => headingOf(line.text)?.[1] === "Alchemist’s Supplies")
  const otherAt = toolLines.findIndex((line) => line.text.trim() === "Other Tools")
  const toolBlocks = blocks(toolLines.slice(toolStart, toolEnd).filter((line) => line.text.trim() !== "Other Tools"))
  const toolRows: Row[] = []
  for (const block of toolBlocks) {
    const sections: Record<string, Line[]> = {}
    let key = ""
    for (const line of block.lines) {
      const match = /^(Ability|Weight|Utilize|Craft|Variants):\s*(.*)$/.exec(line.text.trim())
      if (match) {
        key = match[1]
        sections[key] = [{ text: match[2], page: line.page }]
      } else if (key) sections[key].push(line)
    }
    const text = (name: string) => prose(sections[name] ?? [])
    const heading = toolLines.find((line) => headingOf(line.text)?.[1] === block.name) as Line
    const group = toolLines.indexOf(heading) < otherAt ? "artisan" : "other"
    const row: Row = { id: toId(block.name), name: block.name, page: block.page, kind: "tool", group, ability: abilityOf[text("Ability")] }
    if (block.cost !== "Varies") row.cost = costOf(block.cost as string)
    const weight = weightOf(text("Weight"))
    if (weight !== undefined) row.weight = weight
    const utilize = [...text("Utilize").matchAll(/(?:^|,\s*)(?:or\s+)?(.+?) \(DC (\d+)\)/g)].map((match) => ({ action: match[1][0].toUpperCase() + match[1].slice(1), dc: Number(match[2]) }))
    if (utilize.length) row.utilize = utilize
    if (sections.Craft) row.craft = craftOf(text("Craft"), names)
    toolRows.push(row)
    if (sections.Variants) {
      const variants = [...text("Variants").matchAll(/([A-Za-z -]+?) \((\d+) ([CSGEP])P(?:, (\d+) lb\.)?\)/g)]
      row.variants = variants.map((match) => toId(match[1]))
      for (const match of variants) {
        const variant: Row = {
          id: toId(match[1]),
          name: titleCase(match[1].trim()),
          page: block.page,
          kind: "tool",
          group,
          ability: row.ability,
          ...(utilize.length ? { utilize } : {}),
          variantOf: row.id,
          cost: { amount: Number(match[2]), unit: `${match[3].toLowerCase()}p` },
          ...(match[4] ? { weight: Number(match[4]) } : {}),
        }
        toolRows.push(variant)
      }
    }
  }
  rows.push(...toolRows)

  // The Adventuring Gear table: weight and cost of every item. Page 95.
  const table = linesOf(95).map((line) => line.text.trim())
  const tableRows = triples(
    table.filter((line, index) => !(["Item", "Weight", "Cost"].includes(line) && index > 4)),
    ["Item", "Weight", "Cost"]
  )
  const ammunitionTable = linesOf(96)
    .map((line) => line.text.trim())
    .slice(1)
  const ammoStart = ammunitionTable.indexOf("Cost") + 1
  const ammoRows: string[][] = []
  for (let i = ammoStart; ammunitionTable[i] !== "Antitoxin (50 GP)"; i += 5) ammoRows.push(ammunitionTable.slice(i, i + 5))

  // Descriptions, pages 94 to 100, skipping the tables.
  const gearLines = [
    ...linesOf(94).slice(linesOf(94).findIndex((line) => line.text.trim() === "Acid (25 GP)")),
    ...linesOf(96).slice(linesOf(96).findIndex((line) => line.text.trim() === "Antitoxin (50 GP)")),
    ...linesOf(97, 99),
    ...linesOf(100).slice(
      0,
      linesOf(100).findIndex((line) => line.text.trim() === "Mounts and Vehicles")
    ),
  ]
  const focusTables: Record<string, string[][]> = {}
  const tableTitles = ["Arcane Focuses", "Druidic Focuses", "Holy Symbols"]
  let inTable: string | undefined
  const buffered: Record<string, string[]> = {}
  const flat: Line[] = []
  for (let i = 0; i < gearLines.length; i++) {
    const text = gearLines[i].text.trim()
    if (tableTitles.includes(text)) {
      inTable = text
      buffered[text] = []
      continue
    }
    if (inTable && !headingOf(text) && !text.startsWith("Spell Scroll (Cantrip")) {
      buffered[inTable].push(text)
      continue
    }
    inTable = undefined
    flat.push(gearLines[i])
  }
  for (const [title, cells] of Object.entries(buffered)) focusTables[title] = triples(cells.filter(Boolean), [title === "Holy Symbols" ? "Symbol" : "Focus", "Weight", "Cost"])
  const gearBlocks = blocks(flat)

  const describe = (name: string) => {
    const block = gearBlocks.find((entry) => entry.name === name)
    if (!block) throw new Error(`Equipment: no description for ${name}`)
    return block
  }

  const members: Record<string, string[]> = { ammunition: [], "arcane-focus": [], "druidic-focus": [], "holy-symbol": [], "spell-scroll": ["spell-scroll-cantrip", "spell-scroll-level-1"] }
  for (const [type, amount, storage, weight, cost] of ammoRows) {
    const id = toId(type)
    members.ammunition.push(id)
    rows.push({
      id,
      name: type,
      page: 96,
      kind: "ammunition",
      amount: Number(amount),
      storage: storage === "Case" ? "case-crossbow-bolt" : toId(storage),
      cost: costOf(cost),
      weight: weightOf(weight),
    })
  }
  for (const [title, cells] of Object.entries(focusTables)) {
    const focus = title === "Arcane Focuses" ? "arcane" : title === "Druidic Focuses" ? "druidic" : "holy"
    const groupId = { arcane: "arcane-focus", druidic: "druidic-focus", holy: "holy-symbol" }[focus]
    const page = describe(titleCase(groupId.replace("-", " "))).page
    for (const [label, weight, cost] of cells) {
      const match = /^(.+?)(?: \((.+)\))?$/.exec(label) as RegExpExecArray
      const name = titleCase(match[1])
      const detail = match[2]
      const row: Row = { id: toId(name), name, page, kind: "focus", focus, usedBy: usedBy[focus], cost: costOf(cost) }
      const w = weightOf(weight)
      if (w !== undefined) row.weight = w
      if (detail === "also a Quarterstaff") row.alsoQuarterstaff = true
      else if (detail === "worn or held") row.carried = ["worn", "held"]
      else if (detail === "held") row.carried = ["held"]
      else if (detail?.startsWith("borne")) row.carried = ["borne"]
      members[groupId].push(row.id as string)
      rows.push(row)
    }
  }

  for (const [name, weight, cost] of tableRows) {
    const id = toId(name)
    const heading = name.startsWith("Spell Scroll") ? describe("Spell Scroll") : describe(name)
    const description = prose(heading.lines)
    const base: Row = { id, name, page: heading.page }
    const w = weightOf(weight)
    if (["ammunition", "arcane-focus", "druidic-focus", "holy-symbol"].includes(id)) {
      rows.push({
        ...base,
        kind: "group",
        members: members[id],
        ...(id === "ammunition" ? {} : id === "arcane-focus" ? { usedBy: usedBy.arcane } : id === "druidic-focus" ? { usedBy: usedBy.druidic } : { usedBy: usedBy.holy }),
        description,
      })
      continue
    }
    if (name.endsWith("Pack")) {
      const list = (/following items: (.+)\.$/.exec(description.replace(/\n/g, " ")) as RegExpExecArray)[1]
      const contents = splitTop(list).map((part) => {
        const match = /^(?:(\d+) )?(.+?)$/.exec(part.replace(/^and /, "")) as RegExpExecArray
        return { item: names.resolve(match[2]), quantity: match[1] ? Number(match[1]) : 1 }
      })
      for (const { item } of contents) if (!ids.has(item)) throw new Error(`Pack ${name}: unknown item ${item}`)
      rows.push({ ...base, kind: "pack", contents, cost: costOf(cost), weight: w, description })
      continue
    }
    rows.push({
      ...base,
      kind: "gear",
      ...(cost === "Varies" ? {} : { cost: costOf(cost) }),
      ...(w === undefined ? {} : { weight: w }),
      ...(weight.includes("(full)") ? { weightWhenFull: true } : {}),
      ...(gearMechanics[id] ?? {}),
      description,
    })
  }
  rows.push({
    id: "spell-scroll",
    name: "Spell Scroll",
    page: describe("Spell Scroll").page,
    kind: "group",
    members: members["spell-scroll"],
  })
  return rows
}

/** "Any Melee weapon (except Club, ...), Barrel, Ranged weapons (except Pistol, ...)": ids and weapon or armor categories. */
function craftOf(text: string, names: Names) {
  const items: string[] = []
  const categories: Row[] = []
  const kinds: Record<string, string> = { "any melee weapon": "melee-weapon", "ranged weapons": "ranged-weapon", "medium armor": "medium-armor", "heavy armor": "heavy-armor" }
  for (const part of splitTop(text.replace(/\.$/, ""))) {
    const match = /^(.+?)(?: \(except (.+)\))?$/.exec(part) as RegExpExecArray
    const category = kinds[match[1].toLowerCase()]
    if (category) {
      const except = match[2]
        ? match[2]
            .replace(/ and /g, ", ")
            .split(/,\s*/)
            .filter(Boolean)
            .map((name) => names.resolve(name === "Hide" ? "Hide Armor" : name))
        : []
      categories.push({ category, ...(except.length ? { except } : {}) })
    } else items.push(names.resolve(match[1]))
  }
  return { ...(items.length ? { items } : {}), ...(categories.length ? { categories } : {}) }
}

// Mounts, vehicles, services -----------------------------------------------------------------------------------

function mountsAndVehicles(): Row[] {
  const rows: Row[] = []
  const lines = linesOf(100).map((line) => line.text.trim())
  const mountStart = lines.indexOf("Mounts and Other Animals")
  const statBlocks: Record<string, string> = { "Horse, Draft": "draft-horse", "Horse, Riding": "riding-horse" }
  for (const [name, capacity, cost] of triples(lines.slice(mountStart), ["Item", "Carrying Capacity", "Cost"]).slice(0, 8)) {
    rows.push({
      id: toId(name),
      name,
      page: 100,
      kind: "mount",
      carryingCapacityPounds: Number(capacity.replace(/\D/g, "")),
      cost: costOf(cost),
      statBlock: statBlocks[name] ?? toId(name),
    })
  }
  const saddleText = prose(linesOf(100).slice(lines.indexOf("Saddles") + 1, lines.indexOf("Mounts and Other Animals")))
  const tackStart = lines.indexOf("Tack, Harness, and Drawn Vehicles")
  const tackLines = lines.slice(tackStart + 4, lines.indexOf("Large Vehicles"))
  for (let i = 0; i < tackLines.length; ) {
    if (tackLines[i] === "Saddle") {
      i++
      for (let k = 0; k < 3; k++, i += 3) {
        const [kind, weight, cost] = tackLines.slice(i, i + 3)
        const id = `saddle-${kind.toLowerCase()}`
        rows.push({
          id,
          name: `Saddle, ${kind}`,
          page: 100,
          kind: "tack",
          cost: costOf(cost),
          weight: weightOf(weight),
          description: saddleText,
          ...(kind === "Military" ? { modifiers: [{ effect: "advantage", on: "check", when: "to remain mounted" }] } : {}),
          ...(kind === "Exotic" ? { requiredForMounts: ["aquatic", "flying"] } : {}),
        })
      }
      continue
    }
    const [name, weight, cost] = tackLines.slice(i, i + 3)
    i += 3
    const w = weightOf(weight)
    if (name === "Feed per day") rows.push({ id: toId(name), name, page: 100, kind: "tack", cost: costOf(cost), weight: w, per: "day" })
    else if (name === "Stabling per day") rows.push({ id: toId(name), name, page: 100, kind: "service", cost: costOf(cost), per: "day" })
    else rows.push({ id: toId(name), name, page: 100, kind: "vehicle", cost: costOf(cost), weight: w })
  }
  return rows
}

function ships(): Row[] {
  const lines = linesOf(101).map((line) => line.text.trim())
  const start = lines.indexOf("Airborne and Waterborne Vehicles") + 1 + 9
  const rows: Row[] = []
  const number = (text: string) => (text === "—" ? undefined : Number(text.replace(/,/g, "")))
  const fraction = (text: string) => (text === "1/2" ? 0.5 : number(text))
  for (let i = start; i + 8 < lines.length; i += 9) {
    const [name, speed, crew, passengers, cargo, ac, hp, threshold, cost] = lines.slice(i, i + 9)
    const mph = /^(\d+)(½)? mph$/.exec(speed) as RegExpExecArray
    rows.push({
      id: toId(name),
      name,
      page: 101,
      kind: "ship",
      travel: name === "Airship" ? "air" : "water",
      speedMph: Number(mph[1]) + (mph[2] ? 0.5 : 0),
      crew: number(crew),
      ...(passengers === "—" ? {} : { passengers: number(passengers) }),
      ...(cargo === "—" ? {} : { cargoTons: fraction(cargo) }),
      ac: number(ac),
      hp: number(hp),
      ...(threshold === "—" ? {} : { damageThreshold: number(threshold) }),
      cost: costOf(cost),
      ...(name === "Rowboat" ? { weight: 100 } : {}),
    })
  }
  return rows
}

const tierNames = ["Squalid", "Poor", "Modest", "Comfortable", "Wealthy", "Aristocratic"]

function lifestylesAndFood(): Row[] {
  const rows: Row[] = []
  const lines = linesOf(101)
  const heading = /^(Wretched|Squalid|Poor|Modest|Comfortable|Wealthy|Aristocratic) \((Free|[\d,]+ [CSGEP]P per Day)\)$/
  const at = lines.map((line) => heading.exec(line.text.trim()))
  at.forEach((match, index) => {
    if (!match) return
    const end = at.findIndex((other, j) => j > index && other) // next lifestyle heading
    const stop = end < 0 ? lines.findIndex((line) => line.text.trim() === "Food, Drink, and Lodging") : end
    rows.push({
      id: toId(match[1]),
      name: match[1],
      page: lines[index].page,
      kind: "lifestyle",
      tier: match[1].toLowerCase(),
      ...(match[2] === "Free" ? {} : { costPerDay: costOf(match[2].replace(" per Day", "")) }),
      description: prose(lines.slice(index + 1, stop)),
    })
  })

  // Food, Drink, and Lodging. The PDF text runs the table over two pages, so costs are read in order.
  const region = [
    ...lines.slice(
      lines.map((line) => line.text.trim()).lastIndexOf("Food, Drink, and Lodging"),
      lines.findIndex((line) => line.text.trim() === "Airborne and Waterborne Vehicles")
    ),
    ...linesOf(102).slice(
      0,
      linesOf(102).findIndex((line) => line.text.trim() === "Hirelings")
    ),
  ]
  const costs = region.filter((line) => /^\d+ [CSGEP]P$/.test(line.text.trim()))
  const labels: [string, Row][] = [
    ["Ale (mug)", { kind: "food", unit: "mug" }],
    ["Bread (loaf)", { kind: "food", unit: "loaf" }],
    ["Cheese (wedge)", { kind: "food", unit: "wedge" }],
    ...tierNames.map((tier): [string, Row] => [`Inn Stay (${tier})`, { kind: "inn-stay", tier: tier.toLowerCase() }]),
    ...tierNames.map((tier): [string, Row] => [`Meal (${tier})`, { kind: "meal", tier: tier.toLowerCase() }]),
    ["Wine (Common)", { kind: "food", unit: "bottle" }],
    ["Wine (Fine)", { kind: "food", unit: "bottle" }],
  ]
  if (costs.length !== labels.length) throw new Error(`Food table: ${costs.length} costs for ${labels.length} rows`)
  for (const [index, [name, shape]] of labels.entries()) rows.push({ id: toId(name), name, page: costs[index].page, ...shape, cost: costOf(costs[index].text) })
  return rows
}

function hirelingsAndSpellcasting(): Row[] {
  const rows: Row[] = []
  const lines = linesOf(102).map((line) => line.text.trim())
  const hireStart = lines.lastIndexOf("Hirelings")
  const per = (text: string) => /^(.+?) per (day|mile)$/.exec(text) as RegExpExecArray
  for (const [name, cost] of [0, 1, 2].map((n) => lines.slice(hireStart + 3 + n * 2, hireStart + 5 + n * 2))) {
    const match = per(cost)
    rows.push({ id: toId(name), name, page: 102, kind: "service", cost: costOf(match[1]), per: match[2] })
  }
  const spellStart = lines.indexOf("Spellcasting Services")
  const available = (cell: string) => ({ "Village, town, or city": "village", "Town or city only": "town", "City only": "city" })[cell]
  for (const [level, where, cost] of triples(lines.slice(spellStart), ["Spell Level", "Availability", "Cost"]).slice(0, 7)) {
    const range = /^(\d)[–-](\d)$/.exec(level)
    const min = level === "Cantrip" ? 0 : range ? Number(range[1]) : Number(level)
    const max = range ? Number(range[2]) : min
    const label = level === "Cantrip" ? "Cantrip" : range ? `Levels ${level}` : `Level ${level}`
    rows.push({
      id: toId(`Spellcasting Service ${label}`),
      name: `Spellcasting Service (${label})`,
      page: 102,
      kind: "spellcasting-service",
      minSpellLevel: min,
      maxSpellLevel: max,
      availableFrom: available(where),
      cost: costOf(cost),
    })
  }
  return rows
}

// Properties, masteries, poisons, coins, rules ----------------------------------------------------------------

/** Headings from the base source's names, each followed by its paragraph, between two lines. */
function definitions(page: number, last: number, from: string, to: string, names: string[], stops: string[] = []): { name: string; page: number; description: string }[] {
  const lines = linesOf(page, last)
  const start = lines.findIndex((line) => line.text.includes(from))
  const end = lines.findIndex((line, index) => index > start && line.text.trim() === to)
  const out: { name: string; page: number; lines: Line[] }[] = []
  let open = false
  for (const line of lines.slice(start + 1, end < 0 ? undefined : end)) {
    const text = line.text.trim()
    if (names.includes(text)) {
      out.push({ name: text, page: line.page, lines: [] })
      open = true
    } else if (stops.includes(text)) open = false
    else if (open) out.at(-1)?.lines.push(line)
  }
  return out.map((entry) => ({ name: entry.name, page: entry.page, description: prose(entry.lines) }))
}

function properties(): Row[] {
  const names = readBase("Weapon-Properties").map((entry) => entry.name as string)
  return definitions(89, 90, "Here are definitions", "Mastery Properties", names, ["Improvised Weapons"]).map((entry) => ({
    id: toId(entry.name),
    name: entry.name,
    page: entry.page,
    description: entry.description,
    ...(entry.name === "Heavy" ? { minimumScore: 13 } : {}),
    ...(entry.name === "Reach" ? { reachBonusFeet: 5 } : {}),
  }))
}

function masteries(): Row[] {
  const names = readBase("Weapon-Mastery-Properties").map((entry) => entry.name as string)
  return definitions(90, 90, "The properties are defined below.", "\u0000", names).map((entry) => ({
    id: toId(entry.name),
    name: entry.name,
    page: entry.page,
    description: entry.description,
    ...(entry.name === "Push" ? { pushFeet: 10, maxSize: "Large" } : {}),
    ...(entry.name === "Slow" ? { speedReductionFeet: 10 } : {}),
    ...(entry.name === "Topple" ? { save: { ability: "con", dc: { base: 8, attackAbilityModifier: true, proficiencyBonus: true } }, condition: "prone" } : {}),
  }))
}

const poisonFacts: Record<string, Row> = {
  "assassins-blood": { save: 10, damage: [6, "1d12"], half: true, conditions: [{ condition: "poisoned", duration: { amount: 24, unit: "hour" } }] },
  "burnt-othur-fumes": { save: 13, damage: [10, "3d6"], repeat: { when: "start-of-turn", damage: { average: 3, dice: "1d6", type: "poison" }, endsAfterSuccesses: 3 } },
  "crawler-mucus": {
    save: 13,
    conditions: [
      { condition: "poisoned", duration: { amount: 1, unit: "minute" } },
      { condition: "paralyzed", whilePoisoned: true },
    ],
    repeat: { when: "end-of-turn", endsAfterSuccesses: 1 },
  },
  "essence-of-ether": {
    save: 15,
    conditions: [
      { condition: "poisoned", duration: { amount: 8, unit: "hour" } },
      { condition: "unconscious", whilePoisoned: true },
    ],
  },
  malice: {
    save: 15,
    conditions: [
      { condition: "poisoned", duration: { amount: 1, unit: "hour" } },
      { condition: "blinded", whilePoisoned: true },
    ],
  },
  "midnight-tears": { save: 17, damage: [31, "9d6"], half: true, delayedUntilMidnight: true, neutralizedByEndingPoisoned: true },
  "oil-of-taggit": {
    save: 13,
    conditions: [
      { condition: "poisoned", duration: { amount: 24, unit: "hour" } },
      { condition: "unconscious", whilePoisoned: true },
    ],
  },
  "pale-tincture": {
    save: 16,
    damage: [3, "1d6"],
    conditions: [{ condition: "poisoned" }],
    repeat: { when: "every-24-hours", damage: { average: 3, dice: "1d6", type: "poison" }, endsAfterSuccesses: 7 },
    damageCannotBeHealed: true,
  },
  "purple-worm-poison": { save: 21, damage: [35, "10d6"], half: true },
  "serpent-venom": { save: 11, damage: [10, "3d6"], half: true },
  "spiders-sting": {
    save: 13,
    conditions: [
      { condition: "poisoned", duration: { amount: 1, unit: "hour" } },
      { condition: "unconscious", whilePoisoned: true, failedByAtLeast: 5 },
    ],
  },
  torpor: { save: 15, conditions: [{ condition: "poisoned", duration: { amount: "4d6", unit: "hour" } }], speedHalved: true },
  "truth-serum": { save: 11, conditions: [{ condition: "poisoned", duration: { amount: 1, unit: "hour" } }], cannotKnowinglyLie: true },
  "wyvern-poison": { save: 14, damage: [24, "7d6"], half: true },
}

function poisons(): Row[] {
  const lines = linesOf(197, 198)
  const start = lines.findIndex((line) => line.text.trim() === "Sample Poisons")
  const out: Row[] = []
  for (const block of blocks(lines.slice(start + 1))) {
    const [typeLine, ...rest] = block.lines
    const id = toId(block.name)
    const facts = poisonFacts[id]
    if (!facts) throw new Error(`Poisons: no facts for ${id}`)
    const { save, damage, half, ...more } = facts as { save: number; damage?: [number, string]; half?: boolean }
    out.push({
      id,
      name: block.name,
      page: block.page,
      type: typeLine.text.trim().replace(" Poison", "").toLowerCase(),
      cost: costOf(block.cost as string),
      save: { ability: "con", dc: save },
      ...(damage ? { damage: { average: damage[0], dice: damage[1], type: "poison" } } : {}),
      ...(half ? { halfDamageOnSave: true } : {}),
      ...more,
      description: prose(rest),
    })
  }
  return out
}

function coins(): Row[] {
  const lines = linesOf(89).map((line) => line.text.trim())
  const start = lines.indexOf("Value in GP") + 1
  const values: Record<string, number> = { "1/100": 0.01, "1/10": 0.1, "1/2": 0.5, "1": 1, "10": 10 }
  const rows: Row[] = []
  for (let i = start; lines[i] !== "Weapons"; i += 2) {
    const match = /^(.+) \(([A-Z]{2})\)$/.exec(lines[i]) as RegExpExecArray
    rows.push({ id: toId(match[1]), name: match[1], page: 89, abbreviation: match[2].toLowerCase(), gpValue: values[lines[i + 1]] })
  }
  return rows
}

/** The paragraphs under a heading line, up to the next given line. */
function section(from: number, heading: string, stop: string, to = from + 1): string {
  const lines = linesOf(from, to)
  const start = lines.findIndex((line) => line.text.trim() === heading)
  const end = lines.findIndex((line, index) => index > start && line.text.trim() === stop)
  if (start < 0 || end < 0) throw new Error(`Rules: no section ${heading} to ${stop} on page ${from}`)
  return prose(lines.slice(start + 1, end))
}

function rules(): Row[] {
  const rows: Row[] = [
    { id: "selling-equipment", name: "Selling Equipment", page: 89, kind: "selling", resaleFraction: 0.5, description: section(89, "Selling Equipment", "Equipment") },
    {
      id: "coin-weight",
      name: "Coin Weight",
      page: 89,
      kind: "coin-weight",
      coinsPerPound: 50,
      description: prose(
        linesOf(89).slice(
          linesOf(89).findIndex((line) => line.text.includes("A coin weighs")),
          linesOf(89).findIndex((line) => line.text.trim() === "Coin Values")
        )
      ),
    },
    {
      id: "armor-training-light-medium-or-heavy-armor",
      name: "Armor Training (Light, Medium, or Heavy Armor)",
      page: 92,
      kind: "armor-training",
      covers: ["light", "medium", "heavy"],
      untrainedDisadvantageOn: ["str", "dex"],
      untrainedCannotCast: true,
      description: section(92, "Light, Medium, or Heavy Armor", "Shield"),
    },
    {
      id: "armor-training-shield",
      name: "Armor Training (Shield)",
      page: 92,
      kind: "armor-training",
      covers: ["shield"],
      benefitRequiresTraining: true,
      description: section(92, "Shield", "One at a Time"),
    },
    { id: "one-at-a-time", name: "One at a Time", page: 92, kind: "one-at-a-time", maxArmor: 1, maxShield: 1, description: section(92, "One at a Time", "Armor") },
    {
      id: "barding",
      name: "Barding",
      page: 100,
      kind: "barding",
      costMultiplier: 4,
      weightMultiplier: 2,
      description: section(100, "Barding", "Saddles"),
    },
    { id: "mounts-and-cargo", name: "Mounts and Cargo", page: 100, kind: "draft-cargo", capacityMultiplier: 5, description: section(100, "Mounts and Cargo", "Barding") },
    {
      id: "ship-repair",
      name: "Ship Repair",
      page: 101,
      kind: "ship-repair",
      hitPointsPerDay: 1,
      costGpPerHitPoint: 20,
      shipyardFraction: 0.5,
      description: section(101, "Ship Repair", "Lifestyle Expenses"),
    },
    {
      id: "passengers",
      name: "Passengers",
      page: 101,
      kind: "ship-passengers",
      privateAccommodationsFraction: 0.2,
      hammockCostPerDay: { amount: 5, unit: "sp" },
      cabinCostPerDay: { amount: 2, unit: "gp" },
      description: section(101, "Passengers", "Damage Threshold"),
    },
    {
      id: "crafting-nonmagical-items",
      name: "Crafting Nonmagical Items",
      page: 103,
      kind: "crafting",
      rawMaterialsFraction: 0.5,
      workHoursPerDay: 8,
      costGpPerDay: 10,
      maxAssistants: 1,
      description: [section(103, "Raw Materials", "Time"), section(103, "Time", "Brewing Potions of Healing")].join("\n"),
    },
    {
      id: "brewing-potions-of-healing",
      name: "Brewing Potions of Healing",
      page: 103,
      kind: "potion-brewing",
      tool: "herbalism-kit",
      rawMaterialsGp: 25,
      days: 1,
      workHoursPerDay: 8,
      description: section(103, "Brewing Potions of Healing", "Scribing Spell Scrolls"),
    },
  ]
  const lines = linesOf(103).map((line) => line.text.trim())
  const cells = lines.slice(lines.indexOf("Spell Scroll Costs") + 1).filter(Boolean)
  for (let i = 3; i + 2 < cells.length; i += 3) {
    const level = cells[i] === "Cantrip" ? 0 : Number(cells[i])
    const label = level === 0 ? "Cantrip" : `Level ${level}`
    rows.push({
      id: toId(`Spell Scroll Costs ${label}`),
      name: `Spell Scroll Costs (${label})`,
      page: 103,
      kind: "scribing",
      spellLevel: level,
      days: Number(cells[i + 1].split(" ")[0]),
      cost: costOf(cells[i + 2]),
    })
  }
  return rows
}

export default function build() {
  const names = new Names()
  const table = triples(
    linesOf(95)
      .map((line) => line.text.trim())
      .filter((line, index) => !(["Item", "Weight", "Cost"].includes(line) && index > 4)),
    ["Item", "Weight", "Cost"]
  )
  const ids = new Set<string>()
  const register = (name: string, id = toId(name)) => {
    names.add(name, id)
    ids.add(id)
  }
  for (const [name] of table) register(name)
  for (const type of ["Arrows", "Bolts", "Bullets, Firearm", "Bullets, Sling", "Needles"]) register(type)
  const weaponRows = weapons()
  const armorRows = armor()
  for (const row of [...weaponRows, ...armorRows]) register(row.name as string, row.id as string)
  register("Spell Scroll")
  const equipment = [...weaponRows, ...armorRows, ...gearAndTools(names, ids), ...mountsAndVehicles(), ...ships(), ...lifestylesAndFood(), ...hirelingsAndSpellcasting()]
  const ruleRows = rules()
  writeData("equipment", equipmentSchema, applyOverrides("equipment", equipment as { id: string }[], equipmentOverrides))
  writeData("weapon-properties", weaponPropertySchema, properties())
  writeData("weapon-masteries", weaponMasterySchema, masteries())
  writeData("poisons", poisonSchema, poisons())
  writeData("coins", coinSchema, coins())
  writeData("equipment-rules", equipmentRuleSchema, ruleRows)
}
