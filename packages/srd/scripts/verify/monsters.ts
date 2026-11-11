import { existsSync } from "node:fs"
import type { Monster, MonsterFeature, MonsterRule } from "../../src/schema/monsters"
import { dataPath, readData, toId } from "../lib/data"
import { missingSentences, pages, squash } from "../lib/official"
import type { Report } from "../lib/report"
import { hasUpstream, readOpen5e } from "../lib/sources"

// Everything here is read from the official text by this file alone. The builder's parsing and the base source are
// not used, so a value the builder got wrong cannot pass by being read the same wrong way twice.

const chapter = { first: 258, last: 364 }
const sizeWords = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"]
const abilityWords: Record<string, string> = { Str: "str", Dex: "dex", Con: "con", Int: "int", Wis: "wis", Cha: "cha" }
const damageWords = ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder"]
const conditionWords = [
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
const sectionWords: Record<string, string> = { Traits: "traits", Actions: "actions", "Bonus Actions": "bonusActions", Reactions: "reactions", "Legendary Actions": "legendary" }
const alignmentLine = /^(?:Unaligned|Neutral|(?:Lawful|Neutral|Chaotic) (?:Good|Neutral|Evil))$/
const statLine = /^(AC|Initiative|HP|Speed|Skills|Vulnerabilities|Resistances|Immunities|Gear|Senses|Languages|CR)\b/

/** "−3" and "+3" to numbers. */
const num = (text: string) => Number(text.replace("−", "-").replace("+", ""))
const flat = (text: string) => text.replace(/\s+/g, " ").trim()
/** Joined lines. A hyphen at a line end is dropped before a lowercase letter ("Ne-\ncrotic" is "Necrotic") and kept after a digit ("20-\nfoot"). */
const soft = (lines: string[]) =>
  flat(
    lines
      .join("\n")
      .replace(/(\p{L})-\n\s*(\p{Ll})/gu, "$1$2")
      .replace(/(\d)-\n\s*/g, "$1-")
  )
const crValue = (text: string) => (text.includes("/") ? 1 / Number(text.split("/")[1]) : Number(text))
const diceAverage = (dice: string) => {
  const match = /^(\d+)d(\d+)(?: ([+-]) (\d+))?$/.exec(dice) as RegExpExecArray
  const modifier = match[3] ? Number(`${match[3]}${match[4]}`) : 0
  return Math.floor((Number(match[1]) * (Number(match[2]) + 1)) / 2 + modifier)
}
/** Deep equality that ignores key order and treats undefined fields as absent. */
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .filter(([, v]) => v !== undefined)
            .sort(([a], [b]) => (a < b ? -1 : 1))
            .map(([k, v]) => [k, canonical(v)])
        )
      : value
const same = (a: unknown, b: unknown) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

type Line = { text: string; page: number }

/**
 * Printed values the data corrects by override, because the PDF text is plainly wrong. The header check names each
 * one as a misprint instead of failing.
 */
const misprints = [
  {
    match: "young-white-dragon: int save is -2, official 2",
    page: 340,
    reason: "the PDF prints the save “2” with no sign, the only unsigned save in the chapter. With modifier −2 and no proficiency it is −2",
  },
]

/** Values the official text itself prints inconsistently with its own rules. The data keeps what is printed. */
const officialErrors = [
  { match: "archmage: XP 8000 at CR 12", page: 305 },
  { match: "gray-ooze: initiative score 13", page: 293 },
  { match: "invisible-stalker: initiative score 22", page: 301 },
]
type Official = {
  name: string
  page: number
  section: string
  group?: string
  header: string
  fields: Map<string, string>
  abilityTokens: string[]
  features: Map<string, OfficialFeature[]>
  legendaryIntro?: string
}
type OfficialFeature = { name: string; lines: string[]; subItems: string[]; breaks: number[] }

/** The chapter as lines with page numbers, the running header removed. */
function chapterLines(): Line[] {
  const out: Line[] = []
  for (let page = chapter.first; page <= chapter.last; page++) {
    for (const raw of pages[page - 1].split("\n")) {
      const text = raw.replace(/ /g, " ")
      if (/^\s*$/.test(text) || text.trim() === "System Reference Document 5.2.1" || text.trim() === `${page}`) continue
      out.push({ text, page })
    }
  }
  return out
}

/** A line that reads like the second line of a stat block: "Medium or Small Humanoid (Wizard), Neutral". */
function isTypeLine(text: string) {
  const comma = text.lastIndexOf(", ")
  if (comma < 0 || !alignmentLine.test(text.slice(comma + 2).trim())) return false
  return sizeWords.includes(text.split(" ")[0])
}

/** Split the chapter into stat blocks. A block starts at the name line above a type line and an AC line. */
function officialBlocks(lines: Line[]): Official[] {
  const starts: number[] = []
  for (let i = 1; i + 2 < lines.length; i++) if (isTypeLine(lines[i].text.trim()) && /^AC \d/.test(lines[i + 1].text.trim())) starts.push(i - 1)
  const isHeading = (text: string) => /^[A-Z][^.,:;()]*$/.test(text) && text.split(" ").every((word) => /^[A-Z]/.test(word) || word === "of")
  const blocks: Official[] = []
  let section = ""
  let group: string | undefined
  for (const [n, start] of starts.entries()) {
    const titles: string[] = []
    for (let i = start - 1; i >= 0 && isHeading(lines[i].text.trim()); i--) titles.unshift(lines[i].text.trim())
    for (const title of titles) {
      if (title === "Monsters A–Z" || title === "Animals") {
        section = title
        group = undefined
      } else group = title
    }
    let end = n + 1 < starts.length ? starts[n + 1] : lines.length
    while (isHeading(lines[end - 1].text.trim()) && end - 1 > start) end--
    const block = lines.slice(start, end)
    const name = block[0].text.trim()
    blocks.push({ ...parseBlock(block), name, page: block[0].page, section, ...(group && group !== name ? { group } : {}) })
  }
  return blocks
}

function parseBlock(block: Line[]): Omit<Official, "name" | "page" | "section" | "group"> {
  const fields = new Map<string, string>()
  const abilityTokens: string[] = []
  let i = 2
  let field = ""
  for (; i < block.length; i++) {
    const text = block[i].text.trim()
    if (text in sectionWords) break
    const key = statLine.exec(text)?.[1]
    if (text === "MOD SAVE" || /^(Str|Dex|Con|Int|Wis|Cha)\b/.test(text)) field = "abilities"
    else if (key) {
      field = key
      fields.set(key, text.slice(key.length).trim())
      continue
    }
    if (field === "abilities") {
      if (text !== "MOD SAVE") abilityTokens.push(...text.split(/\s+/))
    } else if (field) fields.set(field, `${fields.get(field)} ${text}`.trim())
    if (field === "CR") {
      i++
      break
    }
  }
  if (fields.has("CR")) {
    // The CR line may be the last line of the header; anything after it starts a section.
    while (i < block.length && !(block[i].text.trim() in sectionWords)) i++
  }
  const features = new Map<string, OfficialFeature[]>()
  let section = ""
  let current: OfficialFeature | undefined
  let previous = ""
  let legendaryIntro: string[] | undefined
  const featureStart = /^([A-Z][\p{L}’-]*(?: (?:[A-Z][\p{L}’-]*|of|the|and|or|to|in|with|a|an|from|on|by|for|at)){0,6})(?:\. | \()/u
  for (; i < block.length; i++) {
    const raw = block[i].text
    const text = raw.trim()
    if (text in sectionWords) {
      section = sectionWords[text]
      features.set(section, [])
      current = undefined
      previous = text
      if (section === "legendary") legendaryIntro = []
      continue
    }
    const start = featureStart.exec(text)
    // After a spell list, whose lines end without a period, a feature is a whole "Name. " or "Name (…). " opening.
    const inList = current?.lines.some((line) => /^(At Will|\d+\/Day( Each)?):/.test(line.trim())) && /^[^(]+(?: \([^)]*\))?\. /.test(text)
    if (start && (/[.:)]$/.test(previous) || previous in sectionWords || inList)) {
      const list = features.get(section) as OfficialFeature[]
      // An item of a list the previous feature introduces with a colon ("These weaknesses:") belongs to that feature.
      const parent = list.at(-1)
      current = { name: start[1], lines: [raw], subItems: [], breaks: [] }
      if (parent && isListItem(parent, start[1])) {
        parent.subItems.push(start[1])
        parent.breaks.push(parent.lines.length)
        parent.lines.push(raw)
        current = parent
      } else list.push(current)
    } else if (current) current.lines.push(raw)
    else if (legendaryIntro && section === "legendary") legendaryIntro.push(raw)
    previous = text
  }
  return {
    header: block[1].text.trim(),
    fields,
    abilityTokens,
    features,
    ...(legendaryIntro ? { legendaryIntro: soft(legendaryIntro) } : {}),
  }
}

/** The official lists inside a feature are the vampire's weaknesses and the sphinx's roars. Anything else is its own feature. */
function isListItem(parent: OfficialFeature, name: string) {
  const intro = soft(parent.lines)
  if (/has these weaknesses:/.test(intro)) return true
  return /as detailed below/.test(intro) && /^(First|Second|Third) Roar$/.test(name)
}

/**
 * The parenthetical and the body of an official feature, as paragraphs. A paragraph starts at a tab-led line, at a
 * list item the feature introduces, at a spell list line, and at a numbered result such as "1–4.".
 */
function featureParts(feature: OfficialFeature) {
  const groups: string[][] = []
  for (const [k, raw] of feature.lines.entries()) {
    const starts = k === 0 || raw.startsWith("\t") || feature.breaks.includes(k) || /^\s*(At Will|\d+\/Day( Each)?): /.test(raw) || /^\s*\d+–\d+\. /.test(raw)
    if (starts) groups.push([raw])
    else groups[groups.length - 1].push(raw)
  }
  const paragraphs = groups.map(soft)
  const first = paragraphs[0]
  const rest = first.slice(feature.name.length)
  const paren = rest.startsWith(" (") ? rest.slice(2, rest.indexOf(")")) : undefined
  paragraphs[0] = first.slice(first.indexOf(". ", feature.name.length) + 2)
  return { paren, paragraphs, body: paragraphs.join("\n") }
}

/** The official XP and PB tables of the Monsters chapter, page 256, and Hit Dice by Size, page 255. */
function rulesTables() {
  const text = pages[255].split("\n").map((line) => line.trim())
  const xpStart = text.indexOf("Experience Points by Challenge Rating")
  const pbStart = text.indexOf("Proficiency Bonus by Challenge Rating")
  const xpCells = text.slice(xpStart + 1, text.indexOf("Proficiency Bonus", xpStart + 1)).filter((cell) => cell && cell !== "CR" && cell !== "XP")
  const xp = new Map<number, number[]>()
  for (let k = 0; k < xpCells.length; k += 2)
    xp.set(
      crValue(xpCells[k]),
      xpCells[k + 1].split(" or ").map((value) => Number(value.replace(/,/g, "")))
    )
  const pbCells = text.slice(pbStart + 1, text.indexOf("Traits", pbStart)).filter((cell) => cell && cell !== "CR" && cell !== "PB")
  const pb: { min: number; max: number; pb: number }[] = []
  for (let k = 0; k < pbCells.length; k += 2) {
    const [min, max] = pbCells[k].split("–").map(Number)
    pb.push({ min, max, pb: num(pbCells[k + 1]) })
  }
  const dieText = pages[254].split("\n").map((line) => line.trim())
  const dieStart = dieText.indexOf("Average HP per Die")
  const hitDie: { size: string; die: number; average: number }[] = []
  for (let k = dieStart + 1; sizeWords.includes(dieText[k]); k += 3) hitDie.push({ size: dieText[k], die: Number(dieText[k + 1].slice(1)), average: Number(dieText[k + 2].replace("½", ".5")) })
  return { xp, pb, hitDie }
}

/** Items of a list printed with commas, keeping parentheses whole. */
function items(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let item = ""
  for (const char of text) {
    depth += char === "(" ? 1 : char === ")" ? -1 : 0
    if (char === "," && !depth) {
      out.push(item.trim())
      item = ""
    } else item += char
  }
  out.push(item.trim())
  return out.filter(Boolean)
}

