import { existsSync } from "node:fs"
import { dataPath, readData, toId } from "../lib/data"
import { missingSentences, pages, squash } from "../lib/official"
import type { Report } from "../lib/report"
import { readBase, readOpen5e } from "../lib/sources"

// The official text, read with its own small parsers: whole-page regular expressions over the PDF's cell-per-line output.
// Nothing here imports the builder or reads the base source to decide what is right. Base and Open5e are compared at the end.

const P = (page: number) => pages[page - 1].replace(/ /g, " ")
const PR = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => P(from + i)).join("\n")
const flat = (text: string) => text.replace(/\s*\n\s*/g, " ").trim()
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const sorted = <T>(items: T[]) => [...items].map(String).sort()
const esc = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

type Cost = { amount: number; unit: string }
const cost = (text: string): Cost | undefined => {
  const match = /^([\d,]+) ([CSGEP])P$/.exec(text.trim())
  return match ? { amount: Number(match[1].replace(/,/g, "")), unit: `${match[2].toLowerCase()}p` } : undefined
}
const weight = (text: string): number | undefined => {
  const match = /^(\d+)?\s*(?:(\d+)\/(\d+)|(½))?\s*lb\./.exec(text.trim())
  if (!match) return undefined
  return Number(match[1] ?? 0) + (match[2] ? Number(match[2]) / Number(match[3]) : 0) + (match[4] ? 0.5 : 0)
}
const costText = (value: Cost | undefined) => (value ? `${value.amount} ${value.unit}` : "none")

/** Split at commas that are not inside parentheses. */
function splitTop(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ""
  for (const char of text) {
    if (char === "(") depth++
    if (char === ")") depth--
    if (char === "," && depth === 0) {
      out.push(current.trim())
      current = ""
    } else current += char
  }
  if (current.trim()) out.push(current.trim())
  return out
}

const abilityName = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" } as Record<string, string>
const abilityIdOf = Object.fromEntries(Object.entries(abilityName).map(([id, name]) => [name, id]))
const damageTypes = ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder"]
const conditions = [
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
]
const numberWords: Record<string, number> = { fifty: 50, halved: 0.5, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5, fifth: 0.2, twice: 2 }

/** Every number a passage states, in digits or words. */
function numbersIn(text: string): Set<number> {
  const out = new Set<number>()
  for (const match of text.matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(Number(match[0].replace(/,/g, "")))
  for (const match of text.toLowerCase().matchAll(/\b(fifty|halved|one|two|three|four|five|six|seven|eight|nine|ten|half|fifth|twice)\b/g)) out.add(numberWords[match[1]])
  if (/11\/2|1½/.test(text)) out.add(1.5)
  return out
}

/** Every leaf of a value, with the key it sits under. */
function leaves(value: unknown, key = ""): [string, unknown][] {
  if (Array.isArray(value)) return value.flatMap((item) => leaves(item, key))
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, k))
  return [[key, value]]
}

const mechanicKeys = [
  "capacity",
  "light",
  "fuelHours",
  "lengthFeet",
  "heightFeet",
  "sleeps",
  "uses",
  "hazard",
  "spaceHazard",
  "checks",
  "binding",
  "modifiers",
  "object",
  "audibleFeet",
  "anchorFeet",
  "liftMultiplier",
  "magnification",
  "dig",
  "ignite",
  "attackDamage",
  "healing",
  "stabilize",
  "coating",
  "spellScroll",
] as const

/** Passage between two lines of a page range, as the text of the lines, with its first line excluded. */
function between(text: string, start: RegExp, end: RegExp): string {
  const from = text.search(start)
  if (from < 0) throw new Error(`no ${start}`)
  const rest = text.slice(from).replace(start, "")
  const stop = rest.search(end)
  return stop < 0 ? rest : rest.slice(0, stop)
}

type Entry = Record<string, any>

