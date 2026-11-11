import type { ConditionId, Cost } from "../../src/schema/common"
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

/**
 * Paragraphs the PDF sets flush, after a list of run-in items or after a table, so no tab marks them. Each is the
 * start of its first line.
 */
const flushParagraphs = ["The stress of casting Wish to produce any effect", "The spell doesn’t account for circumstances"]

/** Split body lines into paragraphs: a tab or a bullet starts one, and so does a run-in heading after a full stop. */
function paragraphs(lines: string[]): string[] {
  const groups: string[][] = []
  for (const line of lines.filter((line) => line.trim())) {
    const tabbed = /^\s*\t/.test(line)
    const bullet = /^\s*•/.test(line)
    const previous = groups.at(-1)?.at(-1)?.trim() ?? ""
    const heading = (/[.:!?”)]$/.test(previous) && runInHeading.test(line.trim())) || flushParagraphs.some((start) => line.trim().startsWith(start))
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
  const units: Record<string, Cost["unit"]> = { GP: "gp", CP: "cp", "Copper Piece": "cp", "Copper Pieces": "cp" }
  // A priced part is consumed when "which the spell consumes" follows its price before the next price, or when the
  // material ends "all of which the spell consumes".
  const prices = [...material.matchAll(/([\d,]+)\+? (GP|CP|Copper Pieces?)\b/g)]
  const all = /all of which the spell consumes/.test(material)
  const costs = prices.map((match, index) => {
    const after = material.slice((match.index ?? 0) + match[0].length, prices[index + 1]?.index ?? material.length)
    return { cost: { amount: Number(match[1].replace(/,/g, "")), unit: units[match[2]] }, consumed: all || /which the spell consumes/.test(after) }
  })
  const consumed = !/consumes/.test(material) ? "none" : costs.some((cost) => !cost.consumed) ? "some" : "all"
  return { ...result, material: { text: material, ...(costs.length ? { costs } : {}), consumed } }
}

const types = (text: string) => text.split(/, or |, | or /).map((name) => name.toLowerCase()) as Damage["types"]

function healing(text: string, higherLevel = ""): Healing | undefined {
  const dice = /regains? (?:a number of )?Hit Points equal to (\d+d\d+(?: \+ \d+)?)( plus your spellcasting ability modifier)?/.exec(text) ?? /regains? (\d+d\d+(?: \+ \d+)?) Hit Points/.exec(text)
  const amount = /(?:regains?|restoring|restores) (\d+) Hit Points?\b/.exec(text)
  const temporary = /gains? (\d+d\d+(?: \+ \d+)?) Temporary Hit Points/.exec(text)
  const temporaryModifier = /gains Temporary Hit Points equal to your spellcasting ability modifier/.test(text)
  const perSlot = /healing (?:and damage )?increases? by (\d+d\d+) for each spell slot level/.exec(higherLevel)
  const perSlotAmount = /healing (?:and damage )?increases? by (\d+) for each spell slot level|gain (\d+) additional Temporary Hit Points for each spell slot level/.exec(higherLevel)
  const rolled = temporary ?? dice
  if (!rolled && !amount && !temporaryModifier) return undefined
  return {
    ...(rolled ? { dice: rolled[1] } : amount ? { amount: Number(amount[1]) } : {}),
    ...((dice?.[2] && !temporary) || temporaryModifier ? { modifier: true as const } : {}),
    ...(temporary || temporaryModifier ? { temporary: true as const } : {}),
    ...(perSlot ? { perSlot: perSlot[1] } : {}),
    ...(perSlotAmount ? { perSlotAmount: Number(perSlotAmount[1] ?? perSlotAmount[2]) } : {}),
  }
}

const abilityPattern = "Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma"
const conditionList = `(${conditionNames})((?:(?:, and |, or |, | and | or )(?:${conditionNames}))*)`

/** A paragraph cut into sentences. */
const sentencesOf = (paragraph: string) => paragraph.replace(/([.!?])\s+(?=[A-Z“•])/g, "$1\n").split("\n")

type Mention = { index: number; ability: Save["ability"]; repeat: boolean; before: string }

