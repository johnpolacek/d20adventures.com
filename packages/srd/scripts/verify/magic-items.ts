import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import type { ItemTable, MagicItem, MagicItemRule, MagicItemVariant } from "../../src/schema/magic-items"
import { dataPath, readData, toId } from "../lib/data"
import { inOfficial, missingSentences, pageOf, pages, pagesOf, pageText, squash } from "../lib/official"
import type { Report } from "../lib/report"
import { hasUpstream, readBase, readOpen5e, root } from "../lib/sources"

// The check reads the official text on its own: it finds the headings and subtitles with one anchored pattern per
// subtitle, takes each item's block of lines, and compares the data with what the block says. It shares no parsing
// code with the builder.

const rarityNames = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"]
const rarityAlt = `${rarityNames.join("|")}|Rarity Varies`
const categoryAlt = "Armor|Potion|Ring|Rod|Scroll|Staff|Wand|Weapon|Wondrous Item"
const subtitleRe = new RegExp(
  String.raw`^(${categoryAlt})(?: \(([^()]*)\))?, ((?:${rarityAlt})(?: \((?!Requires)[^()]*\))?(?:, (?:or )?(?:${rarityAlt}) \((?!Requires)[^()]*\))*)(?: \(Requires Attunement(?: by ([^()]*))?\))?$`
)
const classList = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]

type Official = { name: string; page: number; category: string; baseText?: string; rarityText: string; attunementBy?: string; attunes: boolean; block: string[] }
type Rule<K extends MagicItemRule["kind"]> = Extract<MagicItemRule, { kind: K }>

const first = pages.findIndex((page) => page.includes("Magic Items A–Z\nMagic items are presented in alphabetical order"))
const last = pages.findIndex((page, index) => index > first && page.includes("Monsters\nStat Block Overview"))
const rows = pages.slice(first, last).flatMap((page, index) => page.split("\n").map((text) => ({ text, page: first + index + 1 })))

