import { existsSync } from "node:fs"
import type { ItemTable, MagicItem, MagicItemRule, MagicItemVariant } from "../../src/schema/magic-items"
import { dataPath, readData, toId } from "../lib/data"
import { inOfficial, missingSentences, pageOf, pages, pagesOf, pageText, squash } from "../lib/official"
import type { Report } from "../lib/report"
import { hasUpstream, readBase, readOpen5e } from "../lib/sources"

// The check reads the official text on its own: it finds the headings and subtitles with one anchored pattern per
// subtitle, takes each item's block of lines, and compares the data with what the block says. It shares no parsing
// code with the builder.

const rarityNames = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"]
const rarityAlt = `${rarityNames.join("|")}|Rarity Varies`
const categoryAlt = "Armor|Potion|Ring|Rod|Scroll|Staff|Wand|Weapon|Wondrous Item"
const subtitleRe = new RegExp(
  String.raw`^(${categoryAlt})(?: \(([^()]*)\))?, ((?:${rarityAlt})(?: \((?!Requires)[^()]*\))?(?:, (?:or )?(?:${rarityAlt}) \((?!Requires)[^()]*\))*)(?: \(Requires Attunement(?: by ([^()]*))?\))?$`
)
const abilityShort: Record<string, string> = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" }
const classList = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]
const damageWords = "Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder"

