import { existsSync, readFileSync } from "node:fs"
import { dataPath, readData, toId } from "../lib/data"
import { missingSentences, pages, squash } from "../lib/official"
import type { Report } from "../lib/report"
import { hasUpstream, readBase, readOpen5e } from "../lib/sources"

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
function leaves(value: unknown, key = "", asPath = false): [string, unknown][] {
  if (Array.isArray(value)) return value.flatMap((item) => leaves(item, key, asPath))
  if (value && typeof value === "object") return Object.entries(value).flatMap(([k, v]) => leaves(v, asPath && key ? `${key}.${k}` : k, asPath))
  return [[key, value]]
}

/** The number a statement uses, in digits or words. */
function toNumber(text: string): number {
  const word: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, ten: 10, twice: 2, "half a": 0.5, "one-fifth of a": 0.2, "1½": 1.5, "11/2": 1.5 }
  return word[text] ?? Number(text)
}

/** Statements of the gear descriptions that carry a typed number. Each pattern captures the number, and `paths` are the typed fields that hold those numbers. */
const numberGroups: { pattern: RegExp; paths: string[]; stripModifiers?: boolean }[] = [
  { pattern: /within (\d+) feet/g, paths: ["hazard.range", "hazard.withinFeet", "spaceHazard.range", "spaceHazard.withinFeet", "checks.range", "healing.range"], stripModifiers: true },
  { pattern: /(\d+)-foot-square/g, paths: ["hazard.areaSideFeet", "spaceHazard.areaSideFeet"] },
  { pattern: /Bright Light in a (\d+)-foot/g, paths: ["light.brightFeet"] },
  { pattern: /Dim Light for an additional (\d+) feet/g, paths: ["light.dimFeet"] },
  { pattern: /Dim Light in a (\d+)-foot radius/g, paths: ["light.loweredHoodDimRadiusFeet"] },
  { pattern: /\bfor (\d+) hours?/gi, paths: ["light.durationHours", "fuelHours", "modifiers.durationHours", "dig.hours"] },
  { pattern: /(\d+) minutes?/g, paths: ["hazard.recoverMinutes", "hazard.dryAfterMinutes", "ignite.otherFireMinutes", "coating.potencyMinutes"] },
  { pattern: /heard up to (\d+) feet/g, paths: ["audibleFeet"] },
  { pattern: /can’t fall more than (\d+) feet/g, paths: ["anchorFeet"] },
  { pattern: /\(typically (\d+) feet\)/g, paths: ["hazard.chainFeet"] },
  { pattern: /is (\d+) feet long/g, paths: ["lengthFeet"] },
  { pattern: /is (\d+) feet tall/g, paths: ["heightFeet"] },
  { pattern: /\(AC (\d+);/g, paths: ["object.ac"] },
  { pattern: /; (\d+) HP;/g, paths: ["object.hp"] },
  { pattern: /(\d+) pounds/g, paths: ["capacity.pounds"] },
  { pattern: /(\d+|half a|one-fifth of a) cubic (?:foot|feet)/g, paths: ["capacity.cubicFeet"] },
  { pattern: /(\d+) gallons?/g, paths: ["capacity.gallons"] },
  { pattern: /(1½|11\/2|\d+) pints?/g, paths: ["capacity.pints"] },
  { pattern: /(\d+) ounces/g, paths: ["capacity.ounces"] },
  { pattern: /(\d+) (?:Bolts|Arrows|sheets of)/g, paths: ["capacity.holds.quantity"] },
  { pattern: /sleeps (?:up to )?(one|two)/g, paths: ["sleeps"] },
  { pattern: /has (ten) uses/g, paths: ["uses"] },
  { pattern: /(four) times the weight/g, paths: ["liftMultiplier"] },
  { pattern: /(twice) their size/g, paths: ["magnification"] },
  { pattern: /(\d+) feet on each side/g, paths: ["dig.sideFeet"] },
  { pattern: /that has (\d+) Hit Points/g, paths: ["stabilize.atHitPoints"] },
  { pattern: /up to (three) pieces/g, paths: ["coating.ammunitionPieces"] },
  { pattern: /spell save DC is (\d+)/g, paths: ["spellScroll.saveDc"] },
  { pattern: /attack bonus is \+(\d+)/g, paths: ["spellScroll.attackBonus"] },
  { pattern: /\+(\d+) bonus/g, paths: ["modifiers.amount"] },
  { pattern: /turn (\d+) rounds from/g, paths: ["spaceHazard.burnsUntilRoundsAfterLit"] },
]

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
    expect.damage = /d/.test(row.dice) ? { dice: row.dice, type: row.type } : { amount: Number(row.dice), type: row.type }
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
    const minutes = row.times.match(/\d+/g) ?? []
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
      expect.donMinutes = Number(minutes[0])
      expect.doffMinutes = Number(minutes[1] ?? minutes[0])
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
  const otherAt = `Alchemist’s Supplies (50 GP)${toolText}`.indexOf("\nOther Tools\n")
  const toolBlocks = toolHeadings.map((match, index) => ({
    at: match.index as number,
    name: match[1],
    cost: cost(match[2]),
    body: `Alchemist’s Supplies (50 GP)${toolText}`.slice((match.index as number) + match[0].length, toolHeadings[index + 1]?.index ?? undefined),
  }))
  const tools = of("tool")
  const toolVariantNames = (body: string) => {
    const list = flat(/Variants: ([\s\S]*)$/.exec(body)?.[1] ?? "").replace(/(\w)- (\w)/g, "$1$2")
    return list
      .split(/\),? ?/)
      .filter(Boolean)
      .map((segment) => {
        const [name, detail] = segment.split(" (")
        const [price, mass] = detail.split(", ")
        return { name: toId(name), cost: cost(price.toUpperCase()), weight: mass ? weight(mass) : undefined }
      })
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
      ["group", entry.group, (block.at as number) < otherAt ? "artisan" : "other"],
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
      const expectedItems: string[] = []
      const idOfName = (name: string) => nameOf.get(squash(name === "Hide" ? "Hide Armor" : name))
      for (const segment of segments) {
        const excepted = /^(.+?) \(except (.+)\)$/.exec(segment)
        const category = categories.find(
          (item) =>
            squash({ "melee-weapon": "Any Melee weapon", "ranged-weapon": "Ranged weapons", "medium-armor": "Medium armor", "heavy-armor": "Heavy armor" }[item.category as string] as string) ===
            squash(excepted?.[1] ?? segment)
        )
        if (category) {
          const names = excepted ? excepted[2].split(/,\s*(?:and\s+)?|\s+and\s+/).filter(Boolean) : []
          if (!same(category.except ?? [], names.map(idOfName))) toolFailures.push(`${block.name}: exceptions ${JSON.stringify(category.except)} differ from the Craft line "${segment}"`)
        } else expectedItems.push(idOfName(segment) as string)
        const id = [...nameOf].find(([name]) => name === squash(segment.replace(/ \(except.*$/, "")))?.[1]
        const categoryNames = ["anymeleeweapon", "rangedweapons", "mediumarmor", "heavyarmor"]
        if (!id && !categoryNames.includes(squash(segment.replace(/ \(except.*$/, "")))) toolFailures.push(`${block.name}: Craft names "${segment}", which is no entry`)
        else if (id && !items.includes(id as unknown as Entry)) toolFailures.push(`${block.name}: Craft names ${id}, which the data lacks`)
      }
      if (!same(items, expectedItems)) toolFailures.push(`${block.name}: craft items ${JSON.stringify(items)} differ, in order, from the Craft line ${JSON.stringify(expectedItems)}`)
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
  const gearEntries = data.filter((entry) => ["gear", "pack"].includes(entry.kind) || (entry.kind === "group" && !["spell-scroll", "artisans-tools"].includes(entry.id)))
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
  gearCells++
  if (
    !same(
      (byId.get("spell-scroll") as Entry).members,
      officialGear.filter((row) => row.name.startsWith("Spell Scroll")).map((row) => toId(row.name))
    )
  )
    gearFailures.push("the Spell Scroll group's members differ from the table rows, in order")
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
    const textStandard = [...text.matchAll(/DC 8 plus your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) modifier and Proficiency Bonus/g)].map((match) => abilityIdOf[match[1]])
    const typedStandard = typed.filter(([key]) => key === "plusModifierOf").map(([, value]) => value)
    mechTotal++
    if (!same(sorted(textStandard), sorted(typedStandard))) mechFailures.push(`${entry.id}: "DC 8 plus" saves in the text ${textStandard} but typed ${typedStandard}`)
    if (!same(sorted(textDcs), sorted(dcs))) mechFailures.push(`${entry.id}: DCs in the text ${textDcs.join(",")} but typed ${dcs.join(",")}`)
    // Dice
    const textDice = [...text.matchAll(/\d+d\d+(?: \+ \d+)?/g)].map((match) => match[0])
    const typedDice = typed.filter(([key]) => key === "dice").map(([, value]) => value)
    mechTotal++
    if (!same(sorted(textDice), sorted(typedDice))) mechFailures.push(`${entry.id}: dice in the text ${textDice.join(",")} but typed ${typedDice.join(",")}`)
    // Fixed damage
    const textFixed = [...text.matchAll(new RegExp(`(\\d+d\\d+|\\d+) (?:${damageTypes.join("|")}) damage`, "g"))].filter((match) => !match[1].includes("d")).map((match) => Number(match[1]))
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
    // Every typed number is tied to its own statement in the text, both ways: a deleted, changed or invented value differs from what the text states.
    const stripped = (entry.modifiers ?? []).reduce((rest: string, mod: Entry) => rest.replace(mod.when, ""), text)
    const exempt: Record<string, number[]> = { "magnifying-glass": [5] }
    const numericPaths = leaves(mech, "", true).filter(([, value]) => typeof value === "number")
    const covered = new Set<string>()
    for (const group of numberGroups) {
      const source = group.stripModifiers ? stripped : text
      const stated = [...source.matchAll(group.pattern)].map((match) => toNumber(match[1])).filter((value) => !(exempt[entry.id] ?? []).includes(value))
      const typedValues = numericPaths.filter(([path]) => group.paths.includes(path)).map(([, value]) => value)
      for (const path of group.paths) covered.add(path)
      mechTotal++
      if (!same(sorted(stated), sorted(typedValues))) mechFailures.push(`${entry.id}: ${group.paths.join("/")} typed ${typedValues} but the text states ${stated}`)
    }
    for (const [path, value] of numericPaths) {
      mechTotal++
      if (covered.has(path) || /(^|\.)(dc|saveDc|amount)$/.test(path)) continue
      if (path === "spellScroll.spellLevel") {
        if (value !== (entry.id.endsWith("cantrip") ? 0 : 1)) mechFailures.push(`${entry.id}: spell level ${value} does not match the entry name`)
        continue
      }
      mechFailures.push(`${entry.id}: typed number ${path} ${value} has no check`)
    }
    // Wording that says when a modifier applies is the SRD's own.
    for (const mod of entry.modifiers ?? []) {
      mechTotal++
      if (!squash(text).includes(squash(mod.when))) mechFailures.push(`${entry.id}: modifier wording "${mod.when}" is not in the description`)
    }
    // Conditional values carry their condition.
    mechTotal += 5
    const binding = entry.binding
    const bindingWords = {
      "legs-bound": /If the creature’s legs are bound, the creature has the Restrained condition/,
      "attached-to-fixed-anchor": /the creature is Restrained if the Manacles are attached to a chain or hook that is fixed in place/,
    }
    if (Boolean(binding) !== /has the Grappled, Incapacitated, or Restrained condition/.test(flat(text)))
      mechFailures.push(`${entry.id}: binding differs from the sentence that names Grappled, Incapacitated or Restrained`)
    if (binding && !bindingWords[binding.appliesWhen as "legs-bound"]?.test(flat(text)))
      mechFailures.push(`${entry.id}: bound condition applies when ${binding.appliesWhen}, which the text does not say`)
    if (Boolean(entry.spaceHazard?.onlyWhenLit) !== /If lit, the oil burns/.test(flat(text))) mechFailures.push(`${entry.id}: onlyWhenLit differs from "If lit"`)
    const speedZero = [entry.hazard, entry.spaceHazard].some((hazard) => hazard?.speedZeroUntilStartOfNextTurn)
    if (speedZero !== /Speed reduced to 0 until the start of its next turn/.test(flat(text))) mechFailures.push(`${entry.id}: speed to 0 differs from the text`)
    if (Boolean(entry.dig?.inSoilOrSimilar) !== /in soil or similar material/.test(flat(text))) mechFailures.push(`${entry.id}: dig material differs from the text`)
    // Activation: the Utilize action and the Bonus Action the text names.
    const wantActivation = [...(/Utilize action/.test(text) ? ["utilize-action"] : []), ...(/Bonus Action/.test(text) ? ["bonus-action"] : [])]
    mechTotal++
    if (!same(entry.activation ?? [], wantActivation)) mechFailures.push(`${entry.id}: activation ${JSON.stringify(entry.activation)} but the text names ${wantActivation}`)
    if (entry.ignite && !same(entry.ignite.exposedFuel, ["bonus-action"])) mechFailures.push(`${entry.id}: ignite action differs`)
    if (entry.ignite && !/exposed fuel[^.]*takes a Bonus Action/.test(flat(text))) mechFailures.push(`${entry.id}: ignite wording not in the text`)
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
    if (entry.bundleSize !== Number(match[2]) || entry.storage !== ammoStorage[match[3]] || entry.weight !== weight(match[4]) || !same(entry.cost, cost(match[5])) || entry.page !== 96)
      ammoFailures.push(`${match[1]}: a cell differs from the Ammunition table`)
  }
  if (
    !same(
      (byId.get("ammunition") as Entry).members,
      officialAmmo.map((match) => toId(match[1]))
    )
  )
    ammoFailures.push("the Ammunition group's members differ from the Ammunition table, in order")
  report.check("equipment", "ammunition: bundle size, storage, weight, cost, page of each Ammunition row", officialAmmo.length * 5, ammoFailures)

  const focusFailures: string[] = []
  let focusCells = 0
  const focusSources = [
    { title: "Arcane Focuses", page: 96, group: "arcane-focus", classes: ["sorcerer", "warlock", "wizard"] },
    { title: "Druidic Focuses", page: 97, group: "druidic-focus", classes: ["druid", "ranger"] },
    { title: "Holy Symbols", page: 97, group: "holy-symbol", classes: ["cleric", "paladin"] },
  ]
  const officialFocus: string[] = []
  for (const source of focusSources) {
    const groupText = flat((byId.get(source.group) as Entry).description)
    const users = /A ([A-Z][a-z]+(?:, [A-Z][a-z]+)*,? (?:or [A-Z][a-z]+|[A-Z][a-z]+)|[A-Z][a-z]+ or [A-Z][a-z]+) can use/.exec(groupText)?.[1] ?? ""
    const officialUsers = users.split(/,\s*(?:or\s+)?|\s+or\s+/).map((word) => word.toLowerCase())
    if (!same(officialUsers, source.classes)) focusFailures.push(`${source.group}: classes ${source.classes} differ from the sentence "A ${users} can use"`)
    if (!same((byId.get(source.group) as Entry).usedBy, officialUsers)) focusFailures.push(`${source.group}: usedBy differs from the sentence`)
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
        !same(entry.usedBy, officialUsers) ||
        entry.focus !== { "Arcane Focuses": "arcane", "Druidic Focuses": "druidic", "Holy Symbols": "holy" }[source.title] ||
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
  const monsterEntries = new Map(readData("monsters").map((monster) => [monster.id, monster]))
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
    const monster = monsterEntries.get(entry.statBlock)
    const reversed = match[1].split(", ").reverse().join(" ")
    if (!monster) mountFailures.push(`${match[1]}: stat block ${entry.statBlock} is not in the monsters data`)
    else if (squash(monster.name) !== squash(match[1]) && squash(monster.name) !== squash(reversed)) mountFailures.push(`${match[1]}: stat block ${entry.statBlock} is the monster ${monster.name}`)
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
  const lifestyleHeads = [...P(101).matchAll(/^([A-Z][a-z]+) \((Free|\d+ [CSGEP]P per Day)\)$/gm)].filter((match) =>
    ["Wretched", "Squalid", "Poor", "Modest", "Comfortable", "Wealthy", "Aristocratic"].includes(match[1])
  )
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
  // Walk the table text in order. Each row's label line must be followed, past any repeated "Item" and "Cost" headers, by its cost line,
  // and each group heading must come before its rows. A swapped pair of costs or labels breaks the walk.
  const foodLines = [
    ...P(101)
      .slice(P(101).lastIndexOf("Food, Drink, and Lodging"), P(101).indexOf("Airborne and Waterborne Vehicles"))
      .split("\n")
      .map((text) => ({ text: text.trim(), page: 101 })),
    ...P(102)
      .slice(0, P(102).indexOf("Hirelings"))
      .split("\n")
      .map((text) => ({ text: text.trim(), page: 102 })),
  ].filter((line) => line.text)
  const tierLabels = ["Squalid", "Poor", "Modest", "Comfortable", "Wealthy", "Aristocratic"]
  const walk: { id: string; group?: string; label: string; kind: string; unit?: string; tier?: string }[] = [
    { id: "ale-mug", label: "Ale (mug)", kind: "food", unit: "mug" },
    { id: "bread-loaf", label: "Bread (loaf)", kind: "food", unit: "loaf" },
    { id: "cheese-wedge", label: "Cheese (wedge)", kind: "food", unit: "wedge" },
    ...tierLabels.map((label, index) => ({ id: `inn-stay-${label.toLowerCase()}`, label, kind: "inn-stay", tier: label.toLowerCase(), group: index === 0 ? "Inn Stay per Day" : undefined })),
    ...tierLabels.map((label, index) => ({ id: `meal-${label.toLowerCase()}`, label, kind: "meal", tier: label.toLowerCase(), group: index === 0 ? "Meal" : undefined })),
    { id: "wine-common", label: "Common", kind: "food", unit: "bottle", group: "Wine (bottle)" },
    { id: "wine-fine", label: "Fine", kind: "food", unit: "bottle" },
  ]
  let cursor = 0
  const seek = (label: string) => {
    const at = foodLines.findIndex((line, index) => index >= cursor && line.text === label)
    if (at >= 0) cursor = at + 1
    return at
  }
  walk.forEach((row, index) => {
    if (row.group && seek(row.group) < 0) foodFailures.push(`${row.id}: group heading ${row.group} is not before its rows`)
    const at = seek(row.label)
    if (at < 0) {
      foodFailures.push(`${row.id}: label ${row.label} is not in order in the table text`)
      return
    }
    let next = at + 1
    while (["Item", "Cost"].includes(foodLines[next]?.text)) next++
    const entry = byId.get(row.id)
    if (foodLines[next]?.text !== expectedFoodCosts[index]) foodFailures.push(`${row.id}: the cost after ${row.label} is ${foodLines[next]?.text}, expected ${expectedFoodCosts[index]}`)
    cursor = next + 1
    if (entry && (entry.kind !== row.kind || entry.unit !== row.unit || entry.tier !== row.tier))
      foodFailures.push(`${row.id}: kind, unit or tier is ${entry.kind} ${entry.unit} ${entry.tier}, the table says ${row.kind} ${row.unit} ${row.tier}`)
    if (!entry) foodFailures.push(`${row.id} is missing`)
    else if (!same(entry.cost, cost(foodLines[next]?.text ?? "")) || entry.page !== foodLines[next]?.page)
      foodFailures.push(`${row.id}: cost ${costText(entry.cost)} page ${entry.page} differs from the text after ${row.label}`)
  })
  report.check("equipment", "food, drink and lodging: every cost cell, read in table order across the page break", expectedFoodCosts.length * 4, foodFailures)

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

  // The Artisan’s Tools group, which classes and backgrounds name in "chooseFrom".
  const artisanOfficial = toolBlocks.filter((block) => block.at < otherAt).map((block) => toId(block.name))
  const artisans = byId.get("artisans-tools")
  const artisanFailures: string[] = []
  const artisanIntro = between(P(93), /^Artisan’s Tools\n/m, /^Alchemist’s Supplies \(50 GP\)/m)
  if (!artisans || artisans.kind !== "group") artisanFailures.push("artisans-tools is missing")
  else {
    if (!same(artisans.members, artisanOfficial)) artisanFailures.push(`members ${artisans.members} differ from the official list ${artisanOfficial}`)
    if (artisans.page !== 93 || artisans.name !== "Artisan’s Tools") artisanFailures.push("name or page differs from the official heading")
    if (squash(artisans.description) !== squash(artisanIntro)) artisanFailures.push("description is not the paragraph under the heading")
  }
  for (const id of ["musical-instrument", "gaming-set"]) {
    const group = byId.get(id)
    const wanted = toolVariantNames(toolBlocks.find((block) => toId(block.name) === id)?.body ?? "").map((variant) => variant.name)
    if (!group?.variants || !same(group.variants, wanted) || wanted.length === 0) artisanFailures.push(`${id}: variants differ from the official Variants list`)
  }
  report.check("equipment", "tool kinds that starting equipment can name: Artisan’s Tools members, Musical Instrument and Gaming Set variants", artisanOfficial.length + 3, artisanFailures)

  const chooseFailures: string[] = []
  let chooseTotal = 0
  for (const file of ["classes", "backgrounds"]) {
    if (!existsSync(dataPath(file))) continue
    const walk = (value: unknown) => {
      if (Array.isArray(value)) for (const item of value) walk(item)
      else if (value && typeof value === "object") {
        const record = value as Record<string, unknown>
        for (const from of Array.isArray(record.chooseFrom) ? record.chooseFrom : []) {
          chooseTotal++
          const target = byId.get(from)
          if (!target || !(target.kind === "group" || (target.kind === "tool" && target.variants))) chooseFailures.push(`${file}: chooseFrom ${from} is not a group or tool kind in the equipment data`)
        }
        if (record.unit === "single" && typeof record.item === "string") {
          chooseTotal++
          if (byId.get(record.item)?.kind !== "ammunition") chooseFailures.push(`${file}: ${record.item} is counted in single pieces but is not ammunition`)
        }
        for (const item of Object.values(record)) walk(item)
      }
    }
    walk(JSON.parse(readFileSync(dataPath(file), "utf8")))
  }
  report.check("equipment", "starting equipment lines in classes and backgrounds: every chooseFrom is a group or tool kind, every single-piece line is ammunition", chooseTotal, chooseFailures)

  // Poison types ----------------------------------------------------------------------------------------------
  const poisonTypes = readData<Entry>("poison-types")
  const typeBlocks = [...P(197).matchAll(/^(Contact|Ingested|Inhaled|Injury)\. ([\s\S]*?)(?=\n(?:Contact|Ingested|Inhaled|Injury)\. |\nPurchasing Poison)/gm)]
  coverage(
    "equipment",
    "poison types",
    typeBlocks.map((match) => match[1]),
    poisonTypes.map((entry) => entry.name)
  )
  const typeFailures: string[] = []
  for (const match of typeBlocks) {
    const entry = poisonTypes.find((item) => item.id === toId(match[1]))
    if (!entry) continue
    const text = flat(match[2]).replace(/(\w)- (\w)/g, "$1$2")
    const persists = [
      ...(/potent until it is touched or washed off/.test(text) ? ["touched", "washed-off"] : []),
      ...(/potent until delivered through a wound or washed off/.test(text) ? ["delivered-through-wound", "washed-off"] : []),
    ]
    const exposure = /touches contact poison with exposed skin/.test(text)
      ? "touch-with-exposed-skin"
      : /swallow an entire dose/.test(text)
        ? "swallow-entire-dose"
        : /when inhaled/.test(text)
          ? "inhale"
          : /Piercing or Slashing damage from an object coated/.test(text)
            ? "piercing-or-slashing-damage"
            : undefined
    const cube = /(\d+)-foot Cube/.exec(text)?.[1]
    const trigger = /takes? (Piercing) or (Slashing) damage from an object/.exec(text)
    const want: Record<string, unknown> = {
      page: 197,
      exposure,
      persistsUntil: persists.length ? persists : undefined,
      cubeSideFeet: cube ? Number(cube) : undefined,
      holdingBreathIneffective: /Holding one’s breath is ineffective/.test(text) ? true : undefined,
      application: /applied as a Bonus Action/.test(text) ? ["bonus-action"] : undefined,
      triggerDamageTypes: trigger ? [trigger[1].toLowerCase(), trigger[2].toLowerCase()] : undefined,
    }
    for (const [field, value] of Object.entries(want))
      if (!same(entry[field], value)) typeFailures.push(`${match[1]}: ${field} is ${JSON.stringify(entry[field])}, the text says ${JSON.stringify(value)}`)
    if (squash(entry.description) !== squash(match[2])) typeFailures.push(`${match[1]}: description is not the whole paragraph`)
  }
  for (const poison of poisons) if (!poisonTypes.some((entry) => entry.id === poison.type)) typeFailures.push(`${poison.id}: type ${poison.type} has no poison type entry`)
  report.check(
    "equipment",
    "poison types: exposure, how long it stays potent, Cube, application, trigger damage, whole paragraph, and every poison names one",
    typeBlocks.length * 8 + poisons.length,
    typeFailures
  )

  // Typed kinds, lists and links of gear and tack, each read from the entry's own text. -----------------------------------------
  const kindFailures: string[] = []
  let kindTotal = 0
  const expect = (ok: boolean, message: string) => {
    kindTotal++
    if (!ok) kindFailures.push(message)
  }
  const wordsOf = (list: string) => list.split(/,\s*(?:or\s+)?|\s+or\s+/).filter(Boolean)
  const sizeWord = "(?:Tiny|Small|Medium|Large|Huge|Gargantuan)"
  const useWords: [string, RegExp][] = [
    ["escape", /Escaping|escape/],
    ["burst", /Bursting|burst/],
    ["knot", /tie a knot/],
    ["pick", /pick/],
    ["catch", /catches on/],
    ["free", /freeing/],
    ["bind", /wrap|bind/],
  ]
  for (const entry of [...of("gear"), ...of("tack")]) {
    const text = flat(entry.description ?? "")
    const sentences = text.split(/\.\s+(?=[A-Z“])/)
    const variant = entry.kind === "tack" ? /^Saddle, (\w+)/.exec(entry.name)?.[1] : undefined
    // Modifiers: one per sentence that states an Advantage, a bonus or an automatic success, and each one's effect, kind of roll and condition from its own wording.
    const stating = sentences.filter((sentence) => /\bAdvantage\b|\+\d+ bonus|automatically succeed/.test(sentence) && (!variant || sentence.includes(`${variant} Saddle`)))
    expect((entry.modifiers ?? []).length === stating.length, `${entry.id}: ${(entry.modifiers ?? []).length} modifiers but the text has ${stating.length} such sentences`)
    for (const mod of entry.modifiers ?? []) {
      const effect = /\+\d+ bonus/.test(mod.when) ? "bonus" : /\bAdvantage\b/.test(mod.when) ? "advantage" : /automatically succeed/.test(mod.when) ? "automatic-success" : undefined
      expect(mod.effect === effect, `${entry.id}: modifier effect ${mod.effect}, the wording says ${effect}`)
      expect(mod.on === (/saving throws?/.test(mod.when) ? "save" : "check"), `${entry.id}: modifier is on ${mod.on}, the wording says otherwise`)
      expect(
        mod.againstCondition === (/the (Poisoned) condition/.exec(mod.when)?.[1] ?? "").toLowerCase() || (mod.againstCondition === undefined && !/the (Poisoned) condition/.test(mod.when)),
        `${entry.id}: modifier condition differs`
      )
    }
    // Saddles
    const required = variant ? new RegExp(`${variant} Saddle is required for riding an? (\\w+) or an? (\\w+) mount`).exec(text) : null
    expect(
      same(entry.requiredForMounts, required ? [required[1], required[2]] : undefined),
      `${entry.id}: requiredForMounts ${JSON.stringify(entry.requiredForMounts)} differs from the saddle sentence`
    )
    if (entry.kind !== "gear") continue
    // Checks: the kind of use, from the sentence that states the DC.
    for (const check of entry.checks ?? []) {
      const sentence = sentences.find((item) => item.includes(`DC ${check.dc} ${abilityName[check.ability]} (`)) ?? ""
      const use = useWords.find(([, pattern]) => pattern.test(sentence))?.[0]
      expect(check.use === use, `${entry.id}: check use ${check.use}, its sentence says ${use}`)
      // The action and the tool the sentence requires.
      const action = /Utilize action/.test(sentence) ? ["utilize-action"] : /as an action|use its action|take an action/.test(sentence) ? ["action"] : undefined
      expect(same(check.activation, action), `${entry.id}: check action ${JSON.stringify(check.activation)}, its sentence says ${JSON.stringify(action)}`)
      const tool = /use Thieves’ Tools to/.test(sentence) ? "thieves-tools" : undefined
      expect(check.tool === tool, `${entry.id}: check tool ${check.tool}, its sentence says ${tool}`)
      if (check.tool) expect(squash((byId.get(check.tool) as Entry)?.name ?? "") === squash("Thieves’ Tools"), `${entry.id}: tool ${check.tool} is not Thieves’ Tools`)
    }
    // Binding: the conditions required, the condition applied, the sizes.
    if (entry.binding) {
      const required = /(?:that|creature) has the ([A-Za-z, ]+?) condition/.exec(text)
      expect(
        same(
          entry.binding.requiresAnyCondition,
          wordsOf(required?.[1] ?? "").map((word) => word.toLowerCase())
        ),
        `${entry.id}: bound creature conditions differ from the text`
      )
      const applied = /the creature (?:has the|is) ([A-Z][a-z]+)(?: condition until it escapes| if the Manacles)/.exec(text)?.[1]?.toLowerCase()
      expect(entry.binding.appliesCondition === applied, `${entry.id}: applied condition ${entry.binding.appliesCondition}, the text says ${applied}`)
      const sizes = new RegExp(`unwilling (${sizeWord}(?: or ${sizeWord})*) creature`).exec(text)
      expect(same(entry.binding.sizes, sizes ? sizes[1].split(" or ") : undefined), `${entry.id}: sizes differ from the text`)
    }
    // Hazard flags, targets and light.
    if (entry.hazard || /start burning/.test(text)) expect(Boolean(entry.hazard?.burning) === /start burning/.test(text), `${entry.id}: burning differs from the text`)
    const only = /if it is an? ([A-Z][a-z]+)(?: or an? ([A-Z][a-z]+))? damage|if it is an? ([A-Z][a-z]+) or an? ([A-Z][a-z]+)\./.exec(text)
    expect(
      same(entry.hazard?.onlyAgainst, only ? [only[3] ?? only[1], only[4] ?? only[2]].filter(Boolean).map((word) => (word as string).toLowerCase()) : undefined),
      `${entry.id}: creature types it works against differ`
    )
    const auto = new RegExp(`succeeds automatically if it is (${sizeWord}) or larger`).exec(text)
    expect(entry.hazard?.succeedsAutomaticallyIfSizeAtLeast === auto?.[1], `${entry.id}: automatic success size differs`)
    if (entry.light || /Bright Light in a/.test(text)) {
      expect(entry.light?.shape === (/-foot Cone/.test(text) ? "cone" : "radius"), `${entry.id}: light shape differs from the text`)
      expect(entry.light?.fuel === (/burns Oil as fuel/.test(text) ? "oil" : undefined), `${entry.id}: light fuel differs from "burns Oil as fuel"`)
      if (entry.light?.fuel) expect(squash((byId.get(entry.light.fuel) as Entry)?.name ?? "") === "oil", `${entry.id}: fuel ${entry.light.fuel} is not Oil`)
    }
    // Containers hold what the text names.
    const holds = [...text.matchAll(/(\d+) (?:sheets of (paper|parchment)|(Bolts|Arrows))/g)].map((match) => {
      const item = (match[2] ?? match[3]).toLowerCase()
      // Ammunition is counted in single pieces, whatever the bundle size.
      return { item, quantity: Number(match[1]), ...(byId.get(item)?.kind === "ammunition" ? { unit: "single" } : {}) }
    })
    expect(same(entry.capacity?.holds ?? [], holds), `${entry.id}: container contents ${JSON.stringify(entry.capacity?.holds)} differ from ${JSON.stringify(holds)}`)
    for (const hold of holds) expect(squash((byId.get(hold.item) as Entry)?.name ?? "").startsWith(squash(hold.item)), `${entry.id}: ${hold.item} is not the right entry`)
  }
  // Armor training: the categories each rule covers are the words of its official heading.
  const armorHeadings = P(92)
  for (const rule of rules.filter((item) => item.kind === "armor-training")) {
    const heading = /\((.+)\)$/.exec(rule.name)?.[1] ?? ""
    const categories = heading.split(/,\s*(?:or\s+)?|\s+or\s+/).map((word) => word.toLowerCase().replace(/ armor$/, ""))
    expect(new RegExp(`^${esc(heading)}$`, "m").test(armorHeadings), `${rule.id}: heading "${heading}" is not a line of page 92`)
    expect(same(rule.covers, categories), `${rule.id}: covers ${rule.covers} differ from the heading ${heading}`)
  }
  report.check(
    "equipment",
    "gear and tack: modifier effects and conditions, check uses, binding, hazard flags and targets, light, containers, saddles, armor training coverage",
    kindTotal,
    kindFailures
  )

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
    ["slow", mastery("slow")?.targetSpeedReduction, { feet: 10, until: "start-of-user-next-turn" }, /reduce its Speed by 10 feet until the start of your next turn/],
    ["topple", mastery("topple")?.save?.ability, "con", /Constitution saving throw/],
    ["topple", mastery("topple")?.save?.dc, { plusModifierOf: "attack-ability" }, /DC 8 plus the ability modifier used to make the attack roll and your Proficiency Bonus/],
    ["topple", mastery("topple")?.save?.failureCondition, "prone", /has the Prone condition/],
  ]
  for (const [name, got, want, pattern] of typedProps) {
    const description = (prop(name) ?? mastery(name))?.description ?? ""
    if (!same(got, want) || !pattern.test(flat(description))) propertyFailures.push(`${name}: typed value ${JSON.stringify(got)} is not ${JSON.stringify(want)} per the text`)
  }
  for (const entry of [...properties, ...masteries])
    for (const field of Object.keys(entry))
      if (["minimumScore", "reachBonusFeet", "pushFeet", "maxSize", "targetSpeedReduction", "save"].includes(field) && !typedProps.some(([name]) => name === entry.id))
        propertyFailures.push(`${entry.id}: unexpected typed field ${field}`)
  // Every mastery whose text reduces a target's Speed carries the reduction, with its feet and its end, and no other does.
  for (const entry of masteries) {
    const stated = /reduce its Speed by (\d+) feet until the start of your next turn/.exec(flat(entry.description))
    propertyFailures.push(
      ...(same(entry.targetSpeedReduction, stated ? { feet: Number(stated[1]), until: "start-of-user-next-turn" } : undefined)
        ? []
        : [`${entry.id}: target Speed reduction ${JSON.stringify(entry.targetSpeedReduction)} differs from the text`])
    )
  }
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
    const damage = [...text.matchAll(/(\d+) \((\d+d\d+)\) Poison damage/g)].map((item) => ({ dice: item[2], average: Number(item[1]), type: "poison" }))
    const first = entry.repeat ? damage.slice(0, damage.length - 1) : damage
    const typedFirst = entry.damage ? [entry.damage] : []
    // With a repeat, the repeating damage is the last one named. Burnt Othur Fumes and Pale Tincture state both.
    if (!same(typedFirst, first.slice(0, 1)) && !(entry.repeat && !entry.damage && first.length === 0))
      wrong(`damage ${JSON.stringify(typedFirst)} but the text says ${JSON.stringify(first.slice(0, 1))}`)
    // A repeated effect that deals damage names a second roll: the damage of each later failed save. The data must hold it, and only then.
    const wantRepeatDamage = entry.repeat || /repeat the save|repeats the save|successive failed save|every 24 hours/.test(text) ? damage[1] : undefined
    if (!same(entry.repeat?.damage, wantRepeatDamage)) wrong(`repeat damage ${JSON.stringify(entry.repeat?.damage)} but the text says ${JSON.stringify(wantRepeatDamage)}`)
    if (Boolean(entry.save?.halfDamageOnSuccess) !== /half as much damage/.test(text)) wrong("half damage on a save differs")
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
      const startPage = [89, 92, 93, 100, 101, 103, 104, 197].find((page) => squash(P(page)).includes(squash(first.slice(0, 60))))
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
    ["crafting", "purchaseCostPerDay", { amount: 10, unit: "gp" }],
    ["crafting", "workHoursPerDay", 8],
    ["potion-brewing", "rawMaterials", { amount: 25, unit: "gp" }],
    ["ship-repair", "costPerHitPoint", { amount: 20, unit: "gp" }],
    ["ship-repair", "shipyardFraction", 0.5],
    ["ship-passengers", "privateAccommodationsFraction", 0.2],
    ["ship-passengers", "hammockCostPerDay", { amount: 5, unit: "sp" }],
    ["ship-passengers", "cabinCostPerDay", { amount: 2, unit: "gp" }],
    ["crafting", "maxAssistants", 1],
    ["ship-repair", "hitPointsPerDay", 1],
    ["potion-brewing", "days", 1],
    ["potion-brewing", "workHoursPerDay", 8],
  ]
  const wording: Record<string, RegExp> = {
    selling: /fetches half its cost/,
    "coin-weight": /fifty coins weigh a pound/,
    barding: /four times the normal cost, and it weighs twice as much/,
    "draft-cargo": /five times its base carrying capacity/,
    crafting: /half its purchase cost[\s\S]*working 8 hours a day[\s\S]*divide its purchase cost in GP by 10[\s\S]*only one other character can assist you/i,
    "potion-brewing": /25 GP of raw material over the course of 1 day \(8 hours of work\)/,
    "ship-repair": /1 Hit Point of damage requires 1 day and costs 20 GP[\s\S]*halved/,
    "ship-passengers": /one-fifth as many passengers[\s\S]*5 SP per day for a hammock[\s\S]*small private cabin usually costs 2 GP per day/,
  }
  for (const [kind, field, value] of typedRules) {
    ruleCells++
    const rule = rules.find((item) => item.kind === kind)
    if (!rule || !same(rule[field], value) || !wording[kind].test(flat(rule.description))) ruleFailures.push(`${kind}: ${field} is ${JSON.stringify(rule?.[field])}, expected ${value} per the text`)
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
  const proficiency: [string, string, unknown, RegExp][] = [
    ["weapon-proficiency", "addsProficiencyBonusTo", "attack-rolls", /add your Proficiency Bonus to an attack roll you make with it/],
    ["tool-proficiency", "addsProficiencyBonusTo", "ability-checks-with-the-tool", /add your Proficiency Bonus to any ability check you make that uses the tool[\s\S]*Advantage on the check too/],
    ["tool-proficiency", "advantageWithProficientSkill", true, /proficiency in a skill that’s used with that check, you have Advantage/],
    ["casting-in-armor", "requiresArmorTraining", true, /must have training with any armor you are wearing to cast spells/],
    ["potion-brewing", "tool", "herbalism-kit", /proficiency with the Herbalism Kit can create a Potion of Healing/],
    [
      "armor-strength",
      "speedReduction",
      { feet: 10, unlessStrengthAtLeast: "listed-score" },
      /reduces the wearer’s speed by 10 feet unless the wearer has a Strength score equal to or higher than the listed score/,
    ],
    ["armor-stealth", "disadvantageOn", { ability: "dex", skill: "stealth" }, /has Disadvantage on Dexterity \(Stealth\) checks/],
    ["crafting-tools", "requiresProficiency", true, /must use the required tool to make an item and have proficiency with that tool/],
    ["crafting-tools", "helpersNeedProficiency", true, /Anyone who helps you must also have proficiency with it/],
    ["scribing-time-and-cost", "workHoursPerDay", 8, /For each day of inscription, you must work for 8 hours/],
    ["scribing-time-and-cost", "daysNeedNotBeConsecutive", true, /those days needn’t be consecutive/],
    ["scribing-prerequisites", "proficiencyAnyOf", { skill: "arcana", tool: "calligraphers-supplies" }, /proficiency in the Arcana skill or with Calligrapher’s Supplies/],
    ["scribing-prerequisites", "spellPreparedEachDay", true, /have the spell prepared on each day of the inscription/],
    ["scribing-prerequisites", "materialComponentsAtHand", true, /at hand any Material components required by the spell/],
    ["scribing-prerequisites", "consumedComponentsUsedOnCompletion", true, /they are consumed only when you complete the scroll/],
    ["scribing-prerequisites", "usesScribeSaveDcAndAttackBonus", true, /uses your spell save DC and spell attack bonus/],
    ["scribing-cantrips", "worksAsIfCasterLevel", "scribe", /works as if the caster were your level/],
    ["poison-harvesting", "timeMinutes", "1d6", /The effort takes 1d6 minutes/],
    ["poison-harvesting", "tool", "poisoners-kit", /using a Poisoner’s Kit/],
    ["poison-harvesting", "check", { ability: "int", skill: "nature", dc: 20 }, /DC 20 Intelligence \(Nature\) check/],
    ["poison-harvesting", "failedByAtLeastExposes", 5, /fails the check by 5 or more, the character is subjected to the creature’s poison/],
  ]
  for (const [kind, field, value, pattern] of proficiency) {
    ruleCells++
    const rule = rules.find((item) => item.kind === kind)
    if (!rule || !same(rule[field], value) || !pattern.test(flat(rule.description)))
      ruleFailures.push(`${kind}: ${field} is ${JSON.stringify(rule?.[field])}, expected ${JSON.stringify(value)} per the text`)
  }
  const one = rules.find((rule) => rule.kind === "one-at-a-time")
  if (!one || one.maxArmor !== 1 || !/only one suit of armor at a time and wield only one Shield/.test(flat(one.description))) ruleFailures.push("one at a time rule differs")
  // Each rule's name is tied to its id by a hand-kept table, so a name swapped between rules fails.
  const handRuleNames: Record<string, string> = {
    "armor-stealth": "Armor Stealth",
    "armor-strength": "Armor Strength",
    "armor-training-light-medium-or-heavy-armor": "Armor Training (Light, Medium, or Heavy Armor)",
    "armor-training-shield": "Armor Training (Shield)",
    barding: "Barding",
    "brewing-potions-of-healing": "Brewing Potions of Healing",
    "casting-in-armor": "Casting in Armor",
    coins: "Coins",
    "crafting-nonmagical-items": "Crafting Nonmagical Items",
    "crafting-nonmagical-items-tools": "Crafting Nonmagical Items (Tools)",
    "harvesting-poison": "Harvesting Poison",
    "mounts-and-cargo": "Mounts and Cargo",
    "one-at-a-time": "One at a Time",
    passengers: "Passengers",
    "scribing-spell-scrolls-cantrips": "Scribing Spell Scrolls (Cantrips)",
    "scribing-spell-scrolls-prerequisites": "Scribing Spell Scrolls (Prerequisites for the Scribe)",
    "scribing-spell-scrolls-time-and-cost": "Scribing Spell Scrolls (Time and Cost)",
    "selling-equipment": "Selling Equipment",
    "ship-repair": "Ship Repair",
    "spell-scroll-costs-cantrip": "Spell Scroll Costs (Cantrip)",
    "spell-scroll-costs-level-1": "Spell Scroll Costs (Level 1)",
    "spell-scroll-costs-level-2": "Spell Scroll Costs (Level 2)",
    "spell-scroll-costs-level-3": "Spell Scroll Costs (Level 3)",
    "spell-scroll-costs-level-4": "Spell Scroll Costs (Level 4)",
    "spell-scroll-costs-level-5": "Spell Scroll Costs (Level 5)",
    "spell-scroll-costs-level-6": "Spell Scroll Costs (Level 6)",
    "spell-scroll-costs-level-7": "Spell Scroll Costs (Level 7)",
    "spell-scroll-costs-level-8": "Spell Scroll Costs (Level 8)",
    "spell-scroll-costs-level-9": "Spell Scroll Costs (Level 9)",
    "tool-proficiency": "Tool Proficiency",
    "weapon-proficiency": "Weapon Proficiency",
  }
  ruleCells++
  if (!same(sorted(Object.keys(handRuleNames)), sorted(rules.map((rule) => rule.id)))) ruleFailures.push("the rule ids differ from the hand-kept list")
  for (const rule of rules) {
    ruleCells++
    if (handRuleNames[rule.id] !== rule.name) ruleFailures.push(`${rule.id}: name "${rule.name}", the hand-kept list says "${handRuleNames[rule.id]}"`)
  }
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
  const magicItems = readData<Entry>("magic-items")
  const magicFailures: string[] = []
  let magicTotal = 0
  for (const entry of data.filter((item) => item.magicItem)) {
    const item = magicItems.find((candidate) => candidate.id === entry.magicItem)
    magicTotal++
    if (!item) {
      magicFailures.push(`${entry.id}: magic item ${entry.magicItem} is not in magic-items.json`)
      continue
    }
    if (entry.id === "potion-of-healing") {
      magicTotal++
      const variant = item.variants?.find((candidate: Entry) => candidate.name === "Potion of Healing")
      if (variant?.healing !== entry.healing?.dice) magicFailures.push(`${entry.id}: healing ${entry.healing?.dice} but the magic item says ${variant?.healing}`)
    }
    if (entry.spellScroll) {
      magicTotal += 2
      const variant = item.variants?.find((candidate: Entry) => candidate.spellLevel === entry.spellScroll.spellLevel)
      if (variant?.saveDc !== entry.spellScroll.saveDc || variant?.attackBonus !== entry.spellScroll.attackBonus)
        magicFailures.push(`${entry.id}: scroll DC and bonus differ from the magic item variant ${JSON.stringify(variant)}`)
    }
  }
  for (const entry of [...of("gear"), ...of("group")].filter((item) => item.description || item.id === "spell-scroll")) {
    const isMagic = entry.id === "spell-scroll" || /is a magic item/.test(entry.description ?? "")
    magicTotal++
    if (isMagic !== Boolean(entry.magicItem)) magicFailures.push(`${entry.id}: ${isMagic ? "is a magic item but has no magicItem" : "has a magicItem but is not described as one"}`)
    const item = magicItems.find((candidate) => candidate.id === entry.magicItem)
    if (item && !(squash(entry.name).startsWith(squash(item.name)) || (item.variants ?? []).some((variant: Entry) => squash(variant.name) === squash(entry.name))))
      magicFailures.push(`${entry.id}: magic item ${item.name} does not match the name ${entry.name}`)
  }
  report.check("equipment", "magic item links resolve in magic-items.json and share healing dice, scroll save DC and attack bonus", magicTotal, magicFailures)
  const poisonBasic = byId.get("poison-basic")
  refTotal++
  if (!poisonBasic) refFailures.push("poison-basic is missing")
  for (const id of ["spell-scroll-cantrip", "spell-scroll-level-1", "potion-of-healing"]) ref("potion and scroll", id)
  report.check("equipment", "references inside the equipment data resolve", refTotal, refFailures)

  // Hand-kept tables, written by reading the pages. They are compared with the data, and with the page parsers above, so a shared
  // misreading in the builder and a page parser cannot pass both. ---------------------------------------------------------------
  const handFailures: string[] = []
  let handTotal = 0
  const same2 = (label: string, got: string | undefined, want: string) => {
    handTotal++
    if (got !== want) handFailures.push(`${label}: data reads "${got}", the hand-kept table says "${want}"`)
  }
  const weaponLine = (entry: Entry) => {
    const props = (entry.properties as string[]).map((id) => {
      if (id === "thrown") return `thrown ${entry.range.normal}/${entry.range.long}`
      if (id === "ammunition") return `ammunition ${entry.range.normal}/${entry.range.long} ${entry.ammunition}`
      if (id === "versatile") return `versatile ${entry.versatileDamage}`
      if (id === "two-handed" && entry.twoHandedUnlessMounted) return "two-handed unless-mounted"
      return id
    })
    return [
      entry.name,
      entry.category,
      entry.attackType,
      `${entry.damage.dice ?? entry.damage.amount} ${entry.damage.type}`,
      props.join(", ") || "-",
      entry.mastery,
      entry.weight ?? "-",
      costText(entry.cost),
    ].join("|")
  }
  for (const row of handWeapons) {
    const entry = byId.get(toId(row.split("|")[0]))
    same2(row.split("|")[0], entry ? weaponLine(entry) : undefined, row)
  }
  same2("weapon count", String(weapons.length), String(handWeapons.length))
  const armorLine = (entry: Entry) => {
    const dex = entry.category === "shield" ? "-" : entry.addsDexModifier ? (entry.dexModifierCap ? `dex max ${entry.dexModifierCap}` : "dex") : "none"
    const times = entry.donDoffAction ? "utilize" : `${entry.donMinutes}/${entry.doffMinutes}`
    return [
      entry.name,
      entry.category,
      entry.baseAc ?? `+${entry.acBonus}`,
      dex,
      entry.strengthRequired ?? "-",
      entry.stealthDisadvantage ? "disadvantage" : "-",
      entry.weight,
      costText(entry.cost),
      times,
    ].join("|")
  }
  for (const row of handArmor) {
    const entry = byId.get(toId(row.split("|")[0]))
    same2(row.split("|")[0], entry ? armorLine(entry) : undefined, row)
  }
  same2("armor count", String(of("armor").length), String(handArmor.length))
  handMounts.forEach((row) => {
    const entry = byId.get(toId(row.split("|")[0]))
    same2(row.split("|")[0], entry ? [entry.name, entry.carryingCapacityPounds, costText(entry.cost)].join("|") : undefined, row)
  })
  same2("mount count", String(of("mount").length), String(handMounts.length))
  handShips.forEach((row) => {
    const entry = byId.get(toId(row.split("|")[0]))
    const line = entry
      ? [entry.name, entry.speedMph, entry.crew, entry.passengers ?? "-", entry.cargoTons ?? "-", entry.ac, entry.hp, entry.damageThreshold ?? "-", costText(entry.cost)].join("|")
      : undefined
    same2(row.split("|")[0], line, row)
  })
  same2("ship count", String(of("ship").length), String(handShips.length))
  handAmmunition.forEach((row) => {
    const entry = byId.get(toId(row.split("|")[0]))
    same2(row.split("|")[0], entry ? [entry.name, entry.bundleSize, entry.storage, entry.weight, costText(entry.cost)].join("|") : undefined, row)
  })
  same2("ammunition count", String(of("ammunition").length), String(handAmmunition.length))
  const lifestyleHand = ["Wretched|free", "Squalid|1 sp", "Poor|2 sp", "Modest|1 gp", "Comfortable|2 gp", "Wealthy|4 gp", "Aristocratic|10 gp"]
  lifestyleHand.forEach((row) => {
    const entry = byId.get(toId(row.split("|")[0]))
    same2(row.split("|")[0], entry ? `${entry.name}|${entry.costPerDay ? costText(entry.costPerDay) : "free"}` : undefined, row)
  })
  same2("lifestyle count", String(of("lifestyle").length), String(lifestyleHand.length))
  // Gear mechanics: every typed fact of every gear entry, flattened to "path=value", against facts written from the descriptions.
  const mechanicFacts = (entry: Entry) => {
    const picked = Object.fromEntries([...mechanicKeys, "activation", "magicItem"].filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]]))
    return leaves(picked, "", true)
      .filter(([path]) => !path.endsWith("when"))
      .map(([path, value]) => `${path}=${value}`)
      .sort()
      .join("; ")
  }
  for (const entry of of("gear")) {
    const want = handMechanics[entry.id] ?? ""
    same2(`${entry.id} mechanics`, mechanicFacts(entry), want.split("; ").filter(Boolean).sort().join("; "))
  }
  report.check("equipment", "hand-kept tables of weapons, armor, mounts, ships, ammunition and every gear entry's typed mechanics agree with the data", handTotal, handFailures)

  // Cross-checks with the base source and Open5e. A disagreement is settled by the official text, which the checks above enforced. -----
  const crossName = "the base source and Open5e agree on costs, weights, damage, mastery, AC and properties, or the official text settles it"
  if (hasUpstream("5e-bits") && hasUpstream("open5e")) {
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
        if (item.damage?.damage_dice !== (entry.damage.dice ?? String(entry.damage.amount)) || item.damage?.damage_type?.index !== entry.damage.type)
          crossWaived.push(`${entry.id}: base source damage ${item.damage?.damage_dice} ${item.damage?.damage_type?.index}, official ${entry.damage.dice ?? entry.damage.amount} ${entry.damage.type}`)
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
      if (row.fields.damage_dice !== (entry.damage.dice ?? String(entry.damage.amount)) || row.fields.damage_type !== entry.damage.type)
        crossWaived.push(`${entry.id}: Open5e damage ${row.fields.damage_dice} ${row.fields.damage_type}, official ${entry.damage.dice ?? entry.damage.amount} ${entry.damage.type}`)
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
    report.crossCheck("equipment", crossName, crossTotal, crossFailures, crossWaived)
  } else report.skip("equipment", crossName)
}

