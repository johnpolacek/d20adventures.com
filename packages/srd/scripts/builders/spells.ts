import type { Cost } from "../../src/schema/common"
import type { Area, CastingTime, Components, Damage, Duration, Healing, Range, Save, Spell, SpellStatBlock, SpellTable } from "../../src/schema/spells"
import { spellSchema } from "../../src/schema/spells"
import { applyOverrides, toId, writeData } from "../lib/data"
import { pages } from "../lib/official"
import { readBase } from "../lib/sources"
import { overrides } from "../overrides/spells"

type Line = { text: string; page: number }

const schools = "Abjuration|Conjuration|Divination|Enchantment|Evocation|Illusion|Necromancy|Transmutation"
const levelLine = new RegExp(`^(?:Level [1-9] (?:${schools})|(?:${schools}) Cantrip) \\(`)
const typeNames = "Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder"
const abilityNames: Record<string, Save["ability"]> = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" }
const conditionNames = "Blinded|Charmed|Deafened|Exhaustion|Frightened|Grappled|Incapacitated|Invisible|Paralyzed|Petrified|Poisoned|Prone|Restrained|Stunned|Unconscious"

/**
 * Text the PDF extraction sets out of reading order, where a column breaks around a stat block. Each run of lines
 * from `from` to `to` on `page` is moved to follow the line `after`, which ends the spell it belongs to.
 */
const moves = [
  { page: 109, from: "or make attacks with Ranged or Reach weapons", to: "to pass through the barrier, the spell ends.", after: "ing through it. An affected creature can cast spells" },
  { page: 110, from: "Wisdom saving throw to end the effect, as de-", to: "1 minute, after which it can be affected again.", after: "Charmed creature, that creature can make a" },
  { page: 131, from: "face a choice of paths along the way there, you know", to: "which path is the most direct.", after: "far it is and in what direction it lies. Whenever you" },
]

/**
 * The tables printed inside spells. The PDF text gives a table cell by cell: the title, the column headings, then
 * the rows. `rows` is the printed row count. Where a last cell wraps over several lines, `key` matches the first
 * cell of a row, so a row runs to the next key. With more than two columns only the first cell wraps. `halves` marks
 * a table printed as two side-by-side halves, read in pairs and put back in order of the first cell.
 */
type TableSpec = { title?: string; headings: string[]; rows: number; key?: RegExp; halves?: true }
const tableSpecs: Record<string, TableSpec[]> = {
  augury: [{ title: "Omens", headings: ["Omen", "For Results That Will Be …"], rows: 4 }],
  confusion: [{ headings: ["1d10", "Behavior for the Turn"], rows: 4, key: /^\d+(?:–\d+)?$/ }],
  "control-weather": [
    { title: "Precipitation", headings: ["Stage", "Condition"], rows: 5 },
    { title: "Temperature", headings: ["Stage", "Condition"], rows: 6 },
    { title: "Wind", headings: ["Stage", "Condition"], rows: 5 },
  ],
  creation: [{ title: "Materials", headings: ["Material", "Duration"], rows: 5 }],
  "divine-word": [{ title: "Divine Word Effects", headings: ["Hit Points", "Effect"], rows: 4, key: /^\d+–\d+$/ }],
  "prismatic-spray": [{ title: "Prismatic Rays", headings: ["1d8", "Ray"], rows: 8, key: /^\d$/ }],
  "prismatic-wall": [{ title: "Prismatic Layers", headings: ["Order", "Effects"], rows: 7, key: /^\d$/ }],
  reincarnate: [{ headings: ["1d10", "Species"], rows: 10, halves: true }],
  scrying: [
    { headings: ["Your Knowledge of the Target Is …", "Save Modifier"], rows: 3 },
    { headings: ["You Have the Target’s …", "Save Modifier"], rows: 3 },
  ],
  teleport: [{ title: "Teleportation Outcome", headings: ["Familiarity", "Mishap", "Similar Area", "Off Target", "On Target"], rows: 6 }],
}

