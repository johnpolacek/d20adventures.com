import type { ItemTable, MagicItem, MagicItemRule } from "../../src/schema/magic-items"
import { magicItemRuleSchema, magicItemSchema } from "../../src/schema/magic-items"
import { applyOverrides, toId, writeData } from "../lib/data"
import { pages } from "../lib/official"
import { overrides } from "../overrides/magic-items"

// The base source (5e-bits) has no entry for ten of the official items, splits the "+1, +2, or +3" items into
// separate rows and paraphrases the text. This builder therefore reads the official text itself: headings,
// subtitles, tables and prose. The base source is used only by the check, as a second opinion.

type Line = { text: string; page: number }

const rarityWords = "Common|Uncommon|Rare|Very Rare|Legendary|Artifact"
const categoryWords = "Armor|Potion|Ring|Rod|Scroll|Staff|Wand|Weapon|Wondrous Item"
const abilityByName: Record<string, string> = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" }
const damageTypes = "Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder"
const classNames = ["Barbarian", "Bard", "Cleric", "Druid", "Fighter", "Monk", "Paladin", "Ranger", "Rogue", "Sorcerer", "Warlock", "Wizard"]
const diceText = String.raw`\d+d\d+(?: [+−-] \d+)?`
const asDice = (text: string) => text.replace("−", "-")

/* ---------- the official lines ---------- */

const first = pages.findIndex((page) => page.includes("Magic Items A–Z\nMagic items are presented in alphabetical order"))
const last = pages.findIndex((page, index) => index > first && page.includes("Monsters\nStat Block Overview"))
const lines: Line[] = pages.slice(first, last).flatMap((page, index) => page.split("\n").map((text) => ({ text, page: first + index + 1 })))
while (lines.at(-1)?.text.trim() === "") lines.pop()

/* ---------- headings and subtitles ---------- */

const open = (text: string) => (text.match(/\(/g)?.length ?? 0) - (text.match(/\)/g)?.length ?? 0)
const subtitleShape = new RegExp(String.raw`^(${categoryWords})(?: \(([^)]*)\))?, (.+)$`)
const rarityShape = new RegExp(String.raw`^(${rarityWords}|Rarity Varies)\b`)

function readSubtitle(index: number) {
  if (!new RegExp(String.raw`^(${categoryWords})(?: \(|,)`).test(lines[index].text)) return null
  let text = lines[index].text
  let end = index
  while ((open(text) > 0 || /(,|\bVery|\bor)\s*$/.test(text) || lines[end + 1]?.text.startsWith("(")) && end + 1 < lines.length) text += ` ${lines[++end].text}`
  text = text.replace(/\s+/g, " ").trim()
  const match = subtitleShape.exec(text)
  return match && rarityShape.test(match[3]) ? { text, end } : null
}

type Heading = { name: string; nameStart: number; subtitle: string; subEnd: number }
const headings: Heading[] = []
for (let index = 1; index < lines.length; index++) {
  const subtitle = readSubtitle(index)
  if (!subtitle) continue
  const wrapped = /^[a-z]/.test(lines[index - 1].text)
  const nameStart = wrapped ? index - 2 : index - 1
  const name = lines
    .slice(nameStart, index)
    .map((line) => line.text.trim())
    .join(" ")
  headings.push({ name, nameStart, subtitle: subtitle.text, subEnd: subtitle.end })
  index = subtitle.end
}

function parseSubtitle(text: string) {
  const [, categoryName, baseText, rest] = subtitleShape.exec(text) as RegExpExecArray
  const category = toId(categoryName)
  const attunementMatch = /\(Requires Attunement(?: by (.+?))?\)$/.exec(rest)
  const rarityText = attunementMatch ? rest.slice(0, attunementMatch.index).trim() : rest
  const pairs = [...rarityText.matchAll(new RegExp(String.raw`(${rarityWords}) \(([^)]*)\)`, "g"))]
  let rarity: string
  let variants: { name: string; rarity: string }[] | undefined
  if (pairs.length) {
    rarity = "varies"
    variants = pairs.flatMap((pair) => pair[2].split(" or ").map((name) => ({ name, rarity: toId(pair[1]) })))
  } else {
    const word = (rarityShape.exec(rarityText) as RegExpExecArray)[1]
    rarity = word === "Rarity Varies" ? "varies" : toId(word)
  }
  return { category, base: baseText ? parseBase(baseText) : undefined, rarity, variants, attunement: attunementMatch ? parseAttunement(attunementMatch[1]) : undefined }
}

function parseBase(text: string) {
  const [included, excluded] = text.split(", Except ")
  const names = (list: string) => list.split(/, or |, | or /).map((name) => name.trim())
  const base: { any?: string[]; items?: string[]; except?: string[] } = {}
  if (included.startsWith("Any ")) base.any = names(included.slice(4).replace(/ Weapon$/, "")).map((name) => name.toLowerCase())
  else base.items = names(included).map(toId)
  if (excluded) base.except = names(excluded).map(toId)
  return base
}

function parseAttunement(by: string | undefined) {
  if (!by) return { required: true }
  const tokens = by.split(/, or |, | or /).map((token) => token.replace(/^an? /, "").trim())
  const attunement: { required: true; restriction: string; classes?: string[]; spellcaster?: true } = { required: true, restriction: by }
  if (tokens.every((token) => classNames.includes(token))) attunement.classes = tokens.map(toId)
  else if (tokens.length === 1 && tokens[0] === "Spellcaster") attunement.spellcaster = true
  return attunement
}

/* ---------- prose ---------- */

