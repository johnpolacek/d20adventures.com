import type { DamageTypeId } from "../../src/schema/common"
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
  // "Enlarge/" at a line end is the spell "Enlarge/Reduce", which the PDF breaks after the slash.
  if (previous.endsWith("/")) return previous + next
  if (!previous.endsWith("-")) return `${previous} ${next}`
  const left = previous.match(/[A-Za-z0-9’-]+$/)?.[0] ?? ""
  const right = next.match(/^[A-Za-z0-9’]+/)?.[0] ?? ""
  const compound = /\d/.test(left) || hyphenated.has(`${left}${right}`.toLowerCase())
  return compound ? previous + next : previous.slice(0, -1) + next
}

const leadIn = /^(?:[A-Z][\w’-]*)(?: (?:[A-Z0-9][\w’-]*|of|the|to|a|and|in|for|on)){0,4}\. (?=[A-Z“])/

function paragraphs(rows: string[]): string[] {
  const out: string[] = []
  for (const row of rows) {
    if (!row.trim()) continue
    const text = row.replace(/[\t ]+/g, " ").trim()
    const previous = out.at(-1)
    // A line starts a paragraph when it is indented, a bullet or footnote, a run-in label after a sentence end, or text
    // after a bullet.
    const fresh =
      previous === undefined ||
      row.startsWith("\t") ||
      text.startsWith("•") ||
      text.startsWith("*") ||
      (previous.startsWith("•") && previous.length < 40 && /^[A-Z“]/.test(text)) ||
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
const lastFilled = (rows: string[], before: number) => {
  for (let i = before; i >= 0; i--) if (rows[i].trim() !== "") return rows[i]
  return undefined
}
const captionLike = (row: string | undefined, before: string | undefined) =>
  row !== undefined && /^[A-Z][A-Za-z’ ]{2,48}$/.test(row.trim()) && row.trim().split(" ").length <= 6 && (before === undefined || /[.!?:”]\s*$/.test(before))
const clean = (rows: string[]) =>
  rows
    .map((row) => row.trim())
    .filter(Boolean)
    .reduce((text, row) => (text ? joinLines(text, row) : row), "")

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
    // Another table follows: a caption line, then its die heading.
    if (!twoUp && covered === sides && captionLike(row, undefined) && /^1d\d+$/.test((rows.slice(p + 1).find((next) => next.trim() !== "") ?? "").trim())) break
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
  const caption = captionLike(rows[at - 1], lastFilled(rows, at - 2)) || (at - 1 === previousEnd && captionLike(rows[at - 1], undefined)) ? rows[at - 1].trim() : undefined
  return { table: { ...(caption ? { caption } : {}), dice, columns, rows: rowsOut }, from: caption ? at - 1 : at, to: p }
}

// Tables the PDF prints without a die. Each column is a pattern for one line, `any` takes one line of anything,
// and `text` takes lines until the next column's pattern matches.
type Col = RegExp | "any" | "text"
type Spec = { header: string[]; cols: Col[]; twoUp?: boolean; columns?: string[] }
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
  "rules-categories": [{ header: ["Category", "Examples"], cols: ["any", "any"] }],
  "ring-of-shooting-stars": [
    {
      header: ["Number of", "Spheres", "Lightning", "Damage", "Number of", "Spheres", "Lightning", "Damage"],
      columns: ["Number of Spheres", "Lightning Damage"],
      cols: [intCell, new RegExp(`^${diceText}$`), intCell, new RegExp(`^${diceText}$`)],
      twoUp: true,
    },
  ],
  "ring-of-elemental-command": [{ header: ["Plane", "Spells (Charges)"], cols: [/^(Air|Earth|Fire|Water)$/, "text"] }],
}
const costCell = /^(\d+|\d+ charges? per .*)$/

function matches(col: Col, row: string) {
  return col === "any" || col === "text" ? true : col.test(row.trim())
}

