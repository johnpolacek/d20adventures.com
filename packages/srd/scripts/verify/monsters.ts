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
const saveWords: Record<string, string> = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" }
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
  const conditional: { kind: string; value?: string; condition: string }[] = []
  const damageList = (key: string, kind: string) => {
    if (!f.has(key)) return undefined
    const list: string[] = []
    for (const item of items(f.get(key) as string)) {
      if (damageWords.includes(item)) list.push(item.toLowerCase())
      else {
        const lead = /^(\w+) damage (.+)$/.exec(item)
        if (lead && damageWords.includes(lead[1])) conditional.push({ kind, value: lead[1].toLowerCase(), condition: lead[2] })
        else conditional.push({ kind, condition: item })
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
          if (m[2]) conditional.push({ kind: "condition-immunity", value: m[1].toLowerCase(), condition: m[2] })
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

const saveWord = "(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) Saving Throw: DC (\\d+)"
const outcomeAtStart = /^(Hit or Miss|Failure or Success|First Failure|Second Failure|Subsequent Failures|Hit|Miss|Failure|Success): /
const outcomeAnywhere = /(Failure or Success|First Failure|Second Failure|Subsequent Failures|Failure|Success): /g
const damageAt = /(\d+)(?: \((\d+)d(\d+)(?: ([+−–]) (\d+))?\))? (\w+ )?damage/g

/**
 * Damage parts, read sentence by sentence. A sentence that opens with an outcome label sets the outcome for the rest
 * of its paragraph. Damage in that first sentence is plain unless an "if" or "unless" clause follows it or it
 * replaces the part before it ("…, or 2 (1d4) … if the swarm is Bloodied"). Damage anywhere else is limited by its
 * whole sentence.
 */
function expectedDamage(paragraphs: string[]) {
  const out: { average: number; dice?: string; type?: string; on?: string; condition?: string; alternativeTo?: number }[] = []
  for (const paragraph of paragraphs) {
    let outcome: string | undefined
    const sentences = paragraph.split(/\. (?=[A-Z])/)
    for (const [n, raw] of sentences.entries()) {
      const sentence = n < sentences.length - 1 ? `${raw}.` : raw
      const label = outcomeAtStart.exec(sentence)
      if (label) outcome = toId(label[1])
      const parts = [...sentence.matchAll(damageAt)].filter((m) => m[2] || (m[6] && damageWords.includes(m[6].trim())))
      for (const [k, m] of parts.entries()) {
        const part: (typeof out)[number] = {
          average: Number(m[1]),
          dice: m[2] ? `${m[2]}d${m[3]}${m[4] ? ` ${m[4] === "+" ? "+" : "-"} ${m[5]}` : ""}` : undefined,
          type: m[6] && damageWords.includes(m[6].trim()) ? m[6].trim().toLowerCase() : undefined,
          on: outcome,
        }
        if (label) {
          const end = (m.index as number) + m[0].length
          const qualifier = /^ ((?:if|unless) [^.,—]+)/.exec(sentence.slice(end, parts[k + 1]?.index ?? sentence.length))
          if (qualifier) part.condition = qualifier[1]
          const previous = parts[k - 1]
          if (previous && /^(?:,? or |—or )$/.test(sentence.slice((previous.index as number) + previous[0].length, m.index))) part.alternativeTo = out.length - 1
        } else part.condition = sentence.trim()
        out.push(part)
      }
    }
  }
  return out
}

/** Each save: its ability and DC, who makes it, and the text of each outcome, staged outcomes kept apart. */
function expectedSaves(body: string) {
  const starts = [...body.matchAll(new RegExp(saveWord, "g"))]
  return starts.map((m, k) => {
    let end = starts[k + 1]?.index ?? body.length
    const breakAt = body.lastIndexOf("\n", end)
    if (k + 1 < starts.length && breakAt > (m.index as number)) end = breakAt
    const segment = body.slice((m.index as number) + m[0].length, end)
    const targets = segment.startsWith(".") ? undefined : /^(?: \([^)]*\))?, ([\s\S]*?)\.(?: |$)/.exec(segment)?.[1]
    const labels = [...segment.matchAll(outcomeAnywhere)]
    const staged = labels.some((label) => label[1] === "Second Failure" || label[1] === "Subsequent Failures")
    const clauses: Record<string, string> = {}
    for (const [i, label] of labels.entries()) {
      const key =
        label[1] === "Failure" ? (staged ? "firstFailure" : "failure") : label[1] === "Failure or Success" ? "failureOrSuccess" : toId(label[1]).replace(/-(\w)/g, (_, c: string) => c.toUpperCase())
      clauses[key] = squash(segment.slice((label.index as number) + label[0].length, labels[i + 1]?.index ?? segment.length))
    }
    return { ability: saveWords[m[1]], dc: Number(m[2]), targets: targets && squash(targets), ...clauses, half: /^halfdamage/.test(clauses.success ?? "") }
  })
}

/**
 * Conditions the text gives, read phrase by phrase: "the X condition" after a verb that gives it, "gains N
 * Exhaustion level", "exiting Prone". The words from the start of the phrase's clause must hold no precondition or
 * negation.
 */
function expectedConditions(body: string): string[] {
  const given = new Set<string>()
  const list = `(?:${conditionWords.join("|")})(?:(?:,? and |,? or |, )(?:${conditionWords.join("|")}))*`
  const forms = [new RegExp(`(?:\\bhas|\\bhave|\\bgains?|\\bgives? it|\\bgives? the target|\\bwith) the (${list}) conditions?\\b`, "g"), /\bgains? \d+ (Exhaustion) levels?\b/g, /\bexiting (Prone)\b/g]
  for (const form of forms) {
    for (const m of body.matchAll(form)) {
      let start = m.index as number
      while (start > 0 && !",.:;—(\n".includes(body[start - 1]) && !body.slice(0, start).endsWith(" but ")) start--
      const clause = body.slice(start, m.index)
      const words = clause.toLowerCase().split(/\s+/).filter(Boolean)
      if (words.some((word) => ["if", "while", "whenever", "unless", "until", "not"].includes(word) || word.endsWith("n’t")) || clause.includes("no longer")) continue
      if (["that", "who"].includes(words[words.length - 1])) continue
      for (const name of m[1].split(/,? and |,? or |, /)) given.add(name.toLowerCase())
    }
  }
  return [...given].sort()
}

/** The mechanics of one official feature, read from its own text. */
function expectedFeature(feature: OfficialFeature) {
  const { paren, paragraphs, body } = featureParts(feature)
  const uses: Record<string, unknown> = {}
  const rest: string[] = []
  for (const part of paren ? paren.split("; ") : []) {
    const day = /^(\d+)\/Day(?:, or (\d+)\/Day in Lair)?$/.exec(part)
    const roll = /^Recharge (\d)(?:–(\d))?$/.exec(part)
    if (day) uses.uses = { count: Number(day[1]), countInLair: day[2] ? Number(day[2]) : undefined, recharge: "long-rest" }
    else if (roll) uses.rechargeRoll = { min: Number(roll[1]), max: Number(roll[2] ?? roll[1]) }
    else if (part === "Recharge after a Short or Long Rest") uses.uses = { count: 1, recharge: "short-or-long-rest" }
    else rest.push(part)
  }
  if (rest.length) uses.note = rest.join("; ")
  const attackMatch = /(Melee or Ranged|Melee|Ranged) Attack Roll: ([+−]\d+)([^:]*?)(?:Hit|Miss|Hit or Miss):/.exec(body)
  const attack = attackMatch
    ? {
        kind: attackMatch[1] === "Melee or Ranged" ? "melee-or-ranged" : attackMatch[1].toLowerCase(),
        bonus: num(attackMatch[2]),
        reach: Number(/reach (\d+)/.exec(attackMatch[3])?.[1]) || undefined,
        range: /range (\d+)(?:\/(\d+))?/.exec(attackMatch[3]),
        bonusNote: /^ \(([^)]*)\)/.exec(attackMatch[3])?.[1],
      }
    : undefined
  const escapeDc = /escape DC (\d+)/.exec(body)
  // The soft join drops a hyphen at a line end before a lowercase letter, so "5-foot-\nwide" reads "5-footwide" here.
  const areaMatch = /(?:in an?|fills a) (\d+)-?foot(-long, (\d+)-foot-?wide Line|-radius, (\d+)-foot-?high Cylinder|-?radius Sphere| Cone| Cube| Emanation| Sphere)/.exec(body)
  const area = areaMatch
    ? {
        shape: areaMatch[2].split(" ").at(-1)?.toLowerCase(),
        size: Number(areaMatch[1]),
        width: areaMatch[3] ? Number(areaMatch[3]) : undefined,
        height: areaMatch[4] ? Number(areaMatch[4]) : undefined,
      }
    : undefined
  const spellLines = paragraphs.filter((paragraph) => /^(At Will|\d\/Day( Each)?): /.test(paragraph))
  return {
    uses,
    paragraphs,
    body,
    attack,
    damage: expectedDamage(paragraphs),
    saves: expectedSaves(body),
    conditions: expectedConditions(body),
    escape: escapeDc ? Number(escapeDc[1]) : undefined,
    area,
    spellLines,
  }
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
    let stagedInData = 0
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
          const want = expectedFeature(feature)
          total += 2
          // The whole text, ignoring layout, then paragraph by paragraph, then each sentence against the official text.
          if (squash(item.text) !== squash(want.body)) failures.push(`${own}: text differs from the official feature`)
          const paragraphs = item.text.split("\n").map(squash)
          if (!same(paragraphs, want.paragraphs.map(squash))) failures.push(`${own}: ${paragraphs.length} paragraphs, official ${want.paragraphs.length}, or their breaks differ`)
          prose++
          const missing = missingSentences(item.text)
          if (missing.length) proseFailures.push(`${own}: ${missing.join(" | ")}`)
          for (const key of ["uses", "rechargeRoll", "note"] as const) {
            total++
            if (!same(item[key], want.uses[key])) failures.push(`${own}: ${key} ${JSON.stringify(item[key])}, official ${JSON.stringify(want.uses[key])}`)
          }
          total++
          const attack = item.attack
          const wantAttack = want.attack && {
            kind: want.attack.kind,
            bonus: want.attack.bonus,
            reach: want.attack.reach,
            range: want.attack.range ? { normal: Number(want.attack.range[1]), long: want.attack.range[2] ? Number(want.attack.range[2]) : undefined } : undefined,
            bonusNote: want.attack.bonusNote,
          }
          if (!same(attack, wantAttack)) failures.push(`${own}: attack ${JSON.stringify(attack)}, official ${JSON.stringify(wantAttack)}`)
          // Every damage part with its outcome, condition and alternative. Conditions are compared ignoring layout.
          total++
          const damage = (item.damage ?? []).map((part) => ({ ...part, condition: part.condition && squash(part.condition) }))
          const wantDamage = want.damage.map((part) => ({ ...part, condition: part.condition && squash(part.condition) }))
          if (!same(damage, wantDamage)) failures.push(`${own}: damage ${JSON.stringify(item.damage)}, official ${JSON.stringify(want.damage)}`)
          // Every save with its ability, DC, targets and each outcome's text, staged outcomes counted one by one.
          total++
          const saves = (item.saves ?? []).map((save) => ({
            ability: save.ability,
            dc: save.dc,
            targets: save.targets && squash(save.targets),
            failure: save.failure && squash(save.failure),
            firstFailure: save.firstFailure && squash(save.firstFailure),
            secondFailure: save.secondFailure && squash(save.secondFailure),
            subsequentFailures: save.subsequentFailures && squash(save.subsequentFailures),
            success: save.success && squash(save.success),
            failureOrSuccess: save.failureOrSuccess && squash(save.failureOrSuccess),
            half: !!save.halfOnSuccess,
          }))
          if (!same(saves, want.saves)) failures.push(`${own}: saves ${JSON.stringify(item.saves)}, official ${JSON.stringify(want.saves)}`)
          for (const save of item.saves ?? []) stagedInData += (save.firstFailure ? 1 : 0) + (save.secondFailure ? 1 : 0) + (save.subsequentFailures ? 1 : 0)
          total += 3
          if (item.escapeDc !== want.escape) failures.push(`${own}: escape DC ${item.escapeDc}, official ${want.escape}`)
          if (!same(item.area, want.area)) failures.push(`${own}: area ${JSON.stringify(item.area)}, official ${JSON.stringify(want.area)}`)
          if (!same([...(item.conditions ?? [])].sort(), want.conditions)) failures.push(`${own}: conditions ${JSON.stringify(item.conditions)}, official ${JSON.stringify(want.conditions)}`)
          total++
          const lists = want.spellLines.map((line) => {
            const m = /^(At Will|(\d)\/Day( Each)?): (.*)$/.exec(line.trim()) as RegExpExecArray
            return {
              frequency: m[2] ? Number(m[2]) : "at-will",
              each: m[3] ? true : undefined,
              spells: items(m[4]).map((spell) => {
                const s = /^(.+?)(?: \((.+)\))?$/.exec(spell) as RegExpExecArray
                return { id: toId(s[1]), note: s[2] }
              }),
            }
          })
          const gotLists = item.spellcasting?.lists.map((list) => ({ frequency: list.frequency, each: list.each, spells: list.spells.map((spell) => ({ id: spell.id, note: spell.note })) }))
          if (!same(gotLists, lists.length ? lists : undefined)) failures.push(`${own}: spell lists ${JSON.stringify(gotLists)}, official ${JSON.stringify(lists)}`)
          if (item.spellcasting) {
            total++
            const ability = /using (\w+) as (?:the )?spellcasting ability/.exec(want.body)
            const dc = /spell save DC (\d+)/.exec(want.body)
            const bonus = /([+−]\d+) to hit with spell attacks/.exec(want.body)
            const wantCasting = { ability: ability && saveWords[ability[1]], saveDc: dc ? Number(dc[1]) : undefined, attackBonus: bonus ? num(bonus[1]) : undefined }
            const gotCasting = { ability: item.spellcasting.ability, saveDc: item.spellcasting.saveDc, attackBonus: item.spellcasting.attackBonus }
            if (!same(gotCasting, wantCasting)) failures.push(`${own}: spellcasting ${JSON.stringify(gotCasting)}, official ${JSON.stringify(wantCasting)}`)
          }
        }
      }
      total++
      const legendary = monster.legendaryActions
      if (!!legendary !== !!block.legendaryIntro) failures.push(`${monster.id}: legendary actions ${legendary ? "present" : "absent"} in the data only`)
      else if (legendary && block.legendaryIntro) {
        const uses = /^Legendary Action Uses: (\d+)(?: \((\d+) in Lair\))?\./.exec(block.legendaryIntro)
        if (!uses || legendary.uses !== Number(uses[1]) || legendary.usesInLair !== (uses[2] ? Number(uses[2]) : undefined))
          failures.push(`${monster.id}: legendary uses ${legendary.uses}/${legendary.usesInLair}, official "${block.legendaryIntro.slice(0, 40)}"`)
        if (squash(legendary.text) !== squash(block.legendaryIntro)) failures.push(`${monster.id}: legendary text differs from the official paragraph`)
        prose++
        const missing = missingSentences(legendary.text)
        if (missing.length) proseFailures.push(`${monster.id} legendary text: ${missing.join(" | ")}`)
      }
    }
    // Every staged outcome label in the chapter is a typed stage in the data.
    total++
    const chapterText = soft(lines.map((line) => line.text))
    const stagedInText = (chapterText.match(/(?:First Failure|Second Failure|Subsequent Failures): /g) ?? []).length + (chapterText.match(/\.\s+Failure: [^:]*?Second Failure: /g) ?? []).length
    if (stagedInData !== stagedInText) failures.push(`the data holds ${stagedInData} staged failure clauses, the official text prints ${stagedInText}`)
    for (const failure of failures) unsettled.add(failure.split(" ")[0].replace(/:$/, ""))
    report.check(
      "monsters",
      "feature names, text and paragraphs, uses, attacks, damage parts, saves and their stages, conditions, escape DCs, areas and spells equal the official text",
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
    const byRule = new Map(rules.map((rule) => [rule.id, rule]))
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
    total++
    if (rules.length !== 3) failures.push(`monster-rules has ${rules.length} entries, the chapter prints 3 tables`)
    if (wantXp.length !== 34 || wantPb.length !== 8 || wantDice.length !== 6) failures.push(`the official tables read ${wantXp.length}, ${wantPb.length} and ${wantDice.length} rows, not 34, 8 and 6`)
    report.check("monster rules", "XP by CR (34 rows), PB by CR (8) and Hit Dice by Size (6) equal the official tables", total, failures)
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