// Hyphenated words that the PDF prints inside a line, so a hyphen at a line end can be told from a compound.
const hyphenated = new Set<string>()
for (const page of pages) for (const line of page.split("\n")) for (const word of line.slice(0, -1).match(/[A-Za-z0-9]+(?:-[A-Za-z0-9]+)+/g) ?? []) hyphenated.add(word.toLowerCase())

function joinLines(previous: string, next: string) {
  if (!previous.endsWith("-")) return `${previous} ${next}`
  const left = previous.match(/[A-Za-z0-9’-]+$/)?.[0] ?? ""
  const right = next.match(/^[A-Za-z0-9’]+/)?.[0] ?? ""
  const compound = /\d/.test(left) || left.slice(0, -1).includes("-") || hyphenated.has(`${left}${right}`.toLowerCase())
  return compound ? previous + next : previous.slice(0, -1) + next
}

const leadIn = /^(?:[A-Z][\w’-]*)(?: (?:[A-Z][\w’-]*|of|the|to|a|and|in|for|on)){0,4}\. (?=[A-Z“])/

function paragraphs(rows: string[]): string[] {
  const out: string[] = []
  for (const [index, row] of rows.entries()) {
    if (!row.trim()) continue
    const text = row.replace(/[\t ]+/g, " ").trim()
    const previous = out.at(-1)
    // A line starts a paragraph when it is indented, a bullet or footnote, a run-in label after a sentence end, the name
    // line of a stat block, or text after a bullet.
    const statBlock = /^(?:Tiny|Small|Medium|Large|Huge|Gargantuan) [A-Z]/.test(rows[index + 1]?.trim() ?? "")
    const fresh =
      previous === undefined ||
      row.startsWith("\t") ||
      text.startsWith("•") ||
      text.startsWith("*") ||
      statBlock ||
      (previous.startsWith("•") && /^[A-Z“]/.test(text)) ||
      (leadIn.test(text) && /[.!?:)”]$/.test(previous))
    if (fresh) out.push(text)
    else out[out.length - 1] = joinLines(previous, text)
  }
  return out
}

/* ---------- tables ---------- */

const rollRe = /^(\d{1,3})(?:[–-](\d{1,3}))?$/
const rollOf = (text: string) => {
  const match = rollRe.exec(text.trim())
  if (!match) return null
  const value = (digits: string) => (digits === "00" ? 100 : Number(digits))
  return { min: value(match[1]), max: value(match[2] ?? match[1]) }
}
const endsTable = (row: string) => row.startsWith("\t") || row.startsWith("*") || row.startsWith("•")
const captionLike = (row: string | undefined, before: string | undefined) =>
  row !== undefined && /^[A-Z][A-Za-z’ ]{2,48}$/.test(row.trim()) && row.trim().split(" ").length <= 6 && (before === undefined || /[.!?:”]\s*$/.test(before))
const clean = (rows: string[]) => rows.reduce((text, row) => (text ? joinLines(text, row.trim()) : row.trim()), "")

type Taken = { table: ItemTable; from: number; to: number }

// A first cell the PDF wraps onto two lines cannot be told from a second cell, so those rows are named.
const wrappedFirstCell = new Set(["necklace-of-prayer-beads:20"])

function diceTable(id: string, rows: string[], at: number, previousEnd: number): Taken {
  const dice = rows[at].trim()
  const sides = Number(dice.slice(2))
  let p = at + 1
  while (p < rows.length && !rollOf(rows[p])) p++
  const header = rows.slice(at, p).map((row) => row.trim())
  const half = header.length / 2
  const twoUp = header.length >= 4 && header.length % 2 === 0 && header.slice(0, half).every((cell, i) => cell === header[half + i])
  const segments: string[][] = []
  let covered = 0
  const seen = new Set<number>()
  for (; p < rows.length; p++) {
    const row = rows[p]
    if (row.trim() === "") continue
    if (endsTable(row)) break
    // A two-up table has single-line cells, so it is done once every number is covered and its last row has text.
    if (twoUp && seen.size === sides && segments.at(-1)?.length === 2) break
    if (row.trim() === dice) {
      p += header.length - 1
      continue
    }
    const roll = rollOf(row)
    if (roll && (twoUp || roll.min === covered + 1)) {
      segments.push([row.trim()])
      covered = roll.max
      for (let n = roll.min; n <= roll.max; n++) seen.add(n)
      continue
    }
    segments[segments.length - 1].push(row.trim())
  }
  if (!twoUp && covered !== sides) throw new Error(`dice table ${dice} at "${rows[at - 1]}" covers ${covered} of ${sides}`)
  const columns = twoUp ? header.slice(1, half) : header.slice(1)
  const parsed = segments.map((segment) => {
    const cells = segment.slice(1)
    const width = columns.length
    const wrapped = wrappedFirstCell.has(`${id}:${segment[0]}`)
    const lead = wrapped ? [clean(cells.slice(0, 2))] : cells.slice(0, width - 1)
    const values = width === 1 ? [clean(cells)] : [...lead, clean(cells.slice(wrapped ? 2 : width - 1))]
    if (width > 1 && cells.length < width) throw new Error(`table row ${segment[0]} has ${cells.length} cells for ${width} columns`)
    return { roll: rollOf(segment[0]) as { min: number; max: number }, cells: values }
  })
  // A two-up table prints left row, right row, left row. Left rows come first in the logical order.
  const rowsOut = twoUp ? [...parsed.filter((_, i) => i % 2 === 0), ...parsed.filter((_, i) => i % 2 === 1)] : parsed
  const caption = captionLike(rows[at - 1], rows[at - 2]) || (at - 1 === previousEnd && captionLike(rows[at - 1], undefined)) ? rows[at - 1].trim() : undefined
  return { table: { ...(caption ? { caption } : {}), dice, columns, rows: rowsOut }, from: caption ? at - 1 : at, to: p }
}