/** The spell chapter as lines, with the column breaks above put back in reading order. */
function chapter(): Line[] {
  const lines: Line[] = []
  for (let page = 107; page <= 175; page++) for (const text of pages[page - 1].split("\n")) lines.push({ text: text.replace(/ /g, " ").trimEnd(), page })
  const find = (page: number, text: string) => {
    const index = lines.findIndex((line) => line.page === page && line.text.trim() === text)
    if (index < 0) throw new Error(`spells: page ${page} has no line "${text}"`)
    return index
  }
  for (const move of moves) {
    const from = find(move.page, move.from)
    const cut = lines.splice(from, find(move.page, move.to) - from + 1)
    const after = lines.findIndex((line) => line.text.trim() === move.after)
    if (after < 0) throw new Error(`spells: no line "${move.after}"`)
    lines.splice(after + 1, 0, ...cut)
  }
  return lines.slice(lines.findIndex((line) => line.text === "Spell Descriptions") + 1)
}

/**
 * Hyphenated words printed whole somewhere in the SRD or in the base source's spell text, so a hyphen at a line end
 * is kept for them and dropped otherwise.
 */
const compounds = new Set([
  // Broken at a line end in the PDF and printed whole nowhere else.
  "long-dead",
  "nine-course",
  ...[...pages, ...readBase("Spells").map((spell) => `${spell.description} ${spell.higher_level ?? ""}`)].flatMap((text) =>
    [...text.matchAll(/([A-Za-z]+)-([A-Za-z]+)(?=[^A-Za-z\n]|$)/gm)].map((match) => match[0].toLowerCase())
  ),
])

/** Join PDF lines into running text: a word broken at a line end is mended, an em dash takes no space. */
function join(lines: string[]): string {
  let text = ""
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    const broken = /([A-Za-z0-9]+)-$/.exec(text)
    const next = /^[A-Za-z]+/.exec(line)?.[0] ?? ""
    if (!text) text = line
    else if (text.endsWith("—") || (text.endsWith("-") && /^\d/.test(line))) text += line
    else if (broken && next) {
      const keep = /\d$/.test(broken[1]) || /^[A-Z]/.test(next) || compounds.has(`${broken[1]}-${next}`.toLowerCase())
      text = keep ? text + line : text.slice(0, -1) + line
    } else text += ` ${line}`
  }
  return text
}

const runInHeading = /^[A-Z0-9][\w’–-]*(?: (?:[A-Z0-9][\w’–-]*|of|the|and|or|a|an|to|in|on|with|for|from))*\. [A-Z“]/

/** Split body lines into paragraphs: a tab or a bullet starts one, and so does a run-in heading after a full stop. */
function paragraphs(lines: string[]): string[] {
  const groups: string[][] = []
  for (const line of lines.filter((line) => line.trim())) {
    const tabbed = /^\s*\t/.test(line)
    const bullet = /^\s*•/.test(line)
    const previous = groups.at(-1)?.at(-1)?.trim() ?? ""
    const heading = /[.:!?”)]$/.test(previous) && runInHeading.test(line.trim())
    const text = bullet ? `• ${line.replace(/^\s*•\s*/, "")}` : line
    if (!groups.length || tabbed || bullet || heading) groups.push([text])
    else groups.at(-1)?.push(text)
  }
  return groups.map(join).filter(Boolean)
}