function officialItems(): Official[] {
  const found: { at: number; to: number; match: RegExpExecArray; nameFrom: number }[] = []
  for (let i = 1; i < rows.length; i++) {
    // The longest window of up to three lines that is a whole subtitle: "Very Rare" alone is one, and so is "Very Rare (Requires Attunement)".
    let best: { width: number; match: RegExpExecArray } | undefined
    for (let width = 1; width <= 3 && i + width <= rows.length; width++) {
      const window = rows
        .slice(i, i + width)
        .map((row) => row.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim()
      const match = subtitleRe.exec(window)
      if (match) best = { width, match }
    }
    if (!best) continue
    found.push({ at: i, to: i + best.width, match: best.match, nameFrom: /^[a-z]/.test(rows[i - 1].text) ? i - 2 : i - 1 })
    i += best.width - 1
  }
  const items = found.map((entry, index) => {
    const next = found[index + 1]
    return {
      name: rows
        .slice(entry.nameFrom, entry.at)
        .map((row) => row.text.trim())
        .join(" "),
      page: rows[entry.nameFrom].page,
      category: entry.match[1],
      baseText: entry.match[2],
      rarityText: entry.match[3],
      attunementBy: entry.match[4],
      attunes: /\(Requires Attunement/.test(entry.match[0]),
      block: rows.slice(entry.to, next ? next.nameFrom : rows.length).map((row) => row.text),
    }
  })
  // The Apparatus of the Crab lever table is printed after the text of Armor of Resistance. It belongs to the apparatus.
  const host = items.find((item) => item.name === "Armor of Resistance") as Official
  const apparatus = items.find((item) => item.name === "Apparatus of the Crab") as Official
  const at = host.block.findIndex((line) => line.trim() === "Apparatus of the Crab Levers")
  apparatus.block.push(...host.block.splice(at))
  return items
}

// Spell names: the line above a "Level 3 Evocation (…" or "Evocation Cantrip (…" line.
const spellNames = (() => {
  const names = new Set<string>()
  const all = pages.flatMap((page) => page.split("\n"))
  for (let i = 1; i < all.length; i++) if (/^(?:Level [1-9] [A-Z][a-z]+|[A-Z][a-z]+ Cantrip) \(/.test(all[i])) names.add(all[i - 1].trim())
  return names
})()
const officialSpellIds = new Map([...spellNames].map((name) => [toId(name), name]))
const escapeName = (name: string) => name.replace(/[/()]/g, "\\$&")

// One scan with every name as an alternative, longest first, so the regular expression takes "See Invisibility" whole
// and never reaches "Invisibility" inside it.
const nameScan = new RegExp(
  `(^|[^A-Za-z’])(${[...spellNames]
    .sort((a, b) => b.length - a.length)
    .map(escapeName)
    .join("|")})(?![A-Za-z’])`,
  "g"
)

function spellMentions(text: string): { id: string; name: string; index: number }[] {
  const found: { id: string; name: string; index: number }[] = []
  nameScan.lastIndex = 0
  for (let match = nameScan.exec(text); match; match = nameScan.exec(text)) {
    const index = match.index + match[1].length
    found.push({ id: toId(match[2]), name: match[2], index })
    nameScan.lastIndex = index + match[2].length
  }
  return found
}

const flatOf = (block: string[]) =>
  block
    .join("\n")
    .replace(/-\n(?=[a-z])/g, "")
    .replace(/\/\n/g, "/")
    .replace(/\s+/g, " ")
    .trim()

// Sentences end at ".", "!" or "?" followed by a space.
const sentencesOf = (text: string) => text.replace(/([.!?])\s+/g, "$1\u0000").split("\u0000")

const diceRe = String.raw`\d+d\d+(?: [+−-] \d+)?`
const asDice = (text: string) => text.replace("−", "-")
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|")

// A stat block runs from its name line, which is followed by a "Large Beast, Unaligned" line, through the "CR" line
// and on to the next indented paragraph or the end of the block.
function statRegion(block: string[]): [number, number] | null {
  const at = block.findIndex((line, i) => line.trim() !== "" && !line.startsWith("\t") && /^(?:Tiny|Small|Medium|Large|Huge|Gargantuan)[^,]*, [A-Z]/.test(block[i + 1]?.trim() ?? ""))
  if (at < 0) return null
  const cr = block.findIndex((line, i) => i > at && line.startsWith("CR "))
  let end = cr + 1
  while (end < block.length && !block[end].startsWith("\t")) end++
  return [at, end]
}

const withoutStats = (block: string[]) => {
  const region = statRegion(block)
  return region ? [...block.slice(0, region[0]), ...block.slice(region[1])] : block
}

// Lines that start a paragraph in the PDF: the first line, indented lines, bullets, footnotes, lines after a bullet,
// and run-in labels ("Button 1. ...", "Dwarvish. ...") after a sentence end.
function paragraphStarts(block: string[]): string[] {
  const out: string[] = []
  let previous = ""
  let first = true
  for (const line of block) {
    if (line.trim() === "") continue
    const text = line.replace(/\s+/g, " ").trim()
    const label = /^(?:[A-Z][A-Za-z’-]*|\d+)(?: (?:[A-Z][A-Za-z’-]*|\d+|of|the|to|a|and|in|for|on)){0,4}\. [A-Z“]/.test(text) && /[.!?:)”]$/.test(previous)
    if (first || line.startsWith("\t") || text.startsWith("•") || text.startsWith("*") || previous.startsWith("•") || label) out.push(text)
    first = false
    previous = text
  }
  return out
}

type Gear = { id: string; cost?: { amount: number; unit: string }; healing?: { dice?: string }; spellScroll?: { spellLevel: number; saveDc: number; attackBonus: number } }

export default function verify(report: Report) {
  const items = readData<MagicItem>("magic-items")
  const official = officialItems()
  const officialByName = new Map(official.map((entry) => [entry.name, entry]))
  const byName = new Map(items.map((item) => [item.name, item]))
  const itemById = new Map(items.map((item) => [item.id, item]))

  /* ---------- coverage ---------- */

  const names = official.map((entry) => entry.name)
  report.check(
    "magic-items",
    `every one of the ${names.length} official headings is an entry`,
    names.length,
    names.filter((name) => !byName.has(name)).map((name) => `${name}: heading in the official text, no entry`)
  )
  report.check("magic-items", "every entry is an official heading, once", items.length, [
    ...items.filter((item) => !officialByName.has(item.name)).map((item) => `${item.name}: no such heading in the official text`),
    ...(items.length === names.length ? [] : [`${items.length} entries for ${names.length} headings`]),
    ...items.filter((item) => item.id !== toId(item.name)).map((item) => `${item.name}: id ${item.id} is not toId(name)`),
  ])
  const pairs = items.flatMap((item) => (officialByName.has(item.name) ? [{ item, off: officialByName.get(item.name) as Official }] : []))

  /* ---------- page ---------- */

  report.check(
    "magic-items",
    "page is where the heading and subtitle begin",
    pairs.length,
    pairs.flatMap(({ item, off }) => {
      const where = pageOf(`${off.name} ${off.category}`, 209)
      return [
        ...(item.page === off.page ? [] : [`${item.name}: page ${item.page}, official page ${off.page}`]),
        ...(where === off.page ? [] : [`${item.name}: heading text found first on page ${where}, not ${off.page}`]),
      ]
    })
  )

  /* ---------- the subtitle ---------- */

  report.check(
    "magic-items",
    "category",
    pairs.length,
    pairs.flatMap(({ item, off }) => (item.category === off.category.toLowerCase().replace(" ", "-") ? [] : [`${item.name}: ${item.category}, official ${off.category}`]))
  )

  const baseFailures: string[] = []
  for (const { item, off } of pairs) {
    if (off.baseText === undefined) {
      if (item.base) baseFailures.push(`${item.name}: has a base item, the subtitle has none`)
      continue
    }
    const [included, excluded] = off.baseText.split(", Except ")
    const base = item.base ?? {}
    if (included.startsWith("Any ")) {
      const words = included.toLowerCase().match(/light|medium|heavy|simple|martial|melee|ammunition/g) ?? []
      if (!sameSet(words, base.any ?? [])) baseFailures.push(`${item.name}: any ${JSON.stringify(base.any)}, official "${included}"`)
      if (base.items) baseFailures.push(`${item.name}: names items for an "Any" subtitle`)
    } else {
      const wanted = included.split(/,? or |, /).map((name) => toId(name))
      if (JSON.stringify(wanted) !== JSON.stringify(base.items ?? [])) baseFailures.push(`${item.name}: items ${JSON.stringify(base.items)}, official "${included}"`)
    }
    const wantedExcept = excluded ? [toId(excluded)] : []
    if (JSON.stringify(wantedExcept) !== JSON.stringify(base.except ?? [])) baseFailures.push(`${item.name}: except ${JSON.stringify(base.except)}, official "${excluded}"`)
  }
  report.check("magic-items", "base item restriction", pairs.length, baseFailures)

  const rarityFailures: string[] = []
  const variantFailures: string[] = []
  for (const { item, off } of pairs) {
    const withParen = [...off.rarityText.matchAll(new RegExp(String.raw`(${rarityNames.join("|")}) \(([^)]*)\)`, "g"))]
    if (withParen.length) {
      if (item.rarity !== "varies") rarityFailures.push(`${item.name}: ${item.rarity}, official lists several rarities`)
      const wanted = withParen.flatMap((match) => match[2].split(" or ").map((name) => `${name}=${toId(match[1])}`))
      const got = (item.variants ?? []).map((variant) => `${variant.name}=${variant.rarity}`)
      if (JSON.stringify(wanted) !== JSON.stringify(got)) variantFailures.push(`${item.name}: variants ${got.join(", ")}, official ${wanted.join(", ")}`)
    } else if (off.rarityText.startsWith("Rarity Varies")) {
      if (item.rarity !== "varies") rarityFailures.push(`${item.name}: ${item.rarity}, official "Rarity Varies"`)
    } else if (item.rarity !== toId(off.rarityText)) rarityFailures.push(`${item.name}: ${item.rarity}, official ${off.rarityText}`)
  }
  report.check("magic-items", "rarity", pairs.length, rarityFailures)

  const attuneFailures: string[] = []
  for (const { item, off } of pairs) {
    const got = item.attunement
    if (!off.attunes) {
      if (got) attuneFailures.push(`${item.name}: attunement set, official has none`)
      continue
    }
    if (!got || got.required !== true) {
      attuneFailures.push(`${item.name}: official requires attunement`)
      continue
    }
    if ((got.restriction ?? undefined) !== off.attunementBy) attuneFailures.push(`${item.name}: restriction "${got.restriction}", official "${off.attunementBy}"`)
    const by = off.attunementBy ?? ""
    const classes = classList.filter((name) => new RegExp(`\\b${name}\\b`).test(by)).map((name) => name.toLowerCase())
    if (!sameSet(classes, got.classes ?? [])) attuneFailures.push(`${item.name}: classes ${JSON.stringify(got.classes)}, official ${JSON.stringify(classes)}`)
    if (Boolean(got.spellcaster) !== /\bSpellcaster\b/.test(by)) attuneFailures.push(`${item.name}: spellcaster flag is ${got.spellcaster}`)
  }
  report.check("magic-items", "attunement: required, who may attune", pairs.length, attuneFailures)

  /* ---------- variants other than the subtitle's ---------- */

  const flat = (off: Official) => flatOf(off.block)
  // The text without a stat block: the numbers of a summoned creature are not the item's.
  const mech = (off: Official) => flatOf(withoutStats(off.block))
  const variantRows: string[] = []
  const variantsOf = (id: string): MagicItemVariant[] => itemById.get(id)?.variants ?? []
  const offOf = (name: string) => officialByName.get(name) as Official
  const compareVariants = (id: string, name: string, wanted: string[], pick: (variant: MagicItemVariant) => string) => {
    const got = variantsOf(id).map(pick)
    variantRows.push(...(JSON.stringify(got) === JSON.stringify(wanted) ? [] : [`${name}: variants ${got.join("; ")}, official ${wanted.join("; ")}`]))
  }
  const rarityGroup = rarityNames.join("|")
  for (const [id, name, label] of [
    ["belt-of-giant-strength", "Belt of Giant Strength", "Belt"],
    ["potion-of-giant-strength", "Potion of Giant Strength", "Potion"],
  ] as const) {
    const wanted = [...flat(offOf(name)).matchAll(new RegExp(String.raw`${label} of Giant Strength \(([^)]+)\) (\d+) (${rarityGroup})`, "g"))].map(
      (match) => `${label} of Giant Strength (${match[1]})=${toId(match[3])}/${match[2]}`
    )
    compareVariants(id, name, wanted, (variant) => `${variant.name}=${variant.rarity}/${variant.strength}`)
  }
  {
    const text = flat(offOf("Potions of Healing"))
    const wanted = [...text.matchAll(new RegExp(String.raw`(Potion of Healing(?: \((?:greater|superior|supreme)\))?) (${diceRe}) (${rarityGroup})`, "g"))].map(
      (match) => `${match[1]}=${toId(match[3])}/${asDice(match[2])}`
    )
    compareVariants("potions-of-healing", "Potions of Healing", wanted, (variant) => `${variant.name}=${variant.rarity}/${variant.healing}`)
  }
  {
    const text = flat(offOf("Spell Scroll"))
    const wanted = [...text.matchAll(new RegExp(String.raw`(Cantrip|\d) (${rarityGroup}) (\d+) \+(\d+)`, "g"))].map(
      (match) => `${match[1] === "Cantrip" ? "Cantrip" : `Level ${match[1]}`}=${toId(match[2])}/${match[3]}/${match[4]}/${match[1] === "Cantrip" ? 0 : match[1]}`
    )
    compareVariants("spell-scroll", "Spell Scroll", wanted, (variant) => `${variant.name}=${variant.rarity}/${variant.saveDc}/${variant.attackBonus}/${variant.spellLevel}`)
  }
  for (const [id, name] of [
    ["feather-token", "Feather Token"],
    ["figurine-of-wondrous-power", "Figurine of Wondrous Power"],
    ["ioun-stone", "Ioun Stone"],
  ] as const) {
    const wanted = [
      ...offOf(name)
        .block.join("\n")
        .matchAll(new RegExp(String.raw`^\t ([A-Z][A-Za-z ]+) \((${rarityGroup})\)\. `, "gm")),
    ].map((match) => `${match[1]}=${toId(match[2])}`)
    // The parts of the Ivory Goats are variants of the same rarity, but they are not printed with a rarity of their own.
    const unnamed = new Set(["Goat of Terror", "Goat of Traveling", "Goat of Travail"])
    const got = variantsOf(id).filter((variant) => !unnamed.has(variant.name))
    variantRows.push(
      ...(JSON.stringify(got.map((v) => `${v.name}=${v.rarity}`)) === JSON.stringify(wanted) ? [] : [`${name}: variants ${got.map((v) => v.name).join("; ")}, official ${wanted.join("; ")}`])
    )
  }
  report.check("magic-items", "variants: subtitle, tables and paragraphs list the same names and rarities", pairs.filter(({ item }) => item.variants).length + 9, [...variantFailures, ...variantRows])

  // The Feather Tokens table gives each token's rarity a second time.
  {
    const table = (itemById.get("feather-token")?.tables ?? [])[0]
    const failures = (table?.rows ?? []).flatMap((row) => {
      const variant = variantsOf("feather-token").find((entry) => entry.name.toLowerCase() === row.cells[0].toLowerCase())
      return variant && variant.rarity === toId(row.cells[1]) ? [] : [`feather token ${row.cells[0]}: table says ${row.cells[1]}, variant ${variant?.rarity}`]
    })
    report.check("magic-items", "Feather Tokens table agrees with the token variants", table?.rows.length ?? 0, failures)
  }

  /* ---------- prose and completeness ---------- */

  report.check(
    "magic-items",
    "every sentence of the description is in the official text",
    pairs.length,
    pairs.flatMap(({ item }) => missingSentences(item.description).map((sentence) => `${item.name}: "${sentence.slice(0, 80)}" is not official`))
  )
  report.check(
    "magic-items",
    "description is inside the entry's own pages",
    pairs.length,
    pairs.flatMap(({ item, off }) => {
      const lastPage = off.page + 1
      const sentences = item.description
        .split("\n")
        .flatMap((paragraph) => sentencesOf(paragraph))
        .filter((sentence) => squash(sentence).length >= 30)
      const outside = sentences.filter((sentence) => !pagesOf(sentence).some((page) => page >= off.page && page <= lastPage))
      return outside.slice(0, 3).map((sentence) => `${item.name}: "${sentence.slice(0, 60)}" is not on pages ${off.page} to ${lastPage}`)
    })
  )

  // Remove the description's paragraphs, the table cells and the stat block text from the block. What is left must be
  // table furniture (die ranges, column headings, captions) or the labels of a stat block. Anything else is text the
  // data lost.
  const statLabels = /^(?:ac|initiative|hp|speed|mod|save|str|dex|con|int|wis|cha|resistances|immunities|senses|languages|cr|traits|actions|bonusactions)*$/
  const leftovers: string[] = []
  for (const { item, off } of pairs) {
    let rest = squash(off.block.join("\n"))
    const missing: string[] = []
    const take = (piece: string) => {
      const needle = squash(piece)
      if (/^[+\d]*$/.test(needle)) return true
      const at = rest.indexOf(needle)
      if (at < 0) return false
      rest = rest.slice(0, at) + rest.slice(at + needle.length)
      return true
    }
    for (const paragraph of item.description.split("\n")) {
      if (take(paragraph)) continue
      for (const sentence of sentencesOf(paragraph)) if (!take(sentence)) missing.push(sentence)
    }
    // Longest cells first, so "Badger" is not taken out of "Giant Badger".
    const cells = (item.tables ?? []).flatMap((table) => table.rows.flatMap((row) => row.cells)).sort((a, b) => b.length - a.length)
    for (const cell of cells) if (!take(cell)) missing.push(cell)
    for (const stat of item.statBlocks ?? []) {
      const pieces = [
        stat.name,
        stat.type,
        stat.ac,
        stat.hp,
        stat.speed,
        stat.resistances,
        stat.immunities,
        stat.senses,
        stat.languages,
        stat.cr,
        ...[...(stat.traits ?? []), ...(stat.actions ?? []), ...(stat.bonusActions ?? [])].map((entry) => `${entry.name}. ${entry.text}`),
      ]
      for (const piece of pieces) if (piece && !take(piece)) missing.push(piece)
    }
    // Captions and die headings first, then plain headings, so "d" + "effect" is taken whole before "effect" alone.
    const furniture: string[][] = [[], [], []]
    for (const table of item.tables ?? []) {
      const heading = squash(table.columns.join("")).replace(/\d/g, "")
      furniture[0].push(squash(table.caption ?? ""))
      furniture[1].push(table.dice ? `d${heading}` : heading)
      furniture[2].push(heading)
    }
    rest = rest.replace(/\d/g, "")
    for (const group of furniture) {
      for (let changed = true; changed; ) {
        changed = false
        for (const piece of group) {
          if (piece && rest.includes(piece)) {
            rest = rest.replace(piece, "")
            changed = true
          }
        }
      }
    }
    if (item.statBlocks && statLabels.test(rest)) rest = ""
    if (missing.length) leftovers.push(`${item.name}: not found in the block: "${missing[0].slice(0, 60)}"`)
    if (rest) leftovers.push(`${item.name}: ${rest.length} letters of official text are in no field: "${rest.slice(0, 60)}"`)
  }
  report.check("magic-items", "description, tables and stat blocks hold all of the entry's official text and nothing else", pairs.length, leftovers)

  // Table cells must not be left in a description. A run of six or more short lines without a full stop is a table
  // (or a stat block); its text must not sit in the description.
  const strayFailures: string[] = []
  for (const { item, off } of pairs) {
    const block = withoutStats(off.block)
    const description = squash(item.description)
    let run: string[] = []
    const flush = () => {
      if (run.length >= 6) {
        const text = squash(run.join(" "))
        if (text.length >= 12 && description.includes(text)) strayFailures.push(`${item.name}: ${run.length} table lines ("${run[0].trim()}", …) are in the description`)
      }
      run = []
    }
    for (const line of block) {
      const text = line.trim()
      if (text !== "" && !line.startsWith("\t") && !text.startsWith("•") && !text.startsWith("*") && text.split(" ").length <= 4 && !/[.!?:]$/.test(text)) run.push(text)
      else if (text !== "") flush()
    }
    flush()
  }
  report.check("magic-items", "no table cells are left in a description", pairs.length, strayFailures)

  // A description must not end with the caption of its own table, and no text may break a name after a slash.
  const glueFailures: string[] = []
  const raw = pages.join("\n")
  for (const { item } of pairs) {
    for (const table of item.tables ?? [])
      if (table.caption && squash(item.description).endsWith(squash(table.caption))) glueFailures.push(`${item.name}: the description ends with the caption "${table.caption}"`)
    const strings = [item.description, ...(item.tables ?? []).flatMap((table) => table.rows.flatMap((row) => row.cells))]
    for (const text of strings) {
      for (const match of text.matchAll(/(\S*)\/ (\S+)/g))
        if (!raw.includes(`${match[1]}/ ${match[2]}`)) glueFailures.push(`${item.name}: "${match[0]}" has a space after a slash that the official text does not print`)
    }
  }
  report.check("magic-items", "no description ends with its table's caption, no space after a slash that is not printed", pairs.length, glueFailures)

  // Paragraph breaks: every paragraph start in the official block is a paragraph start in the data, and the other way.
  const paragraphFailures: string[] = []
  for (const { item, off } of pairs) {
    const startsOfficial = paragraphStarts(withoutStats(off.block)).map((text) => squash(text).slice(0, 24))
    const dataParagraphs = item.description.split("\n").map((paragraph) => squash(paragraph))
    for (const start of startsOfficial) {
      if (start.length < 8) continue
      // A table caption or a table cell can begin a block line, so the start counts when a table holds the text.
      const inTable = (item.tables ?? []).some((table) => squash(`${table.caption ?? ""}${table.rows.map((row) => row.cells.join("")).join("")}`).includes(start))
      if (!dataParagraphs.some((paragraph) => paragraph.startsWith(start)) && !inTable && !(item.statBlocks && statRegion(off.block)))
        paragraphFailures.push(`${item.name}: the paragraph beginning "${start}" is not a paragraph start in the data`)
    }
    for (const paragraph of dataParagraphs) {
      if (!startsOfficial.some((start) => start.length >= 8 && paragraph.startsWith(start)) && paragraph.length >= 8)
        paragraphFailures.push(`${item.name}: the paragraph beginning "${paragraph.slice(0, 24)}" does not start where the PDF starts one`)
    }
  }
  report.check("magic-items", "paragraph breaks: paragraph starts agree with the PDF both ways", pairs.length, paragraphFailures)

  /* ---------- tables ---------- */

  const checkTable = (table: ItemTable, label: string, block: string, failures: string[]) => {
    // The caption, die and column headings are the printed ones, in order.
    // The headings are followed by the first row, or by the same headings again (a two-up table prints them twice).
    const first = table.rows[0]
    const head = squash(table.dice ?? "") + squash(table.columns.join(""))
    const after = squash(
      (first.roll
        ? `${table.dice === "1d100" ? String(first.roll.min % 100).padStart(2, "0") : first.roll.min}${first.roll.max === first.roll.min ? "" : `–${table.dice === "1d100" ? String(first.roll.max % 100).padStart(2, "0") : first.roll.max}`}`
        : "") + first.cells.join("")
    )
    if (!block.includes(squash(table.caption ?? "") + head + after) && !block.includes(squash(table.caption ?? "") + head + head + after))
      failures.push(`${label}: the headings "${table.caption ?? ""} ${table.dice ?? ""} ${table.columns.join(" / ")}" are not the printed ones, in order, before the first row`)
    for (const row of table.rows) if (row.cells.length !== table.columns.length) failures.push(`${label}: a row has ${row.cells.length} cells for ${table.columns.length} columns`)
    if (table.dice && table.rows.some((row, i) => i > 0 && (row.roll?.min ?? 0) <= (table.rows[i - 1].roll?.min ?? 0))) failures.push(`${label}: rows are not in roll order`)
    if (table.dice) {
      const sides = Number(table.dice.slice(2))
      const covered = new Array<number>(sides + 1).fill(0)
      for (const row of table.rows) for (let n = row.roll?.min ?? 0; n <= (row.roll?.max ?? -1); n++) covered[n]++
      const bad = covered.slice(1).findIndex((count) => count !== 1)
      if (bad >= 0) failures.push(`${label}: roll ${bad + 1} is covered ${covered[bad + 1]} times on ${table.dice}`)
    }
    for (const row of table.rows) {
      const pad = (n: number) => (table.dice === "1d100" ? String(n % 100).padStart(2, "0") : String(n))
      const roll = row.roll ? (row.roll.min === row.roll.max ? pad(row.roll.min) : `${pad(row.roll.min)}–${pad(row.roll.max)}`) : ""
      if (row.cells.some((cell) => !inOfficial(cell))) failures.push(`${label}: a cell is not official text: ${row.cells.join(" | ").slice(0, 80)}`)
      else if (!block.includes(squash(roll + row.cells.join("")))) failures.push(`${label}: row "${roll} ${row.cells.join(" | ").slice(0, 60)}" is not contiguous in the block`)
    }
  }
  const tableFailures: string[] = []
  let tableTotal = 0
  for (const { item, off } of pairs) {
    const block = squash(off.block.join("\n"))
    for (const table of item.tables ?? []) {
      tableTotal++
      checkTable(table, `${item.name} ${table.caption ?? table.columns.join("/")}`, block, tableFailures)
    }
  }
  report.check("magic-items", "tables: rolls cover the die once, every row is contiguous official text", tableTotal, tableFailures)

  /* ---------- stat blocks ---------- */

  const statFailures: string[] = []
  let statTotal = 0
  for (const { item, off } of pairs) {
    const region = statRegion(off.block)
    const blocks = item.statBlocks ?? []
    if (!region) {
      if (blocks.length) statFailures.push(`${item.name}: lists a stat block, the text prints none`)
      continue
    }
    statTotal++
    if (blocks.length !== 1) {
      statFailures.push(`${item.name}: the text prints one stat block, the data holds ${blocks.length}`)
      continue
    }
    const stat = blocks[0]
    const lines = off.block.slice(region[0], region[1]).map((line) => line.replace(/\s+/g, " ").trim())
    const text = flatOf(off.block.slice(region[0], region[1])).replace(/−/g, "-")
    const pick = (re: RegExp) => re.exec(text)?.[1]?.trim()
    const expect = (label: string, got: string | undefined, wanted: string | undefined) => {
      if ((got ?? "") !== (wanted ?? "")) statFailures.push(`${item.name}: stat block ${label} is "${got}", the text says "${wanted}"`)
    }
    expect("name", stat.name, lines[0])
    expect("type", stat.type, lines[1])
    expect("ac", stat.ac, pick(/\bAC (\S+)/))
    expect("hp", stat.hp, pick(/\bHP (.+?) Speed /))
    expect("speed", stat.speed, pick(/\bSpeed (.+?) MOD SAVE/))
    expect("resistances", stat.resistances, pick(/\bResistances (.+?) (?:Immunities|Senses) /))
    expect("immunities", stat.immunities, pick(/\bImmunities (.+?) Senses /))
    expect("senses", stat.senses, pick(/\bSenses (.+?) Languages /))
    expect("languages", stat.languages, pick(/\bLanguages (.+?) CR /))
    expect("cr", stat.cr, pick(/\bCR (.+?)(?: Traits| Actions| Bonus Actions|$)/))
    for (const key of ["str", "dex", "con", "int", "wis", "cha"] as const) {
      const label = `${key[0].toUpperCase()}${key.slice(1)}`
      const match = new RegExp(`${label} (\\d+) ([+-]\\d+) ([+-]\\d+)`).exec(text)
      const got = stat.abilities[key]
      if (!match || got.score !== Number(match[1]) || got.modifier !== Number(match[2]) || got.save !== Number(match[3]))
        statFailures.push(`${item.name}: ${key} is ${got.score} ${got.modifier} ${got.save}, the text says ${match?.slice(1, 4).join(" ")}`)
    }
    // Entries: the count of "Name. text" lines under each heading, and each entry's own words.
    const headings = ["Traits", "Actions", "Bonus Actions"]
    const counts = headings.map((heading) => {
      const at = lines.indexOf(heading)
      if (at < 0) return 0
      const stop = lines.findIndex((line, i) => i > at && headings.includes(line))
      return lines.slice(at + 1, stop < 0 ? undefined : stop).filter((line, i, all) => /^[A-Z][A-Za-z’ ]+\. /.test(line) && (i === 0 || /[.!?)”]$/.test(all[i - 1]))).length
    })
    const got = [stat.traits?.length ?? 0, stat.actions?.length ?? 0, stat.bonusActions?.length ?? 0]
    if (counts.join() !== got.join()) statFailures.push(`${item.name}: stat block has ${got.join("/")} traits, actions and bonus actions, the text has ${counts.join("/")}`)
    for (const entry of [...(stat.traits ?? []), ...(stat.actions ?? []), ...(stat.bonusActions ?? [])])
      if (!inOfficial(`${entry.name}. ${entry.text}`)) statFailures.push(`${item.name}: ${entry.name} is not official text`)
  }
  report.check("magic-items", "stat blocks: every printed line and number, and nothing else", statTotal + 1, statFailures)

  /* ---------- the typed effects against two independent readings ---------- */

  compareEffects(report, items)

  /* ---------- structure of the typed effects ---------- */

  // What the data says must be official wording, and every name and number must be in the text.
  const structureFailures: string[] = []
  const spellsData = existsSync(dataPath("spells")) ? new Set(readData<{ id: string }>("spells").map((spell) => spell.id)) : null
  let structureTotal = 0
  for (const { item, off } of pairs) {
    const text = mech(off)
    const named = new Set(spellMentions(flat(off)).map((mention) => mention.id))
    const bonuses = [...(item.bonuses ?? []), ...(item.conditionalBonuses ?? []), ...(item.variants ?? []).flatMap((variant) => variant.conditionalBonuses ?? [])]
    for (const bonus of bonuses) {
      structureTotal++
      if (!inOfficial(bonus.text)) structureFailures.push(`${item.name}: bonus sentence is not official`)
      if ("appliesWhen" in bonus)
        for (const part of (bonus as { appliesWhen: string }).appliesWhen.split("; ")) if (!inOfficial(part)) structureFailures.push(`${item.name}: "${part}" is not official wording`)
      if (!bonus.text.includes(`+${bonus.value}`) && !bonus.text.includes(`increase by ${bonus.value}`) && !bonus.text.includes(`increases by ${bonus.value}`))
        structureFailures.push(`${item.name}: +${bonus.value} is not in the sentence of ${bonus.to}`)
    }
    for (const damage of [...(item.damage ?? []), ...(item.variants ?? []).flatMap((variant) => variant.damage ?? [])]) {
      structureTotal++
      if (!inOfficial(damage.text)) structureFailures.push(`${item.name}: damage sentence is not official`)
      // A table of dice by a count (the lightning spheres) names its row as "Column value".
      const rowLabel = (part: string) => (item.tables ?? []).some((table) => !table.dice && table.rows.some((row) => part === `${table.columns[0]} ${row.cells[0]}`))
      for (const part of (damage.appliesWhen ?? "").split("; ")) if (part && !rowLabel(part) && !inOfficial(part)) structureFailures.push(`${item.name}: "${part}" is not official wording`)
      if (damage.type !== "weapon" && !damage.text.includes(damage.type.charAt(0).toUpperCase() + damage.type.slice(1)))
        structureFailures.push(`${item.name}: damage sentence does not name ${damage.type}`)
      if (
        !damage.text.includes(String(damage.dice ?? damage.amount).replace("-", "−")) &&
        !damage.text.includes(String(damage.dice ?? damage.amount)) &&
        !damage.text.includes("as shown in the following table")
      )
        structureFailures.push(`${item.name}: damage sentence does not hold ${damage.dice ?? damage.amount}`)
    }
    for (const save of [...(item.saves ?? []), ...(item.variants ?? []).flatMap((variant) => variant.saves ?? [])]) {
      structureTotal++
      if (!text.includes(`DC ${save.dc}`)) structureFailures.push(`${item.name}: DC ${save.dc} is not in the text`)
      if (save.label && !inOfficial(save.label)) structureFailures.push(`${item.name}: label "${save.label}" is not official wording`)
    }
    const spells = [...(item.spells ?? []), ...(item.variants ?? []).flatMap((variant) => variant.spells ?? [])]
    const effects = [...(item.spellEffects ?? []), ...(item.variants ?? []).flatMap((variant) => variant.spellEffects ?? [])]
    for (const spell of [...spells, ...effects]) {
      structureTotal++
      if (!officialSpellIds.has(spell.id)) structureFailures.push(`${item.name}: ${spell.id} is not a spell of the official text`)
      else if (!named.has(spell.id)) structureFailures.push(`${item.name}: ${officialSpellIds.get(spell.id)} is not named in the text`)
      if (spellsData && !spellsData.has(spell.id)) structureFailures.push(`${item.name}: ${spell.id} is not in spells.json`)
    }
    for (const table of item.tables ?? []) {
      for (const row of table.rows) {
        for (const id of [...(row.spells ?? []).map((spell) => spell.id), ...(row.spellEffects ?? []).map((effect) => effect.id)]) {
          structureTotal++
          if (!officialSpellIds.has(id)) structureFailures.push(`${item.name}: row spell ${id} is not a spell of the official text`)
          else if (!spellMentions(row.cells.join(" ")).some((mention) => mention.id === id)) structureFailures.push(`${item.name}: row spell ${officialSpellIds.get(id)} is not named in its row`)
          if (spellsData && !spellsData.has(id)) structureFailures.push(`${item.name}: row spell ${id} is not in spells.json`)
        }
      }
      // Spell tables, read from the table surface: each row is a listed spell with its printed cost, level and group.
      if (table.columns[0] === "Spell" && table.columns[1] === "Charge Cost") {
        for (const row of table.rows) {
          structureTotal++
          const first = spellMentions(row.cells[0])[0]
          const spell = (item.spells ?? []).find((entry) => entry.id === first?.id)
          const cost = /^(\d+)/.exec(row.cells[1])?.[1]
          const level = /\(level (\d) version\)/.exec(row.cells[0])?.[1]
          const perLevel = /per spell level/.test(row.cells[1])
          if (perLevel ? !spell?.chargesPerSpellLevel || spell.charges !== undefined : !spell || spell.charges !== Number(cost))
            structureFailures.push(`${item.name}: ${row.cells[0]} costs ${row.cells[1]}, listed ${spell?.charges}`)
          if (spell && spell.level !== (level ? Number(level) : undefined)) structureFailures.push(`${item.name}: ${row.cells[0]} level ${spell.level}, the row says ${level}`)
        }
      }
      if (table.columns[1] === "Spells (Charges)") {
        const expected = table.rows.flatMap((row) => [...row.cells[1].matchAll(/([A-Z][A-Za-z/ ]+?) \((\d+) charges?\)/g)].map((match) => `${toId(match[1])}:${row.cells[0]}:${match[2]}`))
        const got = (item.spells ?? []).map((spell) => `${spell.id}:${spell.group}:${spell.charges}`)
        structureTotal += expected.length
        if (!sameSet(expected, got)) structureFailures.push(`${item.name}: spells by plane ${got.join(", ")}, the table has ${expected.join(", ")}`)
      }
      if (table.columns.join("|") === "Bead|Spell") {
        for (const row of table.rows) {
          structureTotal++
          if (!officialSpellIds.has(toId(row.cells[1].replace(/ \([^)]*\)$/, "")))) structureFailures.push(`${item.name}: ${row.cells[1]} is not a spell of the official text`)
        }
      }
    }
  }
  // Effects that one expenditure of charges brings about each carry the same `charges` and the same `label`, so a cost is paid once
  // for a label. These items spend one charge on a save and a roll together (hand-kept from the text).
  const sharedCharges: Record<string, string[]> = {
    "staff-of-withering": ["deal an extra 2d10 Necrotic damage"],
    "talisman-of-pure-good": ["Pure Rebuke"],
    "talisman-of-ultimate-evil": ["Ultimate End"],
    "ring-of-shooting-stars": ["Shooting Stars"],
  }
  for (const item of items) {
    const wanted = sharedCharges[item.id] ?? []
    structureTotal += wanted.length
    for (const label of wanted) {
      const saves = (item.saves ?? []).filter((save) => save.label === label)
      const rolls = (item.damage ?? []).filter((roll) => roll.label === label)
      if (saves.length !== 1 || rolls.length !== 1 || !saves[0].charges || saves[0].charges !== rolls[0].charges)
        structureFailures.push(
          `${item.name}: "${label}" save and roll must share one label and the same charges, the data has ${JSON.stringify(saves.map((save) => save.charges))} and ${JSON.stringify(rolls.map((roll) => roll.charges))}`
        )
    }
    // Any save and roll that share a label share the charges.
    for (const save of item.saves ?? [])
      for (const roll of item.damage ?? [])
        if (save.label !== undefined && save.label === roll.label && save.charges !== roll.charges) structureFailures.push(`${item.name}: "${save.label}" save and roll carry different charges`)
  }
  report.check("magic-items", "typed effects: official wording, names and numbers found in the text, spell tables read by row", structureTotal, structureFailures)

  // Ability checks with a DC, kept by hand from the text: ability, skill and DC for each.
  const checksByHand = [
    "amulet-of-the-planes:int:arcana:15",
    "apparatus-of-the-crab:int:investigation:20",
    "bag-of-devouring:str:athletics:15",
    "bag-of-devouring:str:athletics:20",
    "deck-of-illusions:int:investigation:15",
    "dimensional-shackles:str:athletics:30",
    "energy-bow:str:athletics:20",
    "immovable-rod:str:athletics:30",
    "iron-bands:str:athletics:20",
    "portable-hole:str:athletics:10",
    "sphere-of-annihilation:int:arcana:25",
    "rope-of-entanglement:str:athletics:15",
    "rope-of-entanglement:dex:acrobatics:15",
  ]
  const gotChecks = items.flatMap((item) => (item.checks ?? []).map((check) => `${item.id}:${check.ability}:${check.skill}:${check.dc}`))
  report.check(
    "magic-items",
    "ability checks with a DC match the hand-kept table",
    checksByHand.length,
    sameSet(gotChecks, checksByHand) ? [] : [`checks are ${gotChecks.join(", ")}, the table has ${checksByHand.join(", ")}`]
  )

  // The spells and spell effects of the rows of random tables, and the rolls typed on a table's rows, kept by hand from
  // the text: "item:first roll:spells|effects".
  const rowTable = [
    "hat-of-many-spells:1:enlarge-reduce~enlarge effect,enlarge-reduce~reduce effect^0,faerie-fire^0,fireball^0,gust-of-wind^0,invisibility!^0,lightning-bolt^0,phantasmal-force^0,polymorph^0,stinking-cloud^0|",
    "wand-of-wonder:1:darkness#15,faerie-fire#15^0,fireball#15^0,slow#15^0,stinking-cloud#15^0|",
    "wand-of-wonder:26:gust-of-wind#15|",
    "wand-of-wonder:46:lightning-bolt#15|",
    "wand-of-wonder:51:|enlarge-reduce~enlarged",
    "wand-of-wonder:69:|enlarge-reduce~shrink",
    "wand-of-wonder:83:invisibility#15!|",
    "wand-of-wonder:93:polymorph#15|",
    "necklace-of-prayer-beads:1:bless|",
    "necklace-of-prayer-beads:7:cure-wounds@2|",
    "necklace-of-prayer-beads:13:greater-restoration|",
    "necklace-of-prayer-beads:17:shining-smite|",
    "necklace-of-prayer-beads:19:guardian-of-faith|",
    "necklace-of-prayer-beads:20:wind-walk|",
  ]
  const gotRows = items.flatMap((item) =>
    (item.tables ?? []).flatMap((table) =>
      table.rows.flatMap((row) =>
        row.spells || row.spellEffects
          ? [
              `${item.id}:${row.roll?.min}:${(row.spells ?? []).map((spell) => `${spell.id}${spell.label ? `~${spell.label}` : ""}${spell.level ? `@${spell.level}` : ""}${spell.saveDc ? `#${spell.saveDc}` : ""}${spell.selfOnly ? "!" : ""}${spell.alternativeTo === undefined ? "" : `^${spell.alternativeTo}`}`).join(",")}|${(row.spellEffects ?? []).map((effect) => `${effect.id}${effect.label ? `~${effect.label}` : ""}`).join(",")}`,
            ]
          : []
      )
    )
  )
  const rowDamage = items.flatMap((item) =>
    (item.tables ?? []).flatMap((table) =>
      table.rows.flatMap((row) => (row.damage ?? []).map((roll) => `${item.id}:${row.roll?.min ?? row.cells[0]}:${roll.dice}:${roll.type}:${roll.role}:${roll.appliesWhen ?? ""}`))
    )
  )
  const rowDamageByHand = [
    "apparatus-of-the-crab:5:2d6:bludgeoning:effect:Each extended claw makes the following melee attack: +8 to hit, reach 5 ft. Hit: 7 (2d6) Bludgeoning damage",
    "bag-of-beans:1:5d6:poison:effect:On an odd roll",
    "bag-of-beans:81:10d6:force:effect:",
    "wand-of-wonder:31:1d6:psychic:to-user:",
    "ring-of-shooting-stars:1:4d12:lightning:effect:",
    "ring-of-shooting-stars:2:5d4:lightning:effect:",
    "ring-of-shooting-stars:3:2d6:lightning:effect:",
    "ring-of-shooting-stars:4:2d4:lightning:effect:",
  ]
  const usesWithCount = items.flatMap((item) =>
    (item.uses ?? []).flatMap((use) => (use.count === undefined && use.minutes === undefined ? [] : [`${item.id}:${use.count ?? `${use.minutes} minutes`}:${use.recharge ?? "never"}`]))
  )
  report.check("magic-items", "spells of table rows, damage typed on table rows and use counts match the hand-kept tables", rowTable.length + rowDamageByHand.length + 1, [
    ...(sameSet(gotRows, rowTable) ? [] : [`row spells are ${gotRows.join("; ")}, the table has ${rowTable.join("; ")}`]),
    ...(sameSet(rowDamage, rowDamageByHand) ? [] : [`row damage is ${rowDamage.join("; ")}, the table has ${rowDamageByHand.join("; ")}`]),
    ...(sameSet(usesWithCount, ["bag-of-tricks:3:dawn", "boots-of-speed:10 minutes:long-rest", "candle-of-invocation:240 minutes:never", "chime-of-opening:10:never", "mysterious-deck:1d3:never"])
      ? []
      : [
          `counted uses are ${usesWithCount.join("; ")}, the text gives three fuzzy objects before the dawn for the Bag of Tricks, four hours of burning for the Candle (240 minutes), ten minutes of the Boots of Speed before a Long Rest, ten uses of the chime, 1d3 castings of Wish, and no count for the beads`,
        ]),
  ])

  // Every "DC n" in the prose is one a field states, or one printed only inside a table row of the item.
  const dcWaivers: string[] = []
  const dcAccount: string[] = []
  for (const { item, off } of pairs) {
    const fields = [...(item.saves ?? []), ...(item.variants ?? []).flatMap((variant) => variant.saves ?? [])].map((save) => save.dc)
    const spellDcs = [...(item.spells ?? []), ...(item.spellEffects ?? []), ...(item.variants ?? []).flatMap((variant) => [...(variant.spells ?? []), ...(variant.spellEffects ?? [])])].flatMap(
      (spell) => (spell.saveDc ? [spell.saveDc] : [])
    )
    const stated = new Set<number>([...fields, ...(item.checks ?? []).map((check) => check.dc), ...spellDcs])
    const inRows = (item.tables ?? []).flatMap((table) => table.rows.flatMap((row) => row.cells)).join(" ")
    const text = mech(off)
    for (const match of text.matchAll(/DC (\d+)\b(?! plus)/g)) {
      const number = Number(match[1])
      if (stated.has(number) || inRows.includes(`DC ${number}`)) continue
      if (item.id === "apparatus-of-the-crab" && number === 15 && /escape DC 15/.test(text)) continue
      dcAccount.push(`${item.name}: DC ${number} is in the text but in no field ("…${text.slice(Math.max(0, (match.index ?? 0) - 60), (match.index ?? 0) + 60)}…")`)
    }
  }
  report.check("magic-items", "every DC in the text is a field or a table row", pairs.length, dcAccount, dcWaivers)

  const cursedFailures: string[] = []
  const consumableFailures: string[] = []
  const usedUpPhrases =
    /single-use|enough of it for one use|dust is consumed|ceases to be magical|no longer magical|becomes nonmagical|explodes in a 10-foot-radius Sphere on impact and is destroyed|dissolves on your tongue/
  // The items the text itself says are used up, besides Potions and Scrolls, read from the chapter.
  const usedUp = new Set([
    "ammunition-1-2-or-3",
    "ammunition-of-slaying",
    "bead-of-force",
    "bead-of-nourishment",
    "dust-of-disappearance",
    "dust-of-sneezing-and-choking",
    "elemental-gem",
    "feather-token",
  ])
  for (const { item, off } of pairs) {
    const curse = off.block.some((line) => /^\t? ?Curse\. /.test(line))
    if (Boolean(item.cursed) !== curse) cursedFailures.push(`${item.name}: cursed ${item.cursed}, official ${curse ? "has a Curse paragraph" : "none"}`)
    if (!curse && /\bis cursed\b|\bthis (?:armor|weapon|shield) is cursed/i.test(flat(off))) cursedFailures.push(`${item.name}: the text says it is cursed, no Curse paragraph`)
    const wantUsed = item.category === "potion" || item.category === "scroll" || usedUp.has(item.id)
    if (Boolean(item.consumable) !== wantUsed) consumableFailures.push(`${item.name}: consumable ${item.consumable}`)
    if (item.consumable && item.category !== "potion" && item.category !== "scroll" && !usedUpPhrases.test(flat(off))) consumableFailures.push(`${item.name}: no phrase in the text says it is used up`)
  }
  report.check("magic-items", "cursed: items with a Curse paragraph", pairs.length, cursedFailures)
  report.check("magic-items", "consumable: Potions, Scrolls and items the text says are used up", pairs.length, consumableFailures)

  /* ---------- activation and reuse ---------- */

  const actionFailures: string[] = []
  const reuseFailures: string[] = []
  const kinds: [string, RegExp][] = [
    ["magic-action", /\bMagic action\b/],
    ["bonus-action", /\bBonus Action\b/],
    ["utilize-action", /\bUtilize action\b/],
    ["reaction", /\bReaction\b/],
  ]
  // Items whose only Bonus Action dismisses or ends an effect: "when you dismiss it as a Bonus Action". That is not how they are used.
  const dismissOnly: Record<string, string[]> = {
    "bowl-of-commanding-water-elementals": ["bonus-action"],
    "brazier-of-commanding-fire-elementals": ["bonus-action"],
    "censer-of-controlling-air-elementals": ["bonus-action"],
    "stone-of-controlling-earth-elementals": ["bonus-action"],
    "elemental-gem": ["bonus-action"],
    "potion-of-gaseous-form": ["bonus-action"],
    "staff-of-the-python": ["bonus-action"],
    "bead-of-force": ["utilize-action"],
  }
  for (const { item, off } of pairs) {
    const text = flat(off)
    const wanted = kinds.filter(([kind, pattern]) => pattern.test(text) && !(dismissOnly[item.id] ?? []).includes(kind)).map(([kind]) => kind)
    if (!sameSet(wanted, item.activation ?? [])) actionFailures.push(`${item.name}: activation ${JSON.stringify(item.activation)}, the text names ${wanted.join(", ") || "none"}`)
    const reuse = new Set<string>()
    for (const sentence of sentencesOf(text)) {
      if (!/can’t|cannot|ceases to function/.test(sentence)) continue
      if (/until the next dawn/.test(sentence)) reuse.add("dawn")
      if (/until you finish a Short or Long Rest/.test(sentence)) reuse.add("short-or-long-rest")
      else if (/until you finish a Long Rest/.test(sentence)) reuse.add("long-rest")
      else if (/until you finish a Short Rest/.test(sentence)) reuse.add("short-rest")
    }
    // Each prayer bead has its own use, and no one use holds them: `uses` is untyped (p. 233).
    if (item.id === "necklace-of-prayer-beads") {
      if (item.uses?.length || !item.untyped?.includes("uses") || !reuse.has("dawn")) reuseFailures.push(`${item.name}: uses ${JSON.stringify(item.uses)}, untyped ${JSON.stringify(item.untyped)}`)
      continue
    }
    if (!sameSet([...reuse], [...new Set((item.uses ?? []).flatMap((use) => (use.recharge ? [use.recharge] : [])))]))
      reuseFailures.push(`${item.name}: uses ${JSON.stringify(item.uses)}, the text says ${[...reuse].join(", ") || "none"}`)
  }
  report.check("magic-items", "activation: the action kinds the text names", pairs.length, actionFailures)
  report.check("magic-items", 'uses: dawn and rest moments after "can’t be used again until"', pairs.length, reuseFailures)

  /* ---------- references ---------- */

  const refFailures: string[] = []
  let refTotal = 0
  const equipment = existsSync(dataPath("equipment")) ? new Map(readData<Gear>("equipment").map((entry) => [entry.id, entry])) : null
  for (const item of items) {
    for (const id of [...(item.base?.items ?? []), ...(item.base?.except ?? [])]) {
      refTotal++
      if (!pagesOf(id.replace(/-/g, " ")).some((page) => page < 209)) refFailures.push(`${item.name}: ${id} is not named in the Equipment chapter`)
      if (equipment && !equipment.has(id)) refFailures.push(`${item.name}: ${id} is not in equipment.json`)
    }
    for (const id of item.attunement?.classes ?? []) {
      refTotal++
      if (!classList.map((name) => name.toLowerCase()).includes(id)) refFailures.push(`${item.name}: ${id} is not a class`)
    }
  }
  // The Equipment chapter prices Potion of Healing and the Spell Scrolls of cantrip and level 1. Their numbers match our variants.
  if (equipment) {
    const healing = variantsOf("potions-of-healing")[0]
    const potion = equipment.get("potion-of-healing")
    refTotal++
    if (!potion || potion.healing?.dice !== healing?.healing || healing?.name !== "Potion of Healing") refFailures.push("potions-of-healing variant 0 does not match equipment potion-of-healing")
    for (const [index, id] of [
      [0, "spell-scroll-cantrip"],
      [1, "spell-scroll-level-1"],
    ] as const) {
      const variant = variantsOf("spell-scroll")[index]
      const scroll = equipment.get(id)?.spellScroll
      refTotal++
      if (!scroll || scroll.spellLevel !== variant?.spellLevel || scroll.saveDc !== variant?.saveDc || scroll.attackBonus !== variant?.attackBonus)
        refFailures.push(`spell-scroll variant ${index} does not match equipment ${id}`)
    }
  }
  report.check("magic-items", "references: base items, classes and spells resolve, and Potion of Healing and Spell Scroll match equipment", refTotal, refFailures)

  /* ---------- the other two sources ---------- */

  const upstreamName = "5e-bits and Open5e agree on rarity, attunement and category where they share an item, or the official text settles it"
  if (hasUpstream("5e-bits") && hasUpstream("open5e")) {
    const base = readBase<{ name: string; rarity: { name: string }; attunement: boolean; equipment_category: { index: string; name: string } }>("Magic-Items")
    const baseByName = new Map(base.map((row) => [row.name, row]))
    const open = readOpen5e<{ name: string; rarity: string; requires_attunement: boolean; category: string }>("MagicItem")
    const openByName = new Map(open.map((row) => [row.fields.name, row.fields]))
    const upstreamFailures: string[] = []
    const upstreamErrors: string[] = []
    let upstreamTotal = 0
    for (const { item, off } of pairs) {
      const b = baseByName.get(item.name)
      if (b) {
        upstreamTotal++
        if (item.rarity !== "varies" && b.rarity.name !== off.rarityText.replace(/ \(.*$/, "")) upstreamErrors.push(`${item.name}: 5e-bits rarity "${b.rarity.name}", official "${off.rarityText}"`)
        if (Boolean(b.attunement) !== off.attunes) upstreamErrors.push(`${item.name}: 5e-bits attunement ${b.attunement}, official ${off.attunes}`)
        if (
          toId(b.equipment_category.name) !== `${item.category}s` &&
          toId(b.equipment_category.name) !== item.category &&
          !(item.category === "wondrous-item" && b.equipment_category.index === "wondrous-items")
        )
          upstreamErrors.push(`${item.name}: 5e-bits category ${b.equipment_category.index}, official ${item.category}`)
      }
      const o = openByName.get(item.name)
      if (o) {
        upstreamTotal++
        if (item.rarity !== "varies" && o.rarity !== item.rarity) upstreamErrors.push(`${item.name}: Open5e rarity "${o.rarity}", official "${item.rarity}"`)
        if (Boolean(o.requires_attunement) !== off.attunes) upstreamErrors.push(`${item.name}: Open5e attunement ${o.requires_attunement}, official ${off.attunes}`)
        if (o.category !== item.category) upstreamErrors.push(`${item.name}: Open5e category ${o.category}, official ${item.category}`)
      }
    }
    report.crossCheck("magic-items", upstreamName, upstreamTotal, upstreamFailures, upstreamErrors)
  } else report.skip("magic-items", upstreamName)

  verifyRules(report, equipment, checkTable)
}

/* ---------- the typed effects, against two readers who never saw the builder ---------- */

type Reading = Record<string, unknown>

// Layout does not count in quoted words, so they are squashed. Prose that explains (`text`, `notes`) is not compared.
const canon = (value: unknown, key = ""): unknown => {
  if (Array.isArray(value)) return value.map((entry) => canon(entry, key))
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [name, entry] of Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1))) if (name !== "text" && name !== "notes" && entry !== undefined) out[name] = canon(entry, name)
    return out
  }
  return typeof value === "string" && ["appliesWhen", "unless", "label", "effect"].includes(key) ? squash(value) : value
}
const empty = (value: unknown) => value === undefined || (Array.isArray(value) && !value.length) || (value && typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length)