// Tables the PDF prints without a die. Each column is a pattern for one line, `any` takes one line of anything,
// and `text` takes lines until the next column's pattern matches.
type Col = RegExp | "any" | "text"
type Spec = { header: string[]; cols: Col[] }
const rarityCell = /^(Common|Uncommon|Rare|Very Rare|Legendary)$/
const intCell = /^\d+$/
const specs: Record<string, Spec[]> = {
  "belt-of-giant-strength": [{ header: ["Belt", "Str.", "Rarity"], cols: ["text", intCell, rarityCell] }],
  "potion-of-giant-strength": [{ header: ["Potion", "Str.", "Rarity"], cols: ["text", intCell, rarityCell] }],
  "potions-of-healing": [{ header: ["Potion", "HP Regained", "Rarity"], cols: ["text", new RegExp(`^${diceText}$`), rarityCell] }],
  "spell-scroll": [{ header: ["Spell Level", "Rarity", "Save DC", "Attack Bonus"], cols: [/^(Cantrip|\d)$/, rarityCell, intCell, /^\+\d+$/] }],
  "dragon-scale-mail": [{ header: ["Dragon", "Resistance", "Dragon", "Resistance"], cols: ["any", "any", "any", "any"] }],
  "elemental-gem": [{ header: ["Gem", "Summoned Elemental"], cols: ["any", "any"] }],
  "cube-of-force": [{ header: ["Spell", "Charge Cost"], cols: ["any", intCell] }],
  "ring-of-elemental-command": [{ header: ["Plane", "Spells (Charges)"], cols: [/^(Air|Earth|Fire|Water)$/, "text"] }],
}
const costCell = /^(\d+|\d+ charges? per .*)$/

function matches(col: Col, row: string) {
  return col === "any" || col === "text" ? true : col.test(row.trim())
}

function specTable(rows: string[], at: number, header: string[], cols: Col[], twoUp: boolean, headerLength: number): Taken {
  const columns = twoUp ? header.slice(0, header.length / 2) : header
  let p = at + headerLength
  const parsed: string[][] = []
  // A header repeated at a page break is skipped.
  const skipHeader = () => {
    const probe = rows
      .slice(p)
      .filter((row) => row.trim() !== "")
      .slice(0, headerLength)
    if (probe.length === headerLength && probe.every((row, i) => row.trim() === header[i])) {
      let seen = 0
      while (seen < headerLength) if (rows[p++].trim() !== "") seen++
    }
  }
  while (p < rows.length) {
    if (rows[p].trim() === "") {
      p++
      continue
    }
    if (endsTable(rows[p])) break
    const cells: string[] = []
    let q = p
    let ok = true
    for (let c = 0; c < cols.length; c++) {
      const col = cols[c]
      if (q >= rows.length || endsTable(rows[q])) {
        ok = false
        break
      }
      if (col === "text") {
        const parts: string[] = []
        const next = cols[c + 1]
        const lastText = next === undefined
        while (
          q < rows.length &&
          !endsTable(rows[q]) &&
          (lastText ? !(parts.length && matches(cols[0], rows[q]) && cols[0] !== "text" && cols[0] !== "any") : !(parts.length && matches(next, rows[q])))
        )
          parts.push(rows[q++].trim())
        if (!parts.length) ok = false
        cells.push(clean(parts))
      } else {
        if (col !== "any" && !matches(col, rows[q])) {
          ok = false
          break
        }
        const parts = [rows[q++].trim()]
        while (open(parts.join(" ")) > 0 && q < rows.length) parts.push(rows[q++].trim())
        cells.push(clean(parts))
      }
    }
    if (!ok) break
    parsed.push(cells)
    p = q
    skipHeader()
  }
  const width = cols.length
  const logical = twoUp ? flattenTwoUp(parsed, width / 2) : parsed
  return { table: { columns, rows: logical.map((cells) => ({ cells })) }, from: at, to: p }
}

// A two-up table prints (left row, right row) pairs of cells in one record, so split each record in two.
function flattenTwoUp(records: string[][], half: number) {
  return [...records.map((record) => record.slice(0, half)), ...records.map((record) => record.slice(half))]
}

function spellTable(rows: string[], at: number): Taken | null {
  // The header lines are "Spell", "Charge", "Cost" (or "Charge Cost"), once or twice, with blank lines around.
  let p = at
  let count = 0
  while (p < rows.length) {
    const text = rows[p].trim()
    if (text === "Spell") count++
    else if (text !== "" && text !== "Charge" && text !== "Charge Cost" && text !== "Cost") break
    p++
  }
  if (count === 0 || count > 2) return null
  const cells: string[][] = []
  while (p < rows.length) {
    if (rows[p].trim() === "") {
      p++
      continue
    }
    if (endsTable(rows[p])) break
    const parts: string[] = []
    while (p < rows.length && !endsTable(rows[p]) && !costCell.test(rows[p].trim())) parts.push(rows[p++].trim())
    if (p >= rows.length || endsTable(rows[p])) break
    const cost = [rows[p++].trim()]
    while ((open(cost.join(" ")) > 0 || /per spell level$/.test(cost.join(" ").trim())) && p < rows.length) cost.push(rows[p++].trim())
    cells.push([clean(parts), clean(cost)])
    // A header repeated at a page break.
    while (p < rows.length && ["", "Spell", "Charge", "Charge Cost", "Cost"].includes(rows[p].trim())) p++
  }
  const logical = count === 2 ? [...cells.filter((_, i) => i % 2 === 0), ...cells.filter((_, i) => i % 2 === 1)] : cells
  return { table: { columns: ["Spell", "Charge Cost"], rows: logical.map((row) => ({ cells: row })) }, from: at, to: p }
}