/** Read one table. Returns it and the range of lines it used. */
function table(lines: string[], spec: TableSpec): { table: SpellTable; start: number; end: number } {
  const first = spec.title ?? spec.headings[0]
  const start = lines.findIndex((line) => line.trim() === first)
  if (start < 0) throw new Error(`spells: no table "${first}"`)
  let index = spec.title ? start + 1 : start
  // Consume the headings, which may wrap, and report whether they were there.
  const headings = () => {
    let at = index
    for (const heading of spec.headings) {
      let text = ""
      while (at < lines.length && text.length < heading.length) text = join([text, lines[at++]])
      if (text !== heading) return false
    }
    index = at
    return true
  }
  if (!headings() || (spec.halves && !headings())) throw new Error(`spells: table "${first}" headings`)
  const width = spec.headings.length
  const isValue = (line: string) => /^(—|[\d–]+)$/.test(line.trim())
  const rows: string[][] = []
  while (rows.length < spec.rows) {
    // A table that runs onto a new page prints its headings again.
    if (headings()) continue
    const key: string[] = [lines[index++]]
    if (width > 2) while (!isValue(lines[index])) key.push(lines[index++])
    const cells = [join(key)]
    if (spec.key) {
      if (!spec.key.test(cells[0])) throw new Error(`spells: table "${first}" row key "${cells[0]}"`)
      const value: string[] = []
      while (index < lines.length && !/^\s*\t/.test(lines[index]) && !spec.key.test(lines[index].trim()) && lines[index].trim() !== spec.headings[0]) value.push(lines[index++])
      cells.push(join(value))
    } else for (let column = 1; column < width; column++) cells.push(join([lines[index++]]))
    rows.push(cells)
  }
  if (spec.halves) rows.sort((a, b) => Number(a[0]) - Number(b[0]))
  return { table: { ...(spec.title ? { title: spec.title } : {}), columns: spec.headings, rows }, start, end: index }
}