/** What the official header says, in the data's shape. */
function expectedHeader(official: Official) {
  const f = official.fields
  const header = /^(.+?) (?:Swarm of (\w+) )?(\w+)(?: \((.+)\))?, (.+)$/.exec(official.header) as RegExpExecArray
  const speedItems = items(f.get("Speed") ?? "")
  const speed: Record<string, number | true> = {}
  const variants: { speed: Record<string, number>; note: string }[] = []
  for (const item of speedItems) {
    const m = /^(?:([A-Z][a-z]+(?: or [A-Z][a-z]+)?) )?(\d+) ft\.(?: \((.+)\))?$/.exec(item)
    if (!m) throw new Error(`${official.name}: speed item ${item}`)
    const modes = (m[1] ?? "Walk").toLowerCase().split(" or ")
    const note = m[3] && m[3] !== "hover" ? flat(m[3]) : undefined
    if (m[3] === "hover") speed.hover = true
    if (!note) speed[modes[0]] = Number(m[2])
    else if (modes.length > 1) for (const mode of modes) variants.push({ speed: { [mode]: Number(m[2]) }, note })
    else {
      const existing = variants.find((variant) => variant.note === note)
      if (existing) existing.speed[modes[0]] = Number(m[2])
      else variants.push({ speed: { [modes[0]]: Number(m[2]) }, note })
    }
  }
  const tokens = official.abilityTokens
  const abilities: Record<string, { score: number; mod: number; save: number }> = {}
  for (let k = 0; k < tokens.length; k += 4) abilities[abilityWords[tokens[k]]] = { score: Number(tokens[k + 1]), mod: num(tokens[k + 2]), save: num(tokens[k + 3]) }
  const skills = f.has("Skills") ? Object.fromEntries(items(f.get("Skills") as string).map((item) => [toId(item.replace(/ [+−]\d+$/, "")), num(item.split(" ").at(-1) as string)])) : undefined
  // A defense printed with a qualifier goes to conditionalDefenses with its qualifying words, never to a plain list.
  const conditional: { kind: string; value?: string; qualifier: string }[] = []
  const damageList = (key: string, kind: string) => {
    if (!f.has(key)) return undefined
    const list: string[] = []
    for (const item of items(f.get(key) as string)) {
      if (damageWords.includes(item)) list.push(item.toLowerCase())
      else {
        const lead = /^(\w+) damage (.+)$/.exec(item)
        if (lead && damageWords.includes(lead[1])) conditional.push({ kind, value: lead[1].toLowerCase(), qualifier: lead[2] })
        else conditional.push({ kind, qualifier: item })
      }
    }
    return list.length ? list : undefined
  }
  const vulnerabilities = damageList("Vulnerabilities", "vulnerability")
  const resistances = damageList("Resistances", "resistance")
  let immunities: string[] | undefined
  let conditionImmunities: string[] | undefined
  if (f.has("Immunities")) {
    for (const part of (f.get("Immunities") as string).split("; ")) {
      const list = items(part)
      if (list.every((item) => damageWords.includes(item))) immunities = list.map((item) => item.toLowerCase())
      else {
        const plain: string[] = []
        for (const item of list) {
          const m = /^(\w+)(?: \((.+)\))?$/.exec(item)
          if (!m || !conditionWords.includes(m[1])) throw new Error(`${official.name}: immunity ${item}`)
          if (m[2]) conditional.push({ kind: "condition-immunity", value: m[1].toLowerCase(), qualifier: m[2] })
          else plain.push(m[1].toLowerCase())
        }
        if (plain.length) conditionImmunities = plain
      }
    }
  }
  const gear = f.has("Gear")
    ? items(f.get("Gear") as string).map((item) => {
        const m = /^(.+?)(?: \((\d+)\))?$/.exec(item) as RegExpExecArray
        return m[2] ? { name: m[1], quantity: Number(m[2]) } : { name: m[1] }
      })
    : undefined
  const [senseList, passive] = (f.get("Senses") as string).split(/;\s*/)
  const senses: Record<string, number | string> = {}
  for (const item of passive ? items(senseList) : []) {
    const m = /^(\w+) (\d+) ft\.(?: \((.+)\))?$/.exec(item) as RegExpExecArray
    senses[m[1].toLowerCase()] = Number(m[2])
    if (m[3]) senses[`${m[1].toLowerCase()}Note`] = m[3]
  }
  senses.passivePerception = Number(/Passive Perception (\d+)/.exec(passive ?? senseList)?.[1])
  const [languages, telepathy] = (f.get("Languages") as string).split(/; telepathy /)
  const tele = telepathy ? (/^(\d+) ft\.(?: \((.+)\))?$/.exec(telepathy) as RegExpExecArray) : undefined
  const crLine = /^(\d+(?:\/\d+)?) \((?:XP ([\d,]+)(?:, or ([\d,]+) in lair)?|([\d,]+) XP); PB \+(\d+)\)$/.exec(f.get("CR") as string)
  if (!crLine) throw new Error(`${official.name}: CR line ${f.get("CR")}`)
  const hp = /^(\d+) \((\d+d\d+(?: [+−] \d+)?)\)$/.exec(f.get("HP") as string) as RegExpExecArray
  const initiative = /^([+−]\d+) \((\d+)\)$/.exec(f.get("Initiative") as string) as RegExpExecArray
  const sizes = header[1].split(" or ")
  return {
    size: sizes,
    type: toId(header[3]).replace(/s$/, ""),
    swarmOf: header[2],
    tags: header[4]?.split(", ").map(toId),
    alignment: header[5],
    ac: Number(f.get("AC")),
    initiative: { modifier: num(initiative[1]), score: Number(initiative[2]) },
    hp: { average: Number(hp[1]), formula: hp[2].replace("−", "-") },
    speed,
    speedVariants: variants.length ? variants : undefined,
    abilities,
    skills,
    vulnerabilities,
    resistances,
    immunities,
    conditionImmunities,
    conditionalDefenses: conditional.length ? conditional : undefined,
    gear,
    senses,
    languages: flat(languages),
    telepathy: tele ? Number(tele[1]) : undefined,
    telepathyNote: tele?.[2] ? flat(tele[2]) : undefined,
    cr: crValue(crLine[1]),
    xp: Number((crLine[2] ?? crLine[4]).replace(/,/g, "")),
    xpInLair: crLine[3] ? Number(crLine[3].replace(/,/g, "")) : undefined,
    pb: Number(crLine[5]),
  }
}

// The check below does not parse feature mechanics the way the builder does. It renders each typed value back into
// the words the SRD prints and finds them in the official text, in order. It counts printed labels, saves, damage
// rolls and condition names by plain string counts. Where the reading depends on meaning (what a damage roll or a
// condition is linked to, and which named conditions are not given), it uses tables kept by hand at the end of this
// file, written by reading each feature.

const abilityName: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" }
const capitalize = (word: string) => word[0].toUpperCase() + word.slice(1)
const quote = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
const occurrences = (text: string, needle: string) => text.split(needle).length - 1

/** Find each pattern in order; the index after the last, or -1 with the first that is missing. */
function inOrder(text: string, patterns: RegExp[]): { missing?: number } {
  let from = 0
  for (const [k, pattern] of patterns.entries()) {
    const sticky = new RegExp(pattern.source, "g")
    sticky.lastIndex = from
    const found = sticky.exec(text)
    if (!found) return { missing: k }
    from = found.index + found[0].length
  }
  return {}
}

/** A damage part as the SRD prints it: "12 (2d6 + 5) Bludgeoning damage", "1 Slashing damage", "28 (8d6) damage". */
function printedDamage(part: { dice?: string; average?: number; amount?: number; type?: string }) {
  const roll = part.dice ? `${part.average} \\(${quote(part.dice).replace(" - ", " [−–-] ")}\\)` : `${part.amount}`
  return new RegExp(`${roll} ${part.type ? `${capitalize(part.type)} ` : ""}damage`)
}

/** How many damage rolls the text prints: each "damage" right after a roll in parentheses, or after a number and a type. */
function damageCount(body: string) {
  let n = 0
  for (const chunk of body.split(" damage").slice(0, -1)) {
    const words = chunk.split(" ")
    const last = words[words.length - 1]
    const before = words[words.length - 2] ?? ""
    if (last.endsWith(")") || (damageWords.includes(last) && (before.endsWith(")") || /^\d+$/.test(before)))) n++
  }
  return n
}

/** The outcome labels of a text by kind, counted as plain strings. A staged plain "Failure:" counts as a failure. */
function labelCounts(text: string): Record<string, number> {
  const first = occurrences(text, "First Failure: ")
  const second = occurrences(text, "Second Failure: ")
  return {
    hit: occurrences(text, "Hit: "),
    "hit-or-miss": occurrences(text, "Hit or Miss: "),
    failure: occurrences(text, "Failure: ") - first - second,
    "first-failure": first,
    "second-failure": second,
    "subsequent-failures": occurrences(text, "Subsequent Failures: "),
    "failure-by-margin": occurrences(text, " or More: "),
    success: occurrences(text, "Success: ") - occurrences(text, "Failure or Success: "),
    "failure-or-success": occurrences(text, "Failure or Success: "),
  }
}

/** Every index of `needle` in `text`. */
function indexes(text: string, needle: string): number[] {
  const out: number[] = []
  for (let at = text.indexOf(needle); at >= 0; at = text.indexOf(needle, at + 1)) out.push(at)
  return out
}

/**
 * Each condition the text names, with where: "the Blinded and Restrained conditions" (read backward from the word
 * "condition" through the names to "the"), "1 Exhaustion level", "exiting Prone". In text order.
 */
function conditionMentions(body: string): { name: string; at: number }[] {
  const found: { name: string; at: number }[] = []
  for (const at of indexes(body, " condition")) {
    const words = body
      .slice(Math.max(0, at - 120), at)
      .replace(/,/g, " , ")
      .split(/\s+/)
      .filter(Boolean)
    const names: string[] = []
    let j = words.length - 1
    while (j >= 0 && (conditionWords.includes(words[j]) || ["and", "or", ","].includes(words[j]))) {
      if (conditionWords.includes(words[j])) names.unshift(words[j].toLowerCase())
      j--
    }
    if (names.length && words[j] === "the") for (const name of names) found.push({ name, at })
  }
  for (const at of indexes(body, " Exhaustion level")) if (/\d$/.test(body.slice(0, at))) found.push({ name: "exhaustion", at })
  for (const at of indexes(body, "exiting Prone")) found.push({ name: "prone", at })
  for (const at of indexes(body, "to exit Prone")) found.push({ name: "prone", at })
  return found.sort((a, b) => a.at - b.at)
}

/** A spell as printed in the text: from its id, with its note. */
function printedSpell(spell: { id: string; note?: string }) {
  return squash(`${spell.id.replace(/-/g, " ")}${spell.note ? ` (${spell.note})` : ""}`)
}

/**
 * A link written as the hand tables write it: the outcome and save ("failure@2", "-" for none), then each printed
 * span: "L:" the label, "W:" the gate, "U:" the exception, "T:" the time; then "altN" for a roll that replaces roll N,
 * "instead" for a condition given instead of the hit's damage, and "self" for a value on the monster itself.
 */
function linkString(link: { on?: string; save?: number; label?: string; appliesWhen?: string; unless?: string; timing?: string; alternativeTo?: number; insteadOfDamage?: true; self?: true }) {
  let text = link.on ?? "-"
  if (link.save !== undefined) text += `@${link.save}`
  if (link.label) text += `|L:${link.label}`
  if (link.appliesWhen) text += `|W:${link.appliesWhen}`
  if (link.unless) text += `|U:${link.unless}`
  if (link.timing) text += `|T:${link.timing}`
  if (link.alternativeTo !== undefined) text += `|alt${link.alternativeTo}`
  if (link.insteadOfDamage) text += "|instead"
  if (link.self) text += "|self"
  return text
}

/** A save's own spans, written as the hand tables write them: "L:First Roar", "W:If the target is a Humanoid", "-". */
const saveString = (save: { label?: string; appliesWhen?: string; oncePerTurn?: string; alsoSelf?: { appliesWhen: string } }) =>
  [save.label && `L:${save.label}`, save.appliesWhen && `W:${save.appliesWhen}`, save.oncePerTurn && `O:${save.oncePerTurn}`, save.alsoSelf && `S:${save.alsoSelf.appliesWhen}`]
    .filter(Boolean)
    .join("|") || "-"

/**
 * The plain link of a feature, or undefined when the feature needs a row in `links`. A feature is plain when it is
 * one paragraph with one "Hit:" or one save's "Failure:", no other outcome but that save's "Success:" or "Failure or
 * Success:", no "if", "unless", "otherwise" or either-or roll after the label, and every damage roll and condition it
 * gives stated after the label and before the next sentence.
 */