function findHeader(rows: string[], header: string[], from = 0) {
  for (let i = from; i + header.length <= rows.length; i++) if (header.every((cell, j) => rows[i + j].trim() === cell)) return i
  return -1
}

// The Mysterious Deck table has two dice columns, one per deck size, and "—" where a card is not in the 13-card deck.
function deckTable(rows: string[], at: number): Taken {
  const header = /^(1d100\s*|\(\d+-Card\s*|Deck\)\s*|\s*|Card)$/
  let p = at
  const cells: string[] = []
  for (; p < rows.length && !endsTable(rows[p]); p++) if (!header.test(rows[p])) cells.push(rows[p].trim())
  if (cells.length % 3) throw new Error("the Mysterious Deck table does not split into rows of three")
  const rowsOut = Array.from({ length: cells.length / 3 }, (_, i) => ({ cells: cells.slice(i * 3, i * 3 + 3) }))
  const caption = rows[at - 1].trim()
  return { table: { caption, columns: ["1d100 (13-Card Deck)", "1d100 (22-Card Deck)", "Card"], rows: rowsOut }, from: at - 1, to: p }
}

function takeTables(id: string, rows: string[]): { rows: string[]; tables: ItemTable[] } {
  const removed = new Set<number>()
  const tables: { at: number; table: ItemTable }[] = []
  const take = (taken: Taken) => {
    for (let i = taken.from; i < taken.to; i++) removed.add(i)
    tables.push({ at: taken.from, table: taken.table })
  }
  if (id === "mysterious-deck")
    take(
      deckTable(
        rows,
        rows.findIndex((row) => /^1d100\s*$/.test(row))
      )
    )
  let lastEnd = -1
  for (let i = 0; i < rows.length; i++) {
    if (removed.has(i)) continue
    if (/^1d\d+$/.test(rows[i].trim())) {
      const taken = diceTable(id, rows, i, lastEnd)
      lastEnd = taken.to
      take(taken)
      i = taken.to - 1
    }
  }
  for (const spec of specs[id] ?? []) {
    const at = findHeader(rows, spec.header)
    if (at < 0) throw new Error(`${id}: table header ${spec.header.join(" / ")} not found`)
    const twoUp = spec.header.length === 4 && spec.header[0] === spec.header[2]
    const taken = specTable(rows, at, spec.header, spec.cols, twoUp, spec.header.length)
    const caption = captionLike(rows[at - 1], rows[at - 2]) ? rows[at - 1].trim() : undefined
    if (caption) taken.from = at - 1
    take({ ...taken, table: { ...(caption ? { caption } : {}), ...taken.table } })
  }
  for (let i = 0; i < rows.length; i++) {
    if (removed.has(i) || rows[i].trim() !== "Spell") continue
    const taken = spellTable(rows, i)
    if (!taken) continue
    const lead = i > 0 && rows[i - 1].trim() === "" ? i - 1 : i
    take({ ...taken, from: lead })
    i = taken.to - 1
  }
  tables.sort((a, b) => a.at - b.at)
  return { rows: rows.filter((_, i) => !removed.has(i)), tables: tables.map((entry) => entry.table) }
}

// The Apparatus of the Crab lever table is printed after the next item's text. Rows are a number, an Up cell and a
// Down cell. The Up cell ends at the first line that ends a sentence.
function leverTable(rows: string[]): ItemTable {
  const at = rows.findIndex((row) => row.trim() === "Lever")
  const table: ItemTable = { caption: "Apparatus of the Crab Levers", columns: ["Lever", "Up", "Down"], rows: [] }
  const body = rows.slice(at + 3).map((row) => row.trim())
  let expected = 1
  let begin = -1
  const chunks: string[][] = []
  for (const [i, row] of body.entries()) {
    if (intCell.test(row) && Number(row) === expected) {
      if (begin >= 0) chunks.push(body.slice(begin, i))
      begin = i
      expected++
    }
  }
  chunks.push(body.slice(begin))
  for (const chunk of chunks) {
    const split = chunk.findIndex((row, i) => i > 0 && /\.$/.test(row))
    table.rows.push({ cells: [chunk[0], clean(chunk.slice(1, split + 1)), clean(chunk.slice(split + 1))] })
  }
  return table
}

/* ---------- mechanics ---------- */

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/)

// A target phrase is a list such as "Armor Class, saving throws, and spell attack rolls". Parts are kept while they
// still name something a bonus applies to, so "Armor Class, and you know Abyssal" gives only Armor Class.
function bonusTargets(phrase: string) {
  const targets: string[] = []
  for (const part of phrase.split(/, and |, | and /)) {
    if (!/(?:rolls|checks|class|throws)$/i.test(part.trim())) break
    targets.push(toId(part.replace(/^(?:your|the) /, "")))
  }
  return targets
}