/** A stat block from its name line to the end of the lines given. */
function statBlock(lines: string[]): SpellStatBlock {
  const labels = /^(AC|HP|Speed|Resistances|Immunities|Senses|Languages|CR) /
  const sections = ["Traits", "Actions", "Bonus Actions"]
  const fields: Record<string, string[]> = {}
  const entries: Record<string, string[][]> = {}
  let abilityText = ""
  let field = ""
  let section = ""
  for (const raw of lines.slice(2)) {
    const line = raw.trim()
    if (sections.includes(line)) {
      section = line
      entries[section] = []
      continue
    }
    if (section) {
      const list = entries[section]
      const previous = list.at(-1)?.at(-1) ?? ""
      // An entry starts after a full stop with its name, then a period or a parenthesis.
      if (!list.length || (/\.$/.test(previous) && /^[A-Z][\w’ ]*(?:\. |\()/.test(line))) list.push([line])
      else list.at(-1)?.push(line)
      continue
    }
    const label = labels.exec(line)
    if (label) {
      field = label[1]
      fields[field] = [line.slice(label[0].length)]
    } else if (/^(MOD SAVE|Str|Dex|Con|Int|Wis|Cha|[+−-]\d)/.test(line)) {
      abilityText += ` ${line}`
      field = ""
    } else if (field) fields[field].push(line)
    else throw new Error(`spells: stat block line "${line}"`)
  }
  const number = (text: string) => Number(text.replace("−", "-"))
  const abilities = Object.fromEntries(
    [...abilityText.matchAll(/(Str|Dex|Con|Int|Wis|Cha)\s+(\d+)\s*([+−-]\d+)\s*([+−-]\d+)/g)].map((match) => [
      match[1].toLowerCase(),
      { score: Number(match[2]), modifier: number(match[3]), save: number(match[4]) },
    ])
  )
  const named = (list: string[][] | undefined) =>
    list?.map((entry) => {
      const text = join(entry)
      const split = text.indexOf(". ")
      return { name: text.slice(0, split), text: text.slice(split + 2) }
    })
  const value = (name: string) => (fields[name] ? join(fields[name]) : undefined)
  return {
    name: lines[0].trim(),
    type: lines[1].trim(),
    ac: value("AC") as string,
    hp: value("HP") as string,
    speed: value("Speed") as string,
    abilities: abilities as SpellStatBlock["abilities"],
    resistances: value("Resistances"),
    immunities: value("Immunities"),
    senses: value("Senses") as string,
    languages: value("Languages") as string,
    cr: value("CR") as string,
    traits: named(entries.Traits),
    actions: named(entries.Actions) as SpellStatBlock["actions"],
    bonusActions: named(entries["Bonus Actions"]),
  }
}

type Block = { name: string; page: number; material?: string; body: string[] }

/** Cut the chapter into spells: a name line, a level line, then the Casting Time line. */
function blocks(lines: Line[]): Block[] {
  const heads: number[] = []
  lines.forEach((_line, index) => {
    if (!levelLine.test(lines[index + 1]?.text ?? "")) return
    if (lines[index + 2]?.text.startsWith("Casting Time:") || lines[index + 3]?.text.startsWith("Casting Time:")) heads.push(index)
  })
  return heads.map((head, index) => {
    const end = heads[index + 1] ?? lines.length
    let duration = head
    while (!lines[duration].text.startsWith("Duration:")) duration++
    const header = lines.slice(head, duration).map((line) => line.text)
    const from = header.findIndex((line) => /^Components?:/.test(line))
    const material = /\bM \((.*)\)$/.exec(join(header.slice(from)))?.[1]
    return { name: lines[head].text.trim(), page: lines[head].page, material, body: lines.slice(duration + 1, end).map((line) => line.text) }
  })
}

const isStatBlockStart = (lines: string[], index: number) => /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b.*, \w+$/.test(lines[index + 1]?.trim() ?? "") && lines[index + 2]?.startsWith("AC ")

/** Description, upgrade paragraphs, tables and stat blocks of every spell, keyed by id. Stat blocks go to the spell that names them. */
function officialText() {
  const result = new Map<
    string,
    { name: string; page: number; material?: string; description: string; higherLevel?: string; cantripUpgrade?: string; tables?: SpellTable[]; statBlocks?: SpellStatBlock[] }
  >()
  const loose: SpellStatBlock[] = []
  for (const block of blocks(chapter())) {
    const id = toId(block.name)
    let body = block.body
    const start = body.findIndex((_, index) => isStatBlockStart(body, index))
    if (start >= 0) {
      loose.push(statBlock(body.slice(start)))
      body = body.slice(0, start)
    }
    const tables: SpellTable[] = []
    for (const spec of tableSpecs[id] ?? []) {
      const found = table(body, spec)
      tables.push(found.table)
      body = [...body.slice(0, found.start), ...body.slice(found.end)]
    }
    const text = paragraphs(body)
    const labelled = (label: string) => text.find((paragraph) => paragraph.startsWith(label))?.slice(label.length)
    const higherLevel = labelled("Using a Higher-Level Spell Slot. ")
    const cantripUpgrade = labelled("Cantrip Upgrade. ")
    const description = text.filter((paragraph) => !/^(Using a Higher-Level Spell Slot|Cantrip Upgrade)\. /.test(paragraph)).join("\n")
    result.set(id, { name: block.name, page: block.page, material: block.material, description, higherLevel, cantripUpgrade, tables: tables.length ? tables : undefined })
  }
  for (const stat of loose) {
    const owner = [...result.values()].find((spell) => spell.description.includes(`the ${stat.name} stat block`))
    if (!owner) throw new Error(`spells: no spell uses the ${stat.name} stat block`)
    owner.statBlocks = [...(owner.statBlocks ?? []), stat]
  }
  return result
}

function castingTime(text: string): { castingTime: CastingTime; alternateCastingTime?: CastingTime } {
  const options = /^(.+) \((\w+)\) or (.+) \((\w+)\)$/.exec(text)
  if (options) return { castingTime: { ...castingTime(options[1]).castingTime, option: options[2] }, alternateCastingTime: { ...castingTime(options[3]).castingTime, option: options[4] } }
  const [time, trigger] = text.split(/, which you take /)
  const timed = /^(\d+) (minute|hour)s?$/.exec(time)
  const units: Record<string, CastingTime["unit"]> = { Action: "action", "Bonus Action": "bonus-action", Reaction: "reaction" }
  const unit = timed ? (timed[2] as CastingTime["unit"]) : units[time]
  if (!unit) throw new Error(`spells: casting time "${text}"`)
  return { castingTime: { unit, ...(timed ? { amount: Number(timed[1]) } : {}), ...(trigger ? { trigger } : {}) } }
}

function range(text: string): Range {
  const kinds: Record<string, Range["kind"]> = { Self: "self", Touch: "touch", Sight: "sight", Unlimited: "unlimited", Special: "special" }
  if (kinds[text]) return { kind: kinds[text] }
  const distance = /^(\d+) (feet|miles?)$/.exec(text)
  if (!distance) throw new Error(`spells: range "${text}"`)
  return { kind: distance[2] === "feet" ? "feet" : "miles", distance: Number(distance[1]) }
}

function duration(text: string, concentration: boolean): Duration {
  const kinds: Record<string, Duration["kind"]> = {
    Instantaneous: "instantaneous",
    "Until dispelled": "until-dispelled",
    "Until dispelled or triggered": "until-dispelled-or-triggered",
    Special: "special",
  }
  if (kinds[text]) return { kind: kinds[text], concentration }
  const timed = /^(?:Concentration,? )?([Uu]p to )?(\d+) (round|minute|hour|day)s?$/i.exec(text)
  if (!timed) throw new Error(`spells: duration "${text}"`)
  return { kind: "timed", amount: Number(timed[2]), unit: timed[3].toLowerCase() as Duration["unit"], ...(timed[1] ? { upTo: true as const } : {}), concentration }
}

function components(list: string[], material: string | undefined): Components {
  const result: Components = { verbal: list.includes("V"), somatic: list.includes("S") }
  if (!list.includes("M")) return result
  if (!material) throw new Error("spells: an M component has no material")
  const text = material
  const units: Record<string, Cost["unit"]> = { GP: "gp", CP: "cp", "Copper Pieces": "cp" }
  const costs = [...text.matchAll(/([\d,]+)\+? (GP|CP|Copper Pieces)\b/g)].map((match) => ({ amount: Number(match[1].replace(/,/g, "")), unit: units[match[2]] }))
  return { ...result, material: { text, ...(costs.length ? { costs } : {}), consumed: /consume/.test(text) } }
}

const types = (text: string) => text.split(/, or |, | or /).map((name) => name.toLowerCase()) as Damage["types"]

/** Damage the description states as dice and type, once per distinct roll. */
function damage(text: string, higherLevel = "", cantripUpgrade = ""): Damage[] | undefined {
  const found: Damage[] = []
  const typeList = `((?:${typeNames})(?:(?:, or |, | or )(?:${typeNames}))*)`
  const dice = "(\\d+d\\d+(?: \\+ \\d+)?)( plus your spellcasting ability modifier)?"
  // "takes 8d6 Fire damage" and "takes Fire damage equal to 3d6 plus your spellcasting ability modifier".
  const before = [...text.matchAll(new RegExp(`${dice} ${typeList} damage`, "g"))].map((match) => ({ index: match.index, dice: match[1], modifier: match[2], types: match[3] }))
  const after = [...text.matchAll(new RegExp(`${typeList} damage (?:to the target )?equal to ${dice}`, "g"))].map((match) => ({
    index: match.index,
    dice: match[2],
    modifier: match[3],
    types: match[1],
  }))
  for (const match of [...before, ...after].sort((a, b) => a.index - b.index)) {
    const entry: Damage = { dice: match.dice, types: types(match.types), ...(match.modifier ? { modifier: true as const } : {}) }
    if (!found.some((other) => JSON.stringify(other) === JSON.stringify(entry))) found.push(entry)
  }
  if (!found.length) return undefined
  const slot = /^(?:The |All the )?(.*?)damage(?: \([^)]*\))? increases? by (\d+d\d+) for (?:each|every) (?:spell )?slot level above \d\./.exec(higherLevel)
  if (slot) {
    const named = [...slot[1].matchAll(new RegExp(typeNames, "g"))].map((match) => match[0].toLowerCase())
    for (const entry of found) if (!named.length || entry.types.some((type) => named.includes(type))) entry.perSlot = slot[2]
  }
  const upgrade = /levels 5 \((\d+d\d+)\), 11 \((\d+d\d+)\), and 17 \((\d+d\d+)\)/.exec(cantripUpgrade)
  if (upgrade) for (const entry of found) entry.cantrip = { 5: upgrade[1], 11: upgrade[2], 17: upgrade[3] }
  return found
}