/**
 * The saving throws a sentence has a creature make, in order: "makes a Dexterity saving throw", "makes another
 * Wisdom saving throw", "repeats the save", "must repeat the saving throw". A save named as a benefit or a penalty
 * ("Advantage on Strength saving throws") is not one.
 */
function mentionsIn(sentence: string, last: Save["ability"] | undefined): Mention[] {
  const found: Mention[] = []
  for (const match of sentence.matchAll(new RegExp(`(${abilityPattern}) saving throw(s?)`, "g"))) {
    const before = sentence.slice(0, match.index)
    if (match[2] || /(?:Advantage|Disadvantage|bonus|penalty) (?:on|to) (?:all |its |their |your |any )?$/.test(before)) continue
    found.push({ index: match.index ?? 0, ability: abilityNames[match[1]], repeat: /\banother $/.test(before), before })
  }
  for (const match of sentence.matchAll(/\brepeats? the (?:save|saving throw)\b/g)) {
    const index = match.index ?? 0
    const ability = found.filter((mention) => mention.index < index).at(-1)?.ability ?? last
    if (ability) found.push({ index, ability, repeat: true, before: sentence.slice(0, index) })
  }
  return found.sort((a, b) => a.index - b.index)
}

/**
 * When a save is made, from the words before it in its sentence or right after it: "At the end of each of its turns,
 * the target repeats the save", "makes a Constitution saving throw at the end of each of its turns". A single save at
 * the start of the caster's next turn, and a repeated save with no such words, are "later".
 */
function timings(sentence: string, mention: Mention): Save["when"][] {
  const near = `${mention.before} ${sentence.slice(mention.index, mention.index + 60).replace(/^\w+ saving throw|^repeats? the (?:save|saving throw)/, "")}`
  const found: Save["when"][] = []
  if (/[Aa]t the end of each of (?:its|the target’s) turns|(?:If|if) the [\w ]*?creature ends its turn|at which point it must/.test(near)) found.push("end-of-turn")
  if (/[Aa]t the start of each of its turns/.test(near)) found.push("start-of-turn")
  if (/(?:each time|whenever|Whenever) (?:it|the target) takes damage|damages the (?:\w+ )?creature|takes the damage from it/.test(mention.before)) found.push("on-damage")
  if (/take an action to [^.]*$/.test(mention.before)) found.push("action")
  if (found.length) return found
  return mention.repeat || /at the start of your next turn|each of your (?:later )?turns/.test(near) ? ["later"] : ["initial"]
}

/** What a success does, read from the text that follows the save up to the next save. */
function outcome(scope: string): Save["onSuccess"] {
  if (/half as much damage|half the initial damage|half damage/i.test(scope)) return "half"
  if (/succeeds on three of these saves|successfully saves[^.]*three times/.test(scope)) return "other"
  if (/ending (?:the spell|the effect|the condition)(?: on itself)? on a success|saving throw to end (?:the|this) effect/.test(scope)) return "ends"
  const success = /(On a successful save|On a success|If it succeeds|if it succeeds|If it successfully saves[^,]*), ([^.]*)/.exec(scope)
  if (!success) return "none"
  if (/isn’t affected|is unaffected|has no effect|resists your efforts/.test(success[2])) return "none"
  if (/\bends\b|is no longer (?:affected|Restrained)|isn’t Restrained/.test(success[2])) return "ends"
  return "other"
}

/** The damage types a spell offers as a choice: "Choose Acid, Cold, … or Thunder", "a type you choose: …", "This damage is …", "air (Lightning), earth (Thunder)". */
function chosenTypes(description: string): Damage["types"] {
  const list = `((?:${typeNames})(?:(?:, or |, | or )(?:${typeNames}))+)`
  const named = new RegExp(`(?:[Cc]hoose|a type you choose:|This damage is) ${list}`).exec(description)
  if (named) return types(named[1])
  const parens = [...description.matchAll(new RegExp(`\\((${typeNames})\\)`, "g"))].map((match) => match[1])
  if (parens.length > 1) return types(parens.join(", "))
  throw new Error(`spells: no damage type choice in "${description.slice(0, 60)}"`)
}

type Link = { trigger?: "hit" | "failed-save"; save?: number }