function bonusesOf(text: string) {
  const found: { to: string; value: number; text: string }[] = []
  const re = /\+(\d+) bonus to ([^.;]+?)(?= (?:made|while|if|when|against|determined|in addition|that|on|with|but|and can)\b|[.;]|$)/g
  for (const sentence of sentences(text)) {
    if (sentence.startsWith("For example")) continue
    re.lastIndex = 0
    for (const match of sentence.matchAll(re)) {
      for (const to of bonusTargets(match[2])) if (!found.some((bonus) => bonus.to === to && bonus.value === Number(match[1]))) found.push({ to, value: Number(match[1]), text: sentence })
    }
  }
  return found
}

const spellHeadings = (() => {
  const names = new Set<string>()
  const all = pages.flatMap((page) => page.split("\n"))
  for (let i = 1; i < all.length; i++) if (/^(Level \d [A-Z][a-z]+|[A-Z][a-z]+ Cantrip) \(/.test(all[i]) && /^[A-Z]/.test(all[i - 1])) names.add(all[i - 1].trim())
  return [...names].sort((a, b) => b.length - a.length)
})()

type Spell = { id: string; level?: number; charges?: number; maxCharges?: number; upcastsWithCharges?: true; chargesPerSpellLevel?: true; saveDc?: number }

function spellsOf(paras: string[], tables: ItemTable[]): Spell[] {
  const found = new Map<string, Spell>()
  const add = (name: string, extra: Partial<Spell> = {}) => {
    const id = toId(name)
    found.set(id, { ...found.get(id), id, ...extra })
  }
  // Spells named after "cast", including bullet lists that follow a sentence ending in a colon.
  const units: string[] = []
  for (const para of paras) {
    if (para.startsWith("•") && units.length) units[units.length - 1] += ` ${para}`
    else units.push(...(para.endsWith(":") ? [para] : sentences(para)))
  }
  const escapeName = (name: string) => name.replace(/[/()]/g, "\\$&")
  for (const unit of units) {
    const castAt = unit.search(/\bcast\b|\bcasting\b/)
    const cost = /\bexpend (?:no more than )?(\d+)(?: or more)?(?: of [A-Za-z’ ]+?)? charges?\b[^.]*?\bcast\b/.exec(unit)
    const unitDc = /\(save DC (\d+)\)/.exec(unit)?.[1]
    for (const name of spellHeadings) {
      const word = `(?<![A-Za-z’])${escapeName(name)}(?![A-Za-z’])`
      // Potions give a spell's effect without casting it, and the Necklace of Fireballs detonates beads as a Fireball.
      const gives = new RegExp(String.raw`effect of the ${word} spell(?: \(save DC (\d+)\))?`).exec(unit) ?? new RegExp(String.raw`as a level (\d) ${word} \(save DC (\d+)\)`).exec(unit)
      if (gives) {
        const asLevel = /as a level (\d)/.test(gives[0])
        add(name, { ...(asLevel ? { level: Number(gives[1]), saveDc: Number(gives[2]) } : gives[1] ? { saveDc: Number(gives[1]) } : {}) })
      }
      if (castAt < 0) continue
      const tail = unit.slice(castAt)
      const re = new RegExp(String.raw`${word}(?: spell)?(?: \((?:save DC (\d+)|level (\d) version|expends (\d+) charges?)\))?`, "g")
      for (const match of tail.matchAll(re)) {
        const before = tail.slice(0, match.index)
        if (/\b(?:targeted by|against|from|by) (?:an? |the )?$/.test(before)) continue
        const castsIt = /\bcast (?:the )?(?:level \d version of )?(?:the )?$/.test(before)
        if (/^ spell\b/.test(match[0].slice(name.length)) && !castsIt) continue
        const level = /level (\d) version of (?:the )?$/.exec(before)?.[1]
        const saveDc = match[1] ?? unitDc
        add(name, {
          ...(saveDc ? { saveDc: Number(saveDc) } : {}),
          ...(match[2] ? { level: Number(match[2]) } : level ? { level: Number(level) } : {}),
          ...(match[3] ? { charges: Number(match[3]) } : cost ? { charges: Number(cost[1]) } : {}),
        })
      }
    }
  }
  // "For 1 charge, you cast the level 3 version of the spell. You can increase the spell’s level by 1 for each additional charge."
  const scaling = paras.join(" ").match(/For (\d+) charge, you cast the level (\d) version of the spell\./)
  const cap = paras.join(" ").match(/expend no more than (\d+) charges/)
  if (scaling && found.size === 1) {
    const [id] = found.keys()
    found.set(id, { ...(found.get(id) as Spell), level: Number(scaling[2]), charges: Number(scaling[1]), ...(cap ? { maxCharges: Number(cap[1]) } : {}), upcastsWithCharges: true })
  }
  const tableDc = paras.map((para) => /\(save DC (\d+)\)[^.]*table/.exec(para)?.[1] ?? /save DC of (\d+)/.exec(para)?.[1]).find(Boolean)
  for (const table of tables) {
    if (table.columns[0] === "Spell" && table.columns[1] === "Charge Cost") {
      for (const { cells } of table.rows) {
        const [raw, cost] = cells
        const level = /\(level (\d) version\)/.exec(raw)?.[1]
        const dc = /\(save DC (\d+)\)/.exec(raw)?.[1] ?? tableDc
        const name = raw.replace(/ \([^)]*\)$/, "")
        add(name, {
          ...(level ? { level: Number(level) } : {}),
          ...(dc ? { saveDc: Number(dc) } : {}),
          ...(/^\d+$/.test(cost) ? { charges: Number(cost) } : { chargesPerSpellLevel: true as const, charges: Number(/^(\d+)/.exec(cost)?.[1]), maxCharges: Number(/maximum (\d+)/.exec(cost)?.[1]) }),
        })
      }
    }
    if (table.columns[1] === "Spells (Charges)") {
      for (const { cells } of table.rows) for (const match of cells[1].matchAll(/([A-Z][A-Za-z/ ]+?) \((\d+) charges?\)/g)) add(match[1], { charges: Number(match[2]), saveDc: 18 })
    }
    if (table.columns.join("|") === "Bead|Spell") {
      for (const { cells } of table.rows)
        add(cells[1].replace(/ \([^)]*\)$/, ""), { ...(/\(level (\d) version\)/.exec(cells[1]) ? { level: Number(/\(level (\d) version\)/.exec(cells[1])?.[1]) } : {}) })
    }
  }
  return [...found.values()]
}

