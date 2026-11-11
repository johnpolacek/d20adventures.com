import { existsSync } from "node:fs"
import type { Spell, SpellStatBlock } from "../../src/schema/spells"
import { dataPath, readData, toId } from "../lib/data"
import { missingSentences, pages, pageText, squash } from "../lib/official"
import type { Report } from "../lib/report"
import { readOpen5e } from "../lib/sources"

const category = "spells"
const officialCount = 339
const abilityNames: Record<string, string> = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" }
const schoolNames = ["Abjuration", "Conjuration", "Divination", "Enchantment", "Evocation", "Illusion", "Necromancy", "Transmutation"]
const typeNames = ["Acid", "Bludgeoning", "Cold", "Fire", "Force", "Lightning", "Necrotic", "Piercing", "Poison", "Psychic", "Radiant", "Slashing", "Thunder"]
const capital = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)
const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`

/**
 * Spells whose damage the text states in a form no single roll can hold. The check that every "XdY Type damage" in
 * the text is in the data skips these, and says why every run.
 */
const irregularDamage: Record<string, string> = {
  wish: "the stress damage on the caster is 1d10 per level of each spell cast later, so no fixed roll holds it",
}

/**
 * Where the PDF text breaks a sentence around a stat block and sets the rest elsewhere, the phrase that resumes it.
 * A data sentence is split there before it is looked for, and each part must be in the official text.
 */
const columnBreaks: Record<string, string> = {
  "antilife-shell": "or make attacks with Ranged or Reach weapons",
  "antipathy-sympathy": "Wisdom saving throw to end the effect",
  "find-the-path": "face a choice of paths",
}

/** Spells where the official text contradicts itself between the spell's header and the class spell lists. The data follows the header. */
const listConflicts = new Set(["flaming-sphere", "phantasmal-force", "mind-spike"])

type Header = { name: string; page: number; levelLine: string; castingTime: string; range: string; components: string; duration: string; body: Line[] }
type Line = { text: string; page: number }

const join = (parts: string[]) =>
  parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/([a-z])-\n([a-z])/g, "$1$2")
    .replace(/—\n/g, "—")
    .replace(/\n/g, " ")

/**
 * Parse every spell of the Spells chapter from the official text: the heading, the level line, the four header
 * fields, and the body up to the next spell. Written apart from the builder, which takes its header fields from the
 * base source.
 */
function officialSpells(): Header[] {
  const lines: Line[] = []
  for (let page = 107; page <= 175; page++) for (const text of pages[page - 1].split("\n")) lines.push({ text: text.replace(/ /g, " "), page })
  const levelPattern = /^(Level \d \w+|\w+ Cantrip) \(.*\)$/
  const found: { at: number; levelAt: number; castAt: number; end: number; fields: Record<string, string> }[] = []
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].text.startsWith("Casting Time:")) continue
    const oneLine = levelPattern.test(lines[index - 1].text.trim())
    const levelAt = oneLine ? index - 1 : index - 2
    const fields: Record<string, string[]> = {}
    let field = ""
    let at = index
    for (; at < lines.length; at++) {
      const label = /^(Casting Time|Range|Components?|Duration):\s*(.*)$/.exec(lines[at].text)
      if (label) {
        field = label[1].replace(/s$/, "").replace("Component", "Components")
        fields[field] = [label[2]]
      } else if (field === "Duration") break
      else fields[field].push(lines[at].text)
    }
    found.push({ at: levelAt - 1, levelAt, castAt: index, end: at, fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, join(value)])) })
  }
  return found.map((spell, index) => ({
    name: lines[spell.at].text.trim(),
    page: lines[spell.at].page,
    levelLine: join(lines.slice(spell.levelAt, spell.castAt).map((line) => line.text)),
    castingTime: spell.fields["Casting Time"],
    range: spell.fields.Range,
    components: spell.fields.Components,
    duration: spell.fields.Duration,
    body: lines.slice(spell.end, found[index + 1]?.at ?? lines.length),
  }))
}

/** The level line: "Level 3 Evocation (Sorcerer, Wizard)" or "Evocation Cantrip (Sorcerer, Wizard)". */
function parseLevelLine(text: string) {
  const leveled = /^Level (\d) (\w+) \((.+)\)$/.exec(text)
  const cantrip = /^(\w+) Cantrip \((.+)\)$/.exec(text)
  if (leveled) return { level: Number(leveled[1]), school: leveled[2].toLowerCase(), classes: leveled[3].split(", ").map((name) => name.toLowerCase()) }
  if (cantrip) return { level: 0, school: cantrip[1].toLowerCase(), classes: cantrip[2].split(", ").map((name) => name.toLowerCase()) }
  return undefined
}

/** The text a data casting time stands for, as the header prints it. */
function castingTimeText(spell: Spell): string {
  const one = (time: Spell["castingTime"]) => {
    const unit = { action: "Action", "bonus-action": "Bonus Action", reaction: "Reaction", minute: "minute", hour: "hour" }[time.unit]
    const base = time.amount ? plural(time.amount, unit) : unit
    const option = time.option ? ` (${time.option})` : ""
    return `${base}${option}${time.trigger ? `, which you take ${time.trigger}` : ""}`
  }
  const text = spell.alternateCastingTime ? `${one(spell.castingTime)} or ${one(spell.alternateCastingTime)}` : one(spell.castingTime)
  return spell.ritual ? `${text} or Ritual` : text
}

function rangeText(range: Spell["range"]): string {
  if (range.kind === "feet") return `${range.distance} feet`
  if (range.kind === "miles") return plural(range.distance ?? 0, "mile")
  return capital(range.kind)
}

/** Parse the official Duration line into the typed fields. */
function parseDuration(text: string) {
  const fixed: Record<string, string> = { Instantaneous: "instantaneous", "Until dispelled": "until-dispelled", "Until dispelled or triggered": "until-dispelled-or-triggered", Special: "special" }
  if (fixed[text]) return { kind: fixed[text], concentration: false }
  const timed = /^(Concentration,? )?(Up to |up to )?(\d+) (round|minute|hour|day)s?$/.exec(text)
  if (!timed) return undefined
  return { kind: "timed", amount: Number(timed[3]), unit: timed[4], ...(timed[2] ? { upTo: true } : {}), concentration: Boolean(timed[1]) }
}

/** The ways the text writes an area of effect. */
function areaTexts(area: NonNullable<Spell["range"]["area"]>): string[] {
  const shape = capital(area.shape)
  if (area.shape === "sphere") return [`${area.size}-foot-radius Sphere`]
  if (area.shape === "line")
    return [`${area.width}-foot-wide, ${area.size}-foot-long Line`, `${area.size}-foot-long, ${area.width}-foot-wide Line`, `Line of strong wind ${area.size} feet long and ${area.width} feet wide`]
  if (area.shape === "cylinder")
    return [
      `${area.size}-foot-radius, ${area.height}-foot-high Cylinder`,
      `${area.size}-foot-radius, ${area.height}-foot-tall Cylinder`,
      `${area.size}-foot-radius, ${area.height}-foot high Cylinder`,
      `${area.height}-foot-tall, ${area.size}-foot-radius Cylinder`,
    ]
  return [`${area.size}-foot ${shape}`]
}

/** A stat block written out in the order the PDF prints it, for comparing with the official text. */
function statBlockText(block: SpellStatBlock): string[] {
  const abilities = Object.entries(block.abilities).map(([id, line]) => `${capital(id)} ${line.score} ${line.modifier} ${line.save}`)
  const entries = (title: string, list: SpellStatBlock["actions"] | undefined) => (list ? [title, ...list.map((entry) => `${entry.name}. ${entry.text}`)] : [])
  return [
    block.name,
    block.type,
    `AC ${block.ac}`,
    `HP ${block.hp}`,
    `Speed ${block.speed}`,
    "MOD SAVE MOD SAVE MOD SAVE",
    ...abilities,
    ...(block.resistances ? [`Resistances ${block.resistances}`] : []),
    ...(block.immunities ? [`Immunities ${block.immunities}`] : []),
    `Senses ${block.senses}`,
    `Languages ${block.languages}`,
    `CR ${block.cr}`,
    ...entries("Traits", block.traits),
    ...entries("Actions", block.actions),
    ...entries("Bonus Actions", block.bonusActions),
  ]
}

/** Every piece of text the data holds for a spell: prose, labelled upgrade paragraphs, tables and stat blocks. */
function dataPieces(spell: Spell): string[] {
  const resume = columnBreaks[spell.id]
  const description = resume ? spell.description.replace(` ${resume}`, `\n${resume}`) : spell.description
  return [
    ...description.split("\n"),
    ...(spell.higherLevel ? [`Using a Higher-Level Spell Slot. ${spell.higherLevel}`] : []),
    ...(spell.cantripUpgrade ? [`Cantrip Upgrade. ${spell.cantripUpgrade}`] : []),
    ...(spell.tables ?? []).flatMap((table) => [...(table.title ? [table.title] : []), ...table.columns, ...table.rows.flat()]),
    ...(spell.statBlocks ?? []).flatMap(statBlockText),
  ]
}

/**
 * Remove each data piece from the squashed official text, longest first, and return what is left. Sentences are
 * removed one at a time, so text the PDF sets out of order still matches. Column headings may print twice.
 */
function leftover(official: string, pieces: string[], repeatable: string[]): string {
  let rest = official
  for (const part of repeatable.map(squash)) rest = rest.split(part).join(" ")
  const parts = pieces
    .flatMap((piece) => piece.split(/(?<=[.!?:])\s+/))
    .map(squash)
    .filter(Boolean)
  for (const part of parts.sort((a, b) => b.length - a.length)) rest = rest.replace(part, " ")
  return rest.replace(/\s+/g, " ").trim()
}

/** Class spell lists from the Classes chapter: every row under a "Level N Class Spells" heading. */
function classLists() {
  const rows: { className: string; level: number; name: string; school: string; special: string; page: number }[] = []
  // False Life's Sorcerer and Wizard rows print an en dash for "none".
  const special = /^(—|–|[CRM](, [CRM])*)$/
  for (let page = 30; page <= 85; page++) {
    const lines = pages[page - 1].split("\n").map((line) => line.trim())
    let current: { className: string; level: number } | undefined
    for (let index = 0; index < lines.length; index++) {
      const heading = /^(?:Cantrips \(Level 0 (\w+) Spells\)|Level (\d) (\w+) Spells)$/.exec(lines[index])
      if (heading) {
        current = heading[1] ? { className: heading[1], level: 0 } : { className: heading[3], level: Number(heading[2]) }
        continue
      }
      if (!current) {
        // A table that runs onto a new page starts with its headings, under the heading of the page before.
        if (lines[index] === "Spell" && lines[index + 1] === "School" && rows.length && rows.at(-1)?.page === page - 1)
          current = { className: rows.at(-1)?.className ?? "", level: rows.at(-1)?.level ?? 0 }
        else continue
      }
      if (lines[index] === "Spell" && lines[index + 1] === "School" && lines[index + 2] === "Special") {
        index += 2
        continue
      }
      const one = schoolNames.includes(lines[index + 1]) && special.test(lines[index + 2])
      const two = schoolNames.includes(lines[index + 2]) && special.test(lines[index + 3])
      if (one) {
        rows.push({ ...current, name: lines[index], school: lines[index + 1], special: lines[index + 2], page })
        index += 2
      } else if (two) {
        rows.push({ ...current, name: `${lines[index]} ${lines[index + 1]}`, school: lines[index + 2], special: lines[index + 3], page })
        index += 3
      } else current = undefined
    }
  }
  return rows
}

export default function verify(report: Report) {
  const spells = readData<Spell>(category)
  const byName = new Map(spells.map((spell) => [spell.name, spell]))
  const official = officialSpells()
  const officialByName = new Map(official.map((spell) => [spell.name, spell]))

  // 1. Coverage both ways.
  {
    const failures: string[] = []
    if (official.length !== officialCount) failures.push(`the official text has ${official.length} spell headers, expected ${officialCount}`)
    for (const spell of official) if (!byName.has(spell.name)) failures.push(`official spell "${spell.name}" (page ${spell.page}) is missing from the data`)
    for (const spell of spells) if (!officialByName.has(spell.name)) failures.push(`data spell "${spell.name}" is not an official spell heading`)
    for (const spell of spells) if (spell.id !== toId(spell.name)) failures.push(`${spell.name}: id ${spell.id} is not ${toId(spell.name)}`)
    report.check(category, `every official spell is in the data and back (${officialCount} official)`, official.length + spells.length, failures)
  }

  // 2. Header fields, every spell, value by value.
  const fieldChecks: Record<string, string[]> = {
    page: [],
    level: [],
    school: [],
    classes: [],
    "casting time": [],
    ritual: [],
    range: [],
    verbal: [],
    somatic: [],
    material: [],
    "material text": [],
    "material cost": [],
    "material consumed": [],
    duration: [],
    concentration: [],
  }
  let compared = 0
  for (const header of official) {
    const spell = byName.get(header.name)
    if (!spell) continue
    compared++
    const fail = (field: string, official: unknown, data: unknown) => fieldChecks[field].push(`${spell.id}: official ${JSON.stringify(official)}, data ${JSON.stringify(data)}`)
    if (spell.page !== header.page) fail("page", header.page, spell.page)
    const level = parseLevelLine(header.levelLine)
    if (!level) fail("level", header.levelLine, "unparsed")
    else {
      if (level.level !== spell.level) fail("level", level.level, spell.level)
      if (level.school !== spell.school) fail("school", level.school, spell.school)
      if ([...level.classes].sort().join() !== [...spell.classes].sort().join()) fail("classes", level.classes, spell.classes)
    }
    const ritual = / or Ritual$/.test(header.castingTime)
    if (ritual !== spell.ritual) fail("ritual", ritual, spell.ritual)
    if (squash(header.castingTime) !== squash(castingTimeText(spell)) || header.castingTime.replace(/-/g, "") !== castingTimeText(spell).replace(/-/g, ""))
      fail("casting time", header.castingTime, castingTimeText(spell))
    if (header.range !== rangeText(spell.range)) fail("range", header.range, rangeText(spell.range))
    const parts = /^(V)?(?:, )?(S)?(?:, )?(?:M \((.*)\))?$/.exec(header.components)
    if (!parts) fail("material", header.components, "unparsed")
    else {
      if (Boolean(parts[1]) !== spell.components.verbal) fail("verbal", Boolean(parts[1]), spell.components.verbal)
      if (Boolean(parts[2]) !== spell.components.somatic) fail("somatic", Boolean(parts[2]), spell.components.somatic)
      if (Boolean(parts[3]) !== Boolean(spell.components.material)) fail("material", Boolean(parts[3]), Boolean(spell.components.material))
      const material = spell.components.material
      if (parts[3] && material) {
        // The PDF breaks lines inside words. Compare exactly, then without hyphens, which keeps dashes and quotes.
        if (parts[3] !== material.text && parts[3].replace(/-/g, "") !== material.text.replace(/-/g, "")) fail("material text", parts[3], material.text)
        const coins: Record<string, string> = { GP: "gp", SP: "sp", CP: "cp", "Gold Pieces": "gp", "Silver Pieces": "sp", "Copper Pieces": "cp" }
        const costs = [...parts[3].matchAll(/([\d,]+)\+? (GP|SP|CP|Gold Pieces|Silver Pieces|Copper Pieces)\b/g)].map((match) => `${match[1].replace(/,/g, "")} ${coins[match[2]]}`)
        const dataCosts = (material.costs ?? []).map((cost) => `${cost.amount} ${cost.unit}`)
        if (costs.join() !== dataCosts.join()) fail("material cost", costs, dataCosts)
        if (/consume/.test(parts[3]) !== material.consumed) fail("material consumed", /consume/.test(parts[3]), material.consumed)
      }
    }
    const duration = parseDuration(header.duration)
    if (!duration) fail("duration", header.duration, "unparsed")
    else {
      const { concentration, ...rest } = duration
      const { concentration: dataConcentration, ...dataRest } = spell.duration
      if (JSON.stringify(rest) !== JSON.stringify(dataRest)) fail("duration", rest, dataRest)
      if (concentration !== dataConcentration) fail("concentration", concentration, dataConcentration)
    }
  }
  for (const [field, failures] of Object.entries(fieldChecks)) report.check(category, `${field} matches the official header`, compared, failures)

  // 3. Prose and completeness.
  const pageRange = new Map<string, [number, number]>()
  for (const [index, header] of official.entries()) pageRange.set(header.name, [header.page, Math.max(official[index + 1]?.page ?? header.page, header.page + 1)])
  {
    const failures: string[] = []
    let total = 0
    for (const spell of spells) {
      const [from, to] = pageRange.get(spell.name) ?? [spell.page, spell.page]
      const own = squash(pageText(from, Math.min(to, 175)))
      for (const piece of dataPieces(spell)) {
        total++
        for (const sentence of missingSentences(piece)) failures.push(`${spell.id}: not in the official text: "${sentence}"`)
        for (const sentence of piece.split(/(?<=[.!?])\s+/))
          if (squash(sentence).length >= 12 && !own.includes(squash(sentence))) failures.push(`${spell.id}: not on pages ${from}–${to}: "${sentence}"`)
      }
    }
    report.check(category, "every sentence is the official wording on the spell’s own pages", total, failures)
  }
  {
    // Everything the official text prints for a spell is in the data. Text the PDF sets inside a neighbouring
    // spell's block, around a stat block, is taken from the spells printed on the same or the next page.
    const failures: string[] = []
    for (const header of official) {
      const spell = byName.get(header.name)
      if (!spell) continue
      const near = spells.filter((other) => other !== spell && Math.abs(other.page - header.page) <= 1)
      const repeatable = (spell.tables ?? []).map((table) => table.columns.join(" "))
      const rest = leftover(squash(join(header.body.map((line) => line.text))), [...dataPieces(spell), ...near.flatMap(dataPieces)], repeatable)
      if (rest) failures.push(`${spell.id}: official text not in the data: "${rest.slice(0, 120)}"`)
    }
    report.check(category, "nothing in the official text is left out", official.length, failures)
  }
  {
    const failures: string[] = []
    let total = 0
    for (const spell of spells) {
      for (const field of ["description", "higherLevel", "cantripUpgrade"] as const) {
        const text = spell[field]
        if (!text) continue
        total++
        if (/^(Using a Higher-Level Spell Slot|Cantrip Upgrade)\./m.test(text)) failures.push(`${spell.id}: ${field} keeps an upgrade label`)
      }
      const header = officialByName.get(spell.name)
      const body = header ? join(header.body.map((line) => line.text)) : ""
      if (/Using a Higher-Level Spell Slot\./.test(body) !== Boolean(spell.higherLevel)) failures.push(`${spell.id}: higherLevel does not match the official text`)
      if (/Cantrip Upgrade\./.test(body) !== Boolean(spell.cantripUpgrade)) failures.push(`${spell.id}: cantripUpgrade does not match the official text`)
      if (spell.level === 0 && spell.higherLevel) failures.push(`${spell.id}: a cantrip has a higher-level paragraph`)
      if (spell.level > 0 && spell.cantripUpgrade) failures.push(`${spell.id}: a leveled spell has a cantrip upgrade`)
    }
    report.check(category, "upgrade paragraphs are their own fields", total, failures)
  }

  // Stat blocks: the ability scores, read from the official text by their own pattern.
  {
    const failures: string[] = []
    let total = 0
    for (const spell of spells) {
      for (const block of spell.statBlocks ?? []) {
        total++
        const page = pages.findIndex((text) => text.includes(`\n${block.name}\n${block.type}\n`))
        if (page < 0) {
          failures.push(`${spell.id}: stat block ${block.name} not found`)
          continue
        }
        const text = pages[page].slice(pages[page].indexOf(`\n${block.name}\n`))
        const scores = [...text.matchAll(/(Str|Dex|Con|Int|Wis|Cha)\s+(\d+)\s*([+−]\d+)\s*([+−]\d+)/g)].slice(0, 6)
        const number = (value: string) => Number(value.replace("−", "-"))
        for (const match of scores) {
          const line = block.abilities[match[1].toLowerCase() as keyof SpellStatBlock["abilities"]]
          if (line.score !== Number(match[2]) || line.modifier !== number(match[3]) || line.save !== number(match[4]))
            failures.push(`${spell.id}: ${block.name} ${match[0].replace(/\s+/g, " ")} vs ${JSON.stringify(line)}`)
        }
        if (scores.length !== 6) failures.push(`${spell.id}: ${block.name} has ${scores.length} official ability lines`)
        if (!text.includes(`AC ${block.ac}`)) failures.push(`${spell.id}: ${block.name} AC ${block.ac}`)
      }
    }
    report.check(category, "stat block numbers match the official text", total, failures)
  }

  // Tables: each row's cells appear in order in the spell's own official text.
  {
    const failures: string[] = []
    let total = 0
    for (const spell of spells) {
      const body = squash(join((officialByName.get(spell.name)?.body ?? []).map((line) => line.text)))
      for (const table of spell.tables ?? []) {
        for (const row of table.rows) {
          total++
          if (!body.includes(squash(row.join(" "))) && !body.includes(squash(row[0])) && !body.includes(squash(row[1])))
            failures.push(`${spell.id}: row ${row.join(" | ")} is not in the official text`)
          if (!row.every((cell) => body.includes(squash(cell)))) failures.push(`${spell.id}: a cell of ${row.join(" | ")} is not in the official text`)
        }
        if (table.columns.length !== table.rows[0].length || table.rows.some((row) => row.length !== table.columns.length)) failures.push(`${spell.id}: table rows and columns differ in width`)
      }
    }
    report.check(category, "table cells are in the spell’s official text", total, failures)
  }

  // 4. Mechanics against each spell's own official text.
  const bodyOf = (spell: Spell) => {
    const header = officialByName.get(spell.name)
    const lines = header?.body ?? []
    // Stat blocks are checked on their own, so the mechanics read only the lines before one.
    const stop = lines.findIndex((_, index) => /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/.test(lines[index + 1]?.text ?? "") && lines[index + 2]?.text.startsWith("AC "))
    return join((stop < 0 ? lines : lines.slice(0, stop)).map((line) => line.text))
  }
  // The sentences of a spell's official block that are this spell's, leaving out text the PDF sets there from a
  // neighbouring spell. Used to read what the text says the spell does.
  const ownText = (spell: Spell) => {
    const mine = squash(dataPieces(spell).join(" "))
    return bodyOf(spell)
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => mine.includes(squash(sentence)))
      .join(" ")
  }
  {
    const failures: string[] = []
    const waived: string[] = []
    let total = 0
    const dicePattern = new RegExp(`(\\d+d\\d+(?: \\+ \\d+)?)(?: plus your spellcasting ability modifier)? ((?:${typeNames.join("|")})(?:(?:, or |, | or )(?:${typeNames.join("|")}))*) damage`, "g")
    for (const spell of spells) {
      const text = bodyOf(spell)
      const own = ownText(spell)
      for (const damage of spell.damage ?? []) {
        total++
        if (damage.dice && !text.includes(damage.dice)) failures.push(`${spell.id}: damage dice ${damage.dice} is not in its text`)
        if (damage.amount && !text.includes(`${damage.amount} ${capital(damage.types[0])} damage`)) failures.push(`${spell.id}: damage ${damage.amount} is not in its text`)
        for (const type of damage.types) if (!text.includes(capital(type))) failures.push(`${spell.id}: damage type ${type} is not in its text`)
        if (damage.modifier && !/plus your spellcasting ability modifier/.test(text)) failures.push(`${spell.id}: damage adds a modifier its text does not`)
        if (damage.perSlot && !new RegExp(`by ${damage.perSlot}\\b[^.]*for (each|every) (spell )?slot level`).test(text))
          failures.push(`${spell.id}: per-slot dice ${damage.perSlot} is not in its text`)
        if (damage.cantrip) {
          const levels = /levels 5 \((\d+d\d+)\), 11 \((\d+d\d+)\), and 17 \((\d+d\d+)\)/.exec(text)
          if (!levels || levels.slice(1).join() !== [damage.cantrip[5], damage.cantrip[11], damage.cantrip[17]].join())
            failures.push(`${spell.id}: cantrip dice ${JSON.stringify(damage.cantrip)} vs ${levels?.slice(1)}`)
        }
      }
      // Every damage roll the text states is in the data.
      for (const match of own.matchAll(dicePattern)) {
        total++
        const types = match[2].split(/, or |, | or /).map((name) => name.toLowerCase())
        const held = (spell.damage ?? []).some((damage) => damage.dice === match[1] && types.every((type) => damage.types.includes(type as never)))
        if (held) continue
        if (irregularDamage[spell.id]) waived.push(`${spell.id}: ${match[0]}: ${irregularDamage[spell.id]}`)
        else failures.push(`${spell.id}: the text’s “${match[0]}” is not in the data`)
      }
      // Damage on the caster: the data marks it exactly where the sentence that rolls it has the caster take it.
      for (const damage of spell.damage ?? []) {
        const roll = damage.dice ?? `${damage.amount} ${capital(damage.types[0])}`
        const sentence = own.split(/(?<=[.!?])\s+/).find((line) => line.includes(roll)) ?? ""
        const target = /you and any creature traveling with you each take/.test(sentence) ? "caster-and-companions" : /\byou take\b|damage to you\b/.test(sentence) ? "caster" : undefined
        if (damage.target !== target) failures.push(`${spell.id}: ${roll} falls on ${target ?? "the targets"} in its text, the data reads ${damage.target ?? "the targets"}`)
      }
      // A damage type a table row decides: the data maps exactly the rows that roll that damage, and names the table.
      for (const damage of (spell.damage ?? []).filter((damage) => damage.table)) {
        const table = spell.tables?.find((table) => table.title === damage.table)
        if (!table?.damageTypes) {
          failures.push(`${spell.id}: damage names table ${damage.table}, which has no damage types`)
          continue
        }
        if ([...new Set(Object.values(table.damageTypes))].sort().join() !== [...damage.types].sort().join()) failures.push(`${spell.id}: damage types differ from table ${damage.table}`)
      }
      for (const table of spell.tables ?? []) {
        for (const row of table.rows) {
          total++
          const rolled = new RegExp(`(\\d+d\\d+) (${typeNames.join("|")}) damage`).exec(row.at(-1) ?? "")
          const mapped = table.damageTypes?.[row[0]]
          if (!rolled) {
            if (mapped) failures.push(`${spell.id}: table row ${row[0]} maps ${mapped} but rolls no damage`)
            continue
          }
          if (mapped !== rolled[2].toLowerCase()) failures.push(`${spell.id}: table row ${row[0]} rolls ${rolled[0]}, the data maps ${mapped}`)
          if (!(spell.damage ?? []).some((damage) => damage.table === table.title && damage.dice === rolled[1])) failures.push(`${spell.id}: no damage roll of ${rolled[1]} names table ${table.title}`)
        }
      }
    }
    report.check(category, "damage dice and types are the spell’s own text", total, failures, [...new Set(waived)])
  }
  {
    const failures: string[] = []
    let total = 0
    for (const spell of spells) {
      const text = bodyOf(spell)
      for (const save of spell.saves ?? []) {
        total++
        if (!text.includes(`${abilityNames[save.ability]} saving throw`)) failures.push(`${spell.id}: ${abilityNames[save.ability]} saving throw is not in its text`)
        if (save.dc && !text.includes(`DC ${save.dc} ${abilityNames[save.ability]} saving throw`)) failures.push(`${spell.id}: DC ${save.dc} is not in its text`)
        if (save.target === "caster" && !new RegExp(`(?:you make a|make a DC \\d+) ${abilityNames[save.ability]} saving throw`).test(text))
          failures.push(`${spell.id}: the caster’s ${abilityNames[save.ability]} save is not in its text`)
        if (save.onSuccess === "half" && !/half as much damage|half the initial damage|half damage/i.test(text)) failures.push(`${spell.id}: a save halves damage its text does not halve`)
      }
      // Every save the text has a creature make is in the data, unless it is a benefit or a penalty to saves.
      const named = [...ownText(spell).matchAll(/(\w+ \w+ )?(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw(s?)/g)]
        .filter((match) => !match[3] && !/^(Advantage on|Disadvantage on|bonus to|penalty to) $/.test(match[1] ?? ""))
        .map((match) => match[2])
      for (const name of new Set(named)) {
        total++
        const id = Object.keys(abilityNames).find((key) => abilityNames[key] === name)
        if (!spell.saves?.some((save) => save.ability === id)) failures.push(`${spell.id}: the text’s ${name} saving throw is not in the data`)
      }
      // A save the caster makes, or one against a fixed DC, is marked so.
      for (const match of ownText(spell).matchAll(/(you make a|make a DC (\d+)) (\w+) saving throw/g)) {
        total++
        const id = Object.keys(abilityNames).find((key) => abilityNames[key] === match[3])
        const dc = match[2] ? Number(match[2]) : undefined
        if (!spell.saves?.some((save) => save.ability === id && save.target === "caster" && save.dc === dc)) failures.push(`${spell.id}: the caster’s “${match[0]}” is not in the data`)
      }
      for (const condition of spell.casterConditions ?? []) {
        total++
        if (!new RegExp(`\\b(?:You gain|you take [^.]*and have|If expelled, you[^.]*and have) the ${capital(condition)} condition`).test(text))
          failures.push(`${spell.id}: the caster’s ${condition} condition is not in its text`)
      }
      if (spell.attack) {
        total++
        if (!text.includes(`${spell.attack} spell attack`)) failures.push(`${spell.id}: ${spell.attack} spell attack is not in its text`)
      }
      const attack = /(melee|ranged) spell attack/.exec(ownText(spell))?.[1]
      if (attack && attack !== spell.attack) failures.push(`${spell.id}: the text makes a ${attack} spell attack, the data ${spell.attack}`)
      for (const condition of spell.conditions ?? []) {
        total++
        if (!new RegExp(`${capital(condition)}\\b[^.]*conditions?|\\b${capital(condition)}\\b`).test(text)) failures.push(`${spell.id}: condition ${condition} is not in its text`)
      }
      if (spell.healing) {
        total++
        const healing = spell.healing
        if (healing.dice && !text.includes(healing.dice)) failures.push(`${spell.id}: healing dice ${healing.dice} is not in its text`)
        if (healing.amount && !new RegExp(`\\b${healing.amount} Hit Points?`).test(text)) failures.push(`${spell.id}: healing ${healing.amount} is not in its text`)
        if (healing.perSlot && !new RegExp(`increases? by ${healing.perSlot} for each spell slot level`).test(text))
          failures.push(`${spell.id}: healing per slot ${healing.perSlot} is not in its text`)
        if (healing.perSlotAmount && !new RegExp(`\\b${healing.perSlotAmount}\\b[^.]*for each spell slot level`).test(text))
          failures.push(`${spell.id}: healing per slot ${healing.perSlotAmount} is not in its text`)
        if (healing.temporary && !/Temporary Hit Points/.test(text)) failures.push(`${spell.id}: temporary healing its text does not give`)
      }
      if (spell.range.area) {
        total++
        if (!areaTexts(spell.range.area).some((phrase) => squash(text).includes(squash(phrase)))) failures.push(`${spell.id}: area ${JSON.stringify(spell.range.area)} is not in its text`)
      }
    }
    report.check(category, "saves, attacks, conditions, healing and areas are the spell’s own text", total, failures)
  }

  // Counts and fixed numbers, read from every spell's own text and compared both ways: a spell whose text has the
  // wording has the field with the same value, and a spell without it has no field.
  {
    const failures: string[] = []
    let total = 0
    const words: Record<string, number> = { a: 1, one: 1, two: 2, three: 3, four: 4 }
    const rolls: [RegExp, string][] = [
      [/attack roll/, "attack-roll"],
      [/\bsaves?\b|saving throws/, "saving-throw"],
      [/ability check/, "ability-check"],
      [/damage rolls/, "damage-roll"],
    ]
    for (const spell of spells) {
      const text = ownText(spell)
      const compare = (field: string, official: unknown, data: unknown) => {
        total++
        if (JSON.stringify(official) !== JSON.stringify(data)) failures.push(`${spell.id}: ${field} reads ${JSON.stringify(official)} in its text, the data ${JSON.stringify(data)}`)
      }
      const count = /You (?:create|hurl) (a|three) [\w ]*?(?:beam|darts|rays)\b/.exec(text)
      const more = /(one) (?:more|additional) (?:dart|ray) for each spell slot level/.exec(text)
      const beams = /creates (\w+) beams at level 5, (\w+) beams at level 11, and (\w+) beams at level 17/.exec(text)
      compare(
        "projectiles",
        count && {
          count: words[count[1]],
          ...(more ? { perSlot: words[more[1]] } : {}),
          ...(beams ? { cantrip: { 5: words[beams[1]], 11: words[beams[2]], 17: words[beams[3]] } } : {}),
        },
        spell.projectiles ?? null
      )
      const targets = /\b(one|two|One) additional (?:creature|Beast|Humanoid|bolt)\b[^.]*for each spell slot level above/.exec(text)
      compare("extra targets per slot", targets ? words[targets[1].toLowerCase()] : null, spell.extraTargetsPerSlot ?? null)
      const bonus = /\+(\d+) bonus to (?:AC|Armor Class)/.exec(text)
      const base = /base AC becomes (\d+) plus its Dexterity modifier/.exec(text)
      const minimum = /Armor Class of (\d+) if its AC is lower than that/.exec(text)
      compare(
        "AC",
        bonus || base || minimum ? { ...(bonus ? { bonus: Number(bonus[1]) } : {}), ...(base ? { base: Number(base[1]) } : {}), ...(minimum ? { minimum: Number(minimum[1]) } : {}) } : null,
        spell.ac ?? null
      )
      const sentence = /[^.]*\b(adds|subtracts?) (\d+d\d+) (?:to|from)\b[^.]*/.exec(text)
      const flat = /\+(\d+) bonus to AC and saving throws/.exec(text)
      const modifier = sentence
        ? {
            dice: sentence[2],
            ...(sentence[1] === "adds" ? {} : { subtract: true }),
            rolls: rolls.filter(([pattern]) => pattern.test(sentence[0].slice(sentence[0].indexOf(sentence[2])))).map(([, roll]) => roll),
          }
        : flat && { amount: Number(flat[1]), rolls: ["saving-throw"] }
      compare("roll modifier", modifier, spell.rollModifier ?? null)
      compare("damage reduction", /reduces the total damage taken by (\d+d\d+)/.exec(text)?.[1] ?? null, spell.damageReduction ?? null)
      const maximum = /Hit Point maximum (?:and current Hit Points increase|also increases) by (\d+d\d+|\d+)/.exec(text)
      const maximumPerSlot = /Hit Points increase by (\d+) for each spell slot level/.exec(text)
      compare(
        "Hit Point maximum",
        maximum && { ...(/d/.test(maximum[1]) ? { dice: maximum[1] } : { amount: Number(maximum[1]) }), ...(maximumPerSlot ? { perSlotAmount: Number(maximumPerSlot[1]) } : {}) },
        spell.hitPointMaximum ?? null
      )
    }
    report.check(category, "projectiles, extra targets, AC, roll modifiers, damage reduction and Hit Point maximum match the spell’s own text both ways", total, failures)
  }

  // Class spell lists in the Classes chapter.
  {
    const rows = classLists()
    const failures: string[] = []
    const listed = new Set(rows.map((row) => `${row.className.toLowerCase()}:${row.name}`))
    const waived: string[] = []
    for (const row of rows) {
      const spell = byName.get(row.name)
      if (!spell) {
        failures.push(`${row.className} list (page ${row.page}): no spell "${row.name}"`)
        continue
      }
      if (!spell.classes.includes(row.className.toLowerCase() as never)) failures.push(`${spell.id}: on the ${row.className} list, not in its classes`)
      if (spell.level !== row.level) failures.push(`${spell.id}: ${row.className} list level ${row.level}, data ${spell.level}`)
      if (spell.school !== row.school.toLowerCase()) {
        const message = `${spell.id}: the ${row.className} spell list on page ${row.page} reads ${row.school}, the spell’s header on page ${spell.page} reads ${capital(spell.school)}`
        if (listConflicts.has(spell.id)) waived.push(`${message}. The data follows the header`)
        else failures.push(message)
      }
      const flags = row.special.split(", ")
      if (flags.includes("C") !== spell.duration.concentration) failures.push(`${spell.id}: ${row.className} list Concentration ${flags.includes("C")}`)
      if (flags.includes("R") !== spell.ritual) failures.push(`${spell.id}: ${row.className} list Ritual ${flags.includes("R")}`)
      // The lists mark M where the material costs gold or is consumed. True Strike's weapon “worth 1+ CP” is not marked.
      const material = spell.components.material
      const specific = Boolean(material && (material.consumed || material.costs?.some((cost) => cost.unit === "gp")))
      if (flags.includes("M") !== specific) failures.push(`${spell.id}: ${row.className} list specific Material ${flags.includes("M")}`)
    }
    const classes = [...new Set(rows.map((row) => row.className.toLowerCase()))]
    for (const spell of spells)
      for (const id of spell.classes) {
        if (!classes.includes(id) || listed.has(`${id}:${spell.name}`)) continue
        const listPages = [...new Set(rows.filter((row) => row.className.toLowerCase() === id).map((row) => row.page))]
        const message = `${spell.id}: the spell’s header on page ${spell.page} names ${capital(id)}, the ${capital(id)} spell list on pages ${listPages[0]}–${listPages.at(-1)} does not print it`
        if (listConflicts.has(spell.id)) waived.push(`${message}. The data follows the header`)
        else failures.push(message)
      }
    report.check(category, `classes, levels, schools and C, R, M flags match the ${classes.length} class spell lists (${rows.length} rows)`, rows.length + spells.length, failures, waived)
  }

  // 5. References to other categories, where their data exists.
  {
    const failures: string[] = []
    let total = 0
    const ids = (name: string) => (existsSync(dataPath(name)) ? new Set(readData<{ id: string }>(name).map((entry) => entry.id)) : undefined)
    const refs: [string, (spell: Spell) => string[]][] = [
      ["classes", (spell) => spell.classes],
      ["magic-schools", (spell) => [spell.school]],
      ["conditions", (spell) => spell.conditions ?? []],
      ["damage-types", (spell) => (spell.damage ?? []).flatMap((damage) => damage.types)],
    ]
    for (const [name, get] of refs) {
      const known = ids(name)
      if (!known) continue
      for (const spell of spells)
        for (const id of get(spell)) {
          total++
          if (!known.has(id)) failures.push(`${spell.id}: ${name} id ${id} is not in data/${name}.json`)
        }
    }
    if (total) report.check(category, "ids that point at other categories resolve", total, failures)
  }

  // The class spell lists in classes.json, where that file exists, agree with each spell's classes and level both ways.
  if (existsSync(dataPath("classes"))) {
    const failures: string[] = []
    let total = 0
    const listed = new Map<string, number>()
    for (const entry of readData<{ id: string; spellcasting?: { spellList?: { level: number; spells: string[] }[] } }>("classes"))
      for (const group of entry.spellcasting?.spellList ?? []) for (const id of group.spells) listed.set(`${entry.id}:${id}`, group.level)
    const casters = new Set([...listed.keys()].map((key) => key.split(":")[0]))
    const byId = new Map(spells.map((spell) => [spell.id, spell]))
    for (const [key, level] of listed) {
      total++
      const [classId, id] = key.split(":")
      const spell = byId.get(id)
      if (!spell) failures.push(`classes.json ${classId} lists unknown spell ${id}`)
      else if (!spell.classes.includes(classId as never)) failures.push(`${id}: classes.json lists it for ${classId}, its classes do not`)
      else if (spell.level !== level) failures.push(`${id}: classes.json ${classId} level ${level}, data ${spell.level}`)
    }
    for (const spell of spells)
      for (const classId of spell.classes) {
        total++
        if (casters.has(classId) && !listed.has(`${classId}:${spell.id}`)) failures.push(`${spell.id}: its classes name ${classId}, the ${classId} spell list in classes.json does not`)
      }
    report.check(category, "classes and levels agree with the spell lists in classes.json", total, failures)
  }

  // 6. Open5e as a second opinion. A disagreement fails only where the official text does not side with the data.
  {
    const rows = readOpen5e<Record<string, any>>("Spell").filter((row) => row.pk.startsWith("srd-2024_"))
    const failures: string[] = []
    const settled: string[] = []
    let total = 0
    for (const { pk, fields } of rows) {
      const spell = byName.get(fields.name.replace(/'/g, "’"))
      if (!spell) {
        failures.push(`Open5e ${pk} "${fields.name}" has no data spell`)
        continue
      }
      const header = officialByName.get(spell.name)
      const body = bodyOf(spell)
      const compare = (field: string, open5e: unknown, data: unknown, officialAgrees: boolean) => {
        total++
        if (JSON.stringify(open5e) === JSON.stringify(data)) return
        ;(officialAgrees ? settled : failures).push(`${spell.id}: ${field} Open5e ${JSON.stringify(open5e)}, data ${JSON.stringify(data)}`)
      }
      const level = parseLevelLine(header?.levelLine ?? "")
      compare("level", fields.level, spell.level, level?.level === spell.level)
      compare("school", fields.school, spell.school, level?.school === spell.school)
      compare(
        "classes",
        [...fields.classes].map((id: string) => id.replace("srd-2024_", "")).sort(),
        [...spell.classes].sort(),
        [...(level?.classes ?? [])].sort().join() === [...spell.classes].sort().join()
      )
      compare("ritual", fields.ritual, spell.ritual, / or Ritual$/.test(header?.castingTime ?? "") === spell.ritual)
      compare("concentration", fields.concentration, spell.duration.concentration, /^Concentration/.test(header?.duration ?? "") === spell.duration.concentration)
      compare("range", fields.range_text, rangeText(spell.range), header?.range === rangeText(spell.range))
      compare("verbal", fields.verbal, spell.components.verbal, /^V/.test(header?.components ?? "") === spell.components.verbal)
      compare("somatic", fields.somatic, spell.components.somatic, /(^|, )S/.test(header?.components ?? "") === spell.components.somatic)
      compare("material", fields.material, Boolean(spell.components.material), /M \(/.test(header?.components ?? "") === Boolean(spell.components.material))
      if (fields.material_specified && spell.components.material)
        compare("material text", squash(fields.material_specified), squash(spell.components.material.text), squash(header?.components ?? "").endsWith(`${squash(spell.components.material.text)}`))
      if (spell.components.material)
        compare("material consumed", fields.material_consumed, spell.components.material.consumed, /consume/.test(header?.components ?? "") === spell.components.material.consumed)
      const saves = [...new Set((spell.saves ?? []).map((save) => abilityNames[save.ability].toLowerCase()))]
      compare("save ability", fields.saving_throw_ability || undefined, saves[0], !saves.length || body.includes(`${capital(saves[0])} saving throw`))
      compare("attack roll", fields.attack_roll, Boolean(spell.attack), Boolean(spell.attack) === /spell attack/.test(body))
      // Open5e puts healing and other dice in its damage field. The official text settles it when it gives those dice no damage type.
      if (fields.damage_roll) {
        const held = (spell.damage ?? []).some((damage) => damage.dice === fields.damage_roll)
        const typed = new RegExp(`${fields.damage_roll.replace(/[+]/g, "\\+")} (${typeNames.join("|")})`).test(body)
        compare("damage dice", fields.damage_roll, held ? fields.damage_roll : spell.damage?.[0]?.dice, held || !typed || irregularDamage[spell.id] !== undefined)
      }
      if (fields.damage_types?.length)
        compare(
          "damage types",
          [...fields.damage_types].sort(),
          [...new Set((spell.damage ?? []).flatMap((damage) => damage.types))].sort(),
          (spell.damage ?? []).every((damage) => damage.types.every((type) => body.includes(capital(type))))
        )
      if (fields.shape_type)
        compare(
          "area",
          { shape: fields.shape_type, size: fields.shape_size },
          spell.range.area && { shape: spell.range.area.shape, size: spell.range.area.size },
          !spell.range.area || areaTexts(spell.range.area).some((phrase) => squash(body).includes(squash(phrase)))
        )
    }
    if (rows.length !== officialCount) failures.push(`Open5e has ${rows.length} spells, the official text ${officialCount}`)
    report.crossCheck(category, "agrees with Open5e, or the official text settles it", total, failures, settled)
  }
}