/**
 * Saves, damage and conditions, read sentence by sentence from the description and the last cell of each table row,
 * and linked by meaning as the reading rules say: to a failed save stated in the sentence or earlier ("On a failed
 * save", "or take", a sentence that begins "While Charmed" after the save that charms), or to a hit ("on a hit",
 * "when you hit", "whenever you hit it with an attack roll", "extra damage from the attack"). Links the patterns
 * cannot see are overrides that quote the text.
 */
function effects(description: string, tables: SpellTable[], higherLevel = "", cantripUpgrade = "") {
  const rows = tables.flatMap((table) => table.rows.map((row) => row.at(-1) ?? ""))
  const paragraphs = [...description.split("\n"), ...rows]
  const descriptionCount = description.split("\n").length
  const sentences = paragraphs.flatMap((paragraph, at) => sentencesOf(paragraph).map((text) => ({ text, paragraph: at })))
  // A "repeats the save" with no ability of its own repeats the save made before it.
  const allMentions: (Mention & { sentence: number })[][] = []
  let last: Save["ability"] | undefined
  for (const [at, sentence] of sentences.entries()) {
    allMentions.push(mentionsIn(sentence.text, last).map((mention) => ({ ...mention, sentence: at })))
    last = allMentions[at].at(-1)?.ability ?? last
  }
  const flat = allMentions.flat()
  // A paragraph that opens with a run-in name ("Death. Each target makes …") names the saves in it. Saves are labelled
  // only where several named options or effects have a save each.
  const heading = (paragraph: number) => /^(?:\d+ )?([A-Z][\w’]*(?: (?:[A-Z0-9][\w’–]*|of|the|and|or|a|an|to|in|on|with|for|from))*)\. /.exec(paragraphs[paragraph])?.[1]
  // Entries are labelled where the spell has several named options or effects, or a table of named rows.
  const named = new Set(paragraphs.map((_, at) => heading(at)).filter(Boolean))
  const labelOf = (paragraph: number) => (named.size > 1 ? heading(paragraph) : undefined)
  const saves: Save[] = []
  const savedIn: number[] = []
  let tableMention: (typeof flat)[number] | undefined
  const indexOf = new Map<(typeof flat)[number], number[]>()
  for (const [order, mention] of flat.entries()) {
    const sentence = sentences[mention.sentence].text
    const next = flat[order + 1]
    const rest = [sentence.slice(mention.index, next?.sentence === mention.sentence ? next.index : undefined)]
    // The scope runs on through the description, or within its own table row, and stops at an ability check.
    for (let at = mention.sentence + 1; at < sentences.length && at !== next?.sentence; at++) {
      const inRows = sentences[at].paragraph >= descriptionCount
      if ((inRows && sentences[at].paragraph !== sentences[mention.sentence].paragraph) || /\bmakes? an? [\w ()]*?check\b/.test(sentences[at].text)) break
      rest.push(sentences[at].text)
    }
    let onSuccess = outcome(rest.join(" "))
    // A save that sends the creature to a table of outcomes: "half" where the rows halve damage on a success.
    if (/\btable\b/.test(rest.join(" ")) && rows.some((row) => /Failed Save:/.test(row))) {
      onSuccess = rows.some((row) => /Successful Save: Half as much damage/.test(row)) ? "half" : "none"
      tableMention = mention
    }
    const dc = /DC (\d+) $/.exec(mention.before)
    const caster = /\byou make a $|When you cast this spell, make a (?:DC \d+ )?$/.test(mention.before)
    const label = labelOf(sentences[mention.sentence].paragraph)
    indexOf.set(
      mention,
      timings(sentence, mention).map((when) => {
        // A success on the save that decides whether the effect lands leaves the creature unaffected, even where the
        // text adds that the spell then ends.
        const result = when === "initial" && onSuccess === "ends" ? "none" : onSuccess
        const save: Save = {
          ability: mention.ability,
          dc: dc ? Number(dc[1]) : "spell-save-dc",
          ...(label ? { label } : {}),
          when,
          onSuccess: result,
          ...(caster ? { target: "caster" as const } : {}),
        }
        // Two mentions in one sentence that are the same in every respect are one save stated twice.
        const twice = saves.findIndex((other, index) => JSON.stringify(other) === JSON.stringify(save) && savedIn[index] === mention.sentence)
        if (twice >= 0) return twice
        saves.push(save)
        savedIn.push(mention.sentence)
        return saves.length - 1
      })
    )
  }
  // Links given by sentence, kept so that "While Charmed, …" and "While there, …" take the link of what came before.
  const sentenceLinks: Link[] = sentences.map(() => ({}))
  const link = (at: number, index: number): Link => {
    const text = sentences[at].text
    const before = allMentions[at].filter((mention) => mention.index < index).at(-1)
    if (before) return { trigger: "failed-save", save: indexOf.get(before)?.[0] }
    if (/\b[Oo]n a hit\b|\bwhen you hit\b|\bwhenever you hit\b|\bAs you hit the target\b|\bhit by the strike\b|damage from the attack\b/.test(text)) return { trigger: "hit" }
    // In a table row, "Failed Save:" is the save the description sends to the table.
    if (/^Failed Save:|\. Failed Save:|^\w+\. Failed Save:/.test(text) && sentences[at].paragraph >= descriptionCount && tableMention)
      return { trigger: "failed-save", save: indexOf.get(tableMention)?.[0] }
    if (/[Oo]n (?:a )?failed save|Failed Save:|fails (?:the|its|this|that)(?: second)? save\b|succeed on that save or/.test(text)) {
      const latest = flat.filter((mention) => mention.sentence < at || (mention.sentence === at && mention.index < index)).at(-1)
      if (latest) return { trigger: "failed-save", save: indexOf.get(latest)?.[0] }
    }
    // "While Restrained, …" takes the link of the condition it names. "While there, …" takes the save of the sentence before.
    const state = /^While ([A-Z]\w+)\b/.exec(text)?.[1]
    const given = state ? conditions.find((entry) => entry.condition === state.toLowerCase() && entry.trigger) : undefined
    if (given) return { trigger: given.trigger, save: given.save }
    if (/^While there\b/.test(text) && at > 0) {
      const earlier = allMentions[at - 1].at(-1)
      if (earlier) return { trigger: "failed-save", save: indexOf.get(earlier)?.[0] }
    }
    return {}
  }
  const damage: (Damage & { paragraph: number })[] = []
  const conditions: NonNullable<Spell["conditions"]> = []
  const casterConditions: NonNullable<Spell["casterConditions"]> = []
  const typeList = `((?:${typeNames})(?:(?:, or |, | or )(?:${typeNames}))*)`
  const dice = "(\\d+d\\d+(?: \\+ \\d+)?)( plus your spellcasting ability modifier)?"
  const record = (at: number, entry: Link) => {
    if (entry.trigger && !sentenceLinks[at].trigger) sentenceLinks[at] = { trigger: entry.trigger, save: entry.save }
  }
  for (const [at, sentence] of sentences.entries()) {
    if (sentence.paragraph >= descriptionCount) {
      // Table rows give conditions. Their damage is typed through the table.
      for (const match of sentence.text.matchAll(new RegExp(`\\b(?:has|have) the ${conditionList} conditions?`, "g")))
        for (const name of [match[1], ...match[2].split(/, and |, or |, | and | or /).filter(Boolean)]) {
          const label = labelOf(sentence.paragraph)
          const several = /fails (?:its|three of the|the) saves|fails three times|three failures/.test(sentence.text)
          const when = several ? /(If it fails[^,.]*)/.exec(sentence.text)?.[1] : undefined
          const entry = { condition: name.toLowerCase() as ConditionId, ...(several ? {} : link(at, match.index ?? 0)), ...(label ? { label } : {}), ...(when ? { appliesWhen: when } : {}) }
          if (!conditions.some((other) => JSON.stringify(other) === JSON.stringify(entry))) conditions.push(entry)
        }
      continue
    }
    const text = sentence.text
    // "takes 8d6 Fire damage" and "takes Fire damage equal to 3d6 plus your spellcasting ability modifier".
    const rolls: { index: number; end: number; dice?: string; amount?: number; modifier?: string; types: Damage["types"] }[] = [
      ...[...text.matchAll(new RegExp(`${dice} ${typeList} damage`, "g"))].map((match) => ({
        index: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        dice: match[1],
        modifier: match[2],
        types: types(match[3]),
      })),
      ...[...text.matchAll(new RegExp(`${typeList} damage (?:to the target )?equal to ${dice}`, "g"))].map((match) => ({
        index: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        dice: match[2],
        modifier: match[3],
        types: types(match[1]),
      })),
      // "3d8 damage of the chosen type", "an extra 2d8 damage when you hit": the types are the choice the description lists.
      ...[...text.matchAll(/(\d+d\d+) damage(?= of the chosen type| of a type you choose| of the spirit’s type| when you hit)/g)].map((match) => ({
        index: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        dice: match[1],
        types: chosenTypes(description),
      })),
      // A fixed amount: "taking 20 Radiant damage", "deals 50 Force damage to you". Damage to structures is left out.
      ...[...text.matchAll(new RegExp(`\\b(\\d+) (${typeNames}) damage(?! to any structure)`, "g"))]
        .filter((match) => !/(?:d|\+ |at least )$/.test(text.slice(0, match.index)))
        .map((match) => ({ index: match.index ?? 0, end: (match.index ?? 0) + match[0].length, amount: Number(match[1]), types: types(match[2]) })),
      // Delayed Blast Fireball: "A creature takes Fire damage equal to the total accumulated damage", "The spell’s base damage is 12d6".
      ...[...text.matchAll(/base damage is (\d+d\d+)/g)].map((match) => ({
        index: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        dice: match[1],
        types: types(new RegExp(`takes (${typeNames}) damage equal to the total`).exec(description)?.[1] ?? ""),
      })),
    ].sort((a, b) => a.index - b.index)
    // "3d8 Radiant damage (if you are good or neutral) or 3d8 Necrotic damage (if you are evil)" is one roll of either type.
    for (let index = rolls.length - 1; index > 0; index--) {
      const [first, second] = [rolls[index - 1], rolls[index]]
      if (first.dice && first.dice === second.dice && / or $/.test(text.slice(first.end, second.index)) && !/[.;]/.test(text.slice(first.end, second.index))) {
        first.types = [...first.types, ...second.types]
        rolls.splice(index, 1)
      }
    }
    for (const roll of rolls) {
      const target = /you and any creature traveling with you each take/.test(text) ? "caster-and-companions" : /\byou take\b|damage to you\b/.test(text) ? "caster" : undefined
      const tie = link(at, roll.index)
      record(at, tie)
      damage.push({
        ...(roll.dice ? { dice: roll.dice } : { amount: roll.amount }),
        types: roll.types,
        ...(roll.modifier ? { modifier: true as const } : {}),
        ...(target ? { target: target as Damage["target"] } : {}),
        ...tie,
        ...(labelOf(sentence.paragraph) ? { label: labelOf(sentence.paragraph) } : {}),
        paragraph: sentence.paragraph,
      })
    }
    const found = [
      ...[...text.matchAll(new RegExp(`\\b(?:has|have|gains?|is given|giving it|having|with) the ${conditionList} conditions?`, "g"))].map((match) => ({
        index: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        names: [match[1], ...match[2].split(/, and |, or |, | and | or /).filter(Boolean)],
      })),
      ...[...text.matchAll(new RegExp(`\\b(?:is|be|falls?) (${conditionNames})\\b`, "g"))].map((match) => ({ index: match.index ?? 0, end: (match.index ?? 0) + match[0].length, names: [match[1]] })),
    ].sort((a, b) => a.index - b.index)
    for (const match of found) {
      const before = text.slice(0, match.index)
      // The negation that matters is in the match's own clause.
      const clause = before.split(/, (?:and |or |but )?/).at(-1) ?? before
      const after = text.slice(match.end)
      // A condition the text ends, prevents, names as immune, or names as a state the creature already has is not given.
      if (
        /\b(?:if|If|unless) (?:it|the creature|the target|you|a target|they)\b[^,]*$|can’t $|can’t (?:gain|be|have)|neither|Immunity|immune|from such creatures|no longer|\bthat (?:is possessed by or )?$/.test(
          clause
        ) ||
        /^[^.]*?(?:removed|the condition ends|doesn’t end)|^ (?:conditions? )?from (?:such|one or more)/.test(after)
      )
        continue
      const caster = /^(?:You|On a failed save, you|If expelled, you)\b/.test(before)
      // A condition given only after several failures is not linked to one save.
      const several = /fails (?:its|three of the|the) saves|fails three times|three failures/.test(text)
      for (const name of match.names) {
        const condition = name.toLowerCase() as ConditionId
        if (caster) {
          if (!casterConditions.includes(condition)) casterConditions.push(condition)
          continue
        }
        const tie = several ? {} : link(at, match.index)
        record(at, tie)
        const label = labelOf(sentence.paragraph)
        // "If it fails its saves three times, it is turned to stone and has the Petrified condition".
        const when = several ? /(If it fails[^,.]*)/.exec(text)?.[1] : undefined
        const entry = { condition, ...tie, ...(label ? { label } : {}), ...(when ? { appliesWhen: when } : {}) }
        if (!conditions.some((other) => JSON.stringify(other) === JSON.stringify(entry))) conditions.push(entry)
      }
    }
  }
  // Scaling: each "… damage increases by XdY for each spell slot level" clause names the parts it raises by type, by
  // "initial", or by words of the paragraph the part is in. With no such name it raises every part.
  for (const match of higherLevel.matchAll(/([\w ]*?)damage([\w ’()]*?) increases? by (\d+d\d+)/g)) {
    const qualifier = `${match[1]} ${match[2]}`.trim()
    const named = [...qualifier.matchAll(new RegExp(typeNames, "g"))].map((type) => type[0].toLowerCase())
    const key = qualifier
      .replace(/^(?:The|the|and the|All the|Both types of)\s*/, "")
      .split(" ")
      .slice(-2)
      .join(" ")
      .toLowerCase()
    for (const [at, part] of damage.entries()) {
      const raised = named.length
        ? part.types.some((type) => named.includes(type))
        : /both|All|healing and|^(?:The|the)?$/.test(qualifier) || !key
          ? true
          : /initial/.test(qualifier)
            ? at === 0
            : paragraphs[part.paragraph].toLowerCase().includes(key)
      if (raised) part.perSlot = match[3]
    }
  }
  const upgrade = /levels 5 \((\d+d\d+)\), 11 \((\d+d\d+)\), and 17 \((\d+d\d+)\)/.exec(cantripUpgrade)
  if (upgrade) for (const part of damage) part.cantrip = { 5: upgrade[1], 11: upgrade[2], 17: upgrade[3] }
  const tableLink = tableMention ? { trigger: "failed-save" as const, save: indexOf.get(tableMention)?.[0] } : {}
  return { saves, damage: damage.map(({ paragraph, ...part }) => part), conditions, casterConditions, tableLink }
}