function collectDcs(value: unknown): number[] {
  const out: number[] = []
  const walk = (item: unknown, key = "") => {
    if (Array.isArray(item)) for (const entry of item) walk(entry, key)
    else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>
      for (const [k, v] of Object.entries(record)) walk(v, k)
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
      if (typeof record.amount === "number" && "type" in record) out.push(record.amount)
      for (const entry of Object.values(record)) walk(entry)
    }
  }
  walk(value)
  return out
}

// Written by reading pages 91 and 92 of the official text, one row per line: name|category|melee or ranged|damage|properties|mastery|weight|cost.
const handWeapons = [
  "Club|simple|melee|1d4 bludgeoning|light|slow|2|1 sp",
  "Dagger|simple|melee|1d4 piercing|finesse, light, thrown 20/60|nick|1|2 gp",
  "Greatclub|simple|melee|1d8 bludgeoning|two-handed|push|10|2 sp",
  "Handaxe|simple|melee|1d6 slashing|light, thrown 20/60|vex|2|5 gp",
  "Javelin|simple|melee|1d6 piercing|thrown 30/120|slow|2|5 sp",
  "Light Hammer|simple|melee|1d4 bludgeoning|light, thrown 20/60|nick|2|2 gp",
  "Mace|simple|melee|1d6 bludgeoning|-|sap|4|5 gp",
  "Quarterstaff|simple|melee|1d6 bludgeoning|versatile 1d8|topple|4|2 sp",
  "Sickle|simple|melee|1d4 slashing|light|nick|2|1 gp",
  "Spear|simple|melee|1d6 piercing|thrown 20/60, versatile 1d8|sap|3|1 gp",
  "Dart|simple|ranged|1d4 piercing|finesse, thrown 20/60|vex|0.25|5 cp",
  "Light Crossbow|simple|ranged|1d8 piercing|ammunition 80/320 bolts, loading, two-handed|slow|5|25 gp",
  "Shortbow|simple|ranged|1d6 piercing|ammunition 80/320 arrows, two-handed|vex|2|25 gp",
  "Sling|simple|ranged|1d4 bludgeoning|ammunition 30/120 bullets-sling|slow|-|1 sp",
  "Battleaxe|martial|melee|1d8 slashing|versatile 1d10|topple|4|10 gp",
  "Flail|martial|melee|1d8 bludgeoning|-|sap|2|10 gp",
  "Glaive|martial|melee|1d10 slashing|heavy, reach, two-handed|graze|6|20 gp",
  "Greataxe|martial|melee|1d12 slashing|heavy, two-handed|cleave|7|30 gp",
  "Greatsword|martial|melee|2d6 slashing|heavy, two-handed|graze|6|50 gp",
  "Halberd|martial|melee|1d10 slashing|heavy, reach, two-handed|cleave|6|20 gp",
  "Lance|martial|melee|1d10 piercing|heavy, reach, two-handed unless-mounted|topple|6|10 gp",
  "Longsword|martial|melee|1d8 slashing|versatile 1d10|sap|3|15 gp",
  "Maul|martial|melee|2d6 bludgeoning|heavy, two-handed|topple|10|10 gp",
  "Morningstar|martial|melee|1d8 piercing|-|sap|4|15 gp",
  "Pike|martial|melee|1d10 piercing|heavy, reach, two-handed|push|18|5 gp",
  "Rapier|martial|melee|1d8 piercing|finesse|vex|2|25 gp",
  "Scimitar|martial|melee|1d6 slashing|finesse, light|nick|3|25 gp",
  "Shortsword|martial|melee|1d6 piercing|finesse, light|vex|2|10 gp",
  "Trident|martial|melee|1d8 piercing|thrown 20/60, versatile 1d10|topple|4|5 gp",
  "Warhammer|martial|melee|1d8 bludgeoning|versatile 1d10|push|5|15 gp",
  "War Pick|martial|melee|1d8 piercing|versatile 1d10|sap|2|5 gp",
  "Whip|martial|melee|1d4 slashing|finesse, reach|slow|3|2 gp",
  "Blowgun|martial|ranged|1 piercing|ammunition 25/100 needles, loading|vex|1|10 gp",
  "Hand Crossbow|martial|ranged|1d6 piercing|ammunition 30/120 bolts, light, loading|vex|3|75 gp",
  "Heavy Crossbow|martial|ranged|1d10 piercing|ammunition 100/400 bolts, heavy, loading, two-handed|push|18|50 gp",
  "Longbow|martial|ranged|1d8 piercing|ammunition 150/600 arrows, heavy, two-handed|slow|2|50 gp",
  "Musket|martial|ranged|1d12 piercing|ammunition 40/120 bullets-firearm, loading, two-handed|slow|10|500 gp",
  "Pistol|martial|ranged|1d10 piercing|ammunition 30/90 bullets-firearm, loading|vex|3|250 gp",
]