export default function verify(report: Report) {
  const data = readData<Entry>("equipment")
  const byId = new Map(data.map((entry) => [entry.id, entry]))
  const of = (kind: string) => data.filter((entry) => entry.kind === kind)
  const properties = readData<Entry>("weapon-properties")
  const masteries = readData<Entry>("weapon-masteries")
  const poisons = readData<Entry>("poisons")
  const coins = readData<Entry>("coins")
  const rules = readData<Entry>("equipment-rules")

  /** A name check both ways: every official name is in the data, every data name is in the official list. */
  const coverage = (category: string, label: string, official: string[], dataNames: string[]) => {
    const failures: string[] = []
    const have = new Set(dataNames)
    for (const name of official) if (!have.has(name)) failures.push(`${name} is official but missing from the data`)
    const want = new Set(official)
    for (const name of dataNames) if (!want.has(name)) failures.push(`${name} is in the data but not in the official text`)
    if (official.length !== new Set(official).size) failures.push("the official list repeats a name")
    report.check(category, `${label}: names match the official text, both ways (${official.length} official)`, official.length + dataNames.length, failures)
  }

  // Weapons ---------------------------------------------------------------------------------------------------
  const w91 = P(91)
  const weaponHeaders = [...w91.matchAll(/^(Simple|Martial) (Melee|Ranged) Weapons$/gm)].map((match) => ({
    at: match.index as number,
    category: match[1].toLowerCase(),
    attackType: match[2].toLowerCase(),
  }))
  const weaponRow = /^([A-Z][A-Za-z ]*?) *\n(\d+(?:d\d+)?) (Bludgeoning|Piercing|Slashing) *\n([\s\S]*?)\n(Cleave|Graze|Nick|Push|Sap|Slow|Topple|Vex)\n(—|[\d½/ ]+ lb\.)\n([\d,]+ [CSGEP]P)$/gm
  const officialWeapons = [...w91.matchAll(weaponRow)].map((match) => {
    const header = [...weaponHeaders].reverse().find((item) => item.at < (match.index as number)) as (typeof weaponHeaders)[number]
    return { name: match[1].trim(), ...header, dice: match[2], type: match[3].toLowerCase(), props: splitTop(flat(match[4])), mastery: match[5], weight: weight(match[6]), cost: cost(match[7]) }
  })
  const weapons = of("weapon")
  coverage(
    "equipment",
    "weapons",
    officialWeapons.map((row) => row.name),
    weapons.map((entry) => entry.name)
  )

  const properties10 = new Set(properties.map((entry) => entry.id))
  const masteryIds = new Set(masteries.map((entry) => entry.id))
  const weaponFailures: string[] = []
  let weaponCells = 0
  for (const row of officialWeapons) {
    const entry = byId.get(toId(row.name))
    if (!entry) continue
    const expect: Record<string, unknown> = { category: row.category, attackType: row.attackType, mastery: toId(row.mastery), weight: row.weight, cost: row.cost, page: 91 }
    expect.damage = /d/.test(row.dice) ? { dice: row.dice, type: row.type } : { fixed: Number(row.dice), type: row.type }
    const named = row.props.filter((token) => token !== "—")
    expect.properties = named.map((token) => toId(token.replace(/ \(.*\)$/, "")))
    const range = /Range (\d+)\/(\d+)/.exec(row.props.join(","))
    expect.range = range ? { normal: Number(range[1]), long: Number(range[2]) } : undefined
    expect.versatileDamage = /Versatile \((\d+d\d+)\)/.exec(row.props.join(","))?.[1]
    const ammo = /Ammunition \(Range \d+\/\d+; (\w+)\)/.exec(row.props.join(","))?.[1]
    expect.twoHandedUnlessMounted = row.props.some((token) => /unless mounted/.test(token)) ? true : undefined
    for (const [field, value] of Object.entries(expect)) {
      weaponCells++
      if (!same(entry[field], value)) weaponFailures.push(`${row.name}: ${field} is ${JSON.stringify(entry[field])}, the table says ${JSON.stringify(value)}`)
    }
    weaponCells++
    const ammoEntry = byId.get(entry.ammunition)
    if (ammo === undefined ? entry.ammunition !== undefined : !ammoEntry || ammoEntry.kind !== "ammunition" || !ammoEntry.name.startsWith(ammo === "Bullet" ? "Bullets" : `${ammo}s`)) {
      weaponFailures.push(`${row.name}: ammunition ${entry.ammunition} does not match "${ammo}"`)
    } else if (ammo === "Bullet" && ammoEntry && !ammoEntry.name.endsWith(row.name === "Sling" ? "Sling" : "Firearm")) weaponFailures.push(`${row.name}: wrong kind of bullets`)
    for (const id of entry.properties) if (!properties10.has(id)) weaponFailures.push(`${row.name}: property ${id} has no entry`)
    if (!masteryIds.has(entry.mastery)) weaponFailures.push(`${row.name}: mastery ${entry.mastery} has no entry`)
  }
  report.check("equipment", "weapons: every cell of the Weapons table (category, damage, properties, mastery, range, versatile, ammunition, weight, cost, page)", weaponCells, weaponFailures)

  // Armor -----------------------------------------------------------------------------------------------------
  const w92 = P(92)
  const armorHeaders = [...w92.matchAll(/^(Light|Medium|Heavy) Armor \((.+)\)$|^Shield \((.+)\)$/gm)].map((match) => ({
    at: match.index as number,
    category: (match[1] ?? "Shield").toLowerCase(),
    times: match[2] ?? match[3],
  }))
  const armorRow = /^([A-Z][A-Za-z ]+)\n(\+2|\d+(?: \+ Dex modifier(?: \(max \d\))?)?)\n(—|Str \d+)\n(—|Disadvantage)\n(\d+ lb\.)\n([\d,]+ [CSGEP]P)$/gm
  const officialArmor = [...w92.matchAll(armorRow)].map((match) => {
    const header = [...armorHeaders].reverse().find((item) => item.at < (match.index as number)) as (typeof armorHeaders)[number]
    return { name: match[1], category: header.category, times: header.times, ac: match[2], str: match[3], stealth: match[4], weight: weight(match[5]), cost: cost(match[6]) }
  })
  coverage(
    "equipment",
    "armor and shields",
    officialArmor.map((row) => row.name),
    of("armor").map((entry) => entry.name)
  )
  const armorFailures: string[] = []
  let armorCells = 0
  for (const row of officialArmor) {
    const entry = byId.get(toId(row.name))
    if (!entry) continue
    const times = /^(\d+) Minutes? to Don or Doff$/.exec(row.times) ?? /^(\d+) Minutes? to Don and (\d+) Minutes? to Doff$/.exec(row.times)
    const expect: Record<string, unknown> = {
      category: row.category,
      weight: row.weight,
      cost: row.cost,
      page: 92,
      stealthDisadvantage: row.stealth === "Disadvantage" ? true : undefined,
      strengthRequired: row.str === "—" ? undefined : Number(row.str.slice(4)),
    }
    if (row.category === "shield") {
      expect.acBonus = Number(row.ac.slice(1))
      expect.donDoffAction = /Utilize Action to Don or Doff/.test(row.times) ? "utilize" : undefined
    } else {
      const ac = /^(\d+)( \+ Dex modifier(?: \(max (\d)\))?)?$/.exec(row.ac) as RegExpExecArray
      expect.baseAc = Number(ac[1])
      expect.addsDexModifier = Boolean(ac[2])
      expect.dexModifierCap = ac[3] ? Number(ac[3]) : undefined
      expect.donMinutes = Number((times as RegExpExecArray)[1])
      expect.doffMinutes = Number((times as RegExpExecArray)[2] ?? (times as RegExpExecArray)[1])
    }
    for (const [field, value] of Object.entries(expect)) {
      armorCells++
      if (!same(entry[field], value)) armorFailures.push(`${row.name}: ${field} is ${JSON.stringify(entry[field])}, the table says ${JSON.stringify(value)}`)
    }
  }
  report.check("equipment", "armor: every cell of the Armor table (category, AC, Dex, cap, Strength, stealth, don and doff, weight, cost, page)", armorCells, armorFailures)

  // Tools -----------------------------------------------------------------------------------------------------
  const toolText = between(PR(93, 94), /Alchemist’s Supplies \(50 GP\)/, /\nAdventuring Gear\nThe Adventuring Gear table/)
  const toolHeadings = [...`Alchemist’s Supplies (50 GP)${toolText}`.matchAll(/^([^()\n]+?) \((Varies|[\d,]+ [CSGEP]P)\)$/gm)]
  const toolBlocks = toolHeadings.map((match, index) => ({
    name: match[1],
    cost: cost(match[2]),
    body: `Alchemist’s Supplies (50 GP)${toolText}`.slice((match.index as number) + match[0].length, toolHeadings[index + 1]?.index ?? undefined),
  }))
  const tools = of("tool")
  const toolVariantNames = (body: string) => {
    const list = flat(/Variants: ([\s\S]*)$/.exec(body)?.[1] ?? "").replace(/(\w)- (\w)/g, "$1$2")
    return [...list.matchAll(/([A-Za-z -]+?) \((\d+) ([CSGEP])P(?:, (\d+) lb\.)?\)/g)].map((match) => ({
      name: toId(match[1]),
      cost: cost(`${match[2]} ${match[3]}P`),
      weight: match[4] ? Number(match[4]) : undefined,
    }))
  }
  const officialToolNames = toolBlocks.map((block) => block.name)
  const variantNames = toolBlocks.flatMap((block) => toolVariantNames(block.body).map((variant) => variant.name))
  coverage(
    "equipment",
    "tools, including each variant",
    [...officialToolNames.map((name) => toId(name)), ...variantNames],
    tools.map((entry) => entry.id)
  )
  const nameOf = new Map<string, string>()
  for (const entry of data) {
    nameOf.set(squash(entry.name), entry.id)
    const comma = entry.name.indexOf(", ")
    if (comma > 0) nameOf.set(squash(`${entry.name.slice(comma + 2)} ${entry.name.slice(0, comma)}`), entry.id)
  }
  const toolFailures: string[] = []
  let toolCells = 0
  const flatBody = (block: { body: string }, label: string) => {
    const match = new RegExp(`${label}: ([\\s\\S]*?)(?=\\n(?:Ability|Weight|Utilize|Craft|Variants): |\\n(?:Other Tools)\\n|$)`).exec(block.body)
    return match ? flat(match[1]).replace(/(\w)- ([a-z])/g, "$1$2") : undefined
  }
  for (const block of toolBlocks) {
    const entry = byId.get(toId(block.name))
    if (!entry) continue
    const ability = flatBody(block, "Ability") as string
    const w = weight(flatBody(block, "Weight") ?? "")
    const utilize = flatBody(block, "Utilize")
    const craft = flatBody(block, "Craft")
    const checks: [string, unknown, unknown][] = [
      ["ability", entry.ability, abilityIdOf[ability]],
      ["weight", entry.weight, w],
      ["cost", entry.cost, block.cost],
      ["page", entry.page, pagesWithHeading(block.name)],
    ]
    for (const [field, got, want] of checks) {
      toolCells++
      if (!same(got, want)) toolFailures.push(`${block.name}: ${field} is ${JSON.stringify(got)}, the text says ${JSON.stringify(want)}`)
    }
    toolCells++
    const expectedUtilize = utilize ? [...utilize.matchAll(/\(DC (\d+)\)/g)].map((match) => Number(match[1])) : []
    const gotUtilize = (entry.utilize ?? []).map((item: Entry) => item.dc)
    const rebuilt = (entry.utilize ?? []).map((item: Entry) => `${item.action} (DC ${item.dc})`).join(" or ")
    if (!same(gotUtilize, expectedUtilize) || squash(rebuilt) !== squash(utilize ?? "")) toolFailures.push(`${block.name}: Utilize does not reproduce the official line`)
    toolCells++
    if (craft === undefined) {
      if (entry.craft) toolFailures.push(`${block.name}: has a Craft entry the text lacks`)
    } else {
      const segments = splitTop(craft.replace(/\.$/, ""))
      const items: Entry[] = entry.craft?.items ?? []
      const categories: Entry[] = entry.craft?.categories ?? []
      if (segments.length !== items.length + categories.length) toolFailures.push(`${block.name}: Craft lists ${segments.length} things, the data ${items.length + categories.length}`)
      for (const id of items)
        if (!squash(craft).includes(squash((byId.get(id as unknown as string) as Entry)?.name ?? "?")) && !reversedIn(craft, byId.get(id as unknown as string)))
          toolFailures.push(`${block.name}: craft item ${id} is not in the Craft line`)
      for (const category of categories) {
        const label = { "melee-weapon": "Any Melee weapon", "ranged-weapon": "Ranged weapons", "medium-armor": "Medium armor", "heavy-armor": "Heavy armor" }[category.category as string] as string
        if (!squash(craft).includes(squash(label))) toolFailures.push(`${block.name}: category ${category.category} is not in the Craft line`)
        for (const id of category.except ?? [])
          if (!squash(craft).includes(squash((byId.get(id) as Entry).name.replace(/ Armor$/, "")))) toolFailures.push(`${block.name}: exception ${id} is not in the Craft line`)
      }
      for (const segment of segments) {
        const id = [...nameOf].find(([name]) => name === squash(segment.replace(/ \(except.*$/, "")))?.[1]
        const categoryNames = ["anymeleeweapon", "rangedweapons", "mediumarmor", "heavyarmor"]
        if (!id && !categoryNames.includes(squash(segment.replace(/ \(except.*$/, "")))) toolFailures.push(`${block.name}: Craft names "${segment}", which is no entry`)
        else if (id && !items.includes(id as unknown as Entry)) toolFailures.push(`${block.name}: Craft names ${id}, which the data lacks`)
      }
    }
    toolCells++
    const variants = toolVariantNames(block.body)
    if (
      !same(
        entry.variants ?? [],
        variants.map((variant) => variant.name)
      )
    )
      toolFailures.push(`${block.name}: variants differ from the official list`)
    for (const variant of variants) {
      toolCells += 4
      const child = byId.get(variant.name)
      if (!child) continue
      if (!same(child.cost, variant.cost) || child.weight !== variant.weight || child.variantOf !== entry.id || child.ability !== entry.ability || !same(child.utilize, entry.utilize))
        toolFailures.push(`${variant.name}: variant fields differ from the official list or its parent`)
    }
  }
  report.check("equipment", "tools: ability, weight, cost, page, Utilize actions and DCs, Craft list, variants with their own cost and weight", toolCells, toolFailures)

  function reversedIn(craft: string, entry: Entry | undefined) {
    if (!entry) return false
    const comma = entry.name.indexOf(", ")
    return comma > 0 && squash(craft).includes(squash(`${entry.name.slice(comma + 2)} ${entry.name.slice(0, comma)}`))
  }
  function pagesWithHeading(name: string) {
    for (const page of [93, 94]) if (new RegExp(`^${esc(name)} \\(`, "m").test(P(page))) return page
    return undefined
  }

  // Adventuring gear, packs, groups, ammunition, focuses ----------------------------------------------------------
  const gearTable = PR(95, 95).replace(/^Adventuring Gear\nItem\nWeight\nCost\n/, "")
  const gearRow = /^(.+)\n(—|Varies|[\d½/ ]+ lb\.(?: \(full\))?)\n(Varies|[\d,]+ [CSGEP]P)$/gm
  const officialGear = [...gearTable.matchAll(gearRow)].map((match) => ({ name: match[1], weightText: match[2], weight: weight(match[2]), cost: cost(match[3]), costText: match[3] }))
  const gearEntries = data.filter((entry) => ["gear", "pack"].includes(entry.kind) || (entry.kind === "group" && entry.id !== "spell-scroll"))
  coverage(
    "equipment",
    "Adventuring Gear table",
    officialGear.map((row) => row.name),
    gearEntries.map((entry) => entry.name)
  )
  const gearFailures: string[] = []
  let gearCells = 0
  for (const row of officialGear) {
    const entry = byId.get(toId(row.name))
    if (!entry) continue
    const expect: [string, unknown, unknown][] = [
      ["weight", entry.weight, row.weight],
      ["cost", entry.cost, row.cost],
      ["weightWhenFull", entry.weightWhenFull, row.weightText.includes("(full)") ? true : undefined],
    ]
    for (const [field, got, want] of expect) {
      gearCells++
      if (!same(got, want)) gearFailures.push(`${row.name}: ${field} is ${JSON.stringify(got)}, the table says ${JSON.stringify(want)}`)
    }
  }
  report.check("equipment", "gear: weight and cost of every Adventuring Gear row", gearCells, gearFailures)

  // Description blocks, by heading, with the tables left out.
  const gearText = [P(94).slice(P(94).indexOf("Acid (25 GP)")), P(96).slice(P(96).indexOf("Antitoxin (50 GP)")), PR(97, 99), P(100).slice(0, P(100).indexOf("Mounts and Vehicles"))]
    .join("\n")
    .replace(/Spell Scroll \(Cantrip, 30 GP; \nLevel 1, 50 GP\)/, "Spell Scroll (Varies)")
    .replace(/^(Arcane Focuses|Druidic Focuses|Holy Symbols)\n[\s\S]*?(?=^[^()\n]+ \((?:Varies|[\d,]+ [CSGEP]P)\)$)/gm, "")
  const gearHeadings = [...gearText.matchAll(/^([^()\n]+?) \((Varies|[\d,]+ [CSGEP]P)\)$/gm)]
  const gearBlocks = gearHeadings.map((match, index) => ({
    name: match[1],
    costText: match[2],
    body: gearText.slice((match.index as number) + match[0].length, gearHeadings[index + 1]?.index ?? undefined),
    page: [94, 96, 97, 98, 99, 100].find((page) => P(page).includes(match[1] === "Spell Scroll" ? "Spell Scroll (Cantrip, 30 GP;" : `${match[1]} (${match[2]})`)) as number,
  }))
  const blockFailures: string[] = []
  const waived: string[] = []
  let blockCount = 0
  for (const block of gearBlocks) {
    const entries = block.name === "Spell Scroll" ? [byId.get("spell-scroll-cantrip"), byId.get("spell-scroll-level-1")] : [byId.get(toId(block.name))]
    for (const entry of entries) {
      blockCount++
      if (!entry) {
        blockFailures.push(`${block.name}: has a heading but no entry`)
        continue
      }
      const heading = block.name === "Spell Scroll" ? undefined : cost(block.costText)
      if (block.name !== "Spell Scroll" && !same(entry.cost, heading)) blockFailures.push(`${block.name}: heading cost ${block.costText} differs from the data ${costText(entry.cost)}`)
      if (entry.page !== block.page) blockFailures.push(`${block.name}: page is ${entry.page}, the heading is on page ${block.page}`)
      // The PDF text prints the glass bottle's 1½ pints as "11/2".
      const description = (entry.description as string).replace("1½ pints", "11/2 pints")
      if (entry.description?.includes("1½ pints") && !waived.length) waived.push("bottle-glass: the PDF text reads 11/2 pints where the SRD prints 1½, so the check compares the PDF spelling")
      if (squash(description) !== squash(block.body)) blockFailures.push(`${block.name}: description is not the whole block under its heading`)
    }
  }
  report.check("equipment", "gear: every description is the whole official block under its heading, and its heading cost and page agree", blockCount, blockFailures, waived)

  // Typed mechanics against the description they came from.
  const mechFailures: string[] = []
  let mechTotal = 0
  for (const entry of data.filter((item) => item.kind === "gear")) {
    const mech = Object.fromEntries(mechanicKeys.filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]]))
    const text: string = entry.description
    const typed = leaves(mech)
    mechTotal++
    // DCs
    const textDcs = [...text.matchAll(/\bDC (?:is )?(\d+)(?! plus)\b/g)].map((match) => Number(match[1]))
    const dcs = collectDcs(mech)
    if (!same(sorted(textDcs), sorted(dcs))) mechFailures.push(`${entry.id}: DCs in the text ${textDcs.join(",")} but typed ${dcs.join(",")}`)
    // Dice
    const textDice = [...text.matchAll(/\d+d\d+(?: \+ \d+)?/g)].map((match) => match[0])
    const typedDice = typed.filter(([key]) => key === "dice").map(([, value]) => value)
    mechTotal++
    if (!same(sorted(textDice), sorted(typedDice))) mechFailures.push(`${entry.id}: dice in the text ${textDice.join(",")} but typed ${typedDice.join(",")}`)
    // Fixed damage
    const textFixed = [...text.matchAll(new RegExp(`(?<![\\dd+] ?)(?<![\\dd])(\\d+) (?:${damageTypes.join("|")}) damage`, "g"))].map((match) => Number(match[1]))
    const typedFixed = collectFixed(mech)
    mechTotal++
    if (!same(sorted(textFixed), sorted(typedFixed))) mechFailures.push(`${entry.id}: fixed damage in the text ${textFixed.join(",")} but typed ${typedFixed.join(",")}`)
    // Damage types and conditions
    const textTypes = new Set([...text.matchAll(new RegExp(`\\b(${damageTypes.join("|")})\\b`, "g"))].map((match) => match[1].toLowerCase()))
    const typedTypes = new Set(typed.filter(([, value]) => typeof value === "string" && damageTypes.map((name) => name.toLowerCase()).includes(value)).map(([, value]) => value))
    mechTotal++
    if (!same(sorted([...textTypes]), sorted([...typedTypes]))) mechFailures.push(`${entry.id}: damage types in the text ${[...textTypes]} but typed ${[...typedTypes]}`)
    const textConditions = new Set([...text.matchAll(new RegExp(`\\b(${conditions.join("|")})\\b`, "g"))].map((match) => match[1].toLowerCase()))
    const typedConditions = new Set(typed.filter(([, value]) => typeof value === "string" && conditions.map((name) => name.toLowerCase()).includes(value)).map(([, value]) => value))
    mechTotal++
    if (!same(sorted([...textConditions]), sorted([...typedConditions]))) mechFailures.push(`${entry.id}: conditions in the text ${[...textConditions]} but typed ${[...typedConditions]}`)
    // Ability checks and saves
    const textChecks = [...text.matchAll(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?: \(([A-Za-z, ]+)\))? checks?\b/g)].flatMap((match) =>
      match[2] ? match[2].split(/,\s*(?:or )?|\s+or\s+/).map((skill) => `${abilityIdOf[match[1]]}:${toId(skill)}`) : [`${abilityIdOf[match[1]]}:`]
    )
    const typedChecks = [
      ...(entry.checks ?? []).map((check: Entry) => `${check.ability}:${check.skill}`),
      ...(entry.modifiers ?? [])
        .filter((mod: Entry) => mod.on === "check" && mod.ability)
        .flatMap((mod: Entry) => (mod.skills ? mod.skills.map((skill: string) => `${mod.ability}:${skill}`) : [`${mod.ability}:`])),
      ...(entry.stabilize ? [`${entry.stabilize.replacesCheck.ability}:${entry.stabilize.replacesCheck.skill}`] : []),
    ]
    mechTotal++
    if (!same(sorted(textChecks), sorted(typedChecks))) mechFailures.push(`${entry.id}: ability checks in the text ${textChecks} but typed ${typedChecks}`)
    const textSaves = [...text.matchAll(/\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throws?\b/g)].map((match) => abilityIdOf[match[1]])
    const saveHolders = [entry.hazard, entry.spaceHazard].filter((holder) => holder?.save).map((holder) => holder.save.ability)
    mechTotal++
    if (!same(sorted(textSaves), sorted(saveHolders))) mechFailures.push(`${entry.id}: saving throws in the text ${textSaves} but typed ${saveHolders}`)
    // Every other typed number is a number the text states.
    const stated = numbersIn(text)
    for (const [key, value] of typed) {
      if (typeof value !== "number" || (key === "spellLevel" && value === 0)) continue
      mechTotal++
      if (!stated.has(value)) mechFailures.push(`${entry.id}: ${key} ${value} is not a number in the text`)
    }
    // Wording that says when a modifier applies is the SRD's own.
    for (const mod of entry.modifiers ?? []) {
      mechTotal++
      if (!squash(text).includes(squash(mod.when))) mechFailures.push(`${entry.id}: modifier wording "${mod.when}" is not in the description`)
    }
    // Ids a gear entry points at.
    for (const id of [entry.light?.fuel, ...(entry.capacity?.holds ?? []).map((hold: Entry) => hold.item)].filter(Boolean)) {
      mechTotal++
      if (!byId.has(id)) mechFailures.push(`${entry.id}: ${id} has no entry`)
    }
  }
  report.check("equipment", "gear: typed mechanics agree with the description (DCs, dice, fixed damage, damage types, conditions, ability checks, saves, every number)", mechTotal, mechFailures)

  // Packs
  const packFailures: string[] = []
  let packTotal = 0
  for (const pack of of("pack")) {
    const list = flat(/following items: ([\s\S]*)\.$/.exec(pack.description.replace(/\n/g, " "))?.[1] ?? "")
    const segments = splitTop(list).map((part) => part.replace(/^and /, ""))
    const quantity = segments.reduce((sum, part) => sum + (/^(\d+) /.exec(part) ? Number(/^(\d+) /.exec(part)?.[1]) : 1), 0)
    packTotal += 1 + pack.contents.length
    if (segments.length !== pack.contents.length) packFailures.push(`${pack.name}: ${segments.length} items listed, ${pack.contents.length} in the data`)
    if (quantity !== pack.contents.reduce((sum: number, item: Entry) => sum + item.quantity, 0)) packFailures.push(`${pack.name}: quantities differ`)
    pack.contents.forEach((item: Entry, index: number) => {
      const target = byId.get(item.item)
      const part = segments[index] ?? ""
      if (!target) packFailures.push(`${pack.name}: ${item.item} has no entry`)
      else if (
        !squash(part).includes(squash(target.name.replace(/s$/, ""))) &&
        !reversedIn(part.replace(/s$/, ""), target) &&
        !squash(part).includes(squash(target.name.split(", ").reverse().join(" ")).replace(/s$/, ""))
      )
        packFailures.push(`${pack.name}: item ${index + 1} "${part}" is not ${target.name}`)
      const lead = /^(\d+) /.exec(part)
      if (item.quantity !== (lead ? Number(lead[1]) : 1)) packFailures.push(`${pack.name}: ${item.item} quantity ${item.quantity}, the text says "${part}"`)
    })
  }
  report.check("equipment", "packs: contents and quantities against the sentence that lists them", packTotal, packFailures)

  // Ammunition and focus tables
  const ammoTable = between(P(96), /^Ammunition\nType\nAmount\nStorage\nWeight\nCost\n/m, /^Antitoxin \(50 GP\)/m)
  const officialAmmo = [...ammoTable.matchAll(/^(.+)\n(\d+)\n(Quiver|Case|Pouch)\n([\d½/ ]+ lb\.)\n([\d,]+ [CSGEP]P)$/gm)]
  const ammoFailures: string[] = []
  const ammoStorage: Record<string, string> = { Quiver: "quiver", Case: "case-crossbow-bolt", Pouch: "pouch" }
  coverage(
    "equipment",
    "ammunition",
    officialAmmo.map((match) => match[1]),
    of("ammunition").map((entry) => entry.name)
  )
  for (const match of officialAmmo) {
    const entry = byId.get(toId(match[1]))
    if (!entry) continue
    if (entry.amount !== Number(match[2]) || entry.storage !== ammoStorage[match[3]] || entry.weight !== weight(match[4]) || !same(entry.cost, cost(match[5])) || entry.page !== 96)
      ammoFailures.push(`${match[1]}: a cell differs from the Ammunition table`)
  }
  report.check("equipment", "ammunition: amount, storage, weight, cost, page of each Ammunition row", officialAmmo.length * 5, ammoFailures)

  const focusFailures: string[] = []
  let focusCells = 0
  const focusSources = [
    { title: "Arcane Focuses", page: 96, group: "arcane-focus", classes: ["sorcerer", "warlock", "wizard"] },
    { title: "Druidic Focuses", page: 97, group: "druidic-focus", classes: ["druid", "ranger"] },
    { title: "Holy Symbols", page: 97, group: "holy-symbol", classes: ["cleric", "paladin"] },
  ]
  const officialFocus: string[] = []
  for (const source of focusSources) {
    const table = between(P(source.page), new RegExp(`^${source.title}\\n(?:Focus|Symbol)\\nWeight\\nCost\\n`, "m"), /\n(?:[^\n]+ \((?:Varies|[\d,]+ [CSGEP]P)\)|Backpack)\n/)
    const rows = [...`${table}\n`.matchAll(/^(.+)\n(—|[\d½/ ]+ lb\.)\n([\d,]+ [CSGEP]P)\n/gm)]
    const group = byId.get(source.group) as Entry
    for (const row of rows) {
      const id = toId(row[1].replace(/ \(.*\)$/, ""))
      officialFocus.push(id)
      const entry = byId.get(id)
      if (!entry) continue
      const detail = /\((.+)\)/.exec(row[1])?.[1]
      focusCells += 6
      const carried = detail === "worn or held" ? ["worn", "held"] : detail === "held" ? ["held"] : detail?.startsWith("borne") ? ["borne"] : undefined
      if (
        !same(entry.cost, cost(row[3])) ||
        entry.weight !== weight(row[2]) ||
        !same(entry.usedBy, source.classes) ||
        !same(entry.carried, carried) ||
        entry.alsoQuarterstaff !== (detail === "also a Quarterstaff" ? true : undefined) ||
        entry.page !== group.page
      )
        focusFailures.push(`${row[1]}: a cell differs from the ${source.title} table`)
      if (!group.members.includes(id)) focusFailures.push(`${id}: not a member of ${source.group}`)
    }
    if (
      !same(
        group.members,
        rows.map((row) => toId(row[1].replace(/ \(.*\)$/, "")))
      )
    )
      focusFailures.push(`${source.group}: members differ from the table`)
  }
  coverage(
    "equipment",
    "spellcasting focuses",
    officialFocus,
    of("focus").map((entry) => entry.id)
  )
  report.check("equipment", "focuses: cost, weight, class, how carried, Quarterstaff, page of each table row", focusCells, focusFailures)

  // Mounts, tack, vehicles, ships -----------------------------------------------------------------------------
  const w100 = P(100)
  const mountTable = between(w100, /^Mounts and Other Animals\nItem\nCarrying Capacity\nCost\n/m, /^Tack, Harness, and Drawn Vehicles$/m)
  const officialMounts = [...mountTable.matchAll(/^(.+)\n([\d,]+) lb\.\n([\d,]+ [CSGEP]P)$/gm)]
  coverage(
    "equipment",
    "mounts and other animals",
    officialMounts.map((match) => match[1]),
    of("mount").map((entry) => entry.name)
  )
  const monsterNames = pages
    .slice(0, 20)
    .join("\n")
    .split("\n")
    .map((line) => line.replace(/\.{3,}.*$/, "").trim())
  const mountFailures: string[] = []
  for (const match of officialMounts) {
    const entry = byId.get(toId(match[1]))
    if (!entry) continue
    if (entry.carryingCapacityPounds !== Number(match[2].replace(/,/g, "")) || !same(entry.cost, cost(match[3])) || entry.page !== 100) mountFailures.push(`${match[1]}: a cell differs from the table`)
    const statBlock = entry.statBlock
      .split("-")
      .map((word: string) => word[0].toUpperCase() + word.slice(1))
      .join(" ")
    if (!monsterNames.includes(statBlock)) mountFailures.push(`${match[1]}: no monster named ${statBlock} in the contents`)
    if (existsSync(dataPath("monsters")) && !readData("monsters").some((monster) => monster.id === entry.statBlock))
      mountFailures.push(`${match[1]}: stat block ${entry.statBlock} is not in the monsters data`)
  }
  report.check("equipment", "mounts: carrying capacity, cost, page, and the monster stat block the table points to", officialMounts.length * 4, mountFailures)

  const tackTable = between(w100, /^Tack, Harness, and Drawn Vehicles\nItem\nWeight\nCost\n/m, /^Large Vehicles$/m)
  const tackRows: { name: string; weight?: number; cost?: Cost }[] = []
  let saddleGroup = false
  for (const match of tackTable.matchAll(/^(?:(Saddle)\n)?(.+)\n(—|[\d,]+ lb\.)\n([\d,]+ [CSGEP]P)$|^(Saddle)$/gm)) {
    if (match[1]) saddleGroup = true
    if (match[5]) saddleGroup = true
    else {
      const sub = match[1] ? true : saddleGroup && ["Exotic", "Military", "Riding"].includes(match[2])
      tackRows.push({ name: sub ? `Saddle, ${match[2]}` : match[2], weight: weight(match[3]), cost: cost(match[4]) })
    }
  }
  const tackData = data.filter((entry) => ["vehicle", "tack"].includes(entry.kind) || entry.id === "stabling-per-day")
  coverage(
    "equipment",
    "tack, harness and drawn vehicles",
    tackRows.map((row) => row.name),
    tackData.map((entry) => entry.name)
  )
  const tackFailures: string[] = []
  for (const row of tackRows) {
    const entry = byId.get(toId(row.name))
    if (!entry) continue
    const kind = row.name.startsWith("Saddle") || row.name === "Feed per day" ? "tack" : row.name === "Stabling per day" ? "service" : "vehicle"
    if (entry.kind !== kind || entry.weight !== row.weight || !same(entry.cost, row.cost) || entry.page !== 100 || entry.per !== (/per day$/.test(row.name) ? "day" : undefined))
      tackFailures.push(`${row.name}: a cell differs from the table`)
  }
  report.check("equipment", "tack and vehicles: weight, cost, kind, page of each row", tackRows.length * 5, tackFailures)

  const shipRows = [...P(101).matchAll(/^([A-Z][A-Za-z ]+)\n(\d+(?:½)?) mph\n(\d+)\n(\d+|—)\n(1\/2|\d+|—)\n(\d+)\n(\d+)\n(\d+|—)\n([\d,]+ [CSGEP]P)$/gm)]
  coverage(
    "equipment",
    "airborne and waterborne vehicles",
    shipRows.map((match) => match[1]),
    of("ship").map((entry) => entry.name)
  )
  const shipFailures: string[] = []
  const optional = (text: string) => (text === "—" ? undefined : Number(text))
  for (const match of shipRows) {
    const entry = byId.get(toId(match[1]))
    if (!entry) continue
    const speed = Number(match[2].replace("½", "")) + (match[2].includes("½") ? 0.5 : 0)
    const want = {
      speedMph: speed,
      crew: Number(match[3]),
      passengers: optional(match[4]),
      cargoTons: match[5] === "1/2" ? 0.5 : optional(match[5]),
      ac: Number(match[6]),
      hp: Number(match[7]),
      damageThreshold: optional(match[8]),
      cost: cost(match[9]),
      page: 101,
      travel: match[1] === "Airship" ? "air" : "water",
      weight: match[1] === "Rowboat" ? 100 : undefined,
    }
    for (const [field, value] of Object.entries(want))
      if (!same(entry[field], value)) shipFailures.push(`${match[1]}: ${field} is ${JSON.stringify(entry[field])}, the table says ${JSON.stringify(value)}`)
  }
  if (!/A Rowboat can be carried and\s+weighs 100 pounds/.test(P(100))) shipFailures.push("the Rowboat weight sentence is gone")
  report.check("equipment", "ships: speed, crew, passengers, cargo, AC, HP, damage threshold, cost, page, Rowboat weight", shipRows.length * 10, shipFailures)

  // Lifestyles, food, services -----------------------------------------------------------------------------
  const lifestyleHeads = [...P(101).matchAll(/^(Wretched|Squalid|Poor|Modest|Comfortable|Wealthy|Aristocratic) \((Free|[\d,]+ [CSGEP]P per Day)\)$/gm)]
  coverage(
    "equipment",
    "lifestyle expenses",
    lifestyleHeads.map((match) => match[1]),
    of("lifestyle").map((entry) => entry.name)
  )
  const lifestyleFailures: string[] = []
  lifestyleHeads.forEach((match, index) => {
    const entry = byId.get(toId(match[1]))
    if (!entry) return
    const stop = lifestyleHeads[index + 1]?.index ?? P(101).indexOf("Food, Drink, and Lodging\nThe Food")
    const body = P(101).slice((match.index as number) + match[0].length, stop)
    const want = match[2] === "Free" ? undefined : cost(match[2].replace(" per Day", ""))
    if (!same(entry.costPerDay, want) || entry.tier !== match[1].toLowerCase() || entry.page !== 101 || squash(entry.description) !== squash(body))
      lifestyleFailures.push(`${match[1]}: a field differs from the official heading or text`)
  })
  report.check("equipment", "lifestyles: tier, daily cost, page, whole description", lifestyleHeads.length * 4, lifestyleFailures)

  const foodRegion = `${P(101).slice(P(101).lastIndexOf("Food, Drink, and Lodging"), P(101).indexOf("Airborne and Waterborne Vehicles"))}\n${P(102).slice(0, P(102).indexOf("Hirelings"))}`
  const officialFoodCosts = [...foodRegion.matchAll(/^(\d+ [CSGEP]P)$/gm)].map((match) => match[1])
  const expectedFoodCosts = ["4 CP", "2 CP", "1 SP", "7 CP", "1 SP", "5 SP", "8 SP", "2 GP", "4 GP", "1 CP", "2 CP", "1 SP", "2 SP", "3 SP", "6 SP", "2 SP", "10 GP"]
  const foodFailures: string[] = []
  const foodLabels = foodRegion.replace(/\n/g, " ")
  if (!same(officialFoodCosts, expectedFoodCosts)) foodFailures.push(`the official cost cells read ${officialFoodCosts.join(", ")}`)
  for (const label of ["Ale (mug)", "Bread (loaf)", "Cheese (wedge)", "Inn Stay per Day", "Wine (bottle)"])
    if (!foodLabels.includes(label)) foodFailures.push(`label ${label} is not in the table text`)
  const foodRows = [...of("food"), ...of("inn-stay"), ...of("meal")]
  const orderedFood = [
    "ale-mug",
    "bread-loaf",
    "cheese-wedge",
    ...["squalid", "poor", "modest", "comfortable", "wealthy", "aristocratic"].map((tier) => `inn-stay-${tier}`),
    ...["squalid", "poor", "modest", "comfortable", "wealthy", "aristocratic"].map((tier) => `meal-${tier}`),
    "wine-common",
    "wine-fine",
  ]
  if (foodRows.length !== orderedFood.length) foodFailures.push(`${foodRows.length} food rows in the data, ${orderedFood.length} in the table`)
  orderedFood.forEach((id, index) => {
    const entry = byId.get(id)
    if (!entry) foodFailures.push(`${id} is missing`)
    else if (!same(entry.cost, cost(expectedFoodCosts[index])) || entry.page !== (index < 12 ? 101 : 102))
      foodFailures.push(`${id}: cost ${costText(entry.cost)} page ${entry.page} differs from cell ${expectedFoodCosts[index]}`)
  })
  report.check("equipment", "food, drink and lodging: every cost cell, read in table order across the page break", expectedFoodCosts.length * 2, foodFailures)

  const w102 = P(102)
  const spellRows = [
    ...between(w102, /^Spellcasting Services\nSpell Level\nAvailability\nCost\n/m, /^Magic Items$/m).matchAll(
      /^(Cantrip|\d|\d–\d)\n(Village, town, or city|Town or city only|City only)\n([\d,]+ [CSGEP]P)$/gm
    ),
  ]
  const spellFailures: string[] = []
  const spellData = of("spellcasting-service")
  coverage(
    "equipment",
    "spellcasting services (by spell level)",
    spellRows.map((match) => `${match[1]}`),
    spellData.map((entry) => (entry.minSpellLevel === 0 ? "Cantrip" : entry.minSpellLevel === entry.maxSpellLevel ? String(entry.minSpellLevel) : `${entry.minSpellLevel}–${entry.maxSpellLevel}`))
  )
  for (const match of spellRows) {
    const range = match[1].split("–")
    const min = match[1] === "Cantrip" ? 0 : Number(range[0])
    const entry = spellData.find((item) => item.minSpellLevel === min)
    if (!entry) continue
    const from = { "Village, town, or city": "village", "Town or city only": "town", "City only": "city" }[match[2]]
    if (entry.maxSpellLevel !== Number(range[1] ?? min) || entry.availableFrom !== from || !same(entry.cost, cost(match[3])) || entry.page !== 102)
      spellFailures.push(`${match[1]}: a cell differs from the table`)
  }
  report.check("equipment", "spellcasting services: level range, availability, cost, page", spellRows.length * 4, spellFailures)

  const hireRows = [...between(w102, /^Hirelings\nService\nCost\n/m, /^Spellcasting$/m).matchAll(/^(.+)\n(\d+ [CSGEP]P) per (day|mile)$/gm)]
  coverage(
    "equipment",
    "hirelings and messenger",
    hireRows.map((match) => match[1]),
    data.filter((entry) => ["skilled-hireling", "untrained-hireling", "messenger"].includes(entry.id)).map((entry) => entry.name)
  )
  const hireFailures: string[] = []
  for (const match of hireRows) {
    const entry = byId.get(toId(match[1]))
    if (entry && (entry.kind !== "service" || !same(entry.cost, cost(match[2])) || entry.per !== match[3] || entry.page !== 102)) hireFailures.push(`${match[1]}: a cell differs from the table`)
  }
  report.check("equipment", "hirelings: cost, unit, page", hireRows.length * 3, hireFailures)

  // Weapon properties and masteries ---------------------------------------------------------------------------
  const propertyText = `${between(P(89), /^Here are definitions .*\n/m, /$(?![\s\S])/)}\n${between(P(90), /^/, /^Mastery Properties$/m)}`
  const definitions = (text: string, entries: Entry[], label: string, firstPages: number[]) => {
    const heads = [...text.matchAll(/^([A-Z][A-Za-z-]+)$/gm)]
    coverage(
      "equipment",
      label,
      heads.map((match) => match[1]),
      entries.map((entry) => entry.name)
    )
    const failures: string[] = []
    heads.forEach((match, index) => {
      const entry = entries.find((item) => item.id === toId(match[1]))
      if (!entry) return
      const next = heads[index + 1]
      const stop = next ? (next.index as number) : text.length
      let body = text.slice((match.index as number) + match[0].length, stop)
      body = body.replace(/^\nImprovised Weapons\n[\s\S]*$/, "")
      if (squash(entry.description) !== squash(body)) failures.push(`${match[1]}: description is not the whole official paragraph`)
      if (!firstPages.includes(entry.page) || !P(entry.page).includes(`\n${match[1]}\n`)) failures.push(`${match[1]}: page ${entry.page} is not where the heading is`)
    })
    report.check("equipment", `${label}: whole official description and page`, heads.length * 2, failures)
  }
  definitions(propertyText.replace(/\nImprovised Weapons\n[\s\S]*?(?=\nLoading\n)/, ""), properties, "weapon properties", [89, 90])
  const masteryText = between(P(90), /^character\. The properties are defined below\.$/m, /$(?![\s\S])/)
  definitions(masteryText, masteries, "weapon mastery properties", [90])

  const propertyFailures: string[] = []
  const prop = (id: string) => properties.find((entry) => entry.id === id) as Entry
  const mastery = (id: string) => masteries.find((entry) => entry.id === id) as Entry
  const typedProps: [string, unknown, unknown, RegExp][] = [
    ["heavy", prop("heavy")?.minimumScore, 13, /Strength score isn’t at least 13/],
    ["reach", prop("reach")?.reachBonusFeet, 5, /adds 5 feet to your reach/],
    ["push", mastery("push")?.pushFeet, 10, /up to 10 feet straight away/],
    ["push", mastery("push")?.maxSize, "Large", /if it is Large or smaller/],
    ["slow", mastery("slow")?.speedReductionFeet, 10, /reduce its Speed by 10 feet/],
    ["topple", mastery("topple")?.save?.ability, "con", /Constitution saving throw/],
    ["topple", mastery("topple")?.condition, "prone", /has the Prone condition/],
  ]
  for (const [name, got, want, pattern] of typedProps) {
    const description = (prop(name) ?? mastery(name))?.description ?? ""
    if (got !== want || !pattern.test(flat(description))) propertyFailures.push(`${name}: typed value ${JSON.stringify(got)} is not ${JSON.stringify(want)} per the text`)
  }
  for (const entry of [...properties, ...masteries])
    for (const field of Object.keys(entry))
      if (["minimumScore", "reachBonusFeet", "pushFeet", "maxSize", "speedReductionFeet", "save", "condition"].includes(field) && !typedProps.some(([name]) => name === entry.id))
        propertyFailures.push(`${entry.id}: unexpected typed field ${field}`)
  report.check("equipment", "properties and masteries: typed numbers, sizes, saves and conditions against the wording", typedProps.length + properties.length + masteries.length, propertyFailures)

  // Poisons ------------------------------------------------------------------------------------------------------
  const poisonText = `${P(197).slice(P(197).indexOf("Sample Poisons"))}\n${P(198)}`
  const poisonHeads = [...poisonText.matchAll(/^([^()\n]+?) \(([\d,]+ GP)\)\n(Contact|Ingested|Inhaled|Injury) Poison$/gm)]
  coverage(
    "equipment",
    "poisons",
    poisonHeads.map((match) => match[1]),
    poisons.map((entry) => entry.name)
  )
  const poisonFailures: string[] = []
  let poisonCells = 0
  poisonHeads.forEach((match, index) => {
    const entry = poisons.find((item) => item.id === toId(match[1]))
    if (!entry) return
    const body = poisonText.slice((match.index as number) + match[0].length, poisonHeads[index + 1]?.index ?? undefined)
    const text = flat(body).replace(/(\w)- (\w)/g, "$1$2")
    const wrong = (what: string) => poisonFailures.push(`${match[1]}: ${what}`)
    poisonCells += 12
    if (entry.type !== match[3].toLowerCase() || !same(entry.cost, cost(match[2]))) wrong("type or cost differs from the heading")
    if (entry.page !== (P(197).includes(match[0]) ? 197 : 198)) wrong("page differs")
    if (squash(entry.description) !== squash(body)) wrong("description is not the whole block")
    if (entry.save?.dc !== Number(/DC (\d+) Constitution saving throw/.exec(text)?.[1])) wrong("save DC differs")
    const damage = [...text.matchAll(/(\d+) \((\d+d\d+)\) Poison damage/g)].map((item) => ({ average: Number(item[1]), dice: item[2], type: "poison" }))
    const first = entry.repeat ? damage.slice(0, damage.length - 1) : damage
    const typedFirst = entry.damage ? [entry.damage] : []
    // With a repeat, the repeating damage is the last one named. Burnt Othur Fumes and Pale Tincture state both.
    if (!same(typedFirst, first.slice(0, 1)) && !(entry.repeat && !entry.damage && first.length === 0))
      wrong(`damage ${JSON.stringify(typedFirst)} but the text says ${JSON.stringify(first.slice(0, 1))}`)
    if (entry.repeat?.damage && !same(entry.repeat.damage, damage.at(-1))) wrong("repeat damage differs")
    if (Boolean(entry.halfDamageOnSave) !== /half as much damage/.test(text)) wrong("half damage on a save differs")
    const imposed = text.replace("ends the Poisoned condition neutralizes", "")
    if (/neutralizes this poison/.test(text) !== Boolean(entry.neutralizedByEndingPoisoned)) wrong("neutralized by ending Poisoned differs")
    const textConditions = new Set([...imposed.matchAll(new RegExp(`\\b(${conditions.join("|")})\\b`, "g"))].map((item) => item[1].toLowerCase()))
    const typedConditions = new Set((entry.conditions ?? []).map((item: Entry) => item.condition))
    if (!same(sorted([...textConditions]), sorted([...typedConditions]))) wrong(`conditions ${[...typedConditions]} but the text names ${[...textConditions]}`)
    const durations = [...text.matchAll(/Poisoned condition for (\d+d\d+|\d+) (minute|hour)s?/g)].map((item) => ({ amount: /d/.test(item[1]) ? item[1] : Number(item[1]), unit: item[2] }))
    const typedDurations = (entry.conditions ?? []).filter((item: Entry) => item.duration).map((item: Entry) => item.duration)
    if (!same(durations, typedDurations)) wrong(`durations ${JSON.stringify(typedDurations)} but the text says ${JSON.stringify(durations)}`)
    for (const item of entry.conditions ?? []) {
      if (item.condition !== "poisoned" && item.whilePoisoned !== (/while Poisoned in this way/.test(text) ? true : undefined)) wrong(`${item.condition} should be held while Poisoned`)
      if ((item.failedByAtLeast === 5) !== /fails the save by 5 or more/.test(text) && item.condition !== "poisoned") wrong("fails-by-5 rule differs")
    }
    if (/Speed is halved/.test(text) !== Boolean(entry.speedHalved)) wrong("speed halved differs")
    if (/can’t knowingly communicate a lie/.test(text) !== Boolean(entry.cannotKnowinglyLie)) wrong("cannot lie differs")
    if (/can’t be healed by any means/.test(text) !== Boolean(entry.damageCannotBeHealed)) wrong("damage cannot be healed differs")
    if (/stroke of midnight/.test(text) !== Boolean(entry.delayedUntilMidnight)) wrong("midnight delay differs")
    const successes = /After (\w+) successful saves?/.exec(text)?.[1]
    const wantSuccesses = successes ? (numberWords[successes] ?? (successes === "seven" ? 7 : undefined)) : /ending the effect on itself on a success/.test(text) ? 1 : undefined
    if (entry.repeat?.endsAfterSuccesses !== wantSuccesses) wrong(`successes to end ${entry.repeat?.endsAfterSuccesses} but the text says ${wantSuccesses}`)
    const when = /repeat the save at the start of each of its turns|at the end of each of its turns|every 24 hours|start of each of its turns/.exec(text)?.[0]
    const wantWhen = when === undefined ? undefined : /^every 24/.test(when) ? "every-24-hours" : /start/.test(when) ? "start-of-turn" : "end-of-turn"
    if (entry.repeat?.when !== wantWhen) wrong(`repeat timing ${entry.repeat?.when} but the text says ${wantWhen}`)
    if (entry.save && !/Constitution/.test(text)) wrong("save ability differs")
  })
  report.check("equipment", "poisons: type, cost, page, save DC, damage, conditions, durations, repeats and flags", poisonCells, poisonFailures)

  // Coins and rules ---------------------------------------------------------------------------------------------
  const coinRows = [...between(P(89), /^Coin Values\nCoin\nValue in GP\n/m, /^Weapons$/m).matchAll(/^(.+) \(([A-Z]{2})\)\n(1\/100|1\/10|1\/2|1|10)$/gm)]
  coverage(
    "equipment",
    "coins",
    coinRows.map((match) => match[1]),
    coins.map((entry) => entry.name)
  )
  const coinFailures: string[] = []
  for (const match of coinRows) {
    const entry = coins.find((item) => item.name === match[1])
    const value = match[3].includes("/") ? Number(match[3].split("/")[0]) / Number(match[3].split("/")[1]) : Number(match[3])
    if (entry && (entry.abbreviation !== match[2].toLowerCase() || entry.gpValue !== value || entry.page !== 89))
      coinFailures.push(`${match[1]}: value or abbreviation differs from the Coin Values table`)
  }
  report.check("equipment", "coins: value in GP, abbreviation, page", coinRows.length * 3, coinFailures)

  const ruleFailures: string[] = []
  let ruleCells = 0
  for (const rule of rules) {
    ruleCells++
    if (rule.description) {
      const first = rule.description.split("\n")[0]
      if (missingSentences(rule.description).length) ruleFailures.push(`${rule.name}: wording is not the official text`)
      const startPage = [89, 92, 100, 101, 103].find((page) => squash(P(page)).includes(squash(first.slice(0, 60))))
      if (startPage !== rule.page) ruleFailures.push(`${rule.name}: page ${rule.page} but its text begins on ${startPage}`)
      const stated = numbersIn(rule.description)
      for (const [key, value] of leaves(rule)) {
        if (typeof value !== "number" || ["page", "amount"].includes(key)) continue
        ruleCells++
        if (!stated.has(value)) ruleFailures.push(`${rule.name}: ${key} ${value} is not a number in its text`)
      }
    }
  }
  const scribing = [...between(P(103), /^Spell Scroll Costs\nSpell Level\n\t\nTime\n\t\nCost\n/m, /$(?![\s\S])/).matchAll(/^(Cantrip|\d)[ \t]*\n(\d+) days?[ \t]*\n([\d,]+ [CSGEP]P)$/gm)]
  coverage(
    "equipment",
    "spell scroll costs (by spell level)",
    scribing.map((match) => match[1]),
    rules.filter((rule) => rule.kind === "scribing").map((rule) => (rule.spellLevel === 0 ? "Cantrip" : String(rule.spellLevel)))
  )
  for (const match of scribing) {
    const rule = rules.find((item) => item.kind === "scribing" && item.spellLevel === (match[1] === "Cantrip" ? 0 : Number(match[1])))
    ruleCells += 3
    if (rule && (rule.days !== Number(match[2]) || !same(rule.cost, cost(match[3])) || rule.page !== 103)) ruleFailures.push(`Spell Scroll Costs ${match[1]}: a cell differs from the table`)
  }
  const typedRules: [string, string, unknown][] = [
    ["selling", "resaleFraction", 0.5],
    ["coin-weight", "coinsPerPound", 50],
    ["barding", "costMultiplier", 4],
    ["barding", "weightMultiplier", 2],
    ["draft-cargo", "capacityMultiplier", 5],
    ["crafting", "rawMaterialsFraction", 0.5],
    ["crafting", "costGpPerDay", 10],
    ["crafting", "workHoursPerDay", 8],
    ["potion-brewing", "rawMaterialsGp", 25],
    ["ship-repair", "costGpPerHitPoint", 20],
    ["ship-repair", "shipyardFraction", 0.5],
    ["ship-passengers", "privateAccommodationsFraction", 0.2],
  ]
  const wording: Record<string, RegExp> = {
    selling: /fetches half its cost/,
    "coin-weight": /fifty coins weigh a pound/,
    barding: /four times the normal cost, and it weighs twice as much/,
    "draft-cargo": /five times its base carrying capacity/,
    crafting: /half its purchase cost[\s\S]*divide its purchase cost in GP by 10/,
    "potion-brewing": /25 GP of raw material over the course of 1 day \(8 hours of work\)/,
    "ship-repair": /1 Hit Point of damage requires 1 day and costs 20 GP[\s\S]*halved/,
    "ship-passengers": /one-fifth as many passengers[\s\S]*5 SP per day for a hammock[\s\S]*2 GP per day/,
  }
  for (const [kind, field, value] of typedRules) {
    ruleCells++
    const rule = rules.find((item) => item.kind === kind)
    if (!rule || rule[field] !== value || !wording[kind].test(flat(rule.description))) ruleFailures.push(`${kind}: ${field} is ${JSON.stringify(rule?.[field])}, expected ${value} per the text`)
  }
  const training = rules.filter((rule) => rule.kind === "armor-training")
  ruleCells += 3
  const light = training.find((rule) => rule.covers.includes("light"))
  if (
    !light ||
    !same(light.untrainedDisadvantageOn, ["str", "dex"]) ||
    !light.untrainedCannotCast ||
    !/Disadvantage on any D20 Test that involves Strength or Dexterity, and you can’t cast spells/.test(flat(light.description))
  )
    ruleFailures.push("armor training: light, medium, heavy rule differs")
  const shield = training.find((rule) => rule.covers.includes("shield"))
  if (!shield?.benefitRequiresTraining || !/Armor Class benefit of a Shield only if you have training/.test(flat(shield.description))) ruleFailures.push("armor training: shield rule differs")
  const one = rules.find((rule) => rule.kind === "one-at-a-time")
  if (!one || one.maxArmor !== 1 || !/only one suit of armor at a time and wield only one Shield/.test(flat(one.description))) ruleFailures.push("one at a time rule differs")
  report.check("equipment", "rules: coin weight, selling, armor training, barding, cargo, crafting, potion brewing, ship repair, passengers, scroll costs", ruleCells, ruleFailures)

  // Prose ---------------------------------------------------------------------------------------------------------
  const proseFailures: string[] = []
  let proseTotal = 0
  const waivedProse: string[] = []
  for (const entry of [...data, ...properties, ...masteries, ...poisons, ...rules]) {
    if (!entry.description) continue
    proseTotal++
    const text = (entry.description as string).replace("1½ pints", "11/2 pints")
    if (text !== entry.description) waivedProse.push(`${entry.id}: the PDF text spells 1½ as 11/2, compared in that spelling`)
    for (const sentence of missingSentences(text)) proseFailures.push(`${entry.id}: not in the official text: ${sentence}`)
    if (/['"]/.test(entry.description)) proseFailures.push(`${entry.id}: straight quotes`)
  }
  report.check("equipment", "prose: every sentence of every description is in the official text, with typographic quotes", proseTotal, proseFailures, waivedProse)

  // References ----------------------------------------------------------------------------------------------------
  const refFailures: string[] = []
  let refTotal = 0
  const ref = (from: string, id: unknown) => {
    refTotal++
    if (typeof id !== "string" || !byId.has(id)) refFailures.push(`${from}: ${String(id)} has no entry`)
  }
  for (const entry of data) {
    if (entry.kind === "pack") for (const item of entry.contents) ref(entry.id, item.item)
    if (entry.kind === "group") for (const member of entry.members) ref(entry.id, member)
    if (entry.kind === "tool") {
      for (const id of entry.variants ?? []) ref(entry.id, id)
      if (entry.variantOf) ref(entry.id, entry.variantOf)
      for (const id of entry.craft?.items ?? []) ref(entry.id, id)
      for (const category of entry.craft?.categories ?? []) for (const id of category.except ?? []) ref(entry.id, id)
    }
    if (entry.kind === "ammunition") ref(entry.id, entry.storage)
    if (entry.kind === "weapon" && entry.ammunition) ref(entry.id, entry.ammunition)
  }
  const poisonBasic = byId.get("poison-basic")
  refTotal++
  if (!poisonBasic) refFailures.push("poison-basic is missing")
  for (const id of ["spell-scroll-cantrip", "spell-scroll-level-1", "potion-of-healing"]) ref("potion and scroll", id)
  report.check("equipment", "references inside the equipment data resolve", refTotal, refFailures)

  // Cross-checks with the base source and Open5e. A disagreement is settled by the official text, which the checks above enforced. -----
  const crossFailures: string[] = []
  const crossWaived: string[] = []
  let crossTotal = 0
  const baseItems = readBase<Entry>("Equipment")
  const gpOf = (value: Cost | undefined) => (value ? value.amount * ({ cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 10 } as Record<string, number>)[value.unit] : undefined)
  const baseCost = (item: Entry) => ({ amount: item.cost.quantity, unit: item.cost.unit })
  for (const item of baseItems) {
    const entry = byId.get(toId(item.name))
    if (!entry) {
      const known = ["Spellbook", "Spell Scroll, Cantrip", "Spell Scroll, Level 1"].includes(item.name)
      if (!known) crossFailures.push(`base item ${item.name} has no entry in the data`)
      continue
    }
    crossTotal += 2
    if (entry.cost && gpOf(entry.cost) !== gpOf(baseCost(item))) crossWaived.push(`${entry.id}: base source costs ${item.cost.quantity} ${item.cost.unit}, official ${costText(entry.cost)}`)
    if ((entry.weight ?? 0) !== (item.weight ?? 0)) crossWaived.push(`${entry.id}: base source weighs ${item.weight}, official ${entry.weight}`)
    if (entry.kind === "weapon") {
      crossTotal += 3
      if (item.damage?.damage_dice !== (entry.damage.dice ?? String(entry.damage.fixed)) || item.damage?.damage_type?.index !== entry.damage.type)
        crossWaived.push(`${entry.id}: base source damage ${item.damage?.damage_dice} ${item.damage?.damage_type?.index}, official ${entry.damage.dice ?? entry.damage.fixed} ${entry.damage.type}`)
      if (item.mastery?.index !== entry.mastery) crossWaived.push(`${entry.id}: base source mastery ${item.mastery?.index}, official ${entry.mastery}`)
      if ((item.ammunition?.index ?? undefined) !== entry.ammunition) crossWaived.push(`${entry.id}: base source ammunition ${item.ammunition?.index}, data ${entry.ammunition}`)
      const baseProps = (item.properties ?? []).map((property: Entry) => property.index).sort()
      if (!same(baseProps, [...entry.properties].sort())) crossWaived.push(`${entry.id}: base source properties ${baseProps}, official ${entry.properties}`)
    }
    if (entry.kind === "armor" && entry.category !== "shield") {
      crossTotal += 2
      if (item.armor_class?.base !== entry.baseAc || Boolean(item.armor_class?.dex_bonus) !== entry.addsDexModifier)
        crossWaived.push(`${entry.id}: base source AC ${item.armor_class?.base}, official ${entry.baseAc}`)
      if ((item.str_minimum || undefined) !== entry.strengthRequired) crossWaived.push(`${entry.id}: base source Strength ${item.str_minimum}, official ${entry.strengthRequired}`)
    }
  }
  for (const row of readOpen5e<Entry>("Weapon")) {
    const entry = byId.get(toId(row.fields.name))
    if (!entry) {
      crossFailures.push(`Open5e weapon ${row.fields.name} has no entry`)
      continue
    }
    crossTotal += 2
    if (row.fields.damage_dice !== (entry.damage.dice ?? String(entry.damage.fixed)) || row.fields.damage_type !== entry.damage.type)
      crossWaived.push(`${entry.id}: Open5e damage ${row.fields.damage_dice} ${row.fields.damage_type}, official ${entry.damage.dice ?? entry.damage.fixed} ${entry.damage.type}`)
    if (row.fields.is_simple !== (entry.category === "simple")) crossWaived.push(`${entry.id}: Open5e simple ${row.fields.is_simple}, official ${entry.category}`)
  }
  for (const row of readOpen5e<Entry>("Armor")) {
    const entry = byId.get(toId(row.fields.name))
    if (!entry) {
      crossFailures.push(`Open5e armor ${row.fields.name} has no entry`)
      continue
    }
    crossTotal += 3
    if (row.fields.ac_base !== (entry.baseAc ?? entry.acBonus)) crossWaived.push(`${entry.id}: Open5e AC ${row.fields.ac_base}, official ${entry.baseAc}`)
    if ((row.fields.ac_cap_dexmod ?? undefined) !== entry.dexModifierCap) crossWaived.push(`${entry.id}: Open5e Dex cap ${row.fields.ac_cap_dexmod}, official ${entry.dexModifierCap}`)
    if (Boolean(row.fields.grants_stealth_disadvantage) !== Boolean(entry.stealthDisadvantage))
      crossWaived.push(`${entry.id}: Open5e stealth ${row.fields.grants_stealth_disadvantage}, official ${entry.stealthDisadvantage}`)
  }
  for (const row of readOpen5e<Entry>("Item")) {
    const entry = byId.get(toId(row.fields.name.replace(/ \(.*\)$/, "")))
    if (!entry?.cost || (["tool", "ammunition"].includes(entry.kind) === false && (entry.kind === "ship") === false && !entry.cost)) continue
    crossTotal++
    if (Number(row.fields.cost) !== gpOf(entry.cost)) crossWaived.push(`${entry.id}: Open5e cost ${row.fields.cost} GP, official ${costText(entry.cost)}`)
  }
  report.crossCheck("equipment", "the base source and Open5e agree on costs, weights, damage, mastery, AC and properties, or the official text settles it", crossTotal, crossFailures, crossWaived)
}

function collectDcs(value: unknown): number[] {
  const out: number[] = []
  const walk = (item: unknown, key = "") => {
    if (Array.isArray(item)) for (const entry of item) walk(entry, key)
    else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>
      if (key === "dc" && typeof record.fixed === "number") out.push(record.fixed)
      else for (const [k, v] of Object.entries(record)) walk(v, k)
    } else if (typeof item === "number" && (key === "dc" || key === "saveDc")) out.push(item)
  }
  walk(value)
  return out
}

function collectFixed(value: unknown): number[] {
  const out: number[] = []
  const walk = (item: unknown) => {
    if (Array.isArray(item)) item.forEach(walk)
    else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>
      if (typeof record.fixed === "number" && "type" in record) out.push(record.fixed)
      for (const entry of Object.values(record)) walk(entry)
    }
  }
  walk(value)
  return out
}