function chargesOf(flat: string) {
  const max = /(?:\b(?:has|have|starts with)|\bof its) (\d+(?:d\d+(?: \+ \d+)?)?) charges?\b/.exec(flat)?.[1]
  if (!max) return undefined
  const regain = new RegExp(String.raw`regains? (${diceText}|\d+|all) expended charges?( daily at dawn)?`).exec(flat)
  const rolled = /If you expend (?:the )?(?:[a-z]+’s )?last charge, roll (\d+d\d+)\. ((?:On a \d+, [^.]+\.\s*)+)/.exec(flat)
  const outcomes = rolled ? [...rolled[2].matchAll(/On a (\d+), ([^.]+\.)/g)].map((match) => ({ on: Number(match[1]), effect: match[2] })) : []
  return {
    max: /d/.test(max) ? asDice(max) : Number(max),
    ...(regain?.[2] ? { regains: { amount: /^\d+$/.test(regain[1]) ? Number(regain[1]) : regain[1] === "all" ? "all" : asDice(regain[1]), time: "dawn" } } : {}),
    ...(rolled ? { lastCharge: { dice: rolled[1], outcomes } } : {}),
  }
}

function savesChecksDamage(flat: string) {
  const saves: { ability: string; dc: number }[] = []
  const checks: { ability: string; skill?: string; dc: number }[] = []
  const damage: { dice: string; type: string }[] = []
  const abilities = Object.keys(abilityByName).join("|")
  const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b)
  for (const match of flat.matchAll(new RegExp(String.raw`DC (\d+) (${abilities}) saving throw`, "g"))) {
    const save = { ability: abilityByName[match[2]], dc: Number(match[1]) }
    if (!saves.some((other) => same(other, save))) saves.push(save)
  }
  // "make a Constitution saving throw (DC 11 for Light or DC 15 for Daylight)"
  for (const match of flat.matchAll(new RegExp(String.raw`(${abilities}) saving throw \(DC (\d+) for [A-Za-z ]+ or DC (\d+) for [A-Za-z ]+\)`, "g"))) {
    for (const dc of [match[2], match[3]]) {
      const save = { ability: abilityByName[match[1]], dc: Number(dc) }
      if (!saves.some((other) => same(other, save))) saves.push(save)
    }
  }
  for (const match of flat.matchAll(new RegExp(String.raw`DC (\d+) (${abilities})(?: \(([A-Za-z ]+)\))? check`, "g"))) {
    const check = { ability: abilityByName[match[2]], ...(match[3] ? { skill: toId(match[3]) } : {}), dc: Number(match[1]) }
    if (!checks.some((other) => same(other, check))) checks.push(check)
  }
  for (const match of flat.matchAll(new RegExp(String.raw`(${diceText})\)? (${damageTypes}) damage`, "g"))) {
    const entry = { dice: asDice(match[1]), type: match[2].toLowerCase() }
    if (!damage.some((other) => same(other, entry))) damage.push(entry)
  }
  return { saves, checks, damage }
}

/* ---------- variants from paragraphs, tables and subtitles ---------- */

const rarityId = (word: string) => toId(word)

function paragraphVariants(paras: string[]) {
  const variants: { name: string; rarity: string; bonuses?: { to: string; value: number }[] }[] = []
  for (const para of paras) {
    const match = new RegExp(String.raw`^([A-Z][A-Za-z ]+) \((${rarityWords})\)\. `).exec(para)
    if (!match) continue
    const bonuses = bonusesOf(para).map(({ to, value }) => ({ to, value }))
    variants.push({ name: match[1], rarity: rarityId(match[2]), ...(bonuses.length ? { bonuses } : {}) })
  }
  return variants
}

function tableVariants(id: string, tables: ItemTable[]) {
  const table = tables[0]
  if (id === "belt-of-giant-strength" || id === "potion-of-giant-strength") return table.rows.map(({ cells }) => ({ name: cells[0], rarity: rarityId(cells[2]), strength: Number(cells[1]) }))
  if (id === "potions-of-healing") return table.rows.map(({ cells }) => ({ name: cells[0], rarity: rarityId(cells[2]), healing: asDice(cells[1]) }))
  if (id === "spell-scroll")
    return table.rows.map(({ cells }) => ({
      name: cells[0] === "Cantrip" ? "Cantrip" : `Level ${cells[0]}`,
      rarity: rarityId(cells[1]),
      spellLevel: cells[0] === "Cantrip" ? 0 : Number(cells[0]),
      saveDc: Number(cells[2]),
      attackBonus: Number(cells[3].slice(1)),
    }))
  return undefined
}

/* ---------- items ---------- */

// Phrases where the text itself says the item is used up. Potions and scrolls are consumable by the category rules.
const usedUp =
  /single-use|enough of it for one use|dust is consumed|ceases to be magical|ammunition is no longer magical|ammunition becomes nonmagical|bead explodes[^.]*is destroyed|dissolves on your tongue/