// name|category|base AC|Dex rule|Strength|Stealth|weight|cost|don/doff minutes.
const handArmor = [
  "Padded Armor|light|11|dex|-|disadvantage|8|5 gp|1/1",
  "Leather Armor|light|11|dex|-|-|10|10 gp|1/1",
  "Studded Leather Armor|light|12|dex|-|-|13|45 gp|1/1",
  "Hide Armor|medium|12|dex max 2|-|-|12|10 gp|5/1",
  "Chain Shirt|medium|13|dex max 2|-|-|20|50 gp|5/1",
  "Scale Mail|medium|14|dex max 2|-|disadvantage|45|50 gp|5/1",
  "Breastplate|medium|14|dex max 2|-|-|20|400 gp|5/1",
  "Half Plate Armor|medium|15|dex max 2|-|disadvantage|40|750 gp|5/1",
  "Ring Mail|heavy|14|none|-|disadvantage|40|30 gp|10/5",
  "Chain Mail|heavy|16|none|13|disadvantage|55|75 gp|10/5",
  "Splint Armor|heavy|17|none|15|disadvantage|60|200 gp|10/5",
  "Plate Armor|heavy|18|none|15|disadvantage|65|1500 gp|10/5",
  "Shield|shield|+2|-|-|-|6|10 gp|utilize",
]