function healing(text: string, higherLevel = ""): Healing | undefined {
  const dice = /regains? (?:a number of )?Hit Points equal to (\d+d\d+(?: \+ \d+)?)( plus your spellcasting ability modifier)?/.exec(text) ?? /regains? (\d+d\d+(?: \+ \d+)?) Hit Points/.exec(text)
  const amount = /regains? (\d+) Hit Points/.exec(text)
  const temporary = /gains? (\d+d\d+(?: \+ \d+)?) Temporary Hit Points/.exec(text)
  const found = temporary ?? dice
  if (!found && !amount) return undefined
  const perSlot = /healing (?:and damage )?increases? by (\d+d\d+) for each spell slot level/.exec(higherLevel)
  const perSlotAmount = /healing (?:and damage )?increases? by (\d+) for each spell slot level/.exec(higherLevel)
  return {
    ...(found ? { dice: found[1] } : { amount: Number(amount?.[1]) }),
    ...(dice?.[2] && !temporary ? { modifier: true as const } : {}),
    ...(temporary ? { temporary: true as const } : {}),
    ...(perSlot ? { perSlot: perSlot[1] } : {}),
    ...(perSlotAmount ? { perSlotAmount: Number(perSlotAmount[1]) } : {}),
  }
}

/** Every saving throw the description has a creature make, in order. A success halves damage, gives a stated lesser effect, or avoids the spell. */
function saves(text: string): Save[] | undefined {
  const pattern = /(?<!(?:Advantage|Disadvantage|bonus|penalty) (?:on|to) (?:all |its |their |your )?)(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw(?!s)/g
  const abilities = [...new Set([...text.matchAll(pattern)].map((match) => abilityNames[match[1]]))]
  if (!abilities.length) return undefined
  const half = /half as much damage|half the damage|half damage/i.test(text)
  const other = /On a successful save,|on a success(?:ful save)?,? (?:it|the|a|its|you)|Successful Save:/.test(text)
  const onSuccess: Save["onSuccess"] = half ? "half" : other ? "other" : "none"
  return abilities.map((ability) => ({ ability, onSuccess }))
}

function conditions(text: string): Spell["conditions"] {
  const pattern = new RegExp(`(?:has|have|gains?|is given|giving it|having) the ((?:${conditionNames})(?:(?:, and |, or |, | and | or )(?:${conditionNames}))*) conditions?`, "g")
  const found = new Set<string>()
  for (const match of text.matchAll(pattern)) for (const name of match[1].split(/, and |, or |, | and | or /)) found.add(name.toLowerCase())
  return found.size ? ([...found].sort() as Spell["conditions"]) : undefined
}

/** The first area of effect the description sizes. */
function area(text: string): Area | undefined {
  const patterns: [RegExp, (match: RegExpExecArray) => Area][] = [
    [/(\d+)-foot-radius Sphere/, (match) => ({ shape: "sphere", size: Number(match[1]) })],
    [/(\d+)-foot[- ](Cone|Cube|Emanation)/, (match) => ({ shape: match[2].toLowerCase() as Area["shape"], size: Number(match[1]) })],
    [/(\d+)-foot-wide, (\d+)-foot-long Line/, (match) => ({ shape: "line", size: Number(match[2]), width: Number(match[1]) })],
    [/(\d+)-foot-long, (\d+)-foot-wide Line/, (match) => ({ shape: "line", size: Number(match[1]), width: Number(match[2]) })],
    [/(\d+)-foot-radius, (\d+)-foot[- ](?:high|tall) Cylinder/, (match) => ({ shape: "cylinder", size: Number(match[1]), height: Number(match[2]) })],
    [/(\d+)-foot-tall, (\d+)-foot-radius Cylinder/, (match) => ({ shape: "cylinder", size: Number(match[2]), height: Number(match[1]) })],
  ]
  const found = patterns.flatMap(([pattern, make]) => {
    const match = pattern.exec(text)
    return match ? [{ index: match.index, area: make(match) }] : []
  })
  return found.sort((a, b) => a.index - b.index)[0]?.area
}

const numbers: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4 }

