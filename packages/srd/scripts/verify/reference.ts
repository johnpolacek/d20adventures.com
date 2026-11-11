import { existsSync } from "node:fs"
import { abilityIds, conditionIds, damageTypeIds, skillIds } from "../../src/schema/common"
import { dataPath, readData } from "../lib/data"
import { missingSentences, pageOf, pages, pageText, squash } from "../lib/official"
import type { Report } from "../lib/report"
import { hasUpstream, readOpen5e } from "../lib/sources"

// Official names of the six abilities, in the order the tables print them. The data ids must map to them one to one.
const abilityNames: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" }
const abilityIdOf = (name: string) => Object.keys(abilityNames).find((id) => abilityNames[id] === name)
const same = (a: string, b: string) => squash(a) === squash(b)
const lines = (text: string) => text.split("\n").map((line) => line.trim())

/** The text between two markers of a page range. */
function slice(text: string, start: string, end: string): string {
  const begin = text.indexOf(start)
  const stop = text.indexOf(end, begin + start.length)
  if (begin < 0 || stop < 0) throw new Error(`official text has no "${start}" ... "${end}"`)
  return text.slice(begin + start.length, stop)
}

/** The page whose text holds this line exactly. */
function pageWithLine(line: string): number {
  const found = pages.findIndex((page) => lines(page).includes(line))
  if (found < 0) throw new Error(`no page has the line "${line}"`)
  return found + 1
}

/** Alternating name and value lines, as the PDF text gives a table of one-line cells. Header lines are skipped. */
function pairs(text: string, skip: string[]): [string, string][] {
  const cells = lines(text).filter((line) => line && !skip.includes(line))
  if (cells.length % 2) throw new Error(`odd number of cells: ${cells.join(" | ")}`)
  const result: [string, string][] = []
  for (let i = 0; i < cells.length; i += 2) result.push([cells[i], cells[i + 1]])
  return result
}