// name|carrying capacity in pounds|cost, from page 100.
const handMounts = ["Camel|450|50 gp", "Elephant|1320|200 gp", "Horse, Draft|540|50 gp", "Horse, Riding|480|75 gp", "Mastiff|195|25 gp", "Mule|420|8 gp", "Pony|225|30 gp", "Warhorse|540|400 gp"]

// name|speed in mph|crew|passengers|cargo in tons|AC|HP|damage threshold|cost, from page 101.
const handShips = [
  "Airship|8|10|20|1|13|300|-|40000 gp",
  "Galley|4|80|-|150|15|500|20|30000 gp",
  "Keelboat|1|1|6|0.5|15|100|10|3000 gp",
  "Longship|3|40|150|10|15|300|15|10000 gp",
  "Rowboat|1.5|1|3|-|11|50|-|50 gp",
  "Sailing Ship|2|20|20|100|15|300|15|10000 gp",
  "Warship|2.5|60|60|200|15|500|20|25000 gp",
]

// name|bundle size|storage|weight|cost, from page 96.
const handAmmunition = ["Arrows|20|quiver|1|1 gp", "Bolts|20|case-crossbow-bolt|1.5|1 gp", "Bullets, Firearm|10|pouch|2|3 gp", "Bullets, Sling|20|pouch|1.5|4 cp", "Needles|50|pouch|1|1 gp"]