/** Map each damaging row of a table to its damage type, where the row reads "12d6 Fire damage". */
function withDamageTypes(table: SpellTable): SpellTable {
  const types = new RegExp(`\\d+d\\d+ (${typeNames}) damage`)
  const found = table.rows.flatMap((row) => {
    const match = types.exec(row.at(-1) ?? "")
    return match ? [[row[0], match[1].toLowerCase()]] : []
  })
  return found.length ? { ...table, damageTypes: Object.fromEntries(found) } : table
}

/** One damage roll whose type a table row decides, when every damaging row rolls the same dice. */
function tableDamage(tables: SpellTable[]): Damage[] {
  return tables.flatMap((table) => {
    if (!table.damageTypes || !table.title) return []
    const dice = new Set(table.rows.flatMap((row) => [...(/(\d+d\d+) \w+ damage/.exec(row.at(-1) ?? "")?.slice(1, 2) ?? [])]))
    if (dice.size !== 1) throw new Error(`spells: table ${table.title} rolls more than one damage dice`)
    return [{ dice: [...dice][0], types: [...new Set(Object.values(table.damageTypes))], table: table.title }]
  })
}

/** Beams, darts and rays: "You create three glowing darts", "one more dart for each spell slot level", "two beams at level 5". */
function projectiles(text: string, higherLevel = "", cantripUpgrade = ""): Spell["projectiles"] {
  const base = /You (?:create|hurl) (a|three) (?:[\w ]+ )?(beam|dart|ray)s?\b/.exec(text)
  if (!base) return undefined
  const perSlot = /(one) (?:more|additional) (?:dart|ray) for each spell slot level above/.exec(higherLevel)
  const cantrip = /(\w+) beams at level 5, (\w+) beams at level 11, and (\w+) beams at level 17/.exec(cantripUpgrade)
  return {
    count: numbers[base[1]],
    ...(perSlot ? { perSlot: numbers[perSlot[1]] } : {}),
    ...(cantrip ? { cantrip: { 5: numbers[cantrip[1]], 11: numbers[cantrip[2]], 17: numbers[cantrip[3]] } } : {}),
  }
}