// Items whose charges belong to one variant, not to the item.
const chargesPerVariant = new Set(["figurine-of-wondrous-power"])

function bodyOf(index: number): string[] {
  const next = headings[index + 1]
  return lines.slice(headings[index].subEnd + 1, next ? next.nameStart : lines.length).map((line) => line.text)
}

function build(): MagicItem[] {
  const bodies = headings.map((_, index) => bodyOf(index))
  // Apparatus of the Crab: its lever table lands in the body of the item after Armor, +1, +2, or +3 (Armor of Resistance).
  const host = headings.findIndex((heading) => heading.name === "Armor of Resistance")
  const leverAt = bodies[host].findIndex((row) => row.trim() === "Apparatus of the Crab Levers")
  const leverRows = bodies[host].splice(leverAt)
  const levers = leverTable(leverRows.slice(1))

  const items = headings.map((heading, index) => {
    const id = toId(heading.name)
    const sub = parseSubtitle(heading.subtitle)
    const { rows, tables: parsedTables } = takeTables(id, bodies[index])
    const tables = id === "apparatus-of-the-crab" ? [levers, ...parsedTables] : parsedTables
    const paras = paragraphs(rows)
    const flat = paras.join(" ")
    const paragraphForms = paragraphVariants(paras)

    let variants = tableVariants(id, parsedTables) as MagicItem["variants"]
    if (paragraphForms.length) variants = paragraphForms as MagicItem["variants"]
    if (sub.variants) {
      const plus = sub.variants.every((variant) => /^\+\d$/.test(variant.name))
      const targets = plus ? bonusTargets(/bonus to ([^.]+?) (?:made|while|determined)/.exec(flat)?.[1] ?? "") : []
      variants = sub.variants.map((variant) => ({ ...variant, ...(plus ? { bonuses: targets.map((to) => ({ to, value: Number(variant.name.slice(1)) })) } : {}) })) as MagicItem["variants"]
    }

    const stats = savesChecksDamage(`${flat} ${tables.flatMap((table) => table.rows.flatMap((row) => row.cells)).join(" ")}`)
    const charges = chargesPerVariant.has(id) ? undefined : chargesOf(flat)
    const spells = spellsOf(paras, tables)
    const bonuses = paragraphForms.length || sub.variants ? [] : bonusesOf(flat)
    const cursed = paras.some((para) => /^Curse\. /.test(para))
    const consumable = sub.category === "potion" || sub.category === "scroll" || usedUp.test(flat)

    const entry = {
      id,
      name: heading.name,
      page: lines[heading.nameStart].page,
      category: sub.category,
      ...(sub.base ? { base: sub.base } : {}),
      rarity: sub.rarity,
      ...(variants ? { variants } : {}),
      ...(sub.attunement ? { attunement: sub.attunement } : {}),
      ...(cursed ? { cursed: true } : {}),
      ...(consumable ? { consumable: true } : {}),
      ...(bonuses.length ? { bonuses } : {}),
      ...(charges ? { charges } : {}),
      ...(stats.saves.length ? { saves: stats.saves } : {}),
      ...(stats.checks.length ? { checks: stats.checks } : {}),
      ...(stats.damage.length ? { damage: stats.damage } : {}),
      ...(spells.length ? { spells } : {}),
      ...(tables.length ? { tables } : {}),
      description: paras.join("\n"),
    }
    return entry as unknown as MagicItem
  })
  return items
}

/* ---------- the rules ---------- */

const rulePages = [204, 205, 206, 207]
const ruleRows: Line[] = rulePages.flatMap((page) => pages[page - 1].split("\n").map((text) => ({ text, page })))

// Headings of the chapter's rules, in print order. The first four share names with cells of the category table, so
// the search starts after the last cell of that table.
const ruleHeadings = [
  "Armor",
  "Potions",
  "Rings",
  "Rods",
  "Magic Item Rules",
  "Attunement Prerequisites",
  "Items Made for Specific Creatures",
  "Unusual Anatomy",
  "Paired Items",
  "Scrolls",
  "Staffs",
  "Wands",
  "Weapons",
  "Wondrous Items",
  "Magic Item Rarity",
  "Magic Item Values by Rarity",
  "Activating a Magic Item",
  "Command Word",
  "Consumable Items",
  "Spells Cast from Items",
  "Charges",
  "“The Next Dawn”",
  "Cursed Items",
  "Magic Item Resilience",
  "Crafting Magic Items",
  "Arcana Proficiency",
  "Tools",
  "Spells",
  "Time and Cost",
  "Sentient Magic Items",
]

// Where a table's own lines start inside a section, so the section keeps only its prose and footnote.
const tableCaptions: Record<string, string> = {
  Potions: "Potion Miscibility",
  Tools: "Magic Item Tools",
  "Magic Item Values by Rarity": "Magic Item Rarities and Values",
  "Time and Cost": "Magic Item Crafting Time and Cost",
}