// id: the typed facts of each gear entry, as "path=value", read from its description. Gear not listed has none.
const handMechanics: Record<string, string> = {
  acid: "hazard.range=20; hazard.save.ability=dex; hazard.save.dc.plusModifierOf=dex; hazard.damage.dice=2d6; hazard.damage.type=acid",
  "alchemists-fire": "hazard.range=20; hazard.save.ability=dex; hazard.save.dc.plusModifierOf=dex; hazard.damage.dice=1d4; hazard.damage.type=fire; hazard.burning=true",
  antitoxin: "activation=bonus-action; modifiers.effect=advantage; modifiers.on=save; modifiers.againstCondition=poisoned; modifiers.durationHours=1",
  backpack: "capacity.pounds=30; capacity.cubicFeet=1",
  "ball-bearings": "activation=utilize-action; hazard.areaSideFeet=10; hazard.withinFeet=10; hazard.save.ability=dex; hazard.save.dc=10; hazard.condition=prone; hazard.recoverMinutes=10",
  barrel: "capacity.gallons=40; capacity.cubicFeet=4",
  basket: "capacity.pounds=40; capacity.cubicFeet=2",
  bedroll: "sleeps=1; modifiers.effect=automatic-success; modifiers.on=save",
  bell: "activation=utilize-action; audibleFeet=60",
  blanket: "modifiers.effect=advantage; modifiers.on=save",
  "block-and-tackle": "liftMultiplier=4",
  book: "modifiers.effect=bonus; modifiers.on=check; modifiers.ability=int; modifiers.skills=arcana; modifiers.skills=history; modifiers.skills=nature; modifiers.skills=religion; modifiers.amount=5",
  "bottle-glass": "capacity.pints=1.5",
  bucket: "capacity.cubicFeet=0.5",
  caltrops:
    "activation=utilize-action; hazard.areaSideFeet=5; hazard.withinFeet=5; hazard.save.ability=dex; hazard.save.dc=15; hazard.damage.amount=1; hazard.damage.type=piercing; hazard.speedZeroUntilStartOfNextTurn=true; hazard.recoverMinutes=10",
  candle: "light.shape=radius; light.brightFeet=5; light.dimFeet=5; light.durationHours=1",
  "case-crossbow-bolt": "capacity.holds.item=bolts; capacity.holds.quantity=20; capacity.holds.unit=single",
  "case-map-or-scroll": "capacity.holds.item=paper; capacity.holds.quantity=10; capacity.holds.item=parchment; capacity.holds.quantity=5",
  chain:
    "activation=utilize-action; binding.requiresAnyCondition=grappled; binding.requiresAnyCondition=incapacitated; binding.requiresAnyCondition=restrained; binding.appliesCondition=restrained; binding.appliesWhen=legs-bound; checks.use=bind; checks.ability=str; checks.skill=athletics; checks.dc=13; checks.range=5; checks.activation=utilize-action; checks.use=escape; checks.ability=dex; checks.skill=acrobatics; checks.dc=18; checks.activation=action; checks.use=burst; checks.ability=str; checks.skill=athletics; checks.dc=20; checks.activation=action",
  chest: "capacity.cubicFeet=12",
  "climbers-kit": "activation=utilize-action; activation=bonus-action; anchorFeet=25",
  costume: "modifiers.effect=advantage; modifiers.on=check",
  crowbar: "modifiers.effect=advantage; modifiers.on=check; modifiers.ability=str",
  flask: "capacity.pints=1",
  "grappling-hook": "activation=utilize-action; checks.use=catch; checks.ability=dex; checks.skill=acrobatics; checks.dc=13; checks.range=50; checks.activation=utilize-action",
  "healers-kit": "activation=utilize-action; uses=10; stabilize.requiresCondition=unconscious; stabilize.atHitPoints=0; stabilize.replacesCheck.ability=wis; stabilize.replacesCheck.skill=medicine",
  "holy-water": "hazard.range=20; hazard.save.ability=dex; hazard.save.dc.plusModifierOf=dex; hazard.damage.dice=2d8; hazard.damage.type=radiant; hazard.onlyAgainst=fiend; hazard.onlyAgainst=undead",
  "hunting-trap":
    "activation=utilize-action; hazard.save.ability=dex; hazard.save.dc=13; hazard.damage.dice=1d4; hazard.damage.type=piercing; hazard.speedZeroUntilStartOfNextTurn=true; hazard.chainFeet=3; hazard.failedFreeAttemptDamage.amount=1; hazard.failedFreeAttemptDamage.type=piercing; checks.use=free; checks.ability=str; checks.skill=athletics; checks.dc=13; checks.activation=action",
  jug: "capacity.gallons=1",
  ladder: "heightFeet=10",
  lamp: "light.shape=radius; light.brightFeet=15; light.dimFeet=30; light.fuel=oil",
  "lantern-bullseye": "light.shape=cone; light.brightFeet=60; light.dimFeet=60; light.fuel=oil",
  "lantern-hooded": "activation=bonus-action; light.shape=radius; light.brightFeet=30; light.dimFeet=30; light.fuel=oil; light.loweredHoodDimRadiusFeet=5",
  lock: "checks.use=pick; checks.ability=dex; checks.skill=sleight-of-hand; checks.dc=15; checks.tool=thieves-tools",
  "magnifying-glass": "modifiers.effect=advantage; modifiers.on=check",
  manacles:
    "activation=utilize-action; binding.requiresAnyCondition=grappled; binding.requiresAnyCondition=incapacitated; binding.requiresAnyCondition=restrained; binding.appliesCondition=restrained; binding.appliesWhen=attached-to-fixed-anchor; binding.sizes=Small; binding.sizes=Medium; checks.use=bind; checks.ability=dex; checks.skill=sleight-of-hand; checks.dc=13; checks.range=5; checks.activation=utilize-action; checks.use=escape; checks.ability=dex; checks.skill=sleight-of-hand; checks.dc=20; checks.activation=action; checks.use=burst; checks.ability=str; checks.skill=athletics; checks.dc=25; checks.activation=action; checks.use=pick; checks.ability=dex; checks.skill=sleight-of-hand; checks.dc=15; checks.tool=thieves-tools",
  map: "modifiers.effect=bonus; modifiers.on=check; modifiers.ability=wis; modifiers.skills=survival; modifiers.amount=5",
  net: "hazard.range=15; hazard.save.ability=dex; hazard.save.dc.plusModifierOf=dex; hazard.condition=restrained; hazard.succeedsAutomaticallyIfSizeAtLeast=Huge; checks.use=escape; checks.ability=str; checks.skill=athletics; checks.dc=10; checks.range=5; checks.activation=action; object.ac=10; object.hp=5; object.immunities=bludgeoning; object.immunities=poison; object.immunities=psychic",
  oil: "activation=utilize-action; fuelHours=6; hazard.range=20; hazard.save.ability=dex; hazard.save.dc.plusModifierOf=dex; hazard.dryAfterMinutes=1; hazard.extraFireDamage.amount=5; hazard.extraFireDamage.type=fire; spaceHazard.areaSideFeet=5; spaceHazard.withinFeet=5; spaceHazard.burnsUntilRoundsAfterLit=2; spaceHazard.damage.amount=5; spaceHazard.damage.type=fire; spaceHazard.onlyWhenLit=true",
  perfume: "modifiers.effect=advantage; modifiers.on=check; modifiers.ability=cha; modifiers.skills=persuasion; modifiers.durationHours=1",
  "poison-basic":
    "activation=bonus-action; coating.ammunitionPieces=3; coating.triggerDamageTypes=piercing; coating.triggerDamageTypes=slashing; coating.extraDamage.dice=1d4; coating.extraDamage.type=poison; coating.potencyMinutes=1",
  pole: "lengthFeet=10; modifiers.effect=advantage; modifiers.on=check; modifiers.ability=str; modifiers.skills=athletics",
  "pot-iron": "capacity.gallons=1",
  "potion-of-healing": "activation=bonus-action; magicItem=potions-of-healing; healing.dice=2d4 + 2; healing.range=5",
  pouch: "capacity.pounds=6; capacity.cubicFeet=0.2",
  quiver: "capacity.holds.item=arrows; capacity.holds.quantity=20; capacity.holds.unit=single",
  "ram-portable": "modifiers.effect=bonus; modifiers.on=check; modifiers.ability=str; modifiers.amount=4; modifiers.effect=advantage; modifiers.on=check",
  rope: "activation=utilize-action; binding.requiresAnyCondition=grappled; binding.requiresAnyCondition=incapacitated; binding.requiresAnyCondition=restrained; binding.appliesCondition=restrained; binding.appliesWhen=legs-bound; checks.use=knot; checks.ability=dex; checks.skill=sleight-of-hand; checks.dc=10; checks.activation=utilize-action; checks.use=burst; checks.ability=str; checks.skill=athletics; checks.dc=20; checks.use=escape; checks.ability=dex; checks.skill=acrobatics; checks.dc=15; checks.activation=action",
  sack: "capacity.pounds=30; capacity.cubicFeet=1",
  shovel: "dig.sideFeet=5; dig.hours=1; dig.inSoilOrSimilar=true",
  "signal-whistle": "activation=utilize-action; audibleFeet=600",
  "spell-scroll-cantrip": "magicItem=spell-scroll; spellScroll.spellLevel=0; spellScroll.saveDc=13; spellScroll.attackBonus=5",
  "spell-scroll-level-1": "magicItem=spell-scroll; spellScroll.spellLevel=1; spellScroll.saveDc=13; spellScroll.attackBonus=5",
  "spikes-iron": "activation=utilize-action",
  spyglass: "magnification=2",
  string: "activation=utilize-action; lengthFeet=10",
  tent: "sleeps=2",
  tinderbox: "activation=bonus-action; ignite.exposedFuel=bonus-action; ignite.otherFireMinutes=1",
  torch: "light.shape=radius; light.brightFeet=20; light.dimFeet=20; light.durationHours=1; attackDamage.amount=1; attackDamage.type=fire",
  vial: "capacity.ounces=4",
  waterskin: "capacity.pints=4",
}