function specTable(rows: string[], at: number, header: string[], cols: Col[], twoUp: boolean, headerLength: number, named?: string[]): Taken {
  const columns = named ?? (twoUp ? header.slice(0, header.length / 2) : header)
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
    const twoUp = spec.twoUp ?? (spec.header.length === 4 && spec.header[0] === spec.header[2])
    const taken = specTable(rows, at, spec.header, spec.cols, twoUp, spec.header.length, spec.columns)
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

// Sentences end at ".", "!" or "?" followed by a space.
const sentences = (text: string) => text.replace(/([.!?])\s+/g, "$1\u0000").split("\u0000")

// A target phrase is a list such as "Armor Class, saving throws, and spell attack rolls". Parts are kept while they
// still name something a bonus can apply to, so "Armor Class, and you know Abyssal" gives only Armor Class.
const fixedTargets: Record<string, string> = {
  "armor class": "armor-class",
  "attack rolls": "attack-rolls",
  "damage rolls": "damage-rolls",
  "spell attack rolls": "spell-attack-rolls",
  "spell save dc": "spell-save-dc",
  "spell save dcs": "spell-save-dc",
  "saving throws": "saving-throws",
  "ability checks": "ability-checks",
  initiative: "initiative",
  "proficiency bonus": "proficiency-bonus",
}

function targetOf(part: string): string | undefined {
  const words = part.trim().replace(/^(?:your|the) /, "")
  const skill = /^[A-Z][a-z]+ \(([A-Za-z ]+)\) checks$/.exec(words)
  return skill ? `${toId(skill[1])}-checks` : fixedTargets[words.toLowerCase()]
}

function bonusTargets(phrase: string) {
  const targets: string[] = []
  for (const part of phrase.split(/, and |, | and /)) {
    const target = targetOf(part)
    if (!target) break
    targets.push(target)
  }
  return targets
}

type FoundBonus = { to: string; value: number; text: string; appliesWhen?: string }

// A bonus holds without a appliesWhen when nothing in its sentence limits it. It is conditional when the sentence opens
// with a situation ("While in that Bright Light, ...", "When you are hit ...") or the target phrase is followed by a
// limit ("against ranged attack rolls", "if you are wearing no armor", "made to climb or swim").
function bonusesOf(text: string) {
  const found: FoundBonus[] = []
  const re = /\+(\d+) bonus to ([^.;]+?)(?= (?:made|while|if|when|against|determined|in addition|that|on|with|but|and can)\b|[.;]|$)/g
  for (const sentence of sentences(text)) {
    if (sentence.startsWith("For example")) continue
    const lead = /^((?:While in|When|If) [^,]+),/.exec(sentence)?.[1] ?? /^(Button \d)\./.exec(sentence)?.[1]
    re.lastIndex = 0
    for (const match of sentence.matchAll(re)) {
      const tail = sentence
        .slice((match.index ?? 0) + match[0].length)
        .replace(/[.;]\s*$/, "")
        .trim()
      const limit = /^(?:against|if|when|made to|made with such)\b/.test(tail) ? (tail.startsWith("against") ? tail.split(/, | while /)[0] : tail) : undefined
      // One unbroken span of the text: the opening situation, else the limit after the target.
      const appliesWhen = lead ?? limit
      for (const to of bonusTargets(match[2])) {
        if (!found.some((bonus) => bonus.to === to && bonus.value === Number(match[1]) && bonus.appliesWhen === appliesWhen))
          found.push({ to, value: Number(match[1]), text: sentence, ...(appliesWhen ? { appliesWhen } : {}) })
      }
    }
  }
  // "Your spell save DC and spell attack bonus each increase by 2" is a bonus to each. A score that rises (Strength) is not.
  const raisable: Record<string, string> = { "spell save DC": "spell-save-dc", "spell attack bonus": "spell-attack-rolls", "Proficiency Bonus": "proficiency-bonus" }
  for (const sentence of sentences(text)) {
    const raised = /^Your (.+?) (?:each )?increases? by (\d+)\b/.exec(sentence)
    const targets = raised?.[1].split(" and ").map((name) => raisable[name])
    if (raised && targets?.every(Boolean)) for (const to of targets as string[]) found.push({ to, value: Number(raised[2]), text: sentence })
  }
  // "The bonus increases to +3 when you use the weapon to attack a Construct" is a conditional bonus on the same targets.
  for (const sentence of sentences(text)) {
    const raised = /^The bonus increases to \+(\d+) (when [^.]+)\.$/.exec(sentence)
    if (!raised) continue
    for (const plain of found.filter((bonus) => !bonus.appliesWhen)) found.push({ to: plain.to, value: Number(raised[1]), text: sentence, appliesWhen: raised[2] })
  }
  return found
}

const spellHeadings = (() => {
  const names = new Set<string>()
  const all = pages.flatMap((page) => page.split("\n"))
  for (let i = 1; i < all.length; i++) if (/^(Level \d [A-Z][a-z]+|[A-Z][a-z]+ Cantrip) \(/.test(all[i]) && /^[A-Z]/.test(all[i - 1])) names.add(all[i - 1].trim())
  return [...names].sort((a, b) => b.length - a.length)
})()

const escapeName = (name: string) => name.replace(/[/()]/g, "\\$&")

// Whole spell names in the text. The longest name wins where one holds another, so "See Invisibility" is one mention
// and never also "Invisibility".
function mentions(text: string): { name: string; index: number }[] {
  const taken: boolean[] = []
  const found: { name: string; index: number }[] = []
  for (const name of spellHeadings) {
    const re = new RegExp(`(^|[^A-Za-z’])(${escapeName(name)})(?![A-Za-z’])`, "g")
    for (let match = re.exec(text); match; match = re.exec(text)) {
      const index = match.index + match[1].length
      re.lastIndex = index + name.length
      if (taken.slice(index, index + name.length).some(Boolean)) continue
      for (let i = index; i < index + name.length; i++) taken[i] = true
      found.push({ name, index })
    }
  }
  return found.sort((a, b) => a.index - b.index)
}

type Spell = { id: string; group?: string; level?: number; charges?: number; maxCharges?: number; upcastsWithCharges?: true; chargesPerSpellLevel?: true; saveDc?: number }

// A spell is listed only when the item lets its user cast it, or gives its effect (a potion): the name follows "cast",
// follows "effect of the", or is a spell the item detonates ("as a level 3 Fireball (save DC 15)").
function spellsOf(paras: string[], tables: ItemTable[]): { spells: Spell[]; effects: { id: string; level?: number; saveDc?: number }[] } {
  const found = new Map<string, Spell>()
  const effects = new Map<string, { id: string; level?: number; saveDc?: number }>()
  // "expend 1 of the cube’s charges to cast one of the following spells" costs every spell the later paragraphs list.
  let pendingCost: string | undefined
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
  for (const unit of units) {
    const castAt = unit.search(/\bcast\b|determine the spell/)
    const cost = /\bexpend (?:no more than )?(\d+)(?: or more)?(?: of [A-Za-z’0-9 ]+?)? charges?\b[^.]*?\bcast\b/.exec(unit)
    // One DC for every spell of a list: "cast one of the following spells (save DC 18)". Otherwise a DC belongs to the spell it follows.
    const unitDc = /spells \(save DC (\d+)\)/.exec(unit)?.[1]
    const inUnit = mentions(unit)
    if (cost && /the following spells/.test(unit) && !inUnit.length) pendingCost = cost[1]
    for (const mention of inUnit) {
      const before = unit.slice(0, mention.index)
      const after = unit.slice(mention.index + mention.name.length)
      const paren = /^(?: spell)?(?: \((?:save DC (\d+)|level (\d) version|expends (\d+) charges?)\))?/.exec(after) as RegExpExecArray
      // The item applies the spell's effect without the user casting it.
      // The item casts the spell on its own user: "the orb casts Suggestion on you at will (save DC 18)".
      const onUser = /\bcasts $/.test(before) && /^ on you/.test(after)
      if ((/effect of the $/.test(before) && /^ spell/.test(after)) || /as if you had cast $/.test(before) || (/as a level \d $/.test(before) && paren[1]) || onUser) {
        const level = /as a level (\d) $/.exec(before)?.[1]
        const dc = onUser ? /\(save DC (\d+)\)/.exec(unit)?.[1] : paren[1]
        effects.set(toId(mention.name), { id: toId(mention.name), ...(level ? { level: Number(level) } : {}), ...(dc ? { saveDc: Number(dc) } : {}) })
        continue
      }
      if (castAt < 0 || mention.index < castAt) continue
      if (/\b(?:targeted by|against|from|by) (?:an? |the )?$/.test(before)) continue
      const castsIt = /\bcast (?:the )?(?:level \d version of )?(?:the )?$/.test(before)
      if (/^ spell\b/.test(after) && !castsIt) continue
      const level = /level (\d) version of (?:the )?$/.exec(before)?.[1]
      const saveDc = paren[1] ?? unitDc
      add(mention.name, {
        ...(saveDc ? { saveDc: Number(saveDc) } : {}),
        ...(paren[2] ? { level: Number(paren[2]) } : level ? { level: Number(level) } : {}),
        ...(paren[3] ? { charges: Number(paren[3]) } : cost ? { charges: Number(cost[1]) } : pendingCost ? { charges: Number(pendingCost) } : {}),
      })
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
          ...(/^\d+$/.test(cost) ? { charges: Number(cost) } : { chargesPerSpellLevel: true as const, maxCharges: Number(/maximum (\d+)/.exec(cost)?.[1]) }),
        })
      }
    }
    if (table.columns[1] === "Spells (Charges)") {
      for (const { cells } of table.rows)
        for (const match of cells[1].matchAll(/([A-Z][A-Za-z/ ]+?) \((\d+) charges?\)/g)) add(match[1], { group: cells[0], charges: Number(match[2]), ...(tableDc ? { saveDc: Number(tableDc) } : {}) })
    }
  }
  return { spells: [...found.values()], effects: [...effects.values()] }
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