function ruleSections() {
  const marks: number[] = []
  let from = ruleRows.findIndex((row) => row.text.trim() === "Bag of Holding, Boots of Elvenkind") + 1
  for (const name of ruleHeadings) {
    const at = ruleRows.findIndex((row, i) => i >= from && (row.text.trim() === name || row.text.trim().startsWith(`${name}. `)))
    if (at < 0) throw new Error(`rules: heading ${name} not found`)
    marks.push(at)
    from = at + 1
  }
  const sections = new Map<string, { page: number; text: string }>()
  ruleHeadings.forEach((name, i) => {
    if (name === "Sentient Magic Items") return
    // Four rules are run-in headings: "Paired Items. You can allow ...". Their label is not part of the rule.
    const head = ruleRows[marks[i]].text.trim()
    const runIn = head.startsWith(`${name}. `) ? [head.slice(name.length + 2)] : []
    let rows = [...runIn, ...ruleRows.slice(marks[i] + 1, marks[i + 1]).map((row) => row.text)]
    const caption = tableCaptions[name]
    if (caption) {
      const at = rows.findIndex((row) => row.trim() === caption)
      // The footnote starts with "*" after the table. Keep it with the section.
      const note = rows.findIndex((row, k) => k > at && row.startsWith("*"))
      rows = [...rows.slice(0, at), ...(note >= 0 ? rows.slice(note) : [])]
    }
    sections.set(name, { page: ruleRows[marks[i]].page, text: paragraphs(rows).join("\n") })
  })
  return sections
}

function buildRules(): MagicItemRule[] {
  const rules: MagicItemRule[] = []
  const sections = ruleSections()
  const section = (name: string) => sections.get(name) as { page: number; text: string }

  const flat = ruleRows
    .filter((row) => row.page >= 206)
    .map((row) => row.text.trim())
    .join(" ")
  const values = new Map<string, number | "priceless">()
  for (const match of flat.matchAll(/(?<!Very )(Common|Uncommon|Rare|Very Rare|Legendary|Artifact) (Priceless|[\d,]+ GP)/g))
    values.set(toId(match[1]), match[2] === "Priceless" ? "priceless" : Number(match[2].replace(/[, GP]/g, "")))
  const crafting = new Map<string, { days: number; cost: number }>()
  for (const match of flat.matchAll(/(?<!Very )(Common|Uncommon|Rare|Very Rare|Legendary) (\d+) days ([\d,]+) GP/g))
    crafting.set(toId(match[1]), { days: Number(match[2]), cost: Number(match[3].replace(/,/g, "")) })
  for (const [id, name] of [
    ["common", "Common"],
    ["uncommon", "Uncommon"],
    ["rare", "Rare"],
    ["very-rare", "Very Rare"],
    ["legendary", "Legendary"],
    ["artifact", "Artifact"],
  ]) {
    const value = values.get(id)
    const craft = crafting.get(id)
    rules.push({
      id,
      name,
      page: 206,
      kind: "rarity",
      ...(value === "priceless" ? { priceless: true } : { value }),
      ...(craft ? { craftingDays: craft.days, craftingCost: craft.cost } : {}),
    } as MagicItemRule)
  }

  // The Magic Item Tools table: a category name, then the lines of its tool cell.
  const toolRows = ruleRows.map((row) => row.text.trim())
  const toolStart = toolRows.indexOf("Required Tool") + 1
  const toolEnd = toolRows.findIndex((row, i) => i > toolStart && row === "Spells")
  const order = ["Armor", "Potion", "Ring", "Rod", "Scroll", "Staff", "Wand", "Weapon", "Wondrous Item"]
  const tools = new Map<string, string[]>()
  let k = -1
  for (const row of toolRows.slice(toolStart, toolEnd)) {
    if (row === order[k + 1]) tools.set(order[++k], [])
    else if (k >= 0) (tools.get(order[k]) as string[]).push(row)
  }
  const categoryHeadings: [string, string][] = [
    ["Armor", "Armor"],
    ["Potions", "Potion"],
    ["Rings", "Ring"],
    ["Rods", "Rod"],
    ["Scrolls", "Scroll"],
    ["Staffs", "Staff"],
    ["Wands", "Wand"],
    ["Weapons", "Weapon"],
    ["Wondrous Items", "Wondrous Item"],
  ]
  for (const [heading, singular] of categoryHeadings) {
    const { page, text } = section(heading)
    rules.push({ id: toId(singular), name: singular, page, kind: "category", category: toId(singular), tools: clean(tools.get(singular) as string[]), text } as MagicItemRule)
  }

  const plain = [
    "Magic Item Rarity",
    "Magic Item Values by Rarity",
    "Attunement Prerequisites",
    "Items Made for Specific Creatures",
    "Unusual Anatomy",
    "Paired Items",
    "Activating a Magic Item",
    "Command Word",
    "Consumable Items",
    "Spells Cast from Items",
    "Charges",
    "“The Next Dawn”",
    "Cursed Items",
    "Magic Item Resilience",
    "Crafting Magic Items",
    "Arcana Proficiency",
    "Tools",
    "Spells",
    "Time and Cost",
  ]
  for (const name of plain) {
    const { page, text } = section(name)
    rules.push({ id: name === "Spells" ? "crafting-spells" : name === "Tools" ? "crafting-tools" : toId(name), name, page, kind: "rule", text } as MagicItemRule)
  }

  const equipment = pageLines(102, 103).map((row) => row.trim())
  const from = equipment.indexOf("No More Than Three Items") + 1
  const to = equipment.indexOf("Ending Attunement")
  rules.push({ id: "attunement", name: "No More Than Three Items", page: 102, kind: "attunement", maxItems: 3, text: paragraphs(equipment.slice(from, to)).join("\n") } as MagicItemRule)
  return rules
}

const pageLines = (from: number, to: number) =>
  pages
    .slice(from - 1, to)
    .join("\n")
    .split("\n")

export default function buildMagicItems() {
  const items = applyOverrides("magic-items", build(), overrides)
  writeData("magic-items", magicItemSchema, items)
  writeData("magic-item-rules", magicItemRuleSchema, buildRules())
}