function plainLink(body: string, paragraphs: number, saves: number, mentions: number[]): { on: string; save?: number } | undefined {
  const counts = labelCounts(body)
  const kinds = Object.entries(counts).filter(([, n]) => n > 0)
  const primary = kinds.filter(([kind]) => kind === "hit" || kind === "failure")
  if (paragraphs !== 1 || saves > 1 || primary.length !== 1 || primary[0][1] !== 1) return undefined
  if (kinds.some(([kind]) => !["hit", "failure", "success", "failure-or-success"].includes(kind))) return undefined
  const kind = primary[0][0]
  const label = body.indexOf(kind === "hit" ? "Hit: " : "Failure: ")
  const end = ["Success: ", "Failure or Success: "].map((next) => body.indexOf(next, label)).filter((at) => at > 0)
  const clause = body.slice(label, end.length ? Math.min(...end) : body.length)
  if (/ if | unless |otherwise|, or |—or |If |Unless /.test(clause)) return undefined
  const last = Math.max(...mentions)
  if (mentions.some((at) => at < label) || /\. [A-Z]/.test(body.slice(label, last))) return undefined
  return kind === "hit" ? { on: "hit" } : { on: "failure", save: 0 }
}

export default function verify(report: Report) {
  const monsters = readData<Monster>("monsters")
  const byName = new Map(monsters.map((monster) => [monster.name, monster]))
  const lines = chapterLines()
  const blocks = officialBlocks(lines)
  const crLines = lines.filter((line) => /^CR (\d+|1\/[248]) \((XP [\d,]+|[\d,]+ XP)/.test(line.text.trim())).length
  const tables = rulesTables()
  // Monsters whose header or features differ from the official text, so a difference from Open5e is not settled.
  const unsettled = new Set<string>()

  // ---- Coverage ----
  {
    const failures: string[] = []
    const names = blocks.map((block) => block.name)
    for (const name of names) if (!byName.has(name)) failures.push(`official stat block "${name}" is missing from the data`)
    for (const monster of monsters) if (!names.includes(monster.name)) failures.push(`data "${monster.name}" is not an official stat block`)
    if (new Set(names).size !== names.length) failures.push("the official text has two stat blocks with one name")
    if (crLines !== blocks.length) failures.push(`the official text has ${crLines} CR lines but ${blocks.length} stat blocks were found`)
    for (const monster of monsters) if (monster.id !== toId(monster.name)) failures.push(`${monster.name}: id ${monster.id} is not toId(name)`)
    report.check("monsters", `names match the official stat blocks, ${blocks.length} official, ${crLines} official CR lines`, blocks.length + monsters.length + 1, failures)
  }

  // ---- Header fields ----
  {
    const failures: string[] = []
    let total = 0
    const keys = [
      "page",
      "section",
      "group",
      "size",
      "type",
      "swarmOf",
      "tags",
      "alignment",
      "ac",
      "initiative",
      "hp",
      "speed",
      "speedVariants",
      "skills",
      "vulnerabilities",
      "resistances",
      "immunities",
      "conditionImmunities",
      "conditionalDefenses",
      "senses",
      "languages",
      "telepathy",
      "telepathyNote",
      "cr",
      "xp",
      "xpInLair",
      "pb",
    ] as const
    for (const block of blocks) {
      const monster = byName.get(block.name)
      if (!monster) continue
      let expected: ReturnType<typeof expectedHeader>
      try {
        expected = expectedHeader(block)
      } catch (error) {
        failures.push(String(error))
        continue
      }
      const actual: Record<string, unknown> = monster
      const want: Record<string, unknown> = { ...expected, page: block.page, section: block.section, group: block.group }
      for (const key of keys) {
        total++
        if (!same(actual[key], want[key])) {
          failures.push(`${monster.id}: ${key} is ${JSON.stringify(actual[key])}, official ${JSON.stringify(want[key])}`)
          unsettled.add(monster.id)
        }
      }
      for (const ability of ["str", "dex", "con", "int", "wis", "cha"] as const) {
        for (const part of ["score", "mod", "save"] as const) {
          total++
          if (monster.abilities[ability][part] !== expected.abilities[ability]?.[part]) unsettled.add(monster.id)
          if (monster.abilities[ability][part] !== expected.abilities[ability]?.[part])
            failures.push(`${monster.id}: ${ability} ${part} is ${monster.abilities[ability][part]}, official ${expected.abilities[ability]?.[part]}`)
        }
      }
      total++
      const gear = (monster.gear ?? []).map((item) => ({ id: item.id, quantity: item.quantity }))
      const officialGear = (expected.gear ?? []).map((item) => ({ id: toId(item.quantity ? item.name.replace(/s$/, "") : item.name), quantity: item.quantity }))
      if (!same(gear, officialGear)) failures.push(`${monster.id}: gear ${JSON.stringify(gear)}, official ${JSON.stringify(expected.gear)}`)
    }
    const waived: string[] = []
    const real = failures.filter((failure) => {
      const misprint = misprints.find((entry) => failure === entry.match)
      if (misprint) waived.push(`${failure}: misprint on page ${misprint.page}, ${misprint.reason}`)
      return !misprint
    })
    for (const misprint of misprints) if (!failures.includes(misprint.match)) real.push(`misprint waiver "${misprint.match}" matches nothing. Remove it.`)
    report.check("monsters", "header fields and all 18 ability numbers equal each official stat block", total, real, waived)
  }

  // ---- Features ----
  {
    const failures: string[] = []
    let total = 0
    let nextTurnInData = 0
    const labelsInText: Record<string, number> = {}
    const labelsInData: Record<string, number> = {}
    const usedNotGiven = new Set<string>()
    const usedLinks = new Set<string>()
    const usedProse = new Set<string>()
    const usedByHand = new Set<string>()
    let oncePerTurnCount = 0
    let prose = 0
    const proseFailures: string[] = []
    for (const block of blocks) {
      const monster = byName.get(block.name)
      if (!monster) continue
      const sections: [string, MonsterFeature[] | undefined][] = [
        ["traits", monster.traits],
        ["actions", monster.actions],
        ["bonusActions", monster.bonusActions],
        ["reactions", monster.reactions],
        ["legendary", monster.legendaryActions?.actions],
      ]
      for (const [section, data] of sections) {
        const official = block.features.get(section) ?? []
        total++
        const names = official.map((feature) => feature.name)
        const dataNames = (data ?? []).map((feature) => feature.name)
        if (!same(names, dataNames)) {
          failures.push(`${monster.id}: ${section} are ${JSON.stringify(dataNames)}, official ${JSON.stringify(names)}`)
          continue
        }
        for (const [k, feature] of official.entries()) {
          const item = (data as MonsterFeature[])[k]
          const own = `${monster.id} ${section} ${item.name}`
          const want = featureParts(feature)
          total += 2
          // The whole text, ignoring layout, then paragraph by paragraph, then each sentence against the official text.
          if (squash(item.text) !== squash(want.body)) failures.push(`${own}: text differs from the official feature`)
          const paragraphs = item.text.split("\n").map(squash)
          if (!same(paragraphs, want.paragraphs.map(squash))) failures.push(`${own}: ${paragraphs.length} paragraphs, official ${want.paragraphs.length}, or their breaks differ`)
          prose++
          const missing = missingSentences(item.text)
          if (missing.length) proseFailures.push(`${own}: ${missing.join(" | ")}`)
          const { paren, body } = want

          // Uses: the parenthetical rendered back from the data, and the "next turn" sentence both ways.
          total += 2
          const usesPrint = [
            item.uses?.recharge === "long-rest" ? `${item.uses.count}/Day${item.uses.countInLair ? `, or ${item.uses.countInLair}/Day in Lair` : ""}` : undefined,
            item.uses?.recharge === "short-or-long-rest" && item.uses.count === 1 ? "Recharge after a Short or Long Rest" : undefined,
            item.rechargeRoll ? `Recharge ${item.rechargeRoll.min}${item.rechargeRoll.max === item.rechargeRoll.min ? "" : `–${item.rechargeRoll.max}`}` : undefined,
            item.note,
          ].filter(Boolean)
          if ((usesPrint.length ? usesPrint.join("; ") : undefined) !== paren) failures.push(`${own}: uses print as (${usesPrint.join("; ")}), official (${paren})`)
          const nextTurn = body.includes("can’t take this action again until the start of its next turn")
          if (nextTurn !== (item.uses?.recharge === "start-of-next-turn" && item.uses.count === 1)) failures.push(`${own}: uses ${JSON.stringify(item.uses)} disagree with the "next turn" sentence`)
          if (item.uses?.recharge === "start-of-next-turn") nextTurnInData++

          // Attack: rendered back and found, and present exactly when the text prints an attack roll.
          total++
          const a = item.attack
          if (a) {
            const where = [a.reach !== undefined ? `reach ${a.reach} (?:ft\\.?|feet)` : "", a.range ? `range ${a.range.normal}${a.range.long ? `/${a.range.long}` : ""} (?:ft\\.?|feet)` : ""]
              .filter(Boolean)
              .join(" or ")
            const printed = `${a.kind === "melee-or-ranged" ? "Melee or Ranged" : capitalize(a.kind)} Attack Roll: ${a.bonus < 0 ? "−" : "\\+"}${Math.abs(a.bonus)}(?: to hit)?${a.bonusNote ? ` \\(${quote(a.bonusNote)}\\)` : ""}, ${where}\\.? (?:Hit|Miss|Hit or Miss):`
            if (!new RegExp(printed).test(body)) failures.push(`${own}: attack ${JSON.stringify(a)} is not printed`)
          }
          if (occurrences(body, "Attack Roll: ") !== (a ? 1 : 0)) failures.push(`${own}: ${occurrences(body, "Attack Roll: ")} attack rolls printed, ${a ? 1 : 0} typed`)

          // Damage: every part rendered back and found in order, and as many parts as the text prints rolls.
          total += 2
          const damage = item.damage ?? []
          const order = inOrder(body, damage.map(printedDamage))
          if (order.missing !== undefined) failures.push(`${own}: damage part ${order.missing} ${JSON.stringify(damage[order.missing])} is not printed in that order`)
          if (damageCount(body) !== damage.length) failures.push(`${own}: ${damage.length} damage parts, the text prints ${damageCount(body)}`)

          // Saves: each rendered back in order, as many as printed, targets right after the DC, outcomes by label.
          total += 3
          const saves = item.saves ?? []
          const saveOrder = inOrder(
            body,
            saves.map((save) => new RegExp(`${abilityName[save.ability]} Saving Throw: DC ${save.dc}\\b`))
          )
          if (saveOrder.missing !== undefined || occurrences(body, "Saving Throw: DC") !== saves.length)
            failures.push(`${own}: saves ${JSON.stringify(saves.map((save) => [save.ability, save.dc]))} are not the printed saves`)
          if (body.includes("must make this save") !== saves.some((save) => save.alsoSelf)) failures.push(`${own}: the monster's own save is typed in only one of text and data`)
          const dataLabels: Record<string, number> = {}
          const bump = (kind: string) => {
            dataLabels[kind] = (dataLabels[kind] ?? 0) + 1
          }
          for (const save of saves) {
            const dcAt = body.indexOf(`${abilityName[save.ability]} Saving Throw: DC ${save.dc}`)
            const dcEnd = dcAt + `${abilityName[save.ability]} Saving Throw: DC ${save.dc}`.length
            // How often a creature makes the save, as the parenthetical after the DC says it.
            const parenthetical = body.startsWith(" (", dcEnd) ? body.slice(dcEnd + 2, body.indexOf(")", dcEnd)) : ""
            const printedOnce = parenthetical.includes("once per turn") ? "any-turn" : parenthetical.includes("once on each of its turns") ? "own-turn" : undefined
            if (printedOnce !== save.oncePerTurn) failures.push(`${own}: save oncePerTurn ${save.oncePerTurn}, the text prints "${parenthetical}"`)
            if (printedOnce) oncePerTurnCount++
            let after = body.slice(dcAt).replace(/^[^,.(]*/, "")
            if (after.startsWith("(")) after = after.slice(after.indexOf(")") + 1)
            const printedTargets = after.startsWith(",") ? after.slice(1) : undefined
            if (!!printedTargets !== !!save.targets || (save.targets && !squash(printedTargets as string).startsWith(squash(save.targets))))
              failures.push(`${own}: save targets "${save.targets}" are not what follows the DC`)
            const staged = !!(save.secondFailure || save.subsequentFailures)
            const clauses: [string, string | undefined, string[]][] = [
              ["failure", save.failure, ["Failure"]],
              [staged && !body.includes("First Failure: ") ? "failure" : "first-failure", save.firstFailure, ["First Failure", "Failure"]],
              ["second-failure", save.secondFailure, ["Second Failure"]],
              ["subsequent-failures", save.subsequentFailures, ["Subsequent Failures"]],
              ["failure-by-margin", save.failureBy?.text, [`Failure by ${save.failureBy?.margin} or More`]],
              ["success", save.success, ["Success"]],
              ["failure-or-success", save.failureOrSuccess, ["Failure or Success"]],
            ]
            for (const [kind, clause, labels] of clauses) {
              if (!clause) continue
              bump(kind)
              // The clause is the whole run after its label: it ends the text, a paragraph, or meets the next label.
              const whole = labels.some((label) => {
                const at = item.text.indexOf(`${label}: ${clause}`)
                const next = at < 0 ? "" : item.text.slice(at + label.length + 2 + clause.length)
                return at >= 0 && (next === "" || /^(?:\n| (?:Failure|Success|First Failure|Second Failure|Subsequent Failures)\b)/.test(next))
              })
              if (!whole) failures.push(`${own}: "${clause.slice(0, 40)}" is not the whole text after its label`)
            }
            if (!!save.halfOnSuccess !== squash(save.success ?? "").startsWith("halfdamage")) failures.push(`${own}: halfOnSuccess disagrees with the Success text`)
          }
          if (a) bump("hit")
          const textLabels = labelCounts(body)
          for (const kind of Object.keys(textLabels)) {
            if (kind === "hit-or-miss") continue
            labelsInText[kind] = (labelsInText[kind] ?? 0) + textLabels[kind]
            labelsInData[kind] = (labelsInData[kind] ?? 0) + (dataLabels[kind] ?? 0)
            if (textLabels[kind] !== (dataLabels[kind] ?? 0)) failures.push(`${own}: ${dataLabels[kind] ?? 0} typed ${kind} outcomes, the text prints ${textLabels[kind]}`)
          }

          // Conditions: every named condition is given, unless the hand table says the text only names it.
          total++
          const key = `${monster.id}/${item.name}`
          const mentions = conditionMentions(body)
          const notGiven = [...(namedNotGiven[key] ?? [])]
          if (namedNotGiven[key]) usedNotGiven.add(key)
          const given = mentions.filter((mention) => {
            const k = notGiven.indexOf(mention.name)
            if (k < 0) return true
            notGiven.splice(k, 1)
            return false
          })
          if (notGiven.length) failures.push(`${own}: the table says ${notGiven} are named but not given, and the text has no such mention`)
          const dataConditions = [...new Set((item.conditions ?? []).map((entry) => entry.condition))].sort()
          const wantConditions = [...new Set(given.map((mention) => mention.name))].sort()
          if (!same(dataConditions, wantConditions)) failures.push(`${own}: conditions ${JSON.stringify(dataConditions)}, the text gives ${JSON.stringify(wantConditions)}`)

          // Links: plain features are linked to their one label. Every other feature has a row in the hand table.
          total++
          const positions = [...damage.map((part) => body.search(printedDamage(part))), ...given.map((mention) => mention.at)]
          const plain = positions.length ? plainLink(body, want.paragraphs.length, saves.length, positions) : undefined
          const gotLinks = {
            s: saves.some((save) => save.label || save.appliesWhen || save.oncePerTurn || save.alsoSelf) ? saves.map(saveString) : [],
            d: damage.map(linkString),
            c: (item.conditions ?? []).map((entry) => `${entry.condition}=${linkString(entry)}`),
          }
          // Every printed span is one unbroken run of the feature's own words.
          const flat = item.text.replace(/\n/g, " ")
          for (const span of [
            item.spellcasting?.appliesWhen,
            ...[...saves, ...damage, ...(item.conditions ?? [])].flatMap((link) => [
              link.label,
              link.appliesWhen,
              "alsoSelf" in link ? link.alsoSelf?.appliesWhen : undefined,
              "unless" in link ? link.unless : undefined,
              "timing" in link ? link.timing : undefined,
            ]),
          ])
            if (span && !flat.includes(span)) failures.push(`${own}: "${span}" is not a span of the feature's text`)
          // An exception stands only on words that make one.
          if ([...damage, ...(item.conditions ?? [])].some((link) => link.unless) && !/therwise|unless|instead/.test(flat))
            failures.push(`${own}: an unless with no "otherwise", "unless" or "instead" in the text`)
          const row = links[key]
          if (row) usedLinks.add(key)
          const needsRow = (positions.length && !plain) || gotLinks.s.length > 0
          if (needsRow && !row) failures.push(`${own}: needs a links row: "${key}": ${JSON.stringify(gotLinks)},`)
          else if (row && !needsRow) failures.push(`${own}: is plain, so it needs no links row`)
          else if (row && !same({ s: row.s ?? [], d: row.d ?? [], c: row.c ?? [] }, gotLinks)) failures.push(`${own}: links ${JSON.stringify(gotLinks)}, the table reads ${JSON.stringify(row)}`)
          else if (plain && !row) {
            const want = linkString(plain)
            if (gotLinks.d.some((link) => link !== want) || gotLinks.c.some((link) => link.split("=")[1] !== want))
              failures.push(`${own}: links ${JSON.stringify(gotLinks)}, the plain link is ${want}`)
          }

          // Escape DC and area: rendered back and found, and present exactly when printed.
          total += 2
          if ((item.escapeDc !== undefined) !== body.includes("escape DC") || (item.escapeDc !== undefined && !body.includes(`escape DC ${item.escapeDc}`)))
            failures.push(`${own}: escape DC ${item.escapeDc} is not the printed one`)
          const ar = item.area
          const shapeWord = ar && capitalize(ar.shape)
          const areaPrint = ar
            ? ar.shape === "line"
              ? `${ar.size}-?foot-long, ${ar.width}-foot-?wide Line`
              : ar.shape === "cylinder"
                ? `${ar.size}-?foot-?radius, ${ar.height}-foot-?high Cylinder`
                : `${ar.size}-?foot${ar.shape === "sphere" ? "-?radius" : ""} ${shapeWord}`
            : ""
          const anyArea = /(?:in an?|fills a) \d+-?foot[-\w]*,?(?: \d+-?foot[-\w]*)? (?:Cone|Cube|Cylinder|Emanation|Line|Sphere)\b/.exec(body)
          // A chosen area: "each creature of the azer’s choice in a 5-foot Emanation".
          if (anyArea && !!ar?.selective !== /choice $/.test(body.slice(0, anyArea.index))) failures.push(`${own}: area selective is ${!!ar?.selective}, the text says otherwise`)
          if (!!ar !== !!anyArea || (ar && !new RegExp(`^(?:in an?|fills a) ${areaPrint}`).test(body.slice(anyArea?.index))))
            failures.push(`${own}: area ${JSON.stringify(ar)} is not the first printed area of effect`)

          // Spells: lists rendered back against their paragraphs, casts rendered back against the sentence.
          total++
          const casting = item.spellcasting
          const byHand = castingByHand[key]
          if (byHand) usedByHand.add(key)
          if (byHand && !same(casting, byHand)) failures.push(`${own}: spellcasting ${JSON.stringify(casting)}, the hand table reads ${JSON.stringify(byHand)}`)
          const listParagraphs = byHand ? [] : want.paragraphs.filter((paragraph) => /^(At Will|\d\/Day)/.test(paragraph))
          const renderedLists = (byHand ? [] : (casting?.lists ?? [])).map(
            (list) => squash(`${list.frequency === "at-will" ? "At Will" : `${list.frequency}/Day${list.each ? " Each" : ""}`}: `) + list.spells.map(printedSpell).join("")
          )
          if (!same(renderedLists, listParagraphs.map(squash))) failures.push(`${own}: spell lists ${JSON.stringify(casting?.lists)} do not print as the official lists`)
          const castsText = body.includes("spellcasting ability") || body.includes("Spellcasting to cast")
          if (castsText && !casting && !castingProse[key]) failures.push(`${own}: casts spells but has no spellcasting and no prose reason`)
          if (casting && castingProse[key]) failures.push(`${own}: is listed as prose, but has spellcasting`)
          if (castingProse[key]) usedProse.add(key)
          if (casting) {
            const sq = squash(body)
            const parts = [
              casting.ability
                ? squash(`using ${abilityName[casting.ability]} as`) +
                  (sq.includes(squash(`using ${abilityName[casting.ability]} as the spellcasting ability`)) ? "thespellcastingability" : "spellcastingability")
                : "",
              casting.saveDc !== undefined ? squash(`spell save DC ${casting.saveDc}`) : "",
              casting.attackBonus !== undefined ? squash(`${casting.attackBonus} to hit with spell attacks`) : "",
            ]
            if (parts.some((part) => part && !sq.includes(part))) failures.push(`${own}: spellcasting ${JSON.stringify(casting)} is not printed`)
            if ((casting.saveDc !== undefined) !== body.includes("spell save DC") || (casting.attackBonus !== undefined) !== body.includes("to hit with spell attacks"))
              failures.push(`${own}: spellcasting DC or bonus present in only one of text and data`)
            // Whose ability: the monster's Spellcasting action exactly when the text says so, else a named ability.
            const viaSpellcasting = body.includes("same spellcasting ability as Spellcasting") || (body.includes("Spellcasting to cast") && !body.includes("as the spellcasting ability"))
            if ((casting.sameAsSpellcasting === true) !== viaSpellcasting || (casting.ability === undefined) === !viaSpellcasting)
              failures.push(`${own}: sameAsSpellcasting ${casting.sameAsSpellcasting} and ability ${casting.ability} disagree with the text`)
            // Self-only spells, from "(self only)" or "casts X on itself", and the other limits from the hand tables.
            for (const spell of [...(casting.lists ?? []).flatMap((list) => list.spells), ...(casting.spells ?? [])]) {
              const name = spell.id.replace(/-/g, "[ -]")
              const self = (spell.note ?? "").startsWith("self only") || new RegExp(`${name}(?: \\([^)]*\\))? on itself`, "i").test(body)
              if (!!spell.selfOnly !== self) failures.push(`${own}: ${spell.id} selfOnly ${spell.selfOnly}, the text says ${self}`)
              if (spell.appliesWhen !== spellLimits[key]) failures.push(`${own}: ${spell.id} appliesWhen "${spell.appliesWhen}", the hand table reads "${spellLimits[key]}"`)
              if (spell.appliesWhen && !item.text.includes(spell.appliesWhen)) failures.push(`${own}: "${spell.appliesWhen}" is not a span of the feature's text`)
            }
            if (!byHand && casting.appliesWhen !== castingGates[key]) failures.push(`${own}: spellcasting appliesWhen "${casting.appliesWhen}", the hand table reads "${castingGates[key]}"`)
            // Spells cast: a list, the named spells, or neither only where the hand table says the shape cannot hold them.
            if (!casting.lists && !casting.spells && !byHand) failures.push(`${own}: spellcasting names no spells`)
            if (casting.spells) {
              const names = casting.spells.map(printedSpell)
              const printed = names.length === 1 ? names[0] : names.length === 2 ? `${names[0]}or${names[1]}` : `${names.slice(0, -1).join("")}or${names[names.length - 1]}`
              if (!sq.includes(`casts${printed}`) && !sq.includes(`caststhe${printed}`) && !sq.includes(`spellcastingtocast${printed}`))
                failures.push(`${own}: casts ${JSON.stringify(casting.spells)} are not the printed spells`)
              // Each spell as printed, with its note or with no parenthetical after it.
              for (const spell of casting.spells) {
                const name = spell.id.replace(/-/g, "[ -]")
                const pattern = spell.note ? `${name} \\(${quote(spell.note)}\\)` : `${name}(?! \\()`
                if (!new RegExp(pattern, "i").test(body)) failures.push(`${own}: ${JSON.stringify(spell)} is not printed so`)
              }
            }
          }
        }
      }
      total++
      const legendary = monster.legendaryActions
      if (!!legendary !== !!block.legendaryIntro) failures.push(`${monster.id}: legendary actions ${legendary ? "present" : "absent"} in the data only`)
      else if (legendary && block.legendaryIntro) {
        const printed = `Legendary Action Uses: ${legendary.uses.count}${legendary.uses.countInLair ? ` (${legendary.uses.countInLair} in Lair)` : ""}. `
        if (
          !block.legendaryIntro.startsWith(printed) ||
          !block.legendaryIntro.includes("regains all expended uses at the start of each of its turns") ||
          legendary.uses.recharge !== "start-of-next-turn"
        )
          failures.push(`${monster.id}: legendary uses ${JSON.stringify(legendary.uses)}, official "${block.legendaryIntro.slice(0, 40)}"`)
        if (squash(legendary.text) !== squash(block.legendaryIntro)) failures.push(`${monster.id}: legendary text differs from the official paragraph`)
        prose++
        const missing = missingSentences(legendary.text)
        if (missing.length) proseFailures.push(`${monster.id} legendary text: ${missing.join(" | ")}`)
      }
    }
    // Chapter totals: every outcome label by kind, and every "next turn" sentence, is typed.
    const chapterText = soft(lines.map((line) => line.text))
    for (const kind of Object.keys(labelsInText)) {
      total++
      if (labelsInText[kind] !== labelsInData[kind]) failures.push(`the chapter prints ${labelsInText[kind]} "${kind}" outcomes, the data types ${labelsInData[kind]}`)
    }
    total++
    // Every once-per-turn limit the chapter prints is a typed oncePerTurn.
    total++
    const onceInText = ["once per turn", "once on each of its turns", "once per round"].reduce((n, words) => n + occurrences(chapterText, words), 0)
    if (onceInText !== oncePerTurnCount) failures.push(`the chapter prints ${onceInText} once-per-turn limits, the data types ${oncePerTurnCount}`)
    const nextTurnInText = occurrences(chapterText, "can’t take this action again until the start of its next turn")
    if (nextTurnInText !== nextTurnInData) failures.push(`the chapter prints the "next turn" sentence ${nextTurnInText} times, the data types ${nextTurnInData}`)
    // A hand table row that no feature uses is stale.
    for (const key of Object.keys(links)) if (!usedLinks.has(key)) failures.push(`links row ${key} matches no feature`)
    for (const key of Object.keys(namedNotGiven)) if (!usedNotGiven.has(key)) failures.push(`namedNotGiven row ${key} matches no feature`)
    for (const key of Object.keys(castingProse)) if (!usedProse.has(key)) failures.push(`castingProse row ${key} matches no feature`)
    for (const key of Object.keys(castingByHand)) if (!usedByHand.has(key)) failures.push(`castingByHand row ${key} matches no feature`)
    for (const failure of failures) unsettled.add(failure.split(" ")[0].replace(/:$/, ""))
    report.check(
      "monsters",
      `feature names, text, paragraphs, uses, attacks, damage, saves, outcomes by label (${Object.entries(labelsInText)
        .map(([kind, n]) => `${n} ${kind}`)
        .join(", ")}), conditions, links, escape DCs, areas and spells, rendered back and found in the official text`,
      total,
      failures
    )
    report.check("monsters", "every feature text is official wording", prose, proseFailures)
  }

  // ---- Internal consistency ----
  {
    const failures: string[] = []
    const waived: string[] = []
    let total = 0
    for (const monster of monsters) {
      for (const [ability, line] of Object.entries(monster.abilities)) {
        total += 2
        if (line.mod !== Math.floor((line.score - 10) / 2)) failures.push(`${monster.id}: ${ability} ${line.score} has modifier ${line.mod}`)
        // A save is the modifier, or the modifier plus PB when the monster is proficient. No stat block doubles PB.
        if (line.save !== line.mod && line.save !== line.mod + monster.pb)
          failures.push(`${monster.id}: ${ability} save ${line.save} is neither the modifier ${line.mod} nor ${line.mod} + PB ${monster.pb}`)
      }
      total += 5
      if (diceAverage(monster.hp.formula) !== monster.hp.average) failures.push(`${monster.id}: HP ${monster.hp.average} is not the average of ${monster.hp.formula}`)
      const pb = tables.pb.find((row) => monster.cr >= row.min && monster.cr <= row.max)?.pb ?? (monster.cr < 1 ? tables.pb[0].pb : undefined)
      if (monster.pb !== pb) failures.push(`${monster.id}: PB ${monster.pb} at CR ${monster.cr}, the table gives ${pb}`)
      const xp = tables.xp.get(monster.cr)
      if (!xp?.includes(monster.xp)) failures.push(`${monster.id}: XP ${monster.xp} at CR ${monster.cr}, the table gives ${xp}`)
      if (monster.initiative.score !== 10 + monster.initiative.modifier) failures.push(`${monster.id}: initiative score ${monster.initiative.score} is not 10 + ${monster.initiative.modifier}`)
      const die = Number(/d(\d+)/.exec(monster.hp.formula)?.[1])
      if (!monster.size.some((size) => tables.hitDie.find((row) => row.size === size)?.die === die)) failures.push(`${monster.id}: hit die d${die} is not the die of size ${monster.size.join(" or ")}`)
      const features = [monster.traits, monster.actions, monster.bonusActions, monster.reactions, monster.legendaryActions?.actions].flat().filter((f): f is MonsterFeature => !!f)
      for (const feature of features) {
        for (const part of feature.damage ?? []) {
          if (!part.dice) continue
          total++
          if (diceAverage(part.dice) !== part.average) failures.push(`${monster.id} ${feature.name}: ${part.average} is not the average of ${part.dice}`)
        }
      }
    }
    const real = failures.filter((failure) => {
      const error = officialErrors.find((entry) => failure.startsWith(entry.match))
      if (error) waived.push(`${failure}: the official text prints it so, page ${error.page}`)
      return !error
    })
    for (const error of officialErrors) if (!failures.some((failure) => failure.startsWith(error.match))) real.push(`waiver "${error.match}" matches nothing. Remove it.`)
    report.check("monsters", "modifiers, saves, HP, PB, XP, initiative scores, hit dice and damage averages agree with the official rules", total, real, waived)
  }

  // ---- Cross-check with Open5e, only when its fixtures are cached ----
  const open5eCheck = "Open5e agrees, or the official text settles it in the checks above"
  if (!hasUpstream("open5e")) report.skip("monsters", open5eCheck)
  else {
    const failures: string[] = []
    const waived: string[] = []
    let total = 0
    const creatures = new Map(readOpen5e("Creature").map((row) => [squash(row.fields.name), row.fields]))
    const attacks = readOpen5e("CreatureActionAttack")
    const actions = new Map(readOpen5e("CreatureAction").map((row) => [row.pk, row.fields]))
    for (const monster of monsters) {
      const o = creatures.get(squash(monster.name))
      total++
      if (!o) {
        failures.push(`${monster.id}: Open5e has no creature of this name`)
        continue
      }
      const pairs: [string, unknown, unknown][] = [
        ["ac", monster.ac, o.armor_class],
        ["hp", monster.hp.average, o.hit_points],
        ["hp formula", monster.hp.formula, o.hit_dice?.replace("−", "-")],
        ["initiative", monster.initiative.modifier, o.initiative_bonus],
        ["cr", monster.cr, Number(o.challenge_rating)],
        ["walk", monster.speed.walk, o.walk],
        ["fly", monster.speed.fly, o.fly],
        ["swim", monster.speed.swim, o.swim],
        ["climb", monster.speed.climb, o.climb],
        ["burrow", monster.speed.burrow, o.burrow],
        ["darkvision", monster.senses.darkvision, o.darkvision_range],
        ["blindsight", monster.senses.blindsight, o.blindsight_range],
        ["truesight", monster.senses.truesight, o.truesight_range],
        ["tremorsense", monster.senses.tremorsense, o.tremorsense_range],
        ["passive perception", monster.senses.passivePerception, o.passive_perception],
        ["telepathy", monster.telepathy, o.telepathy_range],
      ]
      const longNames: Record<string, string> = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" }
      for (const [id, long] of Object.entries(longNames)) {
        const line = monster.abilities[id as keyof Monster["abilities"]]
        pairs.push([`${id} score`, line.score, o[`ability_score_${long}`]], [`${id} save`, line.save, o[`saving_throw_${long}`] ?? line.mod])
      }
      for (const skill of Object.keys(o).filter((key) => key.startsWith("skill_bonus_"))) {
        pairs.push([skill, monster.skills?.[skill.slice(12).replace(/_/g, "-") as keyof NonNullable<Monster["skills"]>], o[skill] ?? undefined])
      }
      for (const [label, ours, theirs] of pairs) {
        total++
        const a = ours ?? null
        const b = theirs ?? null
        if (a === b || (a === null && b === 0)) continue
        // The official text settles a disagreement. The header check above already compares our value with it.
        if (!unsettled.has(monster.id)) waived.push(`${monster.id}: Open5e ${label} reads ${b}, the official text and the data read ${a}`)
        else failures.push(`${monster.id}: ${label} ${a}, Open5e ${b}`)
      }
      for (const row of attacks.filter((attack) => attack.fields.parent.startsWith(`srd-2024_${toId(monster.name.replace(/’/g, "'"))}_`))) {
        const action = actions.get(row.fields.parent)
        const feature = [monster.actions, monster.bonusActions, monster.reactions, monster.legendaryActions?.actions].flat().find((f) => f && action && squash(f.name) === squash(action.name))
        total++
        if (!feature?.attack) {
          waived.push(`${monster.id}: Open5e attack ${row.fields.name} has no attack feature of that name in the data`)
          continue
        }
        const a = row.fields
        const hit = feature.damage?.filter((part) => part.on === "hit") ?? []
        const dice = a.damage_die_count ? `${a.damage_die_count}${a.damage_die_type.toLowerCase()}${a.damage_bonus ? ` ${a.damage_bonus < 0 ? "-" : "+"} ${Math.abs(a.damage_bonus)}` : ""}` : undefined
        const checks: [string, unknown, unknown][] = [
          ["bonus", feature.attack.bonus, a.to_hit_mod],
          ["reach", feature.attack.reach ?? null, a.reach ?? null],
          ["range", feature.attack.range?.normal ?? null, a.range ?? null],
          ["long range", feature.attack.range?.long ?? null, a.long_range ?? null],
          ["damage dice", hit[0]?.dice, dice],
          ["damage type", hit[0]?.type, a.damage_type ?? undefined],
        ]
        for (const [label, ours, theirs] of checks) {
          if (same(ours, theirs)) continue
          if (unsettled.has(monster.id)) failures.push(`${monster.id} ${feature.name}: ${label} ${JSON.stringify(ours)}, Open5e ${JSON.stringify(theirs)}`)
          else
            waived.push(`${monster.id} ${feature.name}: Open5e ${label} reads ${JSON.stringify(theirs)}, the data reads ${JSON.stringify(ours)}, which the feature check matches to the official text`)
        }
      }
    }
    report.crossCheck("monsters", open5eCheck, total, failures, waived)
  }

  // ---- Stat block rules tables ----
  {
    const rules = readData<MonsterRule>("monster-rules")
    const failures: string[] = []
    let total = 0
    const byRule = new Map<string, MonsterRule>(rules.map((rule) => [rule.id, rule]))
    const xp = byRule.get("experience-points-by-challenge-rating")
    const pb = byRule.get("proficiency-bonus-by-challenge-rating")
    const dice = byRule.get("hit-dice-by-size")
    const wantXp = [...tables.xp].map(([cr, values]) => ({ cr, xp: values })).sort((a, b) => a.cr - b.cr)
    const wantPb = tables.pb.map((row) => ({ minCr: row.min, maxCr: row.max, pb: row.pb })).sort((a, b) => a.minCr - b.minCr)
    const wantDice = tables.hitDie.map((row) => ({ size: row.size, die: row.die, averagePerDie: row.average }))
    const compare = (label: string, got: unknown, want: unknown[], page: number, rule?: { page: number; name: string }) => {
      total += want.length + 2
      if (!same(got, want)) failures.push(`${label}: rows ${JSON.stringify(got)}, official ${JSON.stringify(want)}`)
      if (!rule || rule.page !== page) failures.push(`${label}: page ${rule?.page}, the table is on ${page}`)
      else if (!pages[page - 1].includes(`${rule.name}\n`)) failures.push(`${label}: no heading "${rule.name}" on page ${page}`)
    }
    compare("experience-points-by-challenge-rating", xp && "xpByCr" in xp ? xp.xpByCr : undefined, wantXp, 256, xp)
    compare("proficiency-bonus-by-challenge-rating", pb && "pbByCr" in pb ? pb.pbByCr : undefined, wantPb, 256, pb)
    compare("hit-dice-by-size", dice && "hitDiceBySize" in dice ? dice.hitDiceBySize : undefined, wantDice, 255, dice)
    // The page 257 rules: each typed value, written here by hand, with the sentence of page 257 that states it.
    const page257 = squash(pages[256])
    const stated: [string, string, unknown, string][] = [
      ["limited-usage", "perDay", { recharge: "long-rest" }, "a monster must finish a Long Rest to regain expended uses"],
      [
        "limited-usage",
        "rechargeRoll",
        { count: 1, die: 6, rolledAt: "start-of-each-turn", alsoRestoredBy: "short-or-long-rest" },
        "This notation means a monster can use the stat block part once. At the start of each of the monster’s turns, roll 1d6",
      ],
      [
        "limited-usage",
        "rechargeRoll",
        { count: 1, die: 6, rolledAt: "start-of-each-turn", alsoRestoredBy: "short-or-long-rest" },
        "which also recharges when the monster finishes a Short or Long Rest",
      ],
      ["limited-usage", "afterRest", { count: 1, recharge: "short-or-long-rest" }, "the monster can use the stat block part once and must then finish a Short or Long Rest to use it again"],
      ["legendary-actions", "takenAfter", "another-creatures-turn", "only after another creature’s turn ends"],
      ["legendary-actions", "oneAtATime", true, "Only one of these actions can be taken at a time"],
      ["legendary-actions", "usesPerAction", 1, "The monster expends one use whenever it takes a Legendary Action"],
      ["legendary-actions", "recharge", "start-of-next-turn", "it regains all expended uses at the start of each of its turns"],
      ["legendary-actions", "blockedBy", ["incapacitated"], "can’t take a Legendary Action if it has the Incapacitated condition"],
    ]
    for (const [id, field, value, sentence] of stated) {
      total += 2
      const rule = byRule.get(id) as Record<string, unknown> | undefined
      if (!same(rule?.[field], value)) failures.push(`${id}: ${field} is ${JSON.stringify(rule?.[field])}, page 257 states ${JSON.stringify(value)}`)
      if (!page257.includes(squash(sentence))) failures.push(`${id}: page 257 does not read "${sentence}"`)
    }
    for (const id of ["limited-usage", "legendary-actions"]) {
      total++
      const rule = byRule.get(id) as Record<string, unknown> | undefined
      const typed = Object.keys(rule ?? {}).filter((key) => !["id", "name", "page"].includes(key))
      if (rule?.page !== 257 || !same(typed.sort(), [...new Set(stated.filter((row) => row[0] === id).map((row) => row[1]))].sort()))
        failures.push(`${id}: page or typed fields differ from the page 257 table`)
    }
    total++
    if (rules.length !== 5) failures.push(`monster-rules has ${rules.length} entries, the chapter prints 3 tables and 2 usage rules`)
    if (wantXp.length !== 34 || wantPb.length !== 8 || wantDice.length !== 6) failures.push(`the official tables read ${wantXp.length}, ${wantPb.length} and ${wantDice.length} rows, not 34, 8 and 6`)
    report.check("monster rules", "XP by CR (34 rows), PB by CR (8) and Hit Dice by Size (6) equal the official tables, and Limited Usage and Legendary Actions equal page 257", total, failures)
  }

  // ---- References ----
  {
    const failures: string[] = []
    let total = 0
    const known = (name: string) => (existsSync(dataPath(name)) ? new Set(readData(name).map((entry) => entry.id)) : undefined)
    const spells = known("spells")
    const equipment = known("equipment")
    const magicItems = known("magic-items")
    for (const monster of monsters) {
      if (equipment) {
        for (const item of monster.gear ?? []) {
          total++
          if (!equipment.has(item.id) && !magicItems?.has(item.id)) failures.push(`${monster.id}: gear ${item.id} is not an equipment id`)
        }
      }
      if (spells) {
        for (const feature of [monster.actions, monster.bonusActions, monster.reactions, monster.legendaryActions?.actions].flat()) {
          for (const list of feature?.spellcasting?.lists ?? []) {
            for (const spell of list.spells) {
              total++
              if (!spells.has(spell.id)) failures.push(`${monster.id} ${feature?.name}: spell ${spell.id} is not a spell id`)
            }
          }
        }
      }
    }
    report.check("monsters", `spell and gear ids resolve (${spells ? "spells" : "no spells data yet"}, ${equipment ? "equipment" : "no equipment data yet"})`, total, failures)
  }
}

/**
 * Conditions a feature names but does not give, read by hand: a precondition ("one creature within 5 feet that has
 * the Prone condition"), a negation ("doesn’t have the Incapacitated condition"), an ending or a replacement.
 */
const namedNotGiven: Record<string, string[]> = {
  "assassin/Evasion": ["incapacitated"],
  "azer-sentinel/Fire Aura": ["incapacitated"],
  "gibbering-mouther/Gibbering": ["incapacitated"],
  "gorgon/Trample": ["prone"],
  "hell-hound/Pack Tactics": ["incapacitated"],
  "hobgoblin-warrior/Pack Tactics": ["incapacitated"],
  "hobgoblin-captain/Aura of Authority": ["incapacitated"],
  "kobold-warrior/Pack Tactics": ["incapacitated"],
  "steam-mephit/Blurred Form": ["incapacitated"],
  "pit-fiend/Fear Aura": ["incapacitated"],
  "purple-worm/Swallow": ["grappled"],
  "remorhaz/Swallow": ["grappled"],
  "tarrasque/Swallow": ["grappled"],
  "tough/Pack Tactics": ["incapacitated"],
  "tough-boss/Pack Tactics": ["incapacitated"],
  "vampire-spawn/Vampire Weakness": ["incapacitated"],
  "vampire-spawn/Bite": ["grappled", "incapacitated", "restrained"],
  "vampire/Vampire Weakness": ["incapacitated"],
  "vampire/Bite": ["grappled", "incapacitated", "restrained"],
  "warrior-infantry/Pack Tactics": ["incapacitated"],
  "werewolf/Pack Tactics": ["incapacitated"],
  "winter-wolf/Pack Tactics": ["incapacitated"],
  "baboon/Pack Tactics": ["incapacitated"],
  "blood-hawk/Pack Tactics": ["incapacitated"],
  "dire-wolf/Pack Tactics": ["incapacitated"],
  "elephant/Trample": ["prone"],
  "giant-rat/Pack Tactics": ["incapacitated"],
  "giant-vulture/Pack Tactics": ["incapacitated"],
  "hyena/Pack Tactics": ["incapacitated"],
  "lion/Pack Tactics": ["incapacitated"],
  "mammoth/Trample": ["prone"],
  "reef-shark/Pack Tactics": ["incapacitated"],
  "vulture/Pack Tactics": ["incapacitated"],
  "wolf/Pack Tactics": ["incapacitated"],
}

/**
 * The link of every save, damage roll and condition in features that are not plain, written as `linkString` and
 * `saveString` write them. Every row was reread from the official text, feature by feature, before it was compared
 * with the data.
 */
const links: Record<string, { s?: string[]; d?: string[]; c?: string[] }> = {
  "centaur-trooper/Trampling Charge": {
    s: ["W:Each creature whose space the centaur enters is targeted once by the following effect"],
    d: ["failure@0|W:Each creature whose space the centaur enters is targeted once by the following effect"],
    c: ["prone=failure@0|W:Each creature whose space the centaur enters is targeted once by the following effect"],
  },
  "aboleth/Tentacle": { d: ["hit"], c: ["grappled=hit|W:If the target is a Large or smaller creature"] },
  "aboleth/Dominate Mind": { c: ["charmed=failure@0"] },
  "ankheg/Bite": { d: ["hit", "hit"], c: ["grappled=hit|W:If the target is a Large or smaller creature"] },
  "balor/Fire Aura": { d: ["-|T:At the end of each of the balor’s turns"] },
  "balor/Flame Whip": { d: ["hit", "hit"], c: ["prone=hit|W:If the target is a Huge or smaller creature"] },
  "barbed-devil/Claws": { d: ["hit"], c: ["grappled=hit|W:If the target is a Large or smaller creature"] },
  "barbed-devil/Hurl Flame": { d: ["hit"] },
  "basilisk/Petrifying Gaze": { s: ["S:If the basilisk sees its reflection in the Cone"], c: ["restrained=first-failure@0", "petrified=second-failure@0"] },
  "bearded-devil/Infernal Glaive": { s: ["W:If the target is a creature and doesn’t already have an infernal wound"], d: ["hit"] },
  "behir/Constrict": { d: ["failure@0"], c: ["grappled=failure@0", "restrained=failure@0|W:until the grapple ends"] },
  "black-pudding/Corrosive Form": { d: ["-|W:A creature that hits the pudding with a melee attack roll"] },
  "black-pudding/Dissolving Pseudopod": { d: ["hit"] },
  "brass-dragon-wyrmling/Sleep Breath": { c: ["incapacitated=first-failure@0", "unconscious=second-failure@0"] },
  "young-brass-dragon/Sleep Breath": { c: ["incapacitated=first-failure@0", "unconscious=second-failure@0"] },
  "adult-brass-dragon/Sleep Breath": { c: ["incapacitated=first-failure@0", "unconscious=second-failure@0"] },
  "ancient-brass-dragon/Sleep Breath": { c: ["incapacitated=first-failure@0", "unconscious=second-failure@0"] },
  "bugbear-warrior/Grab": { d: ["hit"], c: ["grappled=hit|W:If the target is a Medium or smaller creature"] },
  "chain-devil/Chain": { d: ["hit"], c: ["grappled=hit|W:If the target is a Large or smaller creature", "restrained=hit|W:until the grapple ends"] },
  "chain-devil/Conjure Infernal Chain": { d: ["failure@0"], c: ["restrained=failure@0"] },
  "chimera/Bite": { d: ["hit", "hit|W:if the chimera had Advantage on the attack roll|alt0"] },
  "chimera/Ram": { d: ["hit"], c: ["prone=hit|W:If the target is a Medium or smaller creature"] },
  "chuul/Pincer": { d: ["hit"], c: ["grappled=hit|W:If the target is a Large or smaller creature"] },
  "chuul/Paralyzing Tentacles": { c: ["poisoned=failure@0", "paralyzed=failure@0|W:While Poisoned"] },
  "cloaker/Attach": { d: ["hit"], c: ["blinded=hit|W:While the cloaker is attached"] },
  "cockatrice/Petrifying Bite": {
    s: ["W:If the target is a creature"],
    d: ["hit"],
    c: ["restrained=first-failure@0|W:If the target is a creature", "petrified=second-failure@0|W:If the target is a creature"],
  },
  "couatl/Constrict": { d: ["failure@0"], c: ["grappled=failure@0", "restrained=failure@0|W:until the grapple ends"] },
  "swarm-of-crawling-claws/Swarm of Grasping Hands": { d: ["hit", "hit|W:if the swarm is Bloodied|alt0"], c: ["prone=hit|W:If the target is a Medium or smaller creature"] },
  "darkmantle/Crush": { d: ["hit"], c: ["blinded=hit|W:If the target is a Medium or smaller creature and the darkmantle had Advantage on the attack roll"] },
  "death-dog/Bite": { s: ["W:If the target is a creature"], d: ["hit"], c: ["poisoned=first-failure@0|W:If the target is a creature"] },
  "djinni/Storm Bolt": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature"] },
  "djinni/Create Whirlwind": {
    s: ["W:Whenever the whirlwind enters a creature’s space or a creature enters the whirlwind|O:any-turn"],
    d: ["failure@0|W:While in the whirlwind|T:At the start of each of its turns"],
    c: ["restrained=failure@0|W:While in the whirlwind"],
  },
  "dragon-turtle/Tail": { d: ["hit"], c: ["prone=hit|W:If the target is a Huge or smaller creature"] },
  "earth-elemental/Rock Launch": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature"] },
  "erinyes/Entangling Rope": { d: ["failure@0"], c: ["restrained=failure@0"] },
  "ettin/Battleaxe": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature"] },
  "fire-elemental/Fire Aura": { d: ["-|T:At the end of each of the elemental’s turns"] },
  "fire-elemental/Fire Form": { d: ["-|W:The first time it enters a creature’s space on a turn"] },
  "fire-elemental/Burn": { d: ["hit"] },
  "gelatinous-cube/Ooze Cube": { d: ["-|W:a creature within 5 feet of the cube can pull a creature or an object out of the cube by succeeding on a DC 12 Strength (Athletics) check"] },
  "gelatinous-cube/Engulf": { d: ["failure@0", "failure@0|W:An engulfed target|T:at the start of each of the cube’s turns"], c: ["restrained=failure@0|W:An engulfed target"] },
  "ghast/Claw": { s: ["W:If the target is a non-Undead creature"], d: ["hit"], c: ["paralyzed=failure@0|W:If the target is a non-Undead creature"] },
  "ghost/Possession": { c: ["incapacitated=failure@0"] },
  "ghoul/Claw": { s: ["W:If the target is a creature that isn’t an Undead or elf"], d: ["hit"], c: ["paralyzed=failure@0|W:If the target is a creature that isn’t an Undead or elf"] },
  "gibbering-mouther/Gibbering": { s: ["W:while it doesn’t have the Incapacitated condition"] },
  "gibbering-mouther/Bite": { d: ["hit"], c: ["prone=hit|W:If the target is a Medium or smaller creature"] },
  "glabrezu/Pincer": { d: ["hit"], c: ["grappled=hit|W:If the target is a Medium or smaller creature"] },
  "gladiator/Shield Bash": { d: ["failure@0"], c: ["prone=failure@0|W:If the target is a Medium or smaller creature"] },
  "goblin-warrior/Scimitar": { d: ["hit", "hit|W:if the attack roll had Advantage"] },
  "goblin-warrior/Shortbow": { d: ["hit", "hit|W:if the attack roll had Advantage"] },
  "goblin-boss/Scimitar": { d: ["hit", "hit|W:if the attack roll had Advantage"] },
  "goblin-boss/Shortbow": { d: ["hit", "hit|W:if the attack roll had Advantage"] },
  "gorgon/Gore": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature and the gorgon moved 20+ feet straight toward it immediately before the hit"] },
  "gorgon/Petrifying Breath": { c: ["restrained=first-failure@0", "petrified=second-failure@0"] },
  "gray-ooze/Pseudopod": { d: ["hit"] },
  "grick/Tentacles": { d: ["hit"], c: ["grappled=hit|W:If the target is a Medium or smaller creature"] },
  "griffon/Rend": { d: ["hit"], c: ["grappled=hit|W:If the target is a Medium or smaller creature"] },
  "harpy/Luring Song": { c: ["charmed=failure@0", "incapacitated=failure@0|W:While Charmed"] },
  "hill-giant/Tree Club": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature"] },
  "horned-devil/Hurl Flame": { d: ["hit"] },
  "horned-devil/Infernal Tail": { d: ["failure@0"] },
  "ice-devil/Ice Spear": { d: ["hit", "hit"] },
  "invisible-stalker/Vortex": { d: ["failure@0", "failure@0|W:Until the grapple ends|T:at the start of each of the stalker’s turns"], c: ["grappled=failure@0"] },
  "kraken/Tentacle": { d: ["hit"], c: ["grappled=hit", "restrained=hit|W:until the grapple ends"] },
  "lamia/Corrupting Touch": { d: ["failure@0"], c: ["charmed=failure@0|W:Until the curse ends", "poisoned=failure@0|W:Until the curse ends"] },
  "magmin/Touch": { d: ["hit"] },
  "marilith/Constrict": { d: ["failure@0"], c: ["grappled=failure@0", "restrained=failure@0|W:until the grapple ends"] },
  "medusa/Petrifying Gaze": { s: ["S:If the medusa sees its reflection in the Cone"], c: ["restrained=first-failure@0", "petrified=second-failure@0"] },
  "merfolk-skirmisher/Ocean Spear": { d: ["hit", "hit"] },
  "merrow/Harpoon": { d: ["hit"] },
  "mimic/Adhesive": { c: ["grappled=-|W:A Huge or smaller creature adhered to the mimic"] },
  "mimic/Bite": { d: ["hit", "hit|W:if the target is Grappled by the mimic|alt0", "hit"] },
  "mimic/Pseudopod": { d: ["hit", "hit"], c: ["grappled=hit|W:If the target is a Large or smaller creature"] },
  "minotaur-of-baphomet/Gore": {
    d: ["hit", "hit|W:If the target is a Large or smaller creature and the minotaur moved 10+ feet straight toward it immediately before the hit"],
    c: ["prone=hit|W:If the target is a Large or smaller creature and the minotaur moved 10+ feet straight toward it immediately before the hit"],
  },
  "mummy/Rotting Fist": { d: ["hit", "hit"] },
  "mummy-lord/Rotting Fist": { d: ["hit", "hit"] },
  "mummy-lord/Whirlwind of Sand": { c: ["blinded=-|W:Each creature of its choice that it can see within 5 feet of its destination space"] },
  "nalfeshnee/Horror Nimbus": { d: ["failure@0"], c: ["frightened=failure@0"] },
  "otyugh/Bite": { s: ["W:Whenever the Poisoned target finishes a Long Rest"], d: ["hit"], c: ["poisoned=hit"] },
  "otyugh/Tentacle": { d: ["hit"], c: ["grappled=hit|W:If the target is a Medium or smaller creature"] },
  "phase-spider/Bite": { d: ["hit", "hit"], c: ["poisoned=hit|W:If this damage reduces the target to 0 Hit Points", "paralyzed=hit|W:While Poisoned"] },
  "pit-fiend/Fear Aura": { s: ["W:while it doesn’t have the Incapacitated condition"], c: ["frightened=failure@0|W:while it doesn’t have the Incapacitated condition"] },
  "pit-fiend/Bite": { s: ["W:If the target is a creature"], d: ["hit", "failure@0|W:While Poisoned|T:at the start of each of its turns"], c: ["poisoned=failure@0|W:If the target is a creature"] },
  "purple-worm/Bite": { d: ["hit"], c: ["grappled=hit|W:If the target is a Large or smaller creature", "restrained=hit|W:until the grapple ends"] },
  "rakshasa/Cursed Touch": { d: ["hit", "hit"] },
  "remorhaz/Heat Aura": { d: ["-|T:At the end of each of the remorhaz’s turns"] },
  "remorhaz/Bite": { d: ["hit", "hit"], c: ["grappled=hit|W:If the target is a Large or smaller creature", "restrained=hit|W:until the grapple ends"] },
  "roc/Talons": { d: ["hit"], c: ["grappled=hit|W:If the target is a Huge or smaller creature", "restrained=hit|W:until the grapple ends"] },
  "roper/Tentacle": { c: ["grappled=hit", "poisoned=hit|W:until the grapple ends"] },
  "salamander/Fire Aura": { d: ["-|T:At the end of each of the salamander’s turns"] },
  "salamander/Flame Spear": { d: ["hit", "hit"] },
  "salamander/Constrict": { d: ["failure@0", "failure@0"], c: ["grappled=failure@0", "restrained=failure@0|W:until the grapple ends"] },
  "satyr/Hooves": { d: ["hit"] },
  "shadow/Draining Swipe": { d: ["hit"] },
  "shambling-mound/Charged Tendril": { d: ["hit", "hit"] },
  "shambling-mound/Engulf": {
    d: ["failure@0|W:Until the grapple ends|T:at the start of each of its turns"],
    c: ["grappled=failure@0", "blinded=failure@0|W:Until the grapple ends", "restrained=failure@0|W:Until the grapple ends"],
  },
  "silver-dragon-wyrmling/Paralyzing Breath": { c: ["incapacitated=first-failure@0", "paralyzed=second-failure@0"] },
  "young-silver-dragon/Paralyzing Breath": { c: ["incapacitated=first-failure@0", "paralyzed=second-failure@0"] },
  "adult-silver-dragon/Paralyzing Breath": { c: ["incapacitated=first-failure@0", "paralyzed=second-failure@0"] },
  "ancient-silver-dragon/Paralyzing Breath": { c: ["incapacitated=first-failure@0", "paralyzed=second-failure@0"] },
  "warhorse-skeleton/Hooves": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature and the skeleton moved 20+ feet straight toward it immediately before the hit"] },
  "minotaur-skeleton/Gore": {
    d: ["hit", "hit|W:If the target is a Large or smaller creature and the skeleton moved 20+ feet straight toward it immediately before the hit"],
    c: ["prone=hit|W:If the target is a Large or smaller creature and the skeleton moved 20+ feet straight toward it immediately before the hit"],
  },
  "solar/Flying Sword": { d: ["hit", "hit"] },
  "specter/Life Drain": { d: ["hit"] },
  "sphinx-of-valor/Roar": {
    s: ["L:First Roar", "L:Second Roar", "L:Third Roar"],
    d: ["failure@2|L:Third Roar"],
    c: ["frightened=failure@0|L:First Roar", "paralyzed=failure@1|L:Second Roar", "prone=failure@2|L:Third Roar"],
  },
  "stirge/Proboscis": { d: ["hit", "hit|W:While attached|T:at the start of each of the stirge’s turns"] },
  "stone-giant/Boulder": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature"] },
  "stone-giant/Deflect Missile": { s: ["W:if that damage is reduced to 0"], d: ["failure@0|W:if that damage is reduced to 0"] },
  "tarrasque/Bite": { d: ["hit"], c: ["grappled=hit", "restrained=hit|W:Until the grapple ends"] },
  "tarrasque/Tail": { d: ["hit"], c: ["prone=hit|W:If the target is a Huge or smaller creature"] },
  "tarrasque/World-Shaking Movement": { c: ["prone=-|W:if Medium or smaller"] },
  "tough-boss/Warhammer": { d: ["hit"] },
  "vampire-familiar/Umbral Dagger": { d: ["hit", "hit"], c: ["poisoned=hit|W:If the target is reduced to 0 Hit Points by this attack", "paralyzed=hit|W:While it has the Poisoned condition"] },
  "vampire-spawn/Claw": { d: ["hit"], c: ["grappled=hit|W:If the target is a Medium or smaller creature"] },
  "vampire/Grave Strike": { d: ["hit", "hit"], c: ["grappled=hit|W:If the target is a Large or smaller creature"] },
  "vrock/Spores": { d: ["failure@0|W:While Poisoned|T:at the start of each of its turns"], c: ["poisoned=failure@0"] },
  "water-elemental/Slam": { d: ["hit"], c: ["prone=hit|W:If the target is a Medium or smaller creature"] },
  "water-elemental/Whelm": {
    d: ["failure@0", "failure@0|W:Until the grapple ends|T:at the start of each of the elemental’s turns"],
    c: ["grappled=failure@0|W:If the target is a Large or smaller creature", "restrained=failure@0|W:Until the grapple ends"],
  },
  "werebear/Bite": { s: ["W:If the target is a Humanoid"], d: ["hit"] },
  "wereboar/Gore": { s: ["W:If the target is a Humanoid"], d: ["hit"] },
  "wereboar/Tusk": {
    d: ["hit", "hit|W:If the target is a Medium or smaller creature and the wereboar moved 20+ feet straight toward it immediately before the hit"],
    c: ["prone=hit|W:If the target is a Medium or smaller creature and the wereboar moved 20+ feet straight toward it immediately before the hit"],
  },
  "wererat/Bite": { s: ["W:If the target is a Humanoid"], d: ["hit"] },
  "weretiger/Bite": { s: ["W:If the target is a Humanoid"], d: ["hit"] },
  "werewolf/Bite": { s: ["W:If the target is a Humanoid"], d: ["hit"] },
  "wight/Life Drain": { d: ["failure@0"] },
  "winter-wolf/Bite": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature"] },
  "wraith/Life Drain": { d: ["hit"] },
  "allosaurus/Claws": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature and the allosaurus moved 30+ feet straight toward it immediately before the hit"] },
  "ankylosaurus/Tail": { d: ["hit"], c: ["prone=hit|W:If the target is a Huge or smaller creature"] },
  "blood-hawk/Beak": { d: ["hit", "hit|W:if the target is Bloodied|alt0"] },
  "boar/Gore": {
    d: ["hit", "hit|W:If the target is a Medium or smaller creature and the boar moved 20+ feet straight toward it immediately before the hit"],
    c: ["prone=hit|W:If the target is a Medium or smaller creature and the boar moved 20+ feet straight toward it immediately before the hit"],
  },
  "brown-bear/Claw": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature"] },
  "crocodile/Bite": { d: ["hit"], c: ["grappled=hit|W:If the target is a Medium or smaller creature", "restrained=hit|W:While Grappled"] },
  "dire-wolf/Bite": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature"] },
  "elephant/Gore": { d: ["hit"], c: ["prone=hit|W:If the target is a Huge or smaller creature and the elephant moved 20+ feet straight toward it immediately before the hit"] },
  "elk/Ram": {
    d: ["hit", "hit|W:If the target is a Large or smaller creature and the elk moved 20+ feet straight toward it immediately before the hit"],
    c: ["prone=hit|W:If the target is a Large or smaller creature and the elk moved 20+ feet straight toward it immediately before the hit"],
  },
  "giant-ape/Boulder Toss": { d: ["failure@0"], c: ["prone=failure@0|W:If the target is a Large or smaller creature"] },
  "giant-boar/Gore": {
    d: ["hit", "hit|W:If the target is a Large or smaller creature and the boar moved 20+ feet straight toward it immediately before the hit"],
    c: ["prone=hit|W:If the target is a Large or smaller creature and the boar moved 20+ feet straight toward it immediately before the hit"],
  },
  "giant-crab/Claw": { d: ["hit"], c: ["grappled=hit|W:If the target is a Medium or smaller creature"] },
  "giant-crocodile/Bite": { d: ["hit"], c: ["grappled=hit|W:If the target is a Large or smaller creature", "restrained=hit|W:While Grappled"] },
  "giant-crocodile/Tail": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature"] },
  "giant-elk/Ram": {
    d: ["hit", "hit", "hit|W:If the target is a Huge or smaller creature and the elk moved 20+ feet straight toward it immediately before the hit"],
    c: ["prone=hit|W:If the target is a Huge or smaller creature and the elk moved 20+ feet straight toward it immediately before the hit"],
  },
  "giant-frog/Bite": { d: ["hit"], c: ["grappled=hit|W:If the target is a Medium or smaller creature"] },
  "giant-frog/Swallow": {
    d: ["-|W:While swallowed|T:At the end of the frog’s next turn"],
    c: ["blinded=-|W:While swallowed", "restrained=-|W:While swallowed", "prone=-|W:if the frog dies", "prone=-|W:If that damage doesn’t kill it"],
  },
  "giant-goat/Ram": {
    d: ["hit", "hit|W:If the target is a Large or smaller creature and the goat moved 20+ feet straight toward it immediately before the hit"],
    c: ["prone=hit|W:If the target is a Large or smaller creature and the goat moved 20+ feet straight toward it immediately before the hit"],
  },
  "giant-octopus/Tentacles": { d: ["hit"], c: ["grappled=hit|W:If the target is a Medium or smaller creature", "restrained=hit|W:While Grappled"] },
  "giant-scorpion/Claw": { d: ["hit"], c: ["grappled=hit|W:If the target is a Large or smaller creature"] },
  "giant-seahorse/Ram": { d: ["hit", "hit|W:if the seahorse moved 20+ feet straight toward the target immediately before the hit|alt0"] },
  "giant-toad/Bite": { d: ["hit", "hit"], c: ["grappled=hit|W:If the target is a Medium or smaller creature"] },
  "giant-toad/Swallow": { d: ["-|W:While swallowed|T:at the end of each of the toad’s turns"], c: ["blinded=-|W:While swallowed", "restrained=-|W:While swallowed", "prone=-|W:If the toad dies"] },
  "goat/Ram": { d: ["hit", "hit|W:if the goat moved 20+ feet straight toward the target immediately before the hit|alt0"] },
  "mammoth/Gore": { d: ["hit"], c: ["prone=hit|W:If the target is a Huge or smaller creature and the mammoth moved 20+ feet straight toward it immediately before the hit"] },
  "mastiff/Bite": { d: ["hit"], c: ["prone=hit|W:If the target is a Medium or smaller creature"] },
  "rhinoceros/Gore": {
    d: ["hit", "hit|W:If target is a Large or smaller creature and the rhinoceros moved 20+ feet straight toward it immediately before the hit"],
    c: ["prone=hit|W:If target is a Large or smaller creature and the rhinoceros moved 20+ feet straight toward it immediately before the hit"],
  },
  "swarm-of-bats/Bites": { d: ["hit", "hit|W:if the swarm is Bloodied|alt0"] },
  "swarm-of-insects/Bites": { d: ["hit", "hit|W:if the swarm is Bloodied|alt0"] },
  "swarm-of-piranhas/Bites": { d: ["hit", "hit|W:if the swarm is Bloodied|alt0"] },
  "swarm-of-rats/Bites": { d: ["hit", "hit|W:if the swarm is Bloodied|alt0"] },
  "swarm-of-ravens/Beaks": { d: ["hit", "hit|W:if the swarm is Bloodied|alt0"] },
  "swarm-of-venomous-snakes/Bites": { d: ["hit", "hit|W:if the swarm is Bloodied|alt0", "hit"] },
  "tiger/Rend": { d: ["hit"], c: ["prone=hit|W:If the target is a Large or smaller creature"] },
  "triceratops/Gore": {
    d: ["hit", "hit|W:If the target is Huge or smaller and the triceratops moved 20+ feet straight toward it immediately before the hit"],
    c: ["prone=hit|W:If the target is Huge or smaller and the triceratops moved 20+ feet straight toward it immediately before the hit"],
  },
  "tyrannosaurus-rex/Bite": { d: ["hit"], c: ["grappled=hit|W:If the target is a Large or smaller creature", "restrained=hit|W:While Grappled"] },
  "tyrannosaurus-rex/Tail": { d: ["hit"], c: ["prone=hit|W:If the target is a Huge or smaller creature"] },
  "warhorse/Hooves": {
    d: ["hit", "hit|W:If the target is a Large or smaller creature and the horse moved 20+ feet straight toward it immediately before the hit"],
    c: ["prone=hit|W:If the target is a Large or smaller creature and the horse moved 20+ feet straight toward it immediately before the hit"],
  },
  "wolf/Bite": { d: ["hit"], c: ["prone=hit|W:If the target is a Medium or smaller creature"] },
  "aboleth/Mucus Cloud": {
    s: ["W:While underwater"],
    d: ["failure@0|W:While the cursed creature is outside a body of water|U:moisture is applied to its skin before those minutes have passed|T:at the end of every 10 minutes"],
  },
  "animated-rug-of-smothering/Smother": {
    d: ["hit", "hit|W:Until the grapple ends|T:at the start of each of its turns"],
    c: ["grappled=hit|W:If the target is a Medium or smaller creature|instead", "blinded=hit|W:Until the grapple ends", "restrained=hit|W:Until the grapple ends"],
  },
  "azer-sentinel/Fire Aura": { d: ["-|U:the azer has the Incapacitated condition|T:At the end of each of the azer’s turns"] },
  "barbed-devil/Barbed Hide": { d: ["-|W:to any creature it is grappling or any creature grappling it|T:At the start of each of its turns"] },
  "behir/Swallow": {
    d: ["failure@0|W:While swallowed|T:at the start of each of the behir’s turns"],
    c: [
      "blinded=failure@0|W:While swallowed",
      "restrained=failure@0|W:While swallowed",
      "prone=failure@0|W:If the behir takes 30 damage or more on a single turn from the swallowed creature, the behir must succeed on a DC 14 Constitution saving throw at the end of that turn or regurgitate the creature",
      "prone=failure@0|W:If the behir dies",
    ],
  },
  "fire-elemental/Water Susceptibility": { d: ["-|W:for every 5 feet the elemental moves in water or for every gallon of water splashed on it|self"] },
  "ghost/Incorporeal Movement": { d: ["-|W:if it ends its turn inside an object|self"] },
  "specter/Incorporeal Movement": { d: ["-|W:if it ends its turn inside an object|self"] },
  "will-o-wisp/Incorporeal Movement": { d: ["-|W:if it ends its turn inside an object|self"] },
  "wraith/Incorporeal Movement": { d: ["-|W:if it ends its turn inside an object|self"] },
  "homunculus/Bite": { d: ["hit"], c: ["poisoned=failure@0", "poisoned=failure-by-margin@0", "unconscious=failure-by-margin@0|W:While Poisoned"] },
  "incubus/Nightmare": { d: ["failure@0|U:If the target has 20 Hit Points or fewer"], c: ["unconscious=failure@0|W:If the target has 20 Hit Points or fewer"] },
  "invisible-stalker/Invisibility": { c: ["invisible=-|self"] },
  "kraken/Swallow": {
    d: ["failure@0", "failure@0|W:A swallowed creature|T:at the start of each of its turns"],
    c: [
      "restrained=failure@0|W:A swallowed creature",
      "prone=failure@0|W:If the kraken takes 50 damage or more on a single turn from a creature inside it, the kraken must succeed on a DC 25 Constitution saving throw at the end of that turn or regurgitate all swallowed creatures",
      "prone=failure@0|W:If the kraken dies",
    ],
  },
  "lich/Deathly Teleport": { d: ["-|W:each creature within 10 feet of the space it left"] },
  "pseudodragon/Sting": { d: ["failure@0"], c: ["poisoned=failure@0", "unconscious=failure-by-margin@0|W:While Poisoned"] },
  "purple-worm/Swallow": {
    d: ["failure@0|W:A swallowed creature|T:at the start of each of the worm’s turns"],
    c: [
      "blinded=failure@0|W:A swallowed creature",
      "restrained=failure@0|W:A swallowed creature",
      "prone=failure@0|W:If the worm takes 30 damage or more on a single turn from a creature inside it, the worm must succeed on a DC 21 Constitution saving throw at the end of that turn or regurgitate all swallowed creatures",
      "prone=failure@0|W:If the worm dies",
    ],
  },
  "remorhaz/Swallow": {
    d: ["failure@0|W:A swallowed creature|T:at the start of each of the remorhaz’s turns", "failure@0|W:A swallowed creature|T:at the start of each of the remorhaz’s turns"],
    c: [
      "blinded=failure@0|W:A swallowed creature",
      "restrained=failure@0|W:A swallowed creature",
      "prone=failure@0|W:If the remorhaz takes 30 damage or more on a single turn from a creature inside it, the remorhaz must succeed on a DC 15 Constitution saving throw at the end of that turn or regurgitate all swallowed creatures",
      "prone=failure@0|W:If the remorhaz dies",
    ],
  },
  "sea-hag/Death Glare": { d: ["failure@0|U:If the target has 20 Hit Points or fewer"] },
  "solar/Slaying Bow": { d: ["failure@0|U:If the creature has 100 Hit Points or fewer", "failure@0|U:If the creature has 100 Hit Points or fewer"] },
  "tarrasque/Swallow": {
    d: ["failure@0|W:A swallowed creature|T:at the start of each of the tarrasque’s turns"],
    c: [
      "blinded=failure@0|W:A swallowed creature",
      "restrained=failure@0|W:A swallowed creature",
      "prone=failure@0|W:If the tarrasque takes 60 damage or more on a single turn from a creature inside it, the tarrasque must succeed on a DC 20 Constitution saving throw at the end of that turn or regurgitate all swallowed creatures",
      "prone=failure@0|W:If the tarrasque dies",
    ],
  },
  "troll/Loathsome Limbs": { c: ["exhaustion=-|W:for each missing limb|self"] },
  "vampire/Misty Escape": { c: ["paralyzed=-|W:Once in its resting place|self"] },
  "vampire/Vampire Weakness": {
    d: ["-|L:Running Water|W:if it ends its turn in running water|self", "-|L:Sunlight|W:if it starts its turn in sunlight|self"],
    c: ["paralyzed=-|L:Stake to the Heart|W:If a weapon that deals Piercing damage is driven into the vampire’s heart while the vampire has the Incapacitated condition in its resting place|self"],
  },
  "vampire-spawn/Vampire Weakness": { d: ["-|L:Running Water|W:if it ends its turn in running water|self", "-|L:Sunlight|W:if it starts its turn in sunlight|self"] },
  "will-o-wisp/Vanish": { c: ["invisible=-|self"] },
}

/** Castings the text makes available only in a place or state, written from the text. */
const castingGates: Record<string, string> = { "night-hag/Nightmare Haunting": "While on the Ethereal Plane" }

/** Spells the text limits to another creature, written from the text. */
const spellLimits: Record<string, string> = { "unicorn/Unicorn’s Blessing": "The unicorn touches another creature with its horn" }

/** Features that cast spells in a way the shape does not hold, and why. */
const castingProse: Record<string, string> = {
  "shield-guardian/Spell Storing": "casts a spell stored by another caster, with that caster’s ability",
}

/**
 * Casting features whose spells are not in "At Will:" or "N/Day:" paragraphs, written from the text. Coven Magic:
 * each spell once per Long Rest, the shape of "1/Day Each". Hellfire Spellcasting: the ability and DC only, since
 * "casts Fireball … twice … It can replace one Fireball with Hold Monster … or Wall of Fire" fits no list.
 */
const coven = ["augury", "find-familiar", "identify", "locate-object", "scrying", "unseen-servant"].map((id) => ({ id }))
const castingByHand: Record<string, unknown> = {
  "green-hag/Coven Magic": { ability: "int", saveDc: 11, lists: [{ frequency: 1, each: true, spells: coven }], appliesWhen: "While within 30 feet of at least two hag allies" },
  "night-hag/Coven Magic": { ability: "int", saveDc: 14, lists: [{ frequency: 1, each: true, spells: coven }], appliesWhen: "While within 30 feet of at least two hag allies" },
  "sea-hag/Coven Magic": { ability: "int", saveDc: 11, lists: [{ frequency: 1, each: true, spells: coven }], appliesWhen: "While within 30 feet of at least two hag allies" },
  "pit-fiend/Hellfire Spellcasting": { ability: "cha", saveDc: 21 },
}