type Official = { name: string; page: number; category: string; baseText?: string; rarityText: string; attunementBy?: string; attunes: boolean; block: string[] }
type Row = ItemTable["rows"][number]
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
      (match) => `${match[1] === "Cantrip" ? "Cantrip" : `Level ${match[1]}`}=${toId(match[2])}/${match[3]}/${match[4]}`
    )
    compareVariants("spell-scroll", "Spell Scroll", wanted, (variant) => `${variant.name}=${variant.rarity}/${variant.saveDc}/${variant.attackBonus}`)
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
    compareVariants(id, name, wanted, (variant) => `${variant.name}=${variant.rarity}`)
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

  /* ---------- bonuses ---------- */

  // The bonuses that hold only under a condition or trigger, read from the text. Everything else holds whenever the
  // item is worn or wielded.
  const conditional = [
    "arrow-catching-shield:armor-class",
    "bracers-of-archery:damage-rolls",
    "bracers-of-defense:armor-class",
    "demon-armor:attack-rolls",
    "demon-armor:damage-rolls",
    "gloves-of-swimming-and-climbing:strength-athletics-checks",
    "quarterstaff-of-the-acrobat:armor-class",
    "rod-of-alertness:armor-class",
    "rod-of-alertness:saving-throws",
    "rod-of-lordly-might:strength-athletics-checks",
  ]
  const limitRe = /\bagainst\b|\bif you\b|\bwhen you\b|\bmade to\b|\bmade with such\b|of your Unarmed Strikes/
  const bonusFailures: string[] = []
  const conditionalFound: string[] = []
  for (const { item, off } of pairs) {
    const text = mech(off)
    const sentences = sentencesOf(text).filter((sentence) => /\+\d+ bonus to /.test(sentence) && !sentence.startsWith("For example"))
    const plain = item.bonuses ?? []
    const limited = item.conditionalBonuses ?? []
    for (const bonus of [...plain, ...limited]) {
      if (!inOfficial(bonus.text)) bonusFailures.push(`${item.name}: bonus text is not official`)
      if (!bonus.text.includes(`+${bonus.value} bonus to`)) bonusFailures.push(`${item.name}: bonus ${bonus.to} ${bonus.value} is not in its sentence`)
      // Demon Armor words its two targets as one phrase: "the attack and damage rolls of your Unarmed Strikes".
      const shared = /^(?:attack|damage)-rolls$/.test(bonus.to) && squash(bonus.text).includes("attackanddamagerolls")
      if (!squash(bonus.text).includes(squash(bonus.to.replace(/-/g, " "))) && !shared) bonusFailures.push(`${item.name}: target ${bonus.to} is not in its sentence`)
    }
    // The limit is read from the clause after "+n bonus to" and from how the sentence opens, not from the whole sentence.
    for (const bonus of plain) {
      const clause = /\+\d+ bonus to ([^,.;]*)/.exec(bonus.text)?.[1] ?? ""
      if (limitRe.test(clause) || /^(?:While in|When you|If you)/.test(bonus.text))
        bonusFailures.push(`${item.name}: ${bonus.to} ${bonus.value} is limited by its sentence but listed without a condition`)
    }
    for (const bonus of limited) {
      conditionalFound.push(`${item.id}:${bonus.to}`)
      for (const part of bonus.condition.split("; ")) if (!bonus.text.includes(part) || !inOfficial(part)) bonusFailures.push(`${item.name}: condition "${part}" is not in its sentence`)
      // The condition is the opening situation and the limit after the target, read from the sentence. Demon Armor's two
      // Unarmed Strike bonuses name their limit as the phrase they apply to.
      const lead = /^((?:While in|When|If) [^,]+),/.exec(bonus.text)?.[1]
      const afterTarget = /\+\d+ bonus to [^.;]*?( (?:against|if|when|made to|made with such)\b[^.;]*)/.exec(bonus.text)?.[1]?.trim()
      const limit = afterTarget?.startsWith("against") ? afterTarget.split(", ")[0] : afterTarget
      const expected = item.id === "demon-armor" ? "the attack and damage rolls of your Unarmed Strikes" : [lead, limit].filter(Boolean).join("; ")
      if (bonus.condition !== expected) bonusFailures.push(`${item.name}: condition "${bonus.condition}", the sentence gives "${expected}"`)
    }
    // Every sentence that states a bonus is covered by a bonus of the same value and target, or by a variant's.
    const variantBonuses = (item.variants ?? []).flatMap((variant) => variant.bonuses ?? [])
    for (const sentence of sentences) {
      const value = Number(/\+(\d+) bonus to /.exec(sentence)?.[1])
      const phrase = squash(/\+\d+ bonus to (.+)/.exec(sentence)?.[1] ?? "")
      const covered = [...plain, ...limited, ...variantBonuses].some((bonus) => bonus.value === value && phrase.includes(squash(bonus.to.replace(/-/g, " "))))
      if (!covered) bonusFailures.push(`${item.name}: "${sentence.slice(0, 70)}" has no bonus`)
    }
    if (!sentences.length && (plain.length || limited.length)) bonusFailures.push(`${item.name}: lists bonuses, the text states none`)
    for (const variant of item.variants ?? []) {
      for (const bonus of variant.bonuses ?? []) {
        if (item.rarity === "varies" && /^\+\d$/.test(variant.name) && bonus.value !== Number(variant.name.slice(1))) bonusFailures.push(`${item.name} ${variant.name}: bonus ${bonus.value}`)
        if (!new RegExp(`bonus to [^.]*${bonus.to.split("-")[0]}`, "i").test(text)) bonusFailures.push(`${item.name} ${variant.name}: target ${bonus.to} is not stated`)
      }
    }
    // "+N" items give the bonus by rarity: attack and damage rolls, Armor Class, or spell attack rolls.
    if (/\+1, \+2, or \+3$/.test(item.name)) {
      const stated = /bonus to (.+?) (?:made|while|determined)/.exec(text)?.[1] ?? ""
      const want = stated.split(/, and |, | and /).map((part) => toId(part))
      for (const variant of item.variants ?? [])
        if (
          !sameSet(
            (variant.bonuses ?? []).map((bonus) => bonus.to),
            want
          )
        )
          bonusFailures.push(`${item.name} ${variant.name}: bonus targets differ from "${stated}"`)
    }
  }
  if (!sameSet(conditionalFound, conditional)) bonusFailures.push(`conditional bonuses are ${conditionalFound.join(", ")}, the text limits ${conditional.join(", ")}`)
  report.check("magic-items", "bonuses: every stated +N bonus is listed, and only unconditional ones are in the plain list", pairs.length, bonusFailures)

  /* ---------- charges ---------- */

  const chargeFailures: string[] = []
  for (const { item, off } of pairs) {
    const text = mech(off)
    const max = [...text.matchAll(/(?:\b(?:has|have|starts with)|\bof its) (\d+(?:d\d+(?: \+ \d+)?)?) charges?\b/g)].map((match) => asDice(match[1]))
    const got = [item.charges, ...(item.variants ?? []).map((variant) => variant.charges)].filter((charges) => charges).map((charges) => String(charges?.max))
    if (!sameSet([...new Set(max)], [...new Set(got)])) chargeFailures.push(`${item.name}: max charges ${got.join(",") || "none"}, official ${max.join(",") || "none"}`)
    const charges = item.charges
    if (!charges) continue
    const regain = /\bregains? (all|\d+|\d+d\d+(?: \+ \d+)?) expended charges?/.exec(text)
    const dawn = /expended charges? daily at dawn/.test(text)
    if (charges.regains) {
      if (!regain || !dawn) chargeFailures.push(`${item.name}: lists a dawn recharge, the text does not`)
      else if (String(charges.regains.amount) !== asDice(regain[1])) chargeFailures.push(`${item.name}: regains ${charges.regains.amount}, official ${regain[1]}`)
    } else if (regain && dawn) chargeFailures.push(`${item.name}: text recharges ${regain[1]} at dawn, none listed`)
    const lastCharge = /last charge, roll (\d+d\d+)\. ((?:On a \d+, [^.]+\.\s*)+)/.exec(text)
    if (charges.lastCharge) {
      if (!lastCharge) chargeFailures.push(`${item.name}: lists a last-charge roll, the text has none`)
      else {
        const wanted = [...lastCharge[2].matchAll(/On a (\d+), ([^.]+\.)/g)].map((match) => `${match[1]}:${match[2]}`)
        const outcomes = charges.lastCharge.outcomes.map((outcome) => `${outcome.on}:${outcome.effect}`)
        if (lastCharge[1] !== charges.lastCharge.dice || JSON.stringify(wanted) !== JSON.stringify(outcomes))
          chargeFailures.push(`${item.name}: last charge ${outcomes.join("; ")}, official ${wanted.join("; ")}`)
      }
    } else if (/roll \d+d\d+\. On a \d+/.test(text) && /last charge/.test(text)) chargeFailures.push(`${item.name}: the text rolls on the last charge, none listed`)
  }
  report.check("magic-items", "charges: maximum, recharge and last-charge roll", pairs.length, chargeFailures)

  /* ---------- saves, checks and damage ---------- */

  // Whose damage a sentence states, read with different words from the builder's: extra, replacing the usual damage, the
  // user's, the item's, or an effect.
  const roleOf = (sentence: string) => {
    if (sentence.includes("extra ")) return "extra"
    if (sentence.includes("instead of the usual")) return "base"
    if (/you take |to the user|attempts to read it takes/.test(sentence)) return "to-user"
    if (sentence.includes("the vehicle takes")) return "to-item"
    return "effect"
  }
  const dcFailures: string[] = []
  // What the item and its variants state, together.
  const savesOf = (item: MagicItem) => [...(item.saves ?? []), ...(item.variants ?? []).flatMap((variant) => variant.saves ?? [])]
  const checksOf = (item: MagicItem) => [...(item.checks ?? []), ...(item.variants ?? []).flatMap((variant) => variant.checks ?? [])]
  const damageOf = (item: MagicItem) => [...(item.damage ?? []), ...(item.variants ?? []).flatMap((variant) => variant.damage ?? [])]
  for (const { item, off } of pairs) {
    const text = mech(off)
    const saves = [
      ...[...text.matchAll(/DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw/g)].map((match) => `${abilityShort[match[2]]}${match[1]}`),
      ...[...text.matchAll(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw \(DC (\d+) for \w+ or DC (\d+) for \w+\)/g)].flatMap((match) => [
        `${abilityShort[match[1]]}${match[2]}`,
        `${abilityShort[match[1]]}${match[3]}`,
      ]),
    ]
    const checks = [...text.matchAll(/DC (\d+) (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?: \(([A-Za-z ]+)\))? check/g)].map(
      (match) => `${abilityShort[match[2]]}${match[3] ? toId(match[3]) : ""}${match[1]}`
    )
    const damage: string[] = []
    for (const sentence of sentencesOf(text)) {
      for (const match of sentence.matchAll(new RegExp(String.raw`(${diceRe})\)? (${damageWords}) damage`, "g"))) damage.push(`${asDice(match[1])} ${match[2].toLowerCase()} ${roleOf(sentence)}`)
    }
    // A table headed "<Type> Damage" lists dice by a count.
    for (const table of item.tables ?? []) {
      const type = /^(\w+) Damage$/.exec(table.columns[1] ?? "")?.[1]
      if (type && !table.dice) for (const row of table.rows) damage.push(`${row.cells[1]} ${type.toLowerCase()} effect`)
    }
    const gotSaves = savesOf(item).map((save) => `${save.ability}${save.dc}`)
    const gotChecks = checksOf(item).map((check) => `${check.ability}${check.skill ?? ""}${check.dc}`)
    const damageEntries = damageOf(item)
    const gotDamage = damageEntries.map((entry) => `${entry.dice} ${entry.type} ${entry.role}`)
    if (!sameSet([...new Set(saves)], [...new Set(gotSaves)])) dcFailures.push(`${item.name}: saves ${[...new Set(gotSaves)].join(",")}, official ${[...new Set(saves)].join(",")}`)
    if (!sameSet([...new Set(checks)], [...new Set(gotChecks)])) dcFailures.push(`${item.name}: checks ${[...new Set(gotChecks)].join(",")}, official ${[...new Set(checks)].join(",")}`)
    if (!sameSet([...new Set(damage)], [...new Set(gotDamage)])) dcFailures.push(`${item.name}: damage ${[...new Set(gotDamage)].join(",")}, official ${[...new Set(damage)].join(",")}`)
    for (const entry of damageEntries) {
      if (!inOfficial(entry.text)) dcFailures.push(`${item.name}: damage sentence is not official`)
      if (!entry.text.includes(entry.type.charAt(0).toUpperCase() + entry.type.slice(1))) dcFailures.push(`${item.name}: damage sentence does not name ${entry.type}`)
    }
  }
  report.check("magic-items", "saving throws, ability checks and damage (dice, type, whose it is) named in the text", pairs.length, dcFailures)

  // Every "DC n" in the prose is one the data states, as a save, a check, or a spell save.
  const dcWaivers: string[] = []
  const dcAccount: string[] = []
  for (const { item, off } of pairs) {
    const spellDcs = [...(item.spells ?? []), ...(item.variants ?? []).flatMap((variant) => variant.spells ?? [])].flatMap((spell) => (spell.saveDc ? [spell.saveDc] : []))
    const stated = new Set<number>([...savesOf(item).map((save) => save.dc), ...checksOf(item).map((check) => check.dc), ...spellDcs])
    const text = mech(off)
    for (const match of text.matchAll(/DC (\d+)\b(?! plus)/g)) {
      const number = Number(match[1])
      if (stated.has(number)) continue
      if (item.id === "apparatus-of-the-crab" && number === 15 && /escape DC 15/.test(text)) {
        dcWaivers.push("Apparatus of the Crab: the escape DC 15 of the Grappled condition in its lever table has no field")
        continue
      }
      dcAccount.push(`${item.name}: DC ${number} is in the text but in no field ("…${text.slice(Math.max(0, (match.index ?? 0) - 60), (match.index ?? 0) + 60)}…")`)
    }
  }
  report.check("magic-items", "every DC in the text is a field", pairs.length, dcAccount, dcWaivers)

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

  /* ---------- spells ---------- */

  const spellFailures: string[] = []
  const spellWaivers: string[] = []
  const spellsData = existsSync(dataPath("spells")) ? new Set(readData<{ id: string }>("spells").map((spell) => spell.id)) : null
  // Spell names that appear in a sentence with "cast" but are not spells the item lets its user cast.
  const notCast: Record<string, string> = {
    "armor-of-vulnerability:identify": "the Identify spell is cast on the armor by someone else",
    "dust-of-sneezing-and-choking:lesser-restoration": "a Lesser Restoration spell ends the effect, it is not cast from the item",
    "robe-of-eyes:light": "a Light spell cast on the robe blinds the wearer",
    "robe-of-eyes:daylight": "a Daylight spell cast near the robe blinds the wearer",
    "dragon-orb:suggestion": "the orb casts Suggestion on its charmed holder",
  }
  let spellTotal = 0
  const tableOf = (item: MagicItem, columns: string) => (item.tables ?? []).filter((table) => table.columns.join("|").startsWith(columns))
  for (const { item, off } of pairs) {
    const text = mech(off)
    const listed = [...(item.spells ?? []), ...(item.variants ?? []).flatMap((variant) => variant.spells ?? [])]
    const listedIds = new Set(listed.map((spell) => spell.id))
    const mentions = spellMentions(text)
    const sentences = sentencesOf(text)
    const sentenceOf = (index: number) => {
      let at = 0
      for (const sentence of sentences) {
        if (index < at + sentence.length + 1) return { sentence, offset: index - at }
        at += sentence.length + 1
      }
      return { sentence: "", offset: 0 }
    }
    const fromTable = (id: string) =>
      tableOf(item, "Spell|Charge")
        .concat(tableOf(item, "Plane|Spells"), tableOf(item, "Bead|Spell"))
        .some((table) => table.rows.some((row) => spellMentions(row.cells.join(" ")).some((mention) => mention.id === id)))
    for (const spell of listed) {
      spellTotal++
      const name = officialSpellIds.get(spell.id)
      if (!name) {
        spellFailures.push(`${item.name}: ${spell.id} is not a spell of the official text`)
        continue
      }
      const hits = mentions.filter((mention) => mention.id === spell.id)
      if (!hits.length) spellFailures.push(`${item.name}: ${name} is not named in the text`)
      if (spellsData && !spellsData.has(spell.id)) spellFailures.push(`${item.name}: ${spell.id} is not in spells.json`)
      // A listed spell is one the item lets its user cast or gives the effect of: it follows "cast", "effect of the", or "as a level n", or sits in a spell table.
      const justified =
        fromTable(spell.id) ||
        hits.some((hit) => {
          const { sentence, offset } = sentenceOf(hit.index)
          const before = sentence.slice(0, offset)
          return /\bcast\b/.test(before) || /effect of the $/.test(before) || /as a level \d $/.test(before) || /determine the spell/.test(before)
        })
      if (!justified) spellFailures.push(`${item.name}: ${name} is listed but the text never has the user cast it`)
      // Numbers on the spell, each read from the sentence that states it.
      const where = hits.map((hit) => sentenceOf(hit.index).sentence)
      if (spell.level !== undefined && !new RegExp(`level ${spell.level} version|as a level ${spell.level} `).test(text))
        spellFailures.push(`${item.name}: ${spell.id} level ${spell.level} is not stated`)
      const adjacent = hits.map((hit) => /^(?: spell)? \(save DC (\d+)\)/.exec(text.slice(hit.index + hit.name.length))?.[1])
      const near = where.map((sentence) => /\(save DC (\d+)\)/.exec(sentence)?.[1])
      // A spell in a table has the DC of its own row, if the row prints one.
      const rowDc = (item.tables ?? [])
        .flatMap((table) => table.rows)
        .map((row) => (spellMentions(row.cells[0] ?? "")[0]?.id === spell.id ? /\(save DC (\d+)\)/.exec(row.cells[0])?.[1] : undefined))
        .find(Boolean)
      // Otherwise a table has one DC for all its spells, in the sentence that points at the table.
      const tableDc = sentences.map((sentence) => (/\btable\b/.test(sentence) ? /save DC (?:of )?(\d+)/.exec(sentence)?.[1] : undefined)).find(Boolean)
      const stated = fromTable(spell.id) ? (rowDc ?? tableDc) : (adjacent.find(Boolean) ?? near.find(Boolean))
      const allDcs = new Set([...text.matchAll(/save DC (?:of )?(\d+)/g)].map((match) => match[1]))
      if (stated && spell.saveDc !== Number(stated)) spellFailures.push(`${item.name}: ${name} save DC ${spell.saveDc}, the sentence says ${stated}`)
      if (spell.saveDc !== undefined && !allDcs.has(String(spell.saveDc)) && !tableOf(item, "Spell").some((table) => table.rows.some((row) => row.cells[0].includes(`save DC ${spell.saveDc}`))))
        spellFailures.push(`${item.name}: ${name} save DC ${spell.saveDc} is not stated`)
      if (spell.saveDc !== undefined && stated === undefined) spellFailures.push(`${item.name}: ${name} has save DC ${spell.saveDc}, no sentence or row states one for it`)
      if (spell.saveDc === undefined && stated) spellFailures.push(`${item.name}: ${name} has the sentence DC ${stated} but no saveDc`)
      if (spell.charges !== undefined && !fromTable(spell.id)) {
        const own = hits.map((hit) => /^ \(expends (\d+) charges?\)/.exec(text.slice(hit.index + hit.name.length))?.[1]).find(Boolean)
        const cost = own ?? where.map((sentence) => /\bexpends? (?:no more than )?(\d+)/.exec(sentence)?.[1]).find(Boolean)
        // Wands that raise the spell's level per charge print the base cost in "For 1 charge, you cast the level 3 version".
        if (!spell.upcastsWithCharges && Number(cost) !== spell.charges) spellFailures.push(`${item.name}: ${name} costs ${spell.charges}, the sentence says ${cost}`)
      }
      if (spell.charges === undefined && !fromTable(spell.id) && where.some((sentence) => /\bexpends? \d+/.test(sentence)))
        spellFailures.push(`${item.name}: ${name} has a charge cost in its sentence but no charges`)
      const cap = /no more than (\d+) charges/.exec(text)?.[1]
      const perLevel = /maximum (\d+) for a level/.exec(text)?.[1]
      if (spell.maxCharges !== undefined && String(spell.maxCharges) !== (spell.chargesPerSpellLevel ? perLevel : cap))
        spellFailures.push(`${item.name}: ${name} max charges ${spell.maxCharges}, the text says ${spell.chargesPerSpellLevel ? perLevel : cap}`)
      if (spell.maxCharges === undefined && (spell.chargesPerSpellLevel ? perLevel : cap) && (item.spells ?? []).length === 1)
        spellFailures.push(`${item.name}: the text caps charges at ${spell.chargesPerSpellLevel ? perLevel : cap} but ${name} has no maxCharges`)
      const upcast = /increase the spell’s level by (?:1|one) for each additional charge/.test(text)
      if (Boolean(spell.upcastsWithCharges) !== (upcast && (item.spells ?? []).length === 1)) spellFailures.push(`${item.name}: ${name} upcastsWithCharges is ${spell.upcastsWithCharges}`)
      if (spell.upcastsWithCharges) {
        const base = /For (\d+) charges?, you cast the level (\d) version/.exec(text)
        if (!base || spell.charges !== Number(base[1]) || spell.level !== Number(base[2]))
          spellFailures.push(`${item.name}: ${name} base cost and level do not match "For n charge, you cast the level l version"`)
      }
    }
    // Every spell the text has cast, or gives the effect of, is listed, unless it is known not to be cast from the item.
    for (const hit of mentions) {
      if (listedIds.has(hit.id)) continue
      const { sentence, offset } = sentenceOf(hit.index)
      const before = sentence.slice(0, offset)
      const casts = /\bcast\b/.test(before) || /determine the spell/.test(before)
      const gives = /effect of the $/.test(before) || /as a level \d $/.test(before)
      if (!casts && !gives) continue
      const key = `${item.id}:${hit.id}`
      // A spell cast only on a result of a random table is listed on that table's row.
      const tableRows = (item.tables ?? [])
        .flatMap((table) => (table.dice ? table.rows : []))
        .filter((row: Row) => row.cells.some((cell) => spellMentions(cell).some((mention) => mention.id === hit.id) && /\bcast\b|determine the spell/.test(cell)))
      if (notCast[key]) spellWaivers.push(`${item.name}: ${hit.name} is named near "cast" but ${notCast[key]}`)
      else if (tableRows.length && tableRows.every((row) => (row.spells ?? []).includes(hit.id))) continue
      else if (
        /\b(?:targeted by|against|from|by) (?:an? |the )?$/.test(before) ||
        (/^ spell\b/.test(sentence.slice(offset + hit.name.length)) && !/\bcast (?:the )?(?:level \d version of )?(?:the )?$/.test(before))
      )
        continue
      else spellFailures.push(`${item.name}: "${hit.name}" is cast or given by "${sentence.slice(0, 70)}", not listed`)
    }
    // Row spells: spells of the official text, named in their own row, and in spells.json.
    for (const table of item.tables ?? []) {
      for (const row of table.rows) {
        for (const id of row.spells ?? []) {
          spellTotal++
          const name = officialSpellIds.get(id)
          if (!name) spellFailures.push(`${item.name}: row spell ${id} is not a spell of the official text`)
          else if (!spellMentions(row.cells.join(" ")).some((mention) => mention.id === id)) spellFailures.push(`${item.name}: row spell ${name} is not named in its row`)
          if (spellsData && !spellsData.has(id)) spellFailures.push(`${item.name}: row spell ${id} is not in spells.json`)
        }
      }
    }
    // The spell cell of the Necklace of Prayer Beads table is a spell of the official text.
    for (const table of tableOf(item, "Bead|Spell")) {
      for (const row of table.rows) {
        spellTotal++
        if (!officialSpellIds.has(toId(row.cells[1].replace(/ \([^)]*\)$/, "")))) spellFailures.push(`${item.name}: ${row.cells[1]} is not a spell of the official text`)
      }
    }
    // Spell tables: each row is a listed spell with its printed cost, in its printed group.
    for (const table of item.tables ?? []) {
      if (table.columns[0] === "Spell" && table.columns[1] === "Charge Cost") {
        for (const row of table.rows) {
          const candidates = (item.spells ?? []).filter((entry) => officialSpellIds.get(entry.id) && squash(row.cells[0]).startsWith(squash(officialSpellIds.get(entry.id) as string)))
          const spell = candidates.sort((a, b) => b.id.length - a.id.length)[0]
          const cost = /^(\d+)/.exec(row.cells[1])?.[1]
          if (!spell || spell.charges !== Number(cost)) spellFailures.push(`${item.name}: ${row.cells[0]} costs ${row.cells[1]}, listed ${spell?.charges}`)
          spellTotal++
        }
      }
      if (table.columns[1] === "Spells (Charges)") {
        const expected = table.rows.flatMap((row) => [...row.cells[1].matchAll(/([A-Z][A-Za-z/ ]+?) \((\d+) charges?\)/g)].map((match) => `${toId(match[1])}:${row.cells[0]}:${match[2]}`))
        const got = (item.spells ?? []).map((spell) => `${spell.id}:${spell.group}:${spell.charges}`)
        spellTotal += expected.length
        if (!sameSet(expected, got)) spellFailures.push(`${item.name}: spells by plane ${got.join(", ")}, the table has ${expected.join(", ")}`)
      } else if ((item.spells ?? []).some((spell) => spell.group)) spellFailures.push(`${item.name}: spells carry a group but the item has no table of groups`)
    }
  }
  report.check("magic-items", "spells: names, levels, charge costs, save DCs, groups, and every spell cast from the item", spellTotal || 0, spellFailures, spellWaivers)

  /* ---------- activation and reuse ---------- */

  const actionFailures: string[] = []
  const reuseFailures: string[] = []
  const kinds: [string, RegExp][] = [
    ["magic-action", /\bMagic action\b/],
    ["bonus-action", /\bBonus Action\b/],
    ["utilize-action", /\bUtilize action\b/],
    ["reaction", /\bReaction\b/],
  ]
  for (const { item, off } of pairs) {
    const text = flat(off)
    const wanted = kinds.filter(([, pattern]) => pattern.test(text)).map(([kind]) => kind)
    if (!sameSet(wanted, item.activation ?? [])) actionFailures.push(`${item.name}: activation ${JSON.stringify(item.activation)}, the text names ${wanted.join(", ") || "none"}`)
    const reuse = new Set<string>()
    for (const sentence of sentencesOf(text)) {
      if (!/can’t|cannot|ceases to function/.test(sentence)) continue
      if (/until the next dawn/.test(sentence)) reuse.add("dawn")
      if (/until you finish a Short or Long Rest/.test(sentence)) reuse.add("short-or-long-rest")
      else if (/until you finish a Long Rest/.test(sentence)) reuse.add("long-rest")
      else if (/until you finish a Short Rest/.test(sentence)) reuse.add("short-rest")
    }
    if (!sameSet([...reuse], item.reusableAfter ?? [])) reuseFailures.push(`${item.name}: reusableAfter ${JSON.stringify(item.reusableAfter)}, the text says ${[...reuse].join(", ") || "none"}`)
  }
  report.check("magic-items", "activation: the action kinds the text names", pairs.length, actionFailures)
  report.check("magic-items", 'reusableAfter: dawn and rest moments after "can’t be used again until"', pairs.length, reuseFailures)

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
  report.check("magic-items", "references: base items, classes and spells resolve, and Potion of Healing and Spell Scroll match equipment", refTotal + spellTotal, refFailures)

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