const effectFields = ["spells", "spellEffects", "charges", "bonuses", "conditionalBonuses", "saves", "damage", "uses", "checks", "untyped"] as const
const variantFields = ["strength", "healing", "spellLevel", "saveDc", "attackBonus", ...effectFields] as const

function compareEffects(report: Report, items: MagicItem[]) {
  const dir = resolve(root, "scripts/verify/fixtures")
  const read = (file: string) => JSON.parse(readFileSync(resolve(dir, file), "utf8")) as Record<string, Reading>
  const first = read("magic-item-effects-1.json")
  const second = read("magic-item-effects-2.json")
  const readings = new Map(Object.entries({ ...first, ...second }))
  const failures: string[] = []
  for (const id of Object.keys(first)) if (id in second) failures.push(`${id}: both readers have it`)
  const ids = new Set(items.map((item) => item.id))
  for (const id of readings.keys()) if (!ids.has(id)) failures.push(`${id}: a reading of no item`)
  const show = (value: unknown) => (value === undefined ? "none" : JSON.stringify(value).slice(0, 400))
  let total = 0
  const differ = (label: string, ours: unknown, theirs: unknown) => {
    total++
    // The kinds in `untyped` are a set, so their order is not compared.
    const settle = (value: unknown) => (label.endsWith(".untyped") && Array.isArray(value) ? [...value].sort() : value)
    const a = empty(ours) ? undefined : canon(settle(ours))
    const b = empty(theirs) ? undefined : canon(settle(theirs))
    if (JSON.stringify(a) === JSON.stringify(b)) return
    const sorted = (value: unknown) => JSON.stringify(Array.isArray(value) ? [...value].map((entry) => JSON.stringify(entry)).sort() : value)
    failures.push(`${label}: data ${show(a)}, reader ${show(b)}${sorted(a) === sorted(b) ? " (order only)" : ""}`)
  }
  for (const item of items) {
    const reading = readings.get(item.id)
    if (!reading) {
      failures.push(`${item.id}: no reader has this item`)
      continue
    }
    const bonuses = (list: { to: string; value: number }[] | undefined) => list?.map(({ to, value }) => ({ to, value }))
    const ours: Record<string, unknown> = { ...item, bonuses: bonuses(item.bonuses) }
    for (const field of effectFields) differ(`${item.id}.${field}`, ours[field], reading[field])
    const theirVariants = (reading.variants ?? {}) as Record<string, Reading>
    const ourVariants = new Map((item.variants ?? []).map((variant) => [variant.name, variant]))
    for (const name of new Set([...ourVariants.keys(), ...Object.keys(theirVariants)])) {
      const variant = ourVariants.get(name) as Record<string, unknown> | undefined
      const theirs = theirVariants[name] ?? {}
      if (!variant && Object.keys(theirs).some((field) => field !== "notes")) {
        failures.push(`${item.id}: the reader has a variant "${name}" that the data lacks`)
        continue
      }
      for (const field of variantFields) {
        const value = variant?.[field]
        differ(`${item.id} variant ${name}.${field}`, field === "bonuses" ? bonuses(value as { to: string; value: number }[]) : value, theirs[field])
      }
    }
  }
  report.check("magic-items", "typed effects equal the two independent readings, field for field, for every item", total || 1, failures)
}