/**
 * The first area of effect the description sizes. A size that limits an object or an illusion ("no larger than a
 * 20-foot Cube", "must fit in a 5-foot Cube"), a portion of a target, or one of several Cubes is not an area.
 */
function area(text: string): Area | undefined {
  const patterns: [RegExp, (match: RegExpExecArray) => Area][] = [
    [/(\d+)-foot-radius Sphere/g, (match) => ({ shape: "sphere", size: Number(match[1]) })],
    [/(\d+)-foot[- ](Cone|Cube|Emanation)\b/g, (match) => ({ shape: match[2].toLowerCase() as Area["shape"], size: Number(match[1]) })],
    [/(\d+)-foot-wide, (\d+)-foot-long Line/g, (match) => ({ shape: "line", size: Number(match[2]), width: Number(match[1]) })],
    [/(\d+)-foot-long, (\d+)-foot-wide Line/g, (match) => ({ shape: "line", size: Number(match[1]), width: Number(match[2]) })],
    [/Line of [\w ]+? (\d+) feet long and (\d+) feet wide/g, (match) => ({ shape: "line", size: Number(match[1]), width: Number(match[2]) })],
    [/(\d+)-foot-radius, (\d+)-foot[- ](?:high|tall) Cylinder/g, (match) => ({ shape: "cylinder", size: Number(match[1]), height: Number(match[2]) })],
    [/(\d+)-foot-tall, (\d+)-foot-radius Cylinder/g, (match) => ({ shape: "cylinder", size: Number(match[2]), height: Number(match[1]) })],
  ]
  const found = patterns.flatMap(([pattern, make]) =>
    [...text.matchAll(pattern)]
      .filter((match) => {
        const before = text.slice(0, match.index)
        const after = text.slice((match.index ?? 0) + match[0].length)
        return !/(?:no larger than|fit in|contained within|unoccupied|ten|contiguous) (?:an? )?$/.test(before) && !/^(?:s\b| portion)/.test(after)
      })
      .map((match) => ({ index: match.index ?? 0, area: make(match as RegExpExecArray) }))
  )
  found.sort((a, b) => a.index - b.index)
  const first = found[0]?.area
  // An area that belongs to one of several named options, or one of two areas of different shapes, is not the spell's area.
  const paragraphs = text.split("\n")
  const optionsCount = paragraphs.filter((paragraph) => /^[A-Z][\w’]*(?: [A-Z][\w’]*)*\. /.test(paragraph)).length
  const at = found[0] ? text.slice(0, found[0].index).split("\n").length - 1 : 0
  if (!first) return undefined
  if (found.some((other) => other.area.shape !== first.shape)) return undefined
  if (optionsCount > 1 && /^[A-Z][\w’]*(?: [A-Z][\w’]*)*\. /.test(paragraphs[at])) return undefined
  // The caster picks which creatures in the region are affected or spared.
  const selective =
    /creatures? of your choice in\b|creatures of your choice have\b|creature you choose\b|[Cc]hoose up to \w+ creatures in|designate creatures to be unaffected|you can force that creature/.test(text)
  return first && selective ? { ...first, selective: true } : first
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
  const match =
    /(?:(?:You can (?:target|affect)|You animate or reassert control over) (one|two) additional [\w ]+?|(One) additional bolt leaps from the first target to another target) for each spell slot level above/.exec(
      higherLevel
    )
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
  if (flat) return { amount: Number(flat[1]), rolls: ["saving-throw"] }
  const weapon = /a \+(\d+) bonus to attack rolls and damage rolls/.exec(text)
  if (weapon) return { amount: Number(weapon[1]), rolls: ["attack-roll", "damage-roll"] }
  const skill = /a \+(\d+) bonus to \w+ \(\w+\) checks/.exec(text)
  return skill ? { amount: Number(skill[1]), rolls: ["ability-check"] } : undefined
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
    const read = effects(text.description, tables ?? [], text.higherLevel, text.cantripUpgrade)
    const rolls = [...read.damage, ...tableDamage(tables ?? []).map((part) => ({ ...part, ...read.tableLink }))]
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
      ...(read.saves.length ? { saves: read.saves } : {}),
      ...(rolls.length ? { damage: rolls } : {}),
      ...optional("healing", healing(text.description, text.higherLevel)),
      ...(read.conditions.length ? { conditions: read.conditions } : {}),
      ...(read.casterConditions.length ? { casterConditions: read.casterConditions } : {}),
      ...optional("projectiles", projectiles(text.description, text.higherLevel, text.cantripUpgrade)),
      ...optional("extraTargetsPerSlot", extraTargets(text.higherLevel)),
      ...optional("ac", armorClass(text.description)),
      ...optional("rollModifier", rollModifier(text.description)),
      ...optional("damageReduction", /reduces the total damage taken by (\d+d\d+)/.exec(text.description)?.[1]),
      ...optional("hitPointMaximum", hitPointMaximum(text.description, text.higherLevel)),
    }
  })
  // The unlinked fields describe a creature the spell affects. Where the spell's only save is an initial one that a
  // success avoids, failing it is what makes a creature affected and the field stands. Where a success has any other
  // outcome (Ray of Enfeeblement), the field cannot say which creatures it holds for, so it is left out.
  for (const entry of entries) {
    const saves = entry.saves ?? []
    if (!saves.length || (saves.length === 1 && saves[0].when === "initial" && saves[0].onSuccess === "none")) continue
    for (const field of ["rollModifier", "ac", "hitPointMaximum", "damageReduction"] as const) delete entry[field]
  }
  if (official.size !== entries.length) throw new Error(`spells: ${official.size} official spells, ${entries.length} in the base source`)
  writeData("spells", spellSchema, applyOverrides("spells", entries, overrides))
}

const optional = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : ({ [key]: value } as Record<K, V>))