/** "You can target one additional creature for each spell slot level above 1", and Chain Lightning's extra bolt to another target. */
function extraTargets(higherLevel = ""): number | undefined {
  const match = /(?:You can (?:target|affect) (one|two) additional \w+|(One) additional bolt leaps from the first target to another target) for each spell slot level above/.exec(higherLevel)
  return match ? numbers[(match[1] ?? match[2]).toLowerCase()] : undefined
}

function armorClass(text: string): Spell["ac"] {
  const bonus = /\+(\d+) bonus to (?:AC|Armor Class)/.exec(text)
  const base = /base AC becomes (\d+) plus its Dexterity modifier/.exec(text)
  const minimum = /has an Armor Class of (\d+) if its AC is lower than that/.exec(text)
  if (!bonus && !base && !minimum) return undefined
  return { ...(bonus ? { bonus: Number(bonus[1]) } : {}), ...(base ? { base: Number(base[1]) } : {}), ...(minimum ? { minimum: Number(minimum[1]) } : {}) }
}

/** Bless, Bane, Guidance, Ray of Enfeeblement and Warding Bond's saves. */
function rollModifier(text: string): Spell["rollModifier"] {
  const rolls: Record<string, NonNullable<Spell["rollModifier"]>["rolls"]> = {
    "the attack roll or save": ["attack-roll", "saving-throw"],
    "any ability check": ["ability-check"],
    "all its damage rolls": ["damage-roll"],
  }
  const dice = /(adds|subtracts?) (\d+d\d+) (?:to|from) (the attack roll or save|any ability check|all its damage rolls)/.exec(text)
  if (dice) return { dice: dice[2], ...(dice[1] === "adds" ? {} : { subtract: true as const }), rolls: rolls[dice[3]] }
  const flat = /\+(\d+) bonus to AC and saving throws/.exec(text)
  return flat ? { amount: Number(flat[1]), rolls: ["saving-throw"] } : undefined
}