/* ---------- the rules ---------- */

function verifyRules(report: Report, equipment: Map<string, Gear> | null, checkTable: (table: ItemTable, label: string, block: string, failures: string[]) => void) {
  const rules = readData<MagicItemRule>("magic-item-rules")
  const failures: string[] = []
  const text206 = pageText(206, 207).replace(/\s+/g, " ")

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
  }
  const wantedDice: Record<string, string> = { potion: "1d100", "sentient-alignment": "1d100", "sentient-communication": "1d10", "sentient-senses": "1d4", "sentient-special-purpose": "1d10" }
  for (const [id, caption] of Object.entries(wantedTables)) {
    const rule = rules.find((entry) => entry.id === id)
    const table = rule && "tables" in rule ? rule.tables?.[0] : undefined
    if (!table || ((table.caption ?? "Potion Miscibility") !== caption && !(id === "potion" && table.dice === "1d100"))) tableFailures.push(`${id}: table "${caption}" is missing`)
    else if (table.dice !== wantedDice[id]) tableFailures.push(`${id}: the table is ${table.dice}, the text prints ${wantedDice[id]}`)
    if (id === "sentient-alignment" && table && table.rows.length !== 9) tableFailures.push(`${id}: ${table.rows.length} alignments, the text prints 9`)
    if (id === "sentient-special-purpose" && table && table.rows.length !== 10) tableFailures.push(`${id}: ${table.rows.length} purposes, the text prints 10`)
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
    if (conflict.refusals.length !== bullets) ruleFailures.push(`conflict lists ${conflict.refusals.length} refusals, the text has ${bullets} bullets`)
    for (const demand of conflict.demands) if (!inOfficial(`${demand.name}. ${demand.text}`)) ruleFailures.push(`demand ${demand.name} is not official text`)
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