// "can’t be used again until the next dawn", "ceases to function for you until you finish a Long Rest".
function reuseMoments(text: string) {
  const found = new Set<string>()
  for (const sentence of sentences(text)) {
    if (!/can’t|cannot|ceases to function/.test(sentence)) continue
    for (const match of sentence.matchAll(/until (?:the next dawn|you finish a (Short or Long|Long|Short) Rest)/g)) {
      if (!match[0].includes("Rest")) found.add("dawn")
      else found.add(`${match[1].toLowerCase().replace(" or long", "-or-long")}-rest`)
    }
  }
  return ["dawn", "short-rest", "short-or-long-rest", "long-rest"].filter((moment) => found.has(moment))
}

// Whose damage a sentence states: extra on a hit, the item's own base damage, the user's, the item's, or an effect.
function damageRole(sentence: string) {
  // Damage dealt through a save the item forces is an effect: "makes a DC 17 saving throw, taking an extra 6d10".
  if (/(?:saving throw|failed save),[^.]*\bextra\b/.test(sentence)) return "effect"
  if (/\bextra\b/.test(sentence)) return "extra"
  if (/instead of the usual/.test(sentence)) return "base"
  if (/\byou take\b|to the user\b|attempts to read it takes/.test(sentence)) return "to-user"
  if (/\bthe vehicle takes\b/.test(sentence)) return "to-item"
  return "effect"
}

// What limits a damage roll: a leading situation that names a target or a natural 20, a trailing "if ..." or "to ... it hits".
function damageCondition(sentence: string, start: number, end: number) {
  const lead = /^(?:When|If|Whenever) [^,]+|^On a successful save/.exec(sentence)?.[0]
  const while_ = /^While [^,]+/.exec(sentence)?.[0]
  // A situation that limits which hits count: a natural 20, a kind of target, a ranged attack, a form of the weapon.
  // "On a hit" and "when you hit with a melee attack" are part of what "extra" means.
  const situation = /roll a 20|hit an? [A-Z]|ranged attack|blazing weapon|^On a successful save|^If an? [a-z]+ of that type/
  // "Any Undead that starts its turn in that area takes 1d6": the subject names who it falls on.
  const subject = /^((?:Any|A|An|Glass|Nonmagical|Structures)\b[^,]*?) takes? \d/.exec(sentence)?.[1]
  const leading = lead && situation.test(lead) ? lead : (while_ ?? subject)
  const tail = /^ (?:(if [^,.;]+)|(to (?:any creature|objects) it hits(?: that [^,.;]+)?))/.exec(sentence.slice(end))
  const trailing = tail?.[1] ?? tail?.[2]
  // One unbroken span. A roll given as the alternative ("or 14 ... if it’s a Construct") carries its own clause.
  const alternative = /, or (?:an? )?(?:extra )?$/.test(sentence.slice(0, start))
  const appliesWhen = trailing && (alternative || !leading) ? trailing : leading
  return appliesWhen ? { appliesWhen } : {}
}