/** Rows keyed by a line that is one of `keys`, with the following lines (wrapped cells) as the value. */
function rowsByKey(text: string, keys: string[]): Map<string, string> {
  const result = new Map<string, string>()
  let key = ""
  for (const line of lines(text)) {
    if (keys.includes(line)) {
      key = line
      result.set(key, "")
    } else if (key && line) result.set(key, `${result.get(key)} ${line}`.trim())
  }
  return result
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join() === [...b].sort().join()

/** Coverage both ways between official names and data names. */
function coverage(label: string, official: string[], data: string[]): string[] {
  const failures: string[] = []
  for (const name of official) if (!data.includes(name)) failures.push(`${label}: official "${name}" is missing from the data`)
  for (const name of data) if (!official.includes(name)) failures.push(`${label}: data "${name}" is not in the official text`)
  if (new Set(data).size !== data.length) failures.push(`${label}: duplicate names in the data`)
  return failures
}

const dehyphen = (text: string) => text.replace(/(\w)-\s+(\w)/g, "$1$2").replace(/\s+/g, " ")

export default function verify(report: Report) {
  const abilities = readData("abilities")
  const skills = readData("skills")
  const conditions = readData("conditions")
  const damageTypes = readData("damage-types")
  const languages = readData("languages")
  const alignments = readData("alignments")
  const schools = readData("magic-schools")

  // ---- Official tables, parsed here and not by the builder ----
  const abilityTable = pairs(slice(pages[pageWithLine("Ability Descriptions") - 1], "Score Measures …", "Ability Scores"), [])
  const abilityPage = pageWithLine("Ability Descriptions")
  const checkPage = pageWithLine("Ability Check Examples")
  const savePage = pageWithLine("Saving Throw Examples")
  const names = Object.values(abilityNames)
  const checkRows = rowsByKey(slice(pages[checkPage - 1], "Make a Check To …", "Proficiency Bonus"), names)
  const saveRows = rowsByKey(slice(pages[savePage - 1], "Make a Save To …", "Proficiency Bonus"), names)

  const skillsPage = pageWithLine("Skill List") // the Skills table is set at the foot of the next lines of this page
  const skillCells = lines(pages[skillsPage - 1].slice(pages[skillsPage - 1].indexOf("Skills\nSkill\nAbility\nExample Uses\n") + "Skills\nSkill\nAbility\nExample Uses\n".length)).filter(Boolean)
  const skillTable: { name: string; ability: string; uses: string }[] = []
  for (let i = 0; i < skillCells.length; i += 3) skillTable.push({ name: skillCells[i], ability: skillCells[i + 1], uses: skillCells[i + 2] })

  // ---- Abilities ----
  {
    const failures = coverage(
      "abilities",
      abilityTable.map(([name]) => name),
      abilities.map((entry) => entry.name)
    )
    if (abilityTable.length !== 6) failures.push(`the official Ability Descriptions table has ${abilityTable.length} rows, not 6`)
    for (const [name] of abilityTable) {
      if (!checkRows.has(name)) failures.push(`${name}: no row in the official Ability Check Examples table`)
      if (!saveRows.has(name)) failures.push(`${name}: no row in the official Saving Throw Examples table`)
    }
    report.check("reference: abilities", "names match the three official ability tables, 6 official", 6 + abilities.length, failures)
  }
  {
    const failures: string[] = []
    if (
      !sameSet(
        abilities.map((entry) => entry.id),
        [...abilityIds]
      )
    )
      failures.push(`ability ids ${abilities.map((entry) => entry.id)} are not the common.ts enum exactly`)
    let total = 1
    for (const entry of abilities) {
      const name = abilityNames[entry.id]
      const measures = abilityTable.find(([row]) => row === name)?.[1]
      const own = `${entry.id}`
      total += 6
      if (entry.name !== name) failures.push(`${own}: name "${entry.name}" is not "${name}"`)
      if (measures === undefined || !same(entry.measures, measures)) failures.push(`${own}: measures "${entry.measures}" differs from official "${measures}"`)
      if (!same(entry.checkExamples, checkRows.get(name) ?? "")) failures.push(`${own}: checkExamples "${entry.checkExamples}" differs from official "${checkRows.get(name)}"`)
      if (!same(entry.saveExamples, saveRows.get(name) ?? "")) failures.push(`${own}: saveExamples "${entry.saveExamples}" differs from official "${saveRows.get(name)}"`)
      const official = skillTable.filter((skill) => skill.ability === name).map((skill) => skill.name)
      const listed = (entry.skills ?? []).map((id: string) => skills.find((skill) => skill.id === id)?.name)
      if (!sameSet(listed, official)) failures.push(`${own}: skills ${listed} differ from the official Skills table ${official}`)
      const pages3 = [pageOf(`${name} ${measures}`), pageOf(`${name} ${checkRows.get(name)}`, abilityPage), pageOf(`${name} ${saveRows.get(name)}`, abilityPage)]
      if (entry.page !== abilityPage || pages3[0] !== abilityPage) failures.push(`${own}: page ${entry.page}, the official table starts on ${abilityPage}`)
      if (pages3[1] !== checkPage || pages3[2] !== savePage) failures.push(`${own}: check or save example row not on the expected pages`)
    }
    report.check("reference: abilities", "every field equals the official text, ids equal the enum", total, failures)
  }

  // ---- Skills ----
  {
    const failures = coverage(
      "skills",
      skillTable.map((skill) => skill.name),
      skills.map((entry) => entry.name)
    )
    if (skillTable.length !== 18) failures.push(`the official Skills table has ${skillTable.length} rows, not 18`)
    report.check("reference: skills", "names match the official Skills table, 18 official", skillTable.length + skills.length, failures)
  }
  {
    const failures: string[] = []
    if (
      !sameSet(
        skills.map((entry) => entry.id),
        [...skillIds]
      )
    )
      failures.push("skill ids are not the common.ts enum exactly")
    for (const entry of skills) {
      const row = skillTable.find((skill) => skill.name === entry.name)
      if (!row) continue
      if (abilityIdOf(row.ability) !== entry.ability) failures.push(`${entry.id}: ability ${entry.ability}, official ${row.ability}`)
      if (!same(entry.exampleUses, row.uses)) failures.push(`${entry.id}: exampleUses "${entry.exampleUses}" differs from official "${row.uses}"`)
      if (entry.page !== skillsPage) failures.push(`${entry.id}: page ${entry.page}, the Skills table is on ${skillsPage}`)
      if (pageOf(`${row.name} ${row.ability} ${row.uses}`) !== skillsPage) failures.push(`${entry.id}: row not found on page ${skillsPage}`)
    }
    report.check("reference: skills", "every field equals the official text, ids equal the enum", skills.length * 3 + 1, failures)
  }

  // ---- Conditions ----
  const glossary = lines(slice(pageText(179), "This glossary defines these conditions:", "A condition doesn’t stack")).filter(Boolean)
  const headings = pages.flatMap((page, index) =>
    lines(page)
      .filter((line) => line.endsWith(" [Condition]"))
      .map((line) => ({ name: line.replace(" [Condition]", ""), page: index + 1 }))
  )
  /** The glossary entry of a condition: the heading, the opening sentence, then one tab-led paragraph per effect. */
  function block(name: string, page: number) {
    const all = lines(pages[page - 1])
    const start = all.indexOf(`${name} [Condition]`)
    const body: string[] = []
    const raw = pages[page - 1].split("\n")
    for (let i = start + 1; i < raw.length; i++) {
      if (body.length && !raw[i].startsWith("\t") && /^[A-Z][A-Za-z’ ]+( \[[^\]]+\])?$/.test(raw[i].trim()) && body.at(-1)?.trim().endsWith(".")) break
      body.push(raw[i])
    }
    const intro: string[] = []
    const effects: string[][] = []
    for (const line of body) {
      if (line.startsWith("\t")) effects.push([line.trim()])
      else if (effects.length) effects.at(-1)?.push(line.trim())
      else if (line.trim()) intro.push(line.trim())
    }
    return { intro: dehyphen(intro.join(" ")), effects: effects.map((effect) => dehyphen(effect.join(" ")).trim()) }
  }
  {
    const failures = coverage(
      "conditions",
      glossary,
      conditions.map((entry) => entry.name)
    )
    failures.push(
      ...coverage(
        "conditions (headings)",
        headings.map((heading) => heading.name),
        conditions.map((entry) => entry.name)
      )
    )
    if (glossary.length !== 15 || headings.length !== 15) failures.push(`official glossary lists ${glossary.length} conditions and has ${headings.length} headings, not 15`)
    report.check("reference: conditions", "names match the official glossary list and headings, 15 official", glossary.length + headings.length + conditions.length, failures)
  }
  {
    const failures: string[] = []
    if (
      !sameSet(
        conditions.map((entry) => entry.id),
        [...conditionIds]
      )
    )
      failures.push("condition ids are not the common.ts enum exactly")
    let total = 1
    for (const entry of conditions) {
      const heading = headings.find((candidate) => candidate.name === entry.name)
      if (!heading) continue
      const official = block(entry.name, heading.page)
      total += 5
      if (entry.page !== heading.page) failures.push(`${entry.id}: page ${entry.page}, heading on ${heading.page}`)
      if (!same(entry.description, [official.intro, ...official.effects].join(" "))) failures.push(`${entry.id}: description differs from the official entry`)
      const effects = official.effects.map((text) => ({ name: text.slice(0, text.indexOf(". ")), text: text.slice(text.indexOf(". ") + 2) }))
      if (entry.effects.length !== effects.length) failures.push(`${entry.id}: ${entry.effects.length} effects, official ${effects.length}`)
      else
        entry.effects.forEach((effect: { name: string; text: string }, index: number) => {
          total += 2
          if (effect.name !== effects[index].name) failures.push(`${entry.id}: effect ${index} named "${effect.name}", official "${effects[index].name}"`)
          if (!same(effect.text, effects[index].text)) failures.push(`${entry.id}: effect "${effect.name}" text differs from the official text`)
        })
      if (!same(entry.description.split("\n")[0], official.intro)) failures.push(`${entry.id}: opening sentence differs`)
      const includes = effects.flatMap((effect) => {
        const match = effect.text.match(/^You have the ([A-Z][a-z]+)(?: and ([A-Z][a-z]+))? conditions?/)
        return match ? [match[1], match[2]].filter((word): word is string => Boolean(word)).map((word) => word.toLowerCase()) : []
      })
      if (!sameSet(entry.includes ?? [], includes)) failures.push(`${entry.id}: includes ${entry.includes ?? []}, official text gives ${includes}`)
      if (entry.id !== "exhaustion" && entry.exhaustion) failures.push(`${entry.id}: has exhaustion numbers`)
    }
    report.check("reference: conditions", "page, description, every effect and the conditions each includes equal the official text", total, failures)
  }
  {
    // Exhaustion numbers, read from the official sentences with their own patterns.
    const failures: string[] = []
    const entry = conditions.find((candidate) => candidate.id === "exhaustion")
    const page = headings.find((heading) => heading.name === "Exhaustion")?.page ?? 0
    const text = [block("Exhaustion", page).intro, ...block("Exhaustion", page).effects].join(" ")
    const expected = {
      deathLevel: Number(text.match(/You die if your Exhaustion level is (\d+)/)?.[1]),
      d20TestPenaltyPerLevel: Number(text.match(/the roll is reduced by (\d+) times your Exhaustion level/)?.[1]),
      speedReductionPerLevel: Number(text.match(/Speed is reduced by a number of feet equal to (\d+) times your Exhaustion level/)?.[1]),
      levelsRemovedPerLongRest: Number(text.match(/Finishing a Long Rest removes (\d+) of your Exhaustion levels/)?.[1]),
    }
    for (const [key, value] of Object.entries(expected)) if (!Number.isInteger(value)) failures.push(`official text gave no ${key}`)
    if (JSON.stringify(entry?.exhaustion) !== JSON.stringify(expected)) failures.push(`exhaustion ${JSON.stringify(entry?.exhaustion)} differs from official ${JSON.stringify(expected)}`)
    if (!/each time you receive it, you gain 1 Exhaustion level/i.test(text)) failures.push("official text does not say each receipt adds 1 level")
    report.check("reference: conditions", "exhaustion numbers equal the official text", 5, failures)
  }

  // ---- Damage types ----
  const damagePage = pages.findIndex((page) => page.includes("Damage Types\nType\nExamples\n")) + 1
  const damageRows = pairs(slice(pageText(damagePage), "Damage Types\nType\nExamples\n", "Darkness\n").replace(/Type\nExamples\n/g, ""), [])
  {
    const failures = coverage(
      "damage types",
      damageRows.map(([name]) => name),
      damageTypes.map((entry) => entry.name)
    )
    if (damageRows.length !== 13) failures.push(`the official table has ${damageRows.length} rows, not 13`)
    report.check("reference: damage types", "names match the official table, 13 official", damageRows.length + damageTypes.length, failures)
  }
  {
    const failures: string[] = []
    if (
      !sameSet(
        damageTypes.map((entry) => entry.id),
        [...damageTypeIds]
      )
    )
      failures.push("damage type ids are not the common.ts enum exactly")
    for (const entry of damageTypes) {
      const row = damageRows.find(([name]) => name === entry.name)
      if (!row) continue
      if (entry.id !== entry.name.toLowerCase()) failures.push(`${entry.id}: id does not match the name`)
      if (!same(entry.examples, row[1])) failures.push(`${entry.id}: examples "${entry.examples}" differ from official "${row[1]}"`)
      if (entry.page !== damagePage || pageOf(`${row[0]} ${row[1]}`, damagePage) !== damagePage) failures.push(`${entry.id}: page ${entry.page}, official table on ${damagePage}`)
    }
    report.check("reference: damage types", "every field equals the official text, ids equal the enum", damageTypes.length * 3 + 1, failures)
  }

  // ---- Languages ----
  const langPage = pageWithLine("Standard Languages")
  const standardCells = lines(slice(pages[langPage - 1], "Standard Languages\n1d12\nLanguage\n", "The Rare Languages table")).filter(Boolean)
  const standard: { name: string; roll: string }[] = []
  for (let i = 0; i < standardCells.length; i += 2) standard.push({ roll: standardCells[i], name: standardCells[i + 1] })
  const rareCells = lines(slice(pages[langPage - 1], "Rare Languages\nLanguage\nLanguage\n", "*Primordial includes")).filter(Boolean)
  const rare = rareCells.map((name) => name.replace("*", ""))
  const footnote = dehyphen(slice(pages[langPage - 1], "*Primordial includes", "Step 3: Ability Scores").replace(/^/, "Primordial includes")).trim()
  {
    const official = [...standard.map((row) => row.name), ...rare]
    const failures = coverage(
      "languages",
      official,
      languages.map((entry) => entry.name)
    )
    if (standard.length !== 10 || rare.length !== 9) failures.push(`official tables hold ${standard.length} standard and ${rare.length} rare languages, not 10 and 9`)
    report.check("reference: languages", "names match the official tables, 10 standard and 9 rare official", official.length + languages.length, failures)
  }
  {
    const failures: string[] = []
    for (const entry of languages) {
      const row = standard.find((candidate) => candidate.name === entry.name)
      const isRare = rare.includes(entry.name)
      if (entry.rarity !== (row ? "standard" : "rare") || (row && isRare)) failures.push(`${entry.id}: rarity ${entry.rarity} does not match the official table`)
      const range = row && row.roll !== "—" ? row.roll.split("–").map(Number) : undefined
      const expected = range ? { min: range[0], max: range[1] ?? range[0] } : undefined
      if (JSON.stringify(entry.roll) !== JSON.stringify(expected)) failures.push(`${entry.id}: roll ${JSON.stringify(entry.roll)}, official ${JSON.stringify(expected)}`)
      if (entry.page !== langPage) failures.push(`${entry.id}: page ${entry.page}, tables on ${langPage}`)
      const footnoted = entry.name === "Primordial"
      if (footnoted ? !entry.note || !same(entry.note, footnote) : entry.note !== undefined)
        failures.push(`${entry.id}: note ${entry.note === undefined ? "absent" : "present"} does not match the official footnote`)
      const dialects = footnoted ? ["Aquan", "Auran", "Ignan", "Terran"] : []
      if (!sameSet(entry.dialects ?? [], dialects)) failures.push(`${entry.id}: dialects ${entry.dialects ?? []}, official ${dialects}`)
    }
    // The dialect names must be the ones the footnote prints.
    if (!/Aquan, Auran, Ignan, and Terran dialects/.test(footnote)) failures.push("official footnote does not name Aquan, Auran, Ignan and Terran")
    report.check("reference: languages", "rarity, d12 roll, note, dialects and page equal the official text", languages.length * 5 + 1, failures)
  }

  // ---- Alignments ----
  const alignText = pageText(21, 22).replace(/Unaligned Creatures\n[\s\S]*?Sharks[\s\S]*?they are unaligned\.\n/, "")
  const sidebar = dehyphen(pageText(22).match(/Unaligned Creatures\n([\s\S]*?they are unaligned\.)\n(?=doing)/)?.[1] ?? "")
  const labels = [...alignText.matchAll(/^\t ?([A-Z][A-Za-z ]+) \(([A-Z]{1,2})\)\. /gm)]
  const paragraphs = labels.map((match, index) => {
    const end = index + 1 < labels.length ? (labels[index + 1].index as number) : alignText.indexOf("Step 5: Character Creation Details")
    return { name: match[1], abbreviation: match[2], text: dehyphen(alignText.slice((match.index as number) + match[0].length, end)).trim() }
  })
  {
    const failures = coverage(
      "alignments",
      [...paragraphs.map((paragraph) => paragraph.name), "Unaligned"],
      alignments.map((entry) => entry.name)
    )
    if (paragraphs.length !== 9) failures.push(`official text describes ${paragraphs.length} alignments, not 9`)
    if (!sidebar) failures.push("official Unaligned Creatures sidebar not found")
    report.check("reference: alignments", "names match the official text, 9 alignments and Unaligned official", paragraphs.length + 1 + alignments.length, failures)
  }
  {
    const failures: string[] = []
    let total = 0
    for (const entry of alignments) {
      total += 5
      const official = paragraphs.find((paragraph) => paragraph.name === entry.name)
      if (entry.name === "Unaligned") {
        if (!same(entry.description, sidebar)) failures.push(`${entry.id}: description differs from the sidebar`)
        if (entry.abbreviation || entry.order || entry.morality) failures.push(`${entry.id}: Unaligned has no abbreviation, order or morality in the text`)
        if (entry.page !== pageOf(sidebar)) failures.push(`${entry.id}: page ${entry.page}, sidebar on ${pageOf(sidebar)}`)
        continue
      }
      if (!official) continue
      if (entry.abbreviation !== official.abbreviation) failures.push(`${entry.id}: abbreviation ${entry.abbreviation}, official ${official.abbreviation}`)
      if (!same(entry.description, official.text)) failures.push(`${entry.id}: description differs from the official paragraph`)
      const words = entry.name.toLowerCase().split(" ")
      const order = words.length === 2 ? words[0] : "neutral"
      const morality = words.length === 2 ? words[1] : "neutral"
      if (entry.order !== order || entry.morality !== morality) failures.push(`${entry.id}: order/morality ${entry.order}/${entry.morality}, name reads ${order}/${morality}`)
      const first = official.text.split(" ").slice(0, 10).join(" ")
      if (entry.page !== pageOf(`${official.name} (${official.abbreviation}). ${first}`))
        failures.push(`${entry.id}: page ${entry.page}, text begins on ${pageOf(`${official.name} (${official.abbreviation}). ${first}`)}`)
    }
    report.check("reference: alignments", "abbreviation, axes, description and page equal the official text", total, failures)
  }

  // ---- Magic schools ----
  const schoolPage = pageWithLine("Schools of Magic")
  const schoolText = slice(pages[schoolPage - 1], "Schools of Magic\nSchool\nTypical Effects\n", "Class Spell Lists")
  const schoolRows = new Map<string, string>()
  let current = ""
  for (const line of lines(schoolText).filter(Boolean)) {
    if (/^[A-Z][a-z]+$/.test(line)) {
      current = line
      schoolRows.set(current, "")
    } else schoolRows.set(current, `${schoolRows.get(current)} ${line}`.trim())
  }
  {
    const failures = coverage(
      "magic schools",
      [...schoolRows.keys()],
      schools.map((entry) => entry.name)
    )
    if (schoolRows.size !== 8) failures.push(`the official table has ${schoolRows.size} rows, not 8`)
    const expectedIds = ["abjuration", "conjuration", "divination", "enchantment", "evocation", "illusion", "necromancy", "transmutation"]
    if (
      !sameSet(
        schools.map((entry) => entry.id),
        expectedIds
      )
    )
      failures.push("school ids are not the eight lowercase school names")
    report.check("reference: magic schools", "names match the official table, 8 official", schoolRows.size + schools.length + 1, failures)
  }
  {
    const failures: string[] = []
    for (const entry of schools) {
      const official = schoolRows.get(entry.name)
      if (entry.id !== entry.name.toLowerCase()) failures.push(`${entry.id}: id does not match the name`)
      if (official === undefined || !same(entry.typicalEffects, official)) failures.push(`${entry.id}: typicalEffects "${entry.typicalEffects}" differ from official "${official}"`)
      if (entry.page !== schoolPage) failures.push(`${entry.id}: page ${entry.page}, table on ${schoolPage}`)
    }
    report.check("reference: magic schools", "every field equals the official text", schools.length * 3, failures)
  }

  // ---- Prose ----
  {
    const failures: string[] = []
    let total = 0
    const prose: [string, string][] = [
      ...abilities.flatMap(
        (entry) =>
          [
            [entry.id, entry.measures],
            [entry.id, entry.checkExamples],
            [entry.id, entry.saveExamples],
          ] as [string, string][]
      ),
      ...skills.map((entry) => [entry.id, entry.exampleUses] as [string, string]),
      ...conditions.flatMap((entry) => [[entry.id, entry.description], ...entry.effects.map((effect: { text: string }) => [entry.id, effect.text])] as [string, string][]),
      ...damageTypes.map((entry) => [entry.id, entry.examples] as [string, string]),
      ...languages.filter((entry) => entry.note).map((entry) => [entry.id, entry.note] as [string, string]),
      ...alignments.filter((entry) => entry.id === "unaligned").map((entry) => [entry.id, entry.description] as [string, string]),
      ...schools.map((entry) => [entry.id, entry.typicalEffects] as [string, string]),
    ]
    for (const [id, text] of prose) {
      total++
      const text2 = text.length < 12 ? "" : text
      const missing = missingSentences(text2)
      if (missing.length) failures.push(`${id}: not official: ${missing.join(" / ")}`)
      if (squash(text).length && !squash(text2) && !pages.some((page) => squash(page).includes(squash(text)))) failures.push(`${id}: short text "${text}" is not in the official text`)
    }
    // The Neutral paragraph is split by a sidebar in the PDF, so alignments are compared with the page text from which the sidebar is removed.
    for (const entry of alignments.filter((candidate) => candidate.id !== "unaligned")) {
      total++
      for (const sentence of entry.description.split(/(?<=[.!?])\s+/)) if (!squash(alignText).includes(squash(sentence))) failures.push(`${entry.id}: not official: ${sentence}`)
    }
    report.check("reference: prose", "every description and table cell is the official wording", total, failures)
  }

  // ---- References ----
  {
    const failures: string[] = []
    let total = 0
    const skillIdSet = new Set(skills.map((entry) => entry.id))
    const abilityIdSet = new Set(abilities.map((entry) => entry.id))
    const conditionIdSet = new Set(conditions.map((entry) => entry.id))
    for (const entry of abilities)
      for (const id of entry.skills ?? []) {
        total++
        if (!skillIdSet.has(id)) failures.push(`${entry.id}: skill ${id} does not exist`)
        else if (skills.find((skill) => skill.id === id)?.ability !== entry.id) failures.push(`${entry.id}: lists ${id}, which belongs to another ability`)
      }
    for (const entry of skills) {
      total++
      if (!abilityIdSet.has(entry.ability)) failures.push(`${entry.id}: ability ${entry.ability} does not exist`)
      else if (!abilities.find((ability) => ability.id === entry.ability)?.skills?.includes(entry.id)) failures.push(`${entry.id}: not listed under ${entry.ability}`)
    }
    for (const entry of conditions)
      for (const id of entry.includes ?? []) {
        total++
        if (!conditionIdSet.has(id)) failures.push(`${entry.id}: includes ${id}, which does not exist`)
      }
    report.check("reference: references", "every id inside the reference data resolves, and ability skills and skill abilities agree", total, failures)
  }

  // ---- Open5e second opinion ----
  if (hasUpstream("open5e")) {
    const open = (name: string) => new Map(readOpen5e(name).map((row) => [row.fields.describes as string, row.fields.desc as string]))
    const failures: string[] = []
    const waived: string[] = []
    let total = 0
    const compare = (kind: string, theirs: Map<string, string>, ours: Map<string, string>) => {
      for (const [id, ours_] of ours) {
        total++
        const other = theirs.get(id)
        if (other === undefined) failures.push(`${kind} ${id}: not in Open5e`)
        else if (!same(other, ours_)) waived.push(`${kind} ${id}: Open5e wording differs, the official text settles it`)
      }
      for (const id of theirs.keys()) if (!ours.has(id)) failures.push(`${kind} ${id}: Open5e has it, our data does not`)
    }
    compare("ability", open("AbilityDescription"), new Map(abilities.map((entry) => [entry.id, entry.measures])))
    compare("skill", open("SkillDescription"), new Map(skills.map((entry) => [entry.id, entry.exampleUses])))
    compare("condition", open("ConditionDescription"), new Map(conditions.map((entry) => [entry.id, entry.description])))
    compare("damage type", open("DamageTypeDescription"), new Map(damageTypes.map((entry) => [entry.id, entry.examples])))
    compare("alignment", open("AlignmentDescription"), new Map(alignments.filter((entry) => entry.id !== "unaligned").map((entry) => [entry.id, entry.description])))
    report.crossCheck("reference: open5e", "texts agree with Open5e, or the official text settles it", total, failures, waived)
  } else report.skip("reference: open5e", "texts agree with Open5e, or the official text settles it")

  // ---- Data files ----
  {
    const failures: string[] = []
    for (const name of ["abilities", "skills", "conditions", "damage-types", "languages", "alignments", "magic-schools"]) if (!existsSync(dataPath(name))) failures.push(`${name}.json missing`)
    report.check("reference: files", "all seven data files exist", 7, failures)
  }
}