function hitPointMaximum(text: string, higherLevel = ""): Spell["hitPointMaximum"] {
  const amount = /Hit Point maximum and current Hit Points increase by (\d+)/.exec(text)
  const dice = /Hit Point maximum also increases by (\d+d\d+), and it gains the same number of Hit Points/.exec(text)
  const perSlot = /Hit Points increase by (\d+) for each spell slot level above/.exec(higherLevel)
  if (!amount && !dice) return undefined
  return { ...(dice ? { dice: dice[1] } : { amount: Number(amount?.[1]) }), ...(perSlot ? { perSlotAmount: Number(perSlot[1]) } : {}) }
}

export default function build() {
  const official = officialText()
  const base = readBase("Spells")
  const entries = base.map((source): Spell => {
    const id = toId(source.name)
    const text = official.get(id)
    if (!text) throw new Error(`spells: ${source.name} is not in the official text`)
    // 5e-bits folds the Components line into Range for a few spells ("Touch Component: V, S").
    const [rangeText, folded] = (source.range as string).split(/ Components?: /)
    const list = folded ? folded.split(", ") : (source.components as string[])
    const attack = /(melee|ranged) spell attack/.exec(text.description)?.[1]
    const spellRange = range(rangeText)
    const spellArea = area(text.description)
    const tables = text.tables?.map(withDamageTypes)
    const rolls = [...(damage(text.description, text.higherLevel, text.cantripUpgrade) ?? []), ...tableDamage(tables ?? [])]
    return {
      id,
      name: text.name,
      page: text.page,
      level: source.level,
      school: source.school.index,
      classes: source.classes.map((entry: { index: string }) => entry.index),
      ...castingTime(source.casting_time),
      ritual: source.ritual,
      range: { ...spellRange, ...(spellArea ? { area: spellArea } : {}) },
      // 5e-bits puts commas where the PDF breaks a line in a material, so its wording comes from the official header.
      components: components(list, text.material),
      duration: duration(source.duration, source.concentration),
      description: text.description,
      ...(text.higherLevel ? { higherLevel: text.higherLevel } : {}),
      ...(text.cantripUpgrade ? { cantripUpgrade: text.cantripUpgrade } : {}),
      ...(tables ? { tables } : {}),
      ...(text.statBlocks ? { statBlocks: text.statBlocks } : {}),
      ...(attack ? { attack: attack.toLowerCase() as Spell["attack"] } : {}),
      ...optional("saves", saves(text.description)),
      ...(rolls.length ? { damage: rolls } : {}),
      ...optional("healing", healing(text.description, text.higherLevel)),
      ...optional("conditions", conditions([text.description, ...(text.tables ?? []).flatMap((table) => table.rows.flat())].join("\n"))),
      ...optional("projectiles", projectiles(text.description, text.higherLevel, text.cantripUpgrade)),
      ...optional("extraTargetsPerSlot", extraTargets(text.higherLevel)),
      ...optional("ac", armorClass(text.description)),
      ...optional("rollModifier", rollModifier(text.description)),
      ...optional("damageReduction", /reduces the total damage taken by (\d+d\d+)/.exec(text.description)?.[1]),
      ...optional("hitPointMaximum", hitPointMaximum(text.description, text.higherLevel)),
    }
  })
  if (official.size !== entries.length) throw new Error(`spells: ${official.size} official spells, ${entries.length} in the base source`)
  writeData("spells", spellSchema, applyOverrides("spells", entries, overrides))
}

const optional = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : ({ [key]: value } as Record<K, V>))