// Each distinct save once. Where the item forces several, each property's save carries the property's printed name as its label.
function savesOf(paras: string[]) {
  const abilities = Object.keys(abilityByName).join("|")
  const found: { ability: string; dc: number; label?: string; sentence: string }[] = []
  // A property's label holds for the paragraphs after it, until the next label.
  let label: string | undefined
  for (const para of paras) {
    label = /^([A-Z][A-Za-z’ ]{1,30})\. /.exec(para)?.[1] ?? label
    for (const sentence of sentences(para)) {
      for (const match of sentence.matchAll(new RegExp(String.raw`DC (\d+) (${abilities}) saving throw`, "g")))
        found.push({ ability: abilityByName[match[2]], dc: Number(match[1]), ...(label ? { label } : {}), sentence })
      // "make a Constitution saving throw (DC 11 for Light or DC 15 for Daylight)"
      for (const match of sentence.matchAll(new RegExp(String.raw`(${abilities}) saving throw \(DC (\d+) for ([A-Za-z ]+) or DC (\d+) for ([A-Za-z ]+)\)`, "g"))) {
        found.push({ ability: abilityByName[match[1]], dc: Number(match[2]), label: match[3], sentence }, { ability: abilityByName[match[1]], dc: Number(match[4]), label: match[5], sentence })
      }
    }
  }
  const kinds = new Set(found.map((save) => `${save.label}|${save.ability}|${save.dc}`))
  const several = kinds.size > 1
  const out: { ability: string; dc: number; label?: string }[] = []
  const seen = new Set<string>()
  for (const save of found) {
    const key = several ? `${save.label}|${save.ability}|${save.dc}|${save.sentence}` : `${save.ability}|${save.dc}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ability: save.ability, dc: save.dc, ...(several && save.label ? { label: save.label } : {}) })
  }
  return out
}

function savesChecksDamage(text: string) {
  const checks: { ability: string; skill?: string; dc: number }[] = []
  type Damage = { dice?: string; amount?: number; type: string; role: string; appliesWhen?: string; text: string }
  const damage: Damage[] = []
  const abilities = Object.keys(abilityByName).join("|")
  const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b)
  for (const match of text.matchAll(new RegExp(String.raw`DC (\d+) (${abilities})(?: \(([A-Za-z ]+)\))? check`, "g"))) {
    const check = { ability: abilityByName[match[2]], ...(match[3] ? { skill: toId(match[3]) } : {}), dc: Number(match[1]) }
    if (!checks.some((other) => same(other, check))) checks.push(check)
  }
  for (const sentence of sentences(text)) {
    for (const match of sentence.matchAll(new RegExp(String.raw`(${diceText}|\d+)\)? (${damageTypes}) damage`, "g"))) {
      const isDice = /d/.test(match[1])
      const entry: Damage = {
        ...(isDice ? { dice: asDice(match[1]) } : { amount: Number(match[1]) }),
        type: match[2].toLowerCase(),
        role: damageRole(sentence),
        ...damageCondition(sentence, match.index ?? 0, (match.index ?? 0) + match[0].length),
        text: sentence,
      }
      if (
        !damage.some(
          (other) =>
            other.dice === entry.dice &&
            other.amount === (entry as { amount?: number }).amount &&
            other.type === entry.type &&
            other.role === entry.role &&
            other.appliesWhen === (entry as { appliesWhen?: string }).appliesWhen
        )
      )
        damage.push(entry)
    }
  }
  return { checks, damage }
}

/* ---------- stat blocks ---------- */

const sizeLine = /^(?:Tiny|Small|Medium|Large|Huge|Gargantuan)(?: or Smaller)? [A-Za-z]+, [A-Z][a-z]+/

// A stat block runs from its name line to the line after its "CR" line, and on to the end of the item when it has
// Traits and Actions, which the text prints after the CR line.
function takeStatBlock(rows: string[]) {
  const at = rows.findIndex((row, i) => row.trim() !== "" && !row.startsWith("\t") && sizeLine.test(rows[i + 1]?.trim() ?? ""))
  if (at < 0) return { rows, statBlocks: [] as unknown[] }
  const cr = rows.findIndex((row, i) => i > at && row.startsWith("CR "))
  let end = cr + 1
  while (end < rows.length && !rows[end].startsWith("\t")) end++
  return {
    rows: [...rows.slice(0, at), ...rows.slice(end)],
    statBlocks: [
      statBlock(
        rows
          .slice(at, end)
          .map((row) => row.replace(/\s+/g, " ").trim())
          .filter(Boolean)
      ),
    ],
  }
}

const abilityKeys = ["str", "dex", "con", "int", "wis", "cha"] as const
const signed = (text: string) => Number(text.replace("−", "-"))

function statBlock(rows: string[]) {
  const value = (label: string) => rows.find((row) => row.startsWith(`${label} `))?.slice(label.length + 1)
  const labels = ["Resistances", "Immunities", "Senses", "Languages", "CR"]
  const field = (label: string) => {
    const at = rows.findIndex((row) => row.startsWith(`${label} `))
    if (at < 0) return undefined
    const parts = [rows[at].slice(label.length + 1)]
    for (let i = at + 1; i < rows.length && !labels.some((other) => rows[i].startsWith(`${other} `)) && !["Traits", "Actions", "Bonus Actions"].includes(rows[i]); i++) parts.push(rows[i])
    return clean(parts)
  }
  const speedAt = rows.findIndex((row) => row.startsWith("Speed "))
  const abilityEnd = rows.findIndex((row, i) => i > speedAt && labels.some((label) => row.startsWith(`${label} `)))
  const scores = rows
    .slice(speedAt + 1, abilityEnd)
    .filter((row) => row !== "MOD SAVE")
    .join(" ")
  const abilities: Record<string, { score: number; modifier: number; save: number }> = {}
  for (const key of abilityKeys) {
    const match = new RegExp(`${key[0].toUpperCase()}${key.slice(1)} (\\d+) ([+−-]\\d+) ([+−-]\\d+)`).exec(scores)
    if (!match) throw new Error(`stat block ${rows[0]}: no ${key} line in "${scores}"`)
    abilities[key] = { score: Number(match[1]), modifier: signed(match[2]), save: signed(match[3]) }
  }
  const section = (heading: string, until: string[]) => {
    const at = rows.indexOf(heading)
    if (at < 0) return undefined
    const stop = rows.findIndex((row, i) => i > at && until.includes(row))
    const entries = paragraphs(rows.slice(at + 1, stop < 0 ? rows.length : stop)).map((text) => {
      const dot = text.indexOf(". ")
      return { name: text.slice(0, dot), text: text.slice(dot + 2) }
    })
    return entries.length ? entries : undefined
  }
  const traits = section("Traits", ["Actions", "Bonus Actions"])
  const actions = section("Actions", ["Bonus Actions"])
  const bonusActions = section("Bonus Actions", [])
  const resistances = field("Resistances")
  const immunities = field("Immunities")
  return {
    name: rows[0],
    type: rows[1],
    ac: (value("AC") as string).trim(),
    hp: value("HP") as string,
    speed: value("Speed") as string,
    abilities,
    ...(resistances ? { resistances } : {}),
    ...(immunities ? { immunities } : {}),
    senses: field("Senses") as string,
    languages: field("Languages") as string,
    cr: field("CR") as string,
    ...(traits ? { traits } : {}),
    ...(actions ? { actions } : {}),
    ...(bonusActions ? { bonusActions } : {}),
  }
}

/* ---------- variants from paragraphs, tables and subtitles ---------- */

const rarityId = (word: string) => toId(word)

// Variants that are paragraphs ("Bird (Rare). ...") carry the values their own paragraphs state, up to the next variant.
// Where a variant is made of named parts (the three Ivory Goats), each part with its own rule is a variant of the same rarity.
function paragraphVariants(paras: string[]) {
  const label = new RegExp(String.raw`^([A-Z][A-Za-z ]+) \((${rarityWords})\)\. `)
  const starts = paras.flatMap((para, index) => (label.test(para) ? [index] : []))
  const make = (name: string, rarity: string, group: string[]) => {
    const text = group.join(" ")
    const found = bonusesOf(text)
    const bonuses = found.filter((bonus) => !bonus.appliesWhen).map(({ to, value }) => ({ to, value }))
    const conditionalBonuses = found.filter((bonus) => bonus.appliesWhen).map(({ to, value, appliesWhen }) => ({ to, value, appliesWhen, text: group[0] }))
    const stats = savesChecksDamage(text)
    const saves = savesOf(group)
    const attackBonus = /attack bonus of \+(\d+)/.exec(text)?.[1] ? Number(/attack bonus of \+(\d+)/.exec(text)?.[1]) : undefined
    const charges = chargesOf(text)
    const { spells, effects } = spellsOf(group, [])
    return {
      name,
      rarity,
      ...(bonuses.length ? { bonuses } : {}),
      ...(conditionalBonuses.length ? { conditionalBonuses } : {}),
      ...(effects.length ? { spellEffects: effects } : {}),
      ...(charges ? { charges } : {}),
      ...(saves.length ? { saves } : {}),
      ...(stats.checks.length ? { checks: stats.checks } : {}),
      ...(stats.damage.length ? { damage: stats.damage } : {}),
      ...(spells.length ? { spells } : {}),
      ...(attackBonus ? { attackBonus } : {}),
    }
  }
  const variants = starts.flatMap((start, k) => {
    const group = paras.slice(start, starts[k + 1] ?? paras.length)
    const match = label.exec(group[0]) as RegExpExecArray
    const parts = group.flatMap((para, index) => (index > 0 && /^Goat of [A-Z][a-z]+\. /.test(para) ? [index] : []))
    const own = parts.length ? group.slice(0, parts[0]) : group
    return [
      make(match[1], rarityId(match[2]), own),
      ...parts.map((at, i) => make(/^(Goat of [A-Z][a-z]+)\. /.exec(group[at])?.[1] as string, rarityId(match[2]), group.slice(at, parts[i + 1] ?? group.length))),
    ]
  })
  return { intro: paras.slice(0, starts[0] ?? paras.length), variants }
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
    const withoutStats = takeStatBlock(bodies[index])
    const { rows, tables: parsedTables } = takeTables(id, withoutStats.rows)
    const tables = id === "apparatus-of-the-crab" ? [levers, ...parsedTables] : parsedTables
    const paras = paragraphs(rows)
    const flat = paras.join(" ")
    const forms = paragraphVariants(paras)
    const paragraphForms = forms.variants
    // Where variants carry their own paragraphs, the item itself states only what comes before them.
    const itemParas = paragraphForms.length ? forms.intro : paras
    const itemFlat = itemParas.join(" ")

    let variants = tableVariants(id, parsedTables) as MagicItem["variants"]
    if (paragraphForms.length) variants = paragraphForms as MagicItem["variants"]
    if (sub.variants) {
      const plus = sub.variants.every((variant) => /^\+\d$/.test(variant.name))
      const targets = plus ? bonusTargets(/bonus to ([^.]+?) (?:made|while|determined)/.exec(flat)?.[1] ?? "") : []
      variants = sub.variants.map((variant) => ({ ...variant, ...(plus ? { bonuses: targets.map((to) => ({ to, value: Number(variant.name.slice(1)) })) } : {}) })) as MagicItem["variants"]
    }

    // Rows of random tables carry the spells the result has the user cast ("You cast ...") and the spells whose effect it
    // applies ("as if you had cast ..."). A spell the result has a creature cast ("can cast Wish once for you") is in neither.
    for (const table of tables) {
      if (!table.dice) continue
      for (const row of table.rows) {
        const own = row.cells.flatMap((cell) => sentences(cell)).filter((sentence) => /\byou cast\b|determine the spell|as if you had cast/i.test(sentence))
        // The beads of a Necklace of Prayer Beads are rows that each hold one spell the user casts from that bead.
        if (table.columns.join("|") === "Bead|Spell") {
          row.spells = [toId(row.cells[1].replace(/ \([^)]*\)$/, ""))]
          continue
        }
        const found = spellsOf(own, [])
        if (found.spells.length) row.spells = found.spells.map((spell) => spell.id)
        if (found.effects.length) row.spellEffects = found.effects
      }
    }
    const cells = tables.flatMap((table) => table.rows.flatMap((row) => row.cells)).join(" ")
    // An effect stated only in a row of a table belongs to that row, so the table cells are not read for the item.
    const mechanics = itemFlat
    const everything = `${flat} ${cells}`
    const activation = (
      [
        ["magic-action", /\bMagic action\b/],
        ["bonus-action", /\bBonus Action\b/],
        ["utilize-action", /\bUtilize action\b/],
        ["reaction", /\bReaction\b/],
      ] as const
    )
      // An action that only ends or dismisses an effect is not how the thing is used: the action is within a few words of "dismiss", "end the effect" or "revert".
      .filter(([, pattern]) =>
        sentences(everything).some((sentence) => {
          const at = sentence.search(pattern)
          return at >= 0 && !/dismiss|to end|end the effect|revert/.test(sentence.slice(Math.max(0, at - 60), at + 60))
        })
      )
      .map(([kind]) => kind)
    const uses = reuseMoments(everything).map((recharge) => ({ recharge }))
    const stats = savesChecksDamage(mechanics)
    const itemSaves = savesOf(itemParas)
    // A table headed "<Type> Damage" gives dice by a count, such as the lightning spheres of the Ring of Shooting Stars.
    for (const table of tables) {
      const type = /^(\w+) Damage$/.exec(table.columns[1] ?? "")?.[1]
      if (!type || table.dice) continue
      // A roll whose dice are printed only in the rows of a table belongs to the rows, not to the item.
      for (const row of table.rows) row.damage = [{ dice: row.cells[1], type: type.toLowerCase() as DamageTypeId, role: "effect" }]
    }
    const charges = chargesOf(itemFlat)
    const { spells, effects: spellEffects } = spellsOf(itemParas, tables)
    const found = paragraphForms.length || sub.variants ? [] : bonusesOf(flat)
    const bonuses = found.filter((bonus) => !bonus.appliesWhen).map(({ to, value, text }) => ({ to, value, text }))
    const conditionalBonuses = found.filter((bonus) => bonus.appliesWhen).map(({ to, value, appliesWhen, text }) => ({ to, value, appliesWhen, text }))
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
      ...(activation.length ? { activation } : {}),
      ...(uses.length ? { uses } : {}),
      ...(bonuses.length ? { bonuses } : {}),
      ...(conditionalBonuses.length ? { conditionalBonuses } : {}),
      ...(charges ? { charges } : {}),
      ...(itemSaves.length ? { saves: itemSaves } : {}),
      ...(stats.checks.length ? { checks: stats.checks } : {}),
      ...(stats.damage.length ? { damage: stats.damage } : {}),
      ...(spells.length ? { spells } : {}),
      ...(spellEffects.length ? { spellEffects } : {}),
      ...(tables.length ? { tables } : {}),
      ...(withoutStats.statBlocks.length ? { statBlocks: withoutStats.statBlocks } : {}),
      description: paras.join("\n"),
    }
    return entry as unknown as MagicItem
  })
  return items
}

/* ---------- the rules ---------- */

const rulePages = [204, 205, 206, 207, 208]
const ruleRows: Line[] = rulePages.flatMap((page) => pages[page - 1].split("\n").map((text) => ({ text, page })))

// Headings of the chapter's rules, in print order. The first four share names with cells of the category table, so
// the search starts after the last cell of that table. The sentient item tables are printed after "Special Purpose".
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
  "Sentient Magic Item Traits",
  "Abilities",
  "Alignment",
  "Communication",
  "Senses",
  "Special Purpose",
  "Conflict",
]

// Tables the rules type elsewhere (rarity rows, tool column), cut from their section so it keeps its prose and footnote.
const tableCaptions: Record<string, string> = {
  Tools: "Magic Item Tools",
  "Magic Item Values by Rarity": "Magic Item Rarities and Values",
  "Time and Cost": "Magic Item Crafting Time and Cost",
}

// Sections whose printed tables become typed tables of the rule.
const tabledSections = new Set(["Potions", "Special Purpose"])

type Section = { page: number; text: string; paragraphs: string[]; tables: ItemTable[] }

function ruleSections() {
  const marks: number[] = []
  let from = ruleRows.findIndex((row) => row.text.trim() === "Bag of Holding, Boots of Elvenkind") + 1
  for (const name of ruleHeadings) {
    const at = ruleRows.findIndex((row, i) => i >= from && (row.text.trim() === name || row.text.trim().startsWith(`${name}. `)))
    if (at < 0) throw new Error(`rules: heading ${name} not found`)
    marks.push(at)
    from = at + 1
  }
  const sections = new Map<string, Section>()
  ruleHeadings.forEach((name, i) => {
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
    let tables: ItemTable[] = []
    if (tabledSections.has(name)) {
      const taken = takeTables("rules", rows)
      rows = taken.rows
      tables = taken.tables
    }
    const paras = paragraphs(rows)
    sections.set(name, { page: ruleRows[marks[i]].page, text: paras.join("\n"), paragraphs: paras, tables })
  })
  return sections
}

// The Equipment chapter's rules for magic items, pages 102 and 103.
function equipmentSections() {
  const rows: Line[] = [102, 103].flatMap((page) => pages[page - 1].split("\n").map((text) => ({ text, page })))
  const names = [
    "Identifying a Magic Item",
    "Attunement",
    "Attune during a Short Rest",
    "No More Than Three Items",
    "Ending Attunement",
    "Wearing and Wielding Items",
    "Multiple Items of the Same Kind",
    "Paired Items",
    "Crafting Nonmagical Items",
  ]
  let from = 0
  const marks = names.map((name) => {
    const at = rows.findIndex((row, i) => i >= from && row.text.trim() === name)
    if (at < 0) throw new Error(`equipment rules: heading ${name} not found`)
    from = at + 1
    return at
  })
  const sections = new Map<string, { page: number; paragraphs: string[] }>()
  for (const [i, name] of names.slice(0, -1).entries()) sections.set(name, { page: rows[marks[i]].page, paragraphs: paragraphs(rows.slice(marks[i] + 1, marks[i + 1]).map((row) => row.text)) })
  return sections
}

function buildRules(): MagicItemRule[] {
  const rules: MagicItemRule[] = []
  const sections = ruleSections()
  const section = (name: string) => sections.get(name) as Section

  const flat = ruleRows
    .filter((row) => row.page >= 206 && row.page <= 207)
    .map((row) => row.text.trim())
    .join(" ")
  const gold = (amount: number) => ({ amount, unit: "gp" as const })
  const values = new Map<string, number | "priceless">()
  for (const match of flat.matchAll(/(Very Rare|Common|Uncommon|Rare|Legendary|Artifact) (Priceless|[\d,]+ GP)/g))
    values.set(toId(match[1]), match[2] === "Priceless" ? "priceless" : Number(match[2].replace(/[, GP]/g, "")))
  const crafting = new Map<string, { days: number; cost: number }>()
  for (const match of flat.matchAll(/(Very Rare|Common|Uncommon|Rare|Legendary) (\d+) days ([\d,]+) GP/g))
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
      ...(value === "priceless" ? { priceless: true } : { value: gold(value as number) }),
      ...(craft ? { craftingDays: craft.days, craftingCost: gold(craft.cost) } : {}),
    } as MagicItemRule)
  }

  // The footnotes of the value and crafting tables.
  const footnote = (name: string) => sentences(section(name).paragraphs.find((para) => para.startsWith("*")) as string).map((sentence) => sentence.replace(/^\*/, ""))
  const [halve, scrollValue] = footnote("Magic Item Values by Rarity")
  const [craftHalved] = footnote("Time and Cost")
  rules.push(
    {
      id: "consumable-value",
      name: "Consumable Item Value",
      page: 206,
      kind: "value-rule",
      scope: "value",
      appliesTo: "consumable",
      factor: 0.5,
      basis: "rarity-value",
      except: ["spell-scroll"],
      text: halve,
    },
    { id: "spell-scroll-value", name: "Spell Scroll Value", page: 206, kind: "value-rule", scope: "value", appliesTo: "spell-scroll", factor: 2, basis: "scribing-cost", text: scrollValue },
    {
      id: "consumable-crafting",
      name: "Consumable Item Crafting Time and Cost",
      page: 207,
      kind: "value-rule",
      scope: "crafting",
      appliesTo: "consumable",
      factor: 0.5,
      basis: "rarity-value",
      except: ["spell-scroll"],
      text: craftHalved,
    }
  )

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
  // The Magic Item Categories table and the two paragraphs before it, on page 204.
  const tableEnd = ruleRows.findIndex((row) => row.text.trim() === "Bag of Holding, Boots of Elvenkind") + 1
  const intro = takeTables(
    "rules-categories",
    ruleRows.slice(0, tableEnd).map((row) => row.text)
  )
  // Two printed headings sit in these rows: "Magic Items" and "Magic Item Categories". Each starts a rule.
  const headingAt = intro.rows.findIndex((row, i) => i > 0 && row.trim() === "Magic Item Categories")
  rules.push({ id: "magic-items", name: "Magic Items", page: 204, kind: "rule", text: paragraphs(intro.rows.slice(1, headingAt)).join("\n") } as MagicItemRule)
  rules.push({
    id: "magic-item-categories",
    name: "Magic Item Categories",
    page: 204,
    kind: "rule",
    text: paragraphs(intro.rows.slice(headingAt + 1)).join("\n"),
    tables: intro.tables,
  } as MagicItemRule)

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
    const { page, text, tables } = section(heading)
    rules.push({
      id: toId(singular),
      name: singular,
      page,
      kind: "category",
      category: toId(singular),
      tools: clean(tools.get(singular) as string[]),
      text,
      ...(tables.length ? { tables } : {}),
    } as MagicItemRule)
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
    "Sentient Magic Items",
    "Sentient Magic Item Traits",
    "Alignment",
    "Communication",
    "Senses",
    "Special Purpose",
  ]
  // The four sentient tables are printed after "Special Purpose". Each goes to the rule its caption names.
  const sentientTables = section("Special Purpose").tables
  for (const name of plain) {
    const { page, text } = section(name)
    const tables = sentientTables.filter((table) => table.caption === `Sentient Item’s ${name}`)
    rules.push({ id: sentientId(name), name, page, kind: "rule", text, ...(tables.length ? { tables } : {}) } as MagicItemRule)
  }

  const abilities = section("Abilities")
  const abilityRoll = /roll (\d+d\d+) for each one, dropping the lowest roll/.exec(abilities.text)
  rules.push({
    id: "sentient-abilities",
    name: "Abilities",
    page: abilities.page,
    kind: "sentient-abilities",
    abilityRoll: { dice: abilityRoll?.[1], dropLowest: 1 },
    text: abilities.text,
  } as MagicItemRule)

  const conflictSection = section("Conflict")
  // The PDF prints the line that leads into the refusals right after the last demand, with no indent. Split it off.
  const conflictParagraphs = conflictSection.paragraphs.flatMap((para) => {
    const at = para.indexOf(" If its bearer refuses to comply")
    return at < 0 ? [para] : [para.slice(0, at), para.slice(at + 1)]
  })
  const conflict = { ...conflictSection, paragraphs: conflictParagraphs, text: conflictParagraphs.join("\n") }
  const demandNames = ["Chase My Dreams", "Get Rid of It", "It’s Time for a Change", "Keep Me Close"]
  const demands = demandNames.map((name) => {
    const para = conflict.paragraphs.find((entry) => entry.startsWith(`${name}. `)) as string
    return { name, text: para.slice(name.length + 2) }
  })
  const save = /Charisma saving throw \(DC (\d+) plus the item’s Charisma modifier\)/.exec(conflict.text)
  rules.push({
    id: "sentient-conflict",
    name: "Conflict",
    page: conflict.page,
    kind: "sentient-conflict",
    save: { ability: "cha", dcBase: Number(save?.[1]), plusItemModifierOf: "cha" },
    demands,
    refusalLead: conflictParagraphs.find((para) => para.startsWith("If its bearer refuses to comply")),
    refusals: conflict.paragraphs.filter((para) => para.startsWith("• ")).map((para) => para.slice(2)),
    charmedHours: /Charmed condition for (\d+d\d+) hours/.exec(conflict.text)?.[1],
    text: conflict.text,
  } as MagicItemRule)

  // Equipment chapter: identifying, attunement, wearing and wielding.
  const equipment = equipmentSections()
  const equip = (name: string) => equipment.get(name) as { page: number; paragraphs: string[] }
  const attunementParts = ["Attunement", "Attune during a Short Rest", "No More Than Three Items", "Ending Attunement"]
  const attunementText = attunementParts.flatMap((name) => (name === "Attunement" ? equip(name).paragraphs : [name, ...equip(name).paragraphs])).join("\n")
  rules.push({
    id: "attunement",
    name: "Attunement",
    page: equip("Attunement").page,
    kind: "attunement",
    maxItems: 3,
    restsToAttune: "short-rest",
    endsWhenAwayFeet: Number(/more than (\d+) feet away/.exec(attunementText)?.[1]),
    endsAfterAwayHours: Number(/at least (\d+) hours/.exec(attunementText)?.[1]),
    text: attunementText,
  } as MagicItemRule)
  for (const [name, id] of [
    ["Identifying a Magic Item", "identifying-a-magic-item"],
    ["Wearing and Wielding Items", "wearing-and-wielding-items"],
    ["Multiple Items of the Same Kind", "multiple-items-of-the-same-kind"],
    ["Paired Items", "paired-items-worn"],
  ]) {
    const { page, paragraphs: paras } = equip(name)
    rules.push({ id, name, page, kind: "rule", text: paras.join("\n") } as MagicItemRule)
  }
  return rules
}

const sentientId = (name: string) =>
  ["Alignment", "Communication", "Senses", "Special Purpose"].includes(name) ? `sentient-${toId(name)}` : name === "Spells" ? "crafting-spells" : name === "Tools" ? "crafting-tools" : toId(name)

export default function buildMagicItems() {
  const items = applyOverrides("magic-items", build(), overrides)
  writeData("magic-items", magicItemSchema, items)
  writeData("magic-item-rules", magicItemRuleSchema, buildRules())
}