/* ---------- the rules ---------- */

function verifyRules(report: Report, equipment: Map<string, Gear> | null, checkTable: (table: ItemTable, label: string, block: string, failures: string[]) => void) {
  const rules = readData<MagicItemRule>("magic-item-rules")
  const failures: string[] = []
  const text206 = pageText(206, 207).replace(/\s+/g, " ")

  // Each rule has the kind its text calls for.
  const kindOf = (id: string): string =>
    ["common", "uncommon", "rare", "very-rare", "legendary", "artifact"].includes(id)
      ? "rarity"
      : ["armor", "potion", "ring", "rod", "scroll", "staff", "wand", "weapon", "wondrous-item"].includes(id)
        ? "category"
        : ["consumable-value", "spell-scroll-value", "consumable-crafting"].includes(id)
          ? "value-rule"
          : id === "attunement"
            ? "attunement"
            : id === "sentient-abilities" || id === "sentient-conflict"
              ? id
              : "rule"
  for (const rule of rules) if (rule.kind !== kindOf(rule.id)) failures.push(`${rule.id}: kind ${rule.kind}, expected ${kindOf(rule.id)}`)
  const ids = new Set<string>()
  for (const rule of rules)
    if (ids.has(rule.id)) failures.push(`${rule.id}: duplicate id`)
    else ids.add(rule.id)
  report.check("magic-item-rules", "ids are unique", rules.length, failures.splice(0))

  const withText = rules.filter((rule): rule is Exclude<MagicItemRule, Rule<"rarity">> => "text" in rule)
  const sentenceFailures: string[] = []
  for (const rule of withText) for (const sentence of missingSentences(rule.text)) sentenceFailures.push(`${rule.id}: "${sentence.slice(0, 70)}" is not official`)
  report.check("magic-item-rules", "every sentence is in the official text", withText.length, sentenceFailures)

  const pageFailures: string[] = []
  for (const rule of rules) {
    const from = rule.kind === "attunement" || rule.id.startsWith("identifying") || rule.id.startsWith("wearing") || rule.id.startsWith("multiple") || rule.id === "paired-items-worn" ? 100 : 204
    const where = pageOf(rule.name, from)
    // A heading sits on the rule's page, or the rule's text begins on it.
    const firstSentence = "text" in rule ? sentencesOf(rule.text.split(/\n/)[0])[0] : ""
    const textPage = firstSentence ? pagesOf(firstSentence).filter((page) => page >= from) : []
    if (rule.kind === "rarity") {
      if (rule.page !== 206) pageFailures.push(`${rule.id}: page ${rule.page}`)
    } else if (!textPage.includes(rule.page) && where !== rule.page) pageFailures.push(`${rule.id}: page ${rule.page}, heading first at ${where}, text on ${textPage.join(",")}`)
  }
  report.check("magic-item-rules", "page is where the rule begins", rules.length, pageFailures)

  // A rule's name is the heading printed directly before its text. The value rules are footnotes with no heading,
  // so their names are ours. A category's name is checked against the tools table below, since its heading is plural.
  const nameFailures: string[] = []
  const headed = withText.filter((rule) => rule.kind !== "value-rule" && rule.kind !== "category")
  for (const rule of headed) {
    const opening = sentencesOf(rule.text.split(/\n/)[0])[0]
    if (!inOfficial(`${rule.name} ${opening}`)) nameFailures.push(`${rule.id}: "${rule.name}" is not the heading printed before "${opening.slice(0, 50)}"`)
  }
  report.check("magic-item-rules", "every rule’s name is the heading printed before its text", headed.length, nameFailures)

  // Rarity values and crafting, read from the two tables of the chapter.
  const rarityFailures: string[] = []
  const rarityRules = rules.filter((rule): rule is Rule<"rarity"> => rule.kind === "rarity")
  const wantedValue: Record<string, string> = { common: "100", uncommon: "400", rare: "4,000", "very-rare": "40,000", legendary: "200,000" }
  const names = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"]
  if (rarityRules.length !== names.length) rarityFailures.push(`${rarityRules.length} rarity rules for ${names.length} rarities`)
  for (const name of names) {
    const rule = rarityRules.find((entry) => entry.id === toId(name))
    if (!rule) {
      rarityFailures.push(`${name}: no rule`)
      continue
    }
    if (name === "Artifact") {
      if (!rule.priceless || rule.value !== undefined || !/Artifact Priceless/.test(text206)) rarityFailures.push("Artifact: should be priceless with no value")
      if (rule.craftingDays !== undefined) rarityFailures.push("Artifact: has crafting numbers, the table has none for it")
      continue
    }
    const wanted = Number(wantedValue[toId(name)].replace(/,/g, ""))
    if (rule.value?.amount !== wanted || rule.value?.unit !== "gp") rarityFailures.push(`${name}: value ${JSON.stringify(rule.value)}, official ${wantedValue[toId(name)]} GP`)
    if (!inOfficial(`${name} ${wantedValue[toId(name)]} GP`)) rarityFailures.push(`${name}: "${name} ${wantedValue[toId(name)]} GP" is not in the official text`)
  }
  const craftWanted: Record<string, [number, string, number]> = {
    common: [5, "50", 50],
    uncommon: [10, "200", 200],
    rare: [50, "2,000", 2000],
    "very-rare": [125, "20,000", 20000],
    legendary: [250, "100,000", 100000],
  }
  for (const [id, [days, costText, cost]] of Object.entries(craftWanted)) {
    const rule = rarityRules.find((entry) => entry.id === id)
    const name = names.find((entry) => toId(entry) === id) as string
    if (rule?.craftingDays !== days || rule?.craftingCost?.amount !== cost || rule?.craftingCost?.unit !== "gp")
      rarityFailures.push(`${id}: crafting ${rule?.craftingDays} days ${JSON.stringify(rule?.craftingCost)}, official ${days} days ${costText} GP`)
    if (!inOfficial(`${name} ${days} days ${costText} GP`)) rarityFailures.push(`${id}: "${days} days ${costText} GP" is not in the official crafting table`)
  }
  report.check("magic-item-rules", "rarity values and crafting time and cost match the two official tables", 11, rarityFailures)

  // The footnotes: halve the value of a consumable, double the scribing cost of a Spell Scroll. The equipment prices follow.
  const valueFailures: string[] = []
  const valueRules = rules.filter((rule): rule is Rule<"value-rule"> => rule.kind === "value-rule")
  const factorOf = (text: string) => (/\bHalve\b|\bhalved\b/.test(text) ? 0.5 : /\bdouble\b/.test(text) ? 2 : undefined)
  for (const rule of valueRules) {
    if (rule.factor !== factorOf(rule.text)) valueFailures.push(`${rule.id}: factor ${rule.factor}, the text says ${factorOf(rule.text)}`)
    if (rule.text.startsWith("*")) valueFailures.push(`${rule.id}: the text keeps its footnote mark`)
    // What the value is a share of, who it applies to, and what it scales, read from the sentence.
    const basis = /\bscribe\b|\bscribing\b/.test(rule.text) ? "scribing-cost" : "rarity-value"
    const applies = /^The value of a Spell Scroll/.test(rule.text) ? "spell-scroll" : "consumable"
    const scope = /crafting time and cost|time and cost/.test(rule.text) ? "crafting" : "value"
    const except = /other than a Spell Scroll/.test(rule.text)
    if (rule.basis !== basis) valueFailures.push(`${rule.id}: basis ${rule.basis}, the sentence gives ${basis}`)
    if (rule.appliesTo !== applies) valueFailures.push(`${rule.id}: appliesTo ${rule.appliesTo}, the sentence gives ${applies}`)
    if (rule.scope !== scope) valueFailures.push(`${rule.id}: scope ${rule.scope}, the sentence gives ${scope}`)
    if (JSON.stringify(rule.except ?? []) !== JSON.stringify(except ? ["spell-scroll"] : []))
      valueFailures.push(`${rule.id}: except is ${JSON.stringify(rule.except)}, the sentence ${except ? "excepts" : "does not except"} Spell Scrolls`)
  }
  for (const [id, scope, appliesTo] of [
    ["consumable-value", "value", "consumable"],
    ["spell-scroll-value", "value", "spell-scroll"],
    ["consumable-crafting", "crafting", "consumable"],
  ] as const) {
    const rule = valueRules.find((entry) => entry.id === id)
    if (!rule || rule.scope !== scope || rule.appliesTo !== appliesTo) valueFailures.push(`${id}: missing or wrong scope`)
  }
  const common = rarityRules.find((rule) => rule.id === "common")
  const halving = valueRules.find((rule) => rule.id === "consumable-value")
  const doubling = valueRules.find((rule) => rule.id === "spell-scroll-value")
  const scribed = new Map(
    [
      ...pageText(103)
        .replace(/\s+/g, " ")
        .matchAll(/(Cantrip|\b\d) \d+ days? ([\d,]+) GP/g),
    ].map((match) => [match[1] === "Cantrip" ? "spell-scroll-cantrip" : `spell-scroll-level-${match[1]}`, Number(match[2].replace(/,/g, ""))])
  )
  if (equipment) {
    const potion = equipment.get("potion-of-healing")
    if (potion?.cost?.amount !== (common?.value?.amount ?? 0) * (halving?.factor ?? 1))
      valueFailures.push(`potion-of-healing costs ${potion?.cost?.amount}, a Common consumable is worth ${common?.value?.amount} times ${halving?.factor}`)
    for (const id of ["spell-scroll-cantrip", "spell-scroll-level-1"]) {
      const price = equipment.get(id)?.cost?.amount
      if (price !== (scribed.get(id) ?? 0) * (doubling?.factor ?? 1)) valueFailures.push(`${id} costs ${price}, the scribing cost ${scribed.get(id)} times ${doubling?.factor}`)
    }
  }
  report.check("magic-item-rules", "value footnotes: halved consumables, doubled scroll scribing cost, and the equipment prices that follow", valueRules.length + (equipment ? 3 : 0), valueFailures)

  // Categories and tools.
  const categoryFailures: string[] = []
  const categories = ["armor", "potion", "ring", "rod", "scroll", "staff", "wand", "weapon", "wondrous-item"]
  const categoryRules = rules.filter((rule): rule is Rule<"category"> => rule.kind === "category")
  if (
    !sameSet(
      categoryRules.map((rule) => rule.category),
      categories
    )
  )
    categoryFailures.push(`categories ${categoryRules.map((rule) => rule.category).join(",")}`)
  for (const rule of categoryRules) {
    if (!inOfficial(`${rule.name} ${rule.tools}`)) categoryFailures.push(`${rule.name}: "${rule.name} ${rule.tools.slice(0, 40)}" is not in the Magic Item Tools table`)
    if (!squash(pageText(207)).includes(squash(`${rule.name} ${rule.tools}`))) categoryFailures.push(`${rule.name}: tool is not next to its category in the table on page 207`)
  }
  report.check("magic-item-rules", "the nine categories, with their crafting tools from the Magic Item Tools table", categories.length, categoryFailures)

  // The tables of the rules: Potion Miscibility and the four Sentient Item tables.
  const tableFailures: string[] = []
  const ruleTables = rules.flatMap((rule) => (rule.kind === "category" || rule.kind === "rule" ? (rule.tables ?? []).map((table) => ({ rule, table })) : []))
  const block = squash(pageText(204, 208))
  for (const { rule, table } of ruleTables) checkTable(table, `${rule.id} ${table.caption ?? table.columns.join("/")}`, block, tableFailures)
  const wantedTables: Record<string, string> = {
    potion: "Potion Miscibility",
    "sentient-alignment": "Sentient Item’s Alignment",
    "sentient-communication": "Sentient Item’s Communication",
    "sentient-senses": "Sentient Item’s Senses",
    "sentient-special-purpose": "Sentient Item’s Special Purpose",
    "magic-item-categories": "Magic Item Categories",
  }
  const wantedDice: Record<string, string> = { potion: "1d100", "sentient-alignment": "1d100", "sentient-communication": "1d10", "sentient-senses": "1d4", "sentient-special-purpose": "1d10" }
  for (const [id, caption] of Object.entries(wantedTables)) {
    const rule = rules.find((entry) => entry.id === id)
    const table = rule && "tables" in rule ? rule.tables?.[0] : undefined
    if (!table || table.caption !== caption) tableFailures.push(`${id}: table "${caption}" is missing`)
    else if (table.dice !== wantedDice[id]) tableFailures.push(`${id}: the table is ${table.dice}, the text prints ${wantedDice[id]}`)
    if (id === "magic-item-categories" && table) {
      const names = ["Armor", "Potions", "Rings", "Rods", "Scrolls", "Staffs", "Wands", "Weapons", "Wondrous Items"]
      if (table.columns.join("|") !== "Category|Examples" || table.rows.map((row) => row.cells[0]).join("|") !== names.join("|"))
        tableFailures.push(`${id}: the table is not the nine categories with their examples`)
    }
    if (id === "sentient-alignment" && table && table.rows.length !== 9) tableFailures.push(`${id}: ${table.rows.length} alignments, the text prints 9`)
    if (id === "sentient-special-purpose" && table && table.rows.length !== 10) tableFailures.push(`${id}: ${table.rows.length} purposes, the text prints 10`)
  }
  // Only these rules hold a table, and each holds exactly one.
  for (const rule of rules) {
    const held = "tables" in rule ? (rule.tables?.length ?? 0) : 0
    if (held !== (rule.id in wantedTables ? 1 : 0)) tableFailures.push(`${rule.id}: holds ${held} tables, the text prints ${rule.id in wantedTables ? 1 : 0}`)
  }
  report.check(
    "magic-item-rules",
    "rule tables: Potion Miscibility and the sentient item tables, rolls cover the die once, rows are official text",
    ruleTables.length + Object.keys(wantedTables).length,
    tableFailures
  )

  // Typed rules read against their own pages.
  const ruleFailures: string[] = []
  const attunement = rules.find((rule): rule is Rule<"attunement"> => rule.kind === "attunement")
  const equipmentText = pageText(102, 103).replace(/-\n/g, "").replace(/\s+/g, " ")
  if (attunement && attunement.restsToAttune !== "short-rest") ruleFailures.push(`attuning takes ${attunement.restsToAttune}, the text says a Short Rest`)
  if (!attunement) ruleFailures.push("attunement rule is missing")
  else {
    const wantedFeet = /more than (\d+) feet away/.exec(equipmentText)?.[1]
    const wantedHours = /at least (\d+) hours/.exec(equipmentText)?.[1]
    if (attunement.maxItems !== 3 || !/no more than three magic items at a time/.test(equipmentText)) ruleFailures.push(`attunement limit ${attunement.maxItems}, the text says three`)
    if (String(attunement.endsWhenAwayFeet) !== wantedFeet) ruleFailures.push(`attunement ends at ${attunement.endsWhenAwayFeet} feet, the text says ${wantedFeet}`)
    if (String(attunement.endsAfterAwayHours) !== wantedHours) ruleFailures.push(`attunement ends after ${attunement.endsAfterAwayHours} hours, the text says ${wantedHours}`)
    if (!/spend a Short Rest focused on only that item/.test(equipmentText)) ruleFailures.push("attuning no longer takes a Short Rest in the text")
    for (const heading of ["Attune during a Short Rest", "No More Than Three Items", "Ending Attunement"])
      if (!attunement.text.includes(heading)) ruleFailures.push(`attunement text lacks "${heading}"`)
  }
  const abilities = rules.find((rule): rule is Rule<"sentient-abilities"> => rule.kind === "sentient-abilities")
  const rollText = pageText(207, 208).replace(/-\n/g, "").replace(/\s+/g, " ")
  const roll = /roll (\d+d\d+) for each one, dropping the lowest roll/.exec(rollText)
  if (!abilities || !roll || abilities.abilityRoll.dice !== roll[1] || abilities.abilityRoll.dropLowest !== 1)
    ruleFailures.push(`sentient ability roll ${JSON.stringify(abilities?.abilityRoll)}, the text says ${roll?.[0]}`)
  const conflict = rules.find((rule): rule is Rule<"sentient-conflict"> => rule.kind === "sentient-conflict")
  if (!conflict) ruleFailures.push("sentient conflict rule is missing")
  else {
    const dcs = [...rollText.matchAll(/Charisma saving throw \(DC (\d+) plus the item’s Charisma modifier\)/g)].map((match) => Number(match[1]))
    if (dcs.length !== 2 || dcs.some((dc) => dc !== conflict.save.dcBase) || conflict.save.ability !== "cha" || conflict.save.plusItemModifierOf !== "cha")
      ruleFailures.push(`conflict save ${JSON.stringify(conflict.save)}, the text has DCs ${dcs.join(",")}`)
    const hours = /Charmed condition for (\d+d\d+) hours/.exec(rollText)?.[1]
    if (conflict.charmedHours !== hours) ruleFailures.push(`charmed for ${conflict.charmedHours}, the text says ${hours}`)
    const demandNames = [...rollText.matchAll(/(Chase My Dreams|Get Rid of It|It’s Time for a Change|Keep Me Close)\. /g)].map((match) => match[1])
    if (
      !sameSet(
        demandNames,
        conflict.demands.map((demand) => demand.name)
      )
    )
      ruleFailures.push(`conflict demands ${conflict.demands.map((demand) => demand.name).join(", ")}, the text has ${demandNames.join(", ")}`)
    const bullets = pageText(208)
      .split("\n")
      .filter((line) => line.startsWith("•")).length
    for (const refusal of conflict.refusals) if (!inOfficial(refusal)) ruleFailures.push(`refusal "${refusal.slice(0, 40)}" is not official text`)
    if (conflict.refusals.length !== bullets) ruleFailures.push(`conflict lists ${conflict.refusals.length} refusals, the text has ${bullets} bullets`)
    for (const demand of conflict.demands) if (!inOfficial(`${demand.name}. ${demand.text}`)) ruleFailures.push(`demand ${demand.name} is not official text`)
    // Each demand is exactly its own printed paragraph: it runs from its name to the next demand's name or the refusal lead.
    const endOfDemand = /(?:Chase My Dreams|Get Rid of It|It’s Time for a Change|Keep Me Close)\. |If its bearer refuses to comply/
    for (const demand of conflict.demands) {
      const start = rollText.indexOf(`${demand.name}. `)
      if (start < 0) continue
      const after = rollText.slice(start + demand.name.length + 2)
      const printed = after.slice(0, after.search(endOfDemand)).trim()
      if (printed !== demand.text) ruleFailures.push(`demand ${demand.name} reads "${demand.text.slice(0, 60)}", its paragraph is "${printed.slice(0, 60)}"`)
    }
  }
  const needed = [
    "activating-a-magic-item",
    "command-word",
    "consumable-items",
    "spells-cast-from-items",
    "charges",
    "the-next-dawn",
    "cursed-items",
    "magic-item-resilience",
    "crafting-magic-items",
    "arcana-proficiency",
    "crafting-tools",
    "crafting-spells",
    "time-and-cost",
    "attunement-prerequisites",
    "magic-item-rarity",
    "magic-item-values-by-rarity",
    "identifying-a-magic-item",
    "wearing-and-wielding-items",
    "multiple-items-of-the-same-kind",
    "paired-items-worn",
    "sentient-magic-items",
    "sentient-magic-item-traits",
    "sentient-alignment",
    "sentient-communication",
    "sentient-senses",
    "sentient-special-purpose",
  ]
  for (const id of needed) if (!ids.has(id)) ruleFailures.push(`${id}: missing`)
  const crafting = rules.find((rule) => rule.id === "time-and-cost")
  if (crafting && "text" in crafting && !/Work per Day\. For each day of crafting, you must work for 8 hours/.test(crafting.text)) ruleFailures.push("time-and-cost: missing the 8 hours per day rule")
  report.check("magic-item-rules", "attunement limits, sentient item rules and the named rules of the chapter are present and typed as the text says", needed.length + 6, ruleFailures)
}
