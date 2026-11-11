import type { Alignment, Condition, Exhaustion, Language } from "../../src/schema/reference"
import { abilitySchema, alignmentSchema, conditionSchema, damageTypeSchema, languageSchema, magicSchoolSchema, skillSchema } from "../../src/schema/reference"
import { applyOverrides, toId, writeData } from "../lib/data"
import { pageOf, pages } from "../lib/official"
import { readBase } from "../lib/sources"
import { conditionOverrides, languageOverrides } from "../overrides/reference"

/** The SRD prints typographic apostrophes. */
const typographic = (text: string) => text.replace(/'/g, "’").trim()

/** The page where `text` first appears. A missing text is a build error, so a page is never guessed. */
function pageFor(text: string, from = 1): number {
  const page = pageOf(text, from)
  if (!page) throw new Error(`Not in the official text: ${text}`)
  return page
}

/** Rows of a two column table the PDF text gives line by line: a key line, then the value lines until the next key line. */
function rows(text: string, isKey: (line: string) => boolean): Map<string, string> {
  const result = new Map<string, string>()
  let key = ""
  for (const line of text.split("\n").map((line) => line.trim())) {
    if (isKey(line)) {
      key = line
      result.set(key, "")
    } else if (key && line) result.set(key, `${result.get(key)} ${line}`.trim())
  }
  return result
}

/** The lines of a page between two markers. */
function between(page: number, start: string, end: string, from = 0): string {
  const text = pages[page - 1]
  const begin = text.indexOf(start, from)
  const stop = text.indexOf(end, begin + start.length)
  if (begin < 0 || stop < 0) throw new Error(`Page ${page}: no "${start}" ... "${end}"`)
  return text.slice(begin + start.length, stop)
}

function abilities() {
  const base = readBase("Ability-Scores")
  const names = base.map((entry) => entry.full_name as string)
  const isName = (line: string) => names.includes(line)
  const measuresPage = pageFor("Ability Descriptions Ability Score Measures")
  const checkPage = pageFor("Ability Check Examples Ability Make a Check To")
  const savePage = pageFor("Saving Throw Examples Ability Make a Save To")
  const checks = rows(between(checkPage, "Make a Check To …", "Proficiency Bonus"), isName)
  const saves = rows(between(savePage, "Make a Save To …", "Proficiency Bonus"), isName)
  const measures = rows(between(measuresPage, "Score Measures …", "Ability Scores"), isName)
  return base.map((entry) => {
    const name = entry.full_name as string
    const skills = (entry.skills as { index: string }[]).map((skill) => skill.index)
    return {
      id: entry.index,
      name,
      page: pageFor(`${name} ${measures.get(name)}`),
      measures: measures.get(name),
      checkExamples: checks.get(name),
      saveExamples: saves.get(name),
      ...(skills.length ? { skills } : {}),
    }
  })
}

function skills() {
  const abilityNames = new Map(readBase("Ability-Scores").map((entry) => [entry.index as string, entry.full_name as string]))
  return readBase("Skills").map((entry) => ({
    id: entry.index,
    name: entry.name,
    page: pageFor(`${entry.name} ${abilityNames.get(entry.ability_score.index)} ${entry.description}`),
    ability: entry.ability_score.index,
    exampleUses: typographic(entry.description),
  }))
}

const exhaustionOf = (effects: { name: string; text: string }[]): Exhaustion => {
  const text = (name: string) => effects.find((effect) => effect.name === name)?.text ?? ""
  const number = (source: string, pattern: RegExp) => {
    const match = source.match(pattern)
    if (!match) throw new Error(`Exhaustion: no ${pattern} in "${source}"`)
    return Number(match[1])
  }
  return {
    deathLevel: number(text("Exhaustion Levels"), /die if your Exhaustion level is (\d+)/),
    d20TestPenaltyPerLevel: number(text("D20 Tests Affected"), /reduced by (\d+) times/),
    speedReductionPerLevel: number(text("Speed Reduced"), /reduced by a number of feet equal to (\d+) times/),
    levelsRemovedPerLongRest: number(text("Removing Exhaustion Levels"), /removes (\d+) of your Exhaustion levels/),
  }
}

function conditions(): Condition[] {
  // Overrides replace whole descriptions, in the base source's own markup, so the parse below sees the official wording.
  const source = readBase("Conditions").map((entry) => ({ id: entry.index as string, name: entry.name as string, description: entry.description as string }))
  applyOverrides("conditions", source, conditionOverrides)
  const parsed = source.map((entry) => {
    const [intro, ...paragraphs] = typographic(entry.description).split("\n")
    const effects = paragraphs.map((paragraph) => {
      const match = paragraph.match(/^\*\*(.+?)\.\*\* (.+)$/)
      if (!match) throw new Error(`${entry.id}: cannot read effect "${paragraph}"`)
      return { name: match[1], text: match[2] }
    })
    return { id: entry.id, name: entry.name, intro, effects }
  })
  return parsed.map(({ id, name, intro, effects }) => {
    const includes = effects.flatMap((effect) => {
      const match = effect.text.match(/^You have the (\w+)(?: and (\w+))? conditions?/)
      return match ? [match[1], match[2]].filter(Boolean).map((word) => word.toLowerCase()) : []
    })
    return {
      id,
      name,
      page: pageFor(`${name} [Condition] ${intro}`),
      description: [intro, ...effects.map((effect) => `${effect.name}. ${effect.text}`)].join("\n"),
      effects,
      ...(includes.length ? { includes } : {}),
      ...(id === "exhaustion" ? { exhaustion: exhaustionOf(effects) } : {}),
    } as Condition
  })
}

function damageTypes() {
  return readBase("Damage-Types").map((entry) => ({
    id: entry.index,
    name: entry.name,
    page: pageFor(`${entry.name} ${entry.description}`),
    examples: typographic(entry.description),
  }))
}

function languages(): Language[] {
  const page = pageFor("Standard Languages 1d12 Language")
  const roll = rows(between(page, "Standard Languages\n1d12\nLanguage\n", "The Rare Languages table"), (line) => /^(—|\d+(–\d+)?)$/.test(line))
  const rolls = new Map([...roll].map(([key, name]) => [toId(name), key]))
  const parsed = readBase("Languages").map((entry) => ({
    id: entry.index as string,
    name: typographic(entry.name),
    page,
    rarity: entry.is_rare ? "rare" : "standard",
    ...(entry.note ? { note: typographic(entry.note) } : {}),
  }))
  applyOverrides("languages", parsed as { id: string }[], languageOverrides)
  return parsed.map((entry) => {
    const key = rolls.get(entry.id)
    const [min, max] = key && key !== "—" ? key.split("–").map(Number) : []
    return {
      ...entry,
      ...(min ? { roll: { min, max: max ?? min } } : {}),
      ...(entry.id === "primordial" ? { dialects: ["Aquan", "Auran", "Ignan", "Terran"] } : {}),
    } as Language
  })
}

function alignments(): Alignment[] {
  return readBase("Alignments").map((entry) => {
    const description = typographic(entry.description)
    if (entry.index === "unaligned") return { id: entry.index, name: entry.name, page: pageFor(description), description }
    const [order, morality] = (entry.index as string).split("-")
    return {
      id: entry.index,
      name: entry.name,
      // The Neutral paragraph is split by a sidebar, so the page is found from its opening words.
      page: pageFor(`${entry.name} (${entry.abbreviation}). ${description.split(" ").slice(0, 10).join(" ")}`),
      abbreviation: entry.abbreviation,
      order,
      morality: morality ?? "neutral",
      description,
    } as Alignment
  })
}

function magicSchools() {
  return readBase("Magic-Schools").map((entry) => ({
    id: entry.index,
    name: entry.name,
    page: pageFor(`${entry.name} ${entry.description}`, pageFor("Schools of Magic School Typical Effects")),
    typicalEffects: typographic(entry.description),
  }))
}

export default function build() {
  writeData("abilities", abilitySchema, abilities())
  writeData("skills", skillSchema, skills())
  writeData("conditions", conditionSchema, conditions())
  writeData("damage-types", damageTypeSchema, damageTypes())
  writeData("languages", languageSchema, languages())
  writeData("alignments", alignmentSchema, alignments())
  writeData("magic-schools", magicSchoolSchema, magicSchools())
}
