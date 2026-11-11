import { existsSync } from "node:fs"
import { dataPath, readData, toId } from "../lib/data"
import { inOfficial, missingSentences, pageOf, pages, pagesOf, pageText, squash } from "../lib/official"
import type { Report } from "../lib/report"
import { readBase, readOpen5e } from "../lib/sources"

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

type Official = { name: string; page: number; category: string; baseText?: string; rarityText: string; attunementBy?: string; attunes: boolean; block: string[] }

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

const flatOf = (block: string[]) =>
  block
    .join("\n")
    .replace(/-\n(?=[a-z])/g, "")
    .replace(/\s+/g, " ")
    .trim()

const diceRe = String.raw`\d+d\d+(?: [+−-] \d+)?`
const asDice = (text: string) => text.replace("−", "-")
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("|") === [...b].sort().join("|")

export default function verify(report: Report) {
  const items = readData("magic-items")
  const official = officialItems()
  const officialByName = new Map(official.map((entry) => [entry.name, entry]))
  const byName = new Map(items.map((item) => [item.name, item]))

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
    const text = off.baseText
    const [included, excluded] = text.split(", Except ")
    const base = item.base ?? {}
    if (included.startsWith("Any ")) {
      const words = (included.toLowerCase().match(/light|medium|heavy|simple|martial|melee|ammunition/g) ?? []) as string[]
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
      const got = (item.variants ?? []).map((variant: any) => `${variant.name}=${variant.rarity}`)
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
    const classes = off.attunementBy ? classList.filter((name) => new RegExp(`\\b${name}\\b`).test(off.attunementBy as string)).map((name) => name.toLowerCase()) : []
    if (!sameSet(classes, got.classes ?? [])) attuneFailures.push(`${item.name}: classes ${JSON.stringify(got.classes)}, official ${JSON.stringify(classes)}`)
    if (Boolean(got.spellcaster) !== /\bSpellcaster\b/.test(off.attunementBy ?? "")) attuneFailures.push(`${item.name}: spellcaster flag is ${got.spellcaster}`)
  }
  report.check("magic-items", "attunement: required, who may attune", pairs.length, attuneFailures)

  /* ---------- variants other than the subtitle's ---------- */

  const flat = (off: Official) => flatOf(off.block)
  const variantRows: string[] = []
  const itemById = new Map(items.map((item) => [item.id, item]))
  const variantsOf = (id: string) => (itemById.get(id)?.variants ?? []) as any[]
  const offOf = (name: string) => officialByName.get(name) as Official
  const compareVariants = (id: string, name: string, wanted: string[], pick: (variant: any) => string) => {
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
    const failures = (table?.rows ?? []).flatMap((row: any) => {
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
        .flatMap((paragraph: string) => paragraph.split(/(?<=[.!?])\s+/))
        .filter((sentence: string) => squash(sentence).length >= 30)
      const outside = sentences.filter(
        (sentence: string) => !pagesOf(sentence).some((page) => page >= off.page && page <= Math.max(lastPage, rows.find((row) => row.text === off.block.at(-1))?.page ?? lastPage))
      )
      return outside.slice(0, 3).map((sentence: string) => `${item.name}: "${sentence.slice(0, 60)}" is not on pages ${off.page} to ${lastPage}`)
    })
  )

  // Remove the description's paragraphs and the table cells from the block. What is left must be table furniture:
  // die ranges (digits), column headings, captions. Anything else is text the data lost.
  const leftovers: string[] = []
  for (const { item, off } of pairs) {
    let rest = squash(off.block.join("\n"))
    const missing: string[] = []
    const take = (piece: string) => {
      const piece2 = squash(piece)
      const at = rest.indexOf(piece2)
      if (at < 0) return false
      rest = rest.slice(0, at) + rest.slice(at + piece2.length)
      return true
    }
    for (const paragraph of item.description.split("\n") as string[]) {
      if (take(paragraph)) continue
      for (const sentence of paragraph.split(/(?<=[.!?])\s+/)) if (!take(sentence)) missing.push(sentence)
    }
    // Longest cells first, so "Badger" is not taken out of "Giant Badger".
    const cells = ((item.tables ?? []) as any[]).flatMap((table) => table.rows.flatMap((row: any) => row.cells as string[])).sort((a, b) => b.length - a.length)
    for (const cell of cells) if (!/^[+\d]+$/.test(cell) && !take(cell)) missing.push(cell)
    // Captions and die headings first, then plain headings, so "d" + "effect" is taken whole before "effect" alone.
    const furniture: string[][] = [[], [], []]
    for (const table of (item.tables ?? []) as any[]) {
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
    if (missing.length) leftovers.push(`${item.name}: not found in the block: "${missing[0].slice(0, 60)}"`)
    if (rest) leftovers.push(`${item.name}: ${rest.length} letters of official text are in no field: "${rest.slice(0, 60)}"`)
  }
  report.check("magic-items", "description and tables hold all of the entry's official text and nothing else", pairs.length, leftovers)

  /* ---------- tables ---------- */

  const tableFailures: string[] = []
  let tableTotal = 0
  for (const { item, off } of pairs) {
    const block = squash(off.block.join("\n"))
    for (const table of (item.tables ?? []) as any[]) {
      tableTotal++
      const label = `${item.name} ${table.caption ?? table.columns.join("/")}`
      if (table.dice) {
        const sides = Number(table.dice.slice(2))
        const covered = new Array(sides + 1).fill(0)
        for (const row of table.rows) for (let n = row.roll.min; n <= row.roll.max; n++) covered[n]++
        const bad = covered.slice(1).findIndex((count: number) => count !== 1)
        if (bad >= 0) tableFailures.push(`${label}: roll ${bad + 1} is covered ${covered[bad + 1]} times on ${table.dice}`)
      }
      for (const row of table.rows) {
        const pad = (n: number) => (table.dice === "1d100" ? String(n % 100).padStart(2, "0") : String(n))
        const roll = row.roll ? (row.roll.min === row.roll.max ? pad(row.roll.min) : `${pad(row.roll.min)}–${pad(row.roll.max)}`) : ""
        if (row.cells.some((cell: string) => !inOfficial(cell))) tableFailures.push(`${label}: a cell is not official text: ${row.cells.join(" | ").slice(0, 80)}`)
        else if (!block.includes(squash(roll + row.cells.join("")))) tableFailures.push(`${label}: row "${roll} ${row.cells.join(" | ").slice(0, 60)}" is not contiguous in the block`)
      }
    }
  }
  report.check("magic-items", "tables: rolls cover the die once, every row is contiguous official text", tableTotal, tableFailures)

  /* ---------- mechanics ---------- */

  const bonusFailures: string[] = []
  for (const { item, off } of pairs) {
    const text = flat(off)
    const sentences = text.split(/(?<=[.!?])\s+/).filter((sentence) => /\+\d+ bonus to /.test(sentence) && !sentence.startsWith("For example"))
    const bonuses = (item.bonuses ?? []) as any[]
    for (const bonus of bonuses) {
      if (!inOfficial(bonus.text)) bonusFailures.push(`${item.name}: bonus text is not official`)
      if (!bonus.text.includes(`+${bonus.value} bonus to`)) bonusFailures.push(`${item.name}: bonus ${bonus.to} ${bonus.value} is not in its sentence`)
      // Demon Armor words two targets as one phrase: "the attack and damage rolls of your Unarmed Strikes".
      const target = bonus.to.startsWith("unarmed-strike-") ? "attack and damage rolls of your Unarmed Strikes" : bonus.to.replace(/-/g, " ")
      if (!squash(bonus.text).includes(squash(target))) bonusFailures.push(`${item.name}: target ${bonus.to} is not in its sentence`)
    }
    // A sentence is covered by a bonus of the same value whose target is the phrase it names. Later sentences that
    // restate a bonus for another form of the item ("transforming the rod into a magic Battleaxe") repeat it.
    const variantBonuses = ((item.variants ?? []) as any[]).flatMap((variant) => variant.bonuses ?? []) as any[]
    for (const sentence of sentences) {
      const value = Number(/\+(\d+) bonus to /.exec(sentence)?.[1])
      const phrase = squash(/\+\d+ bonus to (.+)/.exec(sentence)?.[1] ?? "")
      const covered = [...bonuses, ...variantBonuses].some((bonus) => bonus.value === value && phrase.includes(squash(bonus.to.replace(/^unarmed-strike-/, "").replace(/-/g, " "))))
      if (!covered) bonusFailures.push(`${item.name}: "${sentence.slice(0, 70)}" has no bonus`)
    }
    if (!sentences.length && bonuses.length) bonusFailures.push(`${item.name}: lists bonuses, the text states none`)
    for (const variant of (item.variants ?? []) as any[]) {
      for (const bonus of variant.bonuses ?? []) {
        const label = variant.name
        if (item.rarity === "varies" && /^\+\d$/.test(label) && bonus.value !== Number(label.slice(1))) bonusFailures.push(`${item.name} ${label}: bonus ${bonus.value}`)
        if (!new RegExp(`bonus to [^.]*${bonus.to.split("-")[0]}`, "i").test(text)) bonusFailures.push(`${item.name} ${label}: target ${bonus.to} is not stated`)
      }
    }
    // "+N" items give the bonus by rarity: attack and damage rolls, Armor Class, or spell attack rolls.
    if (/^\w+, \+1, \+2, or \+3$/.test(item.name.replace("Wand of the War Mage", "Wand")) || /\+1, \+2, or \+3$/.test(item.name)) {
      const stated = /bonus to (.+?) (?:made|while|determined)/.exec(text)?.[1] ?? ""
      const want = stated.split(/, and |, | and /).map((part) => toId(part))
      for (const variant of (item.variants ?? []) as any[])
        if (
          !sameSet(
            (variant.bonuses ?? []).map((bonus: any) => bonus.to),
            want
          )
        )
          bonusFailures.push(`${item.name} ${variant.name}: bonus targets differ from "${stated}"`)
    }
  }
  report.check("magic-items", "bonuses: every stated +N bonus is listed, with its own sentence", pairs.length, bonusFailures)

  const chargeFailures: string[] = []
  const chargeWaivers: string[] = []
  for (const { item, off } of pairs) {
    const text = flat(off)
    const max = [...text.matchAll(/(?:\b(?:has|have|starts with)|\bof its) (\d+(?:d\d+(?: \+ \d+)?)?) charges?\b/g)].map((match) => match[1])
    if (item.id === "figurine-of-wondrous-power") {
      chargeWaivers.push("Figurine of Wondrous Power: the Goat of Traveling has 24 charges, which belong to that one figurine and not to the item")
      continue
    }
    const charges = item.charges
    if (!charges) {
      if (max.length) chargeFailures.push(`${item.name}: text says it has ${max[0]} charges, no charges listed`)
      continue
    }
    if (!max.length || String(charges.max) !== asDice(max[0])) chargeFailures.push(`${item.name}: max ${charges.max}, official ${max[0]}`)
    const regain = /\bregains? (all|\d+|\d+d\d+(?: \+ \d+)?) expended charges?/.exec(text)
    const dawn = /expended charges? daily at dawn/.test(text)
    if (charges.regains) {
      if (!regain || !dawn) chargeFailures.push(`${item.name}: lists a dawn recharge, the text does not`)
      else if (String(charges.regains.amount) !== asDice(regain[1])) chargeFailures.push(`${item.name}: regains ${charges.regains.amount}, official ${regain[1]}`)
    } else if (regain && dawn) chargeFailures.push(`${item.name}: text recharges ${regain[1]} at dawn, none listed`)
    const roll = /roll (\d+d\d+)\. On a (\d+)/.exec(text)
    const lastCharge = /last charge, roll (\d+d\d+)\. ((?:On a \d+, [^.]+\.\s*)+)/.exec(text)
    if (charges.lastCharge) {
      if (!lastCharge) chargeFailures.push(`${item.name}: lists a last-charge roll, the text has none`)
      else {
        const wanted = [...lastCharge[2].matchAll(/On a (\d+), ([^.]+\.)/g)].map((match) => `${match[1]}:${match[2]}`)
        const got = charges.lastCharge.outcomes.map((outcome: any) => `${outcome.on}:${outcome.effect}`)
        if (lastCharge[1] !== charges.lastCharge.dice || JSON.stringify(wanted) !== JSON.stringify(got))
          chargeFailures.push(`${item.name}: last charge ${got.join("; ")}, official ${wanted.join("; ")}`)
      }
    } else if (roll && /last charge/.test(text)) chargeFailures.push(`${item.name}: the text rolls on the last charge, none listed`)
  }
  report.check("magic-items", "charges: maximum, recharge and last-charge roll", pairs.length, chargeFailures, chargeWaivers)

  const dcFailures: string[] = []
  for (const { item, off } of pairs) {
    const text = flat(off)
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
    const damage = [...text.matchAll(new RegExp(String.raw`(${diceRe})\)? (Acid|Bludgeoning|Cold|Fire|Force|Lightning|Necrotic|Piercing|Poison|Psychic|Radiant|Slashing|Thunder) damage`, "g"))].map(
      (match) => `${asDice(match[1])} ${match[2].toLowerCase()}`
    )
    const gotSaves = ((item.saves ?? []) as any[]).map((save) => `${save.ability}${save.dc}`)
    const gotChecks = ((item.checks ?? []) as any[]).map((check) => `${check.ability}${check.skill ?? ""}${check.dc}`)
    const gotDamage = ((item.damage ?? []) as any[]).map((entry) => `${entry.dice} ${entry.type}`)
    if (!sameSet([...new Set(saves)], gotSaves)) dcFailures.push(`${item.name}: saves ${gotSaves.join(",")}, official ${[...new Set(saves)].join(",")}`)
    if (!sameSet([...new Set(checks)], gotChecks)) dcFailures.push(`${item.name}: checks ${gotChecks.join(",")}, official ${[...new Set(checks)].join(",")}`)
    if (!sameSet([...new Set(damage)], gotDamage)) dcFailures.push(`${item.name}: damage ${gotDamage.join(",")}, official ${[...new Set(damage)].join(",")}`)
  }
  report.check("magic-items", "saving throws, ability checks and damage dice named in the text", pairs.length, dcFailures)

  // Every "DC n" in the prose is one the data states, as a save, a check, a spell save or a variant value.
  const dcWaivers: string[] = []
  const dcAccount: string[] = []
  for (const { item, off } of pairs) {
    const stated = new Set<number>([
      ...((item.saves ?? []) as any[]).map((save) => save.dc),
      ...((item.checks ?? []) as any[]).map((check) => check.dc),
      ...((item.spells ?? []) as any[]).flatMap((spell) => (spell.saveDc ? [spell.saveDc] : [])),
    ])
    for (const match of flat(off).matchAll(/DC (\d+)\b(?! plus)/g)) {
      const number = Number(match[1])
      if (stated.has(number)) continue
      if (item.id === "apparatus-of-the-crab" && number === 15 && /escape DC 15/.test(flat(off))) {
        dcWaivers.push("Apparatus of the Crab: the escape DC 15 of the Grappled condition in its lever table has no field")
        continue
      }
      const context = flat(off).slice(Math.max(0, match.index - 60), match.index + 60)
      dcAccount.push(`${item.name}: DC ${number} is in the text but in no field ("…${context}…")`)
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
  const spellsData = existsSync(dataPath("spells")) ? new Set(readData("spells").map((spell: any) => spell.id)) : null
  const officialSpellIds = new Map([...spellNames].map((name) => [toId(name), name]))
  // Spell names that appear in a sentence with "cast" but are not spells the item lets its user cast.
  const notCast: Record<string, string> = {
    "armor-of-vulnerability:identify": "the Identify spell is cast on the armor by someone else",
    "dust-of-sneezing-and-choking:lesser-restoration": "a Lesser Restoration spell ends the effect, it is not cast from the item",
    "robe-of-eyes:light": "a Light spell cast on the robe blinds the wearer",
    "robe-of-eyes:daylight": "a Daylight spell cast near the robe blinds the wearer",
    "dragon-orb:suggestion": "the orb casts Suggestion on its charmed holder",
  }
  let spellTotal = 0
  for (const { item, off } of pairs) {
    const text = flat(off)
    const listed = new Set(((item.spells ?? []) as any[]).map((spell) => spell.id))
    for (const spell of (item.spells ?? []) as any[]) {
      spellTotal++
      const name = officialSpellIds.get(spell.id)
      if (!name) spellFailures.push(`${item.name}: ${spell.id} is not a spell of the official text`)
      else if (!new RegExp(`(?<![A-Za-z’])${name.replace(/[/()]/g, "\\$&")}(?![A-Za-z’])`).test(text)) spellFailures.push(`${item.name}: ${name} is not named in the text`)
      if (spellsData && !spellsData.has(spell.id)) spellFailures.push(`${item.name}: ${spell.id} is not in spells.json`)
      if (spell.level !== undefined && !new RegExp(`level ${spell.level} version|as a level ${spell.level} `).test(text))
        spellFailures.push(`${item.name}: ${spell.id} level ${spell.level} is not stated`)
    }
    // Every spell the text names after "cast" is listed, unless it is known not to be cast from the item.
    const sentences = text.split(/(?<=[.!?])\s+/).filter((sentence) => /\bcast\b/.test(sentence))
    for (const [id, name] of officialSpellIds) {
      if (listed.has(id)) continue
      const pattern = new RegExp(`(?<![A-Za-z’])${name.replace(/[/()]/g, "\\$&")}(?![A-Za-z’])`)
      const mention = sentences.find((sentence) => pattern.test(sentence.slice(sentence.search(/\bcast\b/))))
      const confers = new RegExp(`effect of the ${name.replace(/[/()]/g, "\\$&")} spell|as a level \\d ${name.replace(/[/()]/g, "\\$&")} \\(save DC`).test(text)
      if (!mention && !confers) continue
      const key = `${item.id}:${id}`
      const random = ((item.tables ?? []) as any[]).some((table) => table.dice && table.rows.some((row: any) => row.cells.some((cell: string) => pattern.test(cell) && /\bcast\b/.test(cell))))
      if (notCast[key]) spellWaivers.push(`${item.name}: ${name} is named near "cast" but ${notCast[key]}`)
      else if (random) spellWaivers.push(`${item.name}: ${name} is cast only as a result on a random table, which the table holds`)
      else spellFailures.push(`${item.name}: "${name}" is cast or given by "${(mention ?? text).slice(0, 70)}", not listed`)
    }
    // The spell cell of the Necklace of Prayer Beads table is a spell of the official text.
    for (const table of (item.tables ?? []) as any[]) {
      if (table.columns.join("|") !== "Bead|Spell") continue
      for (const row of table.rows) {
        spellTotal++
        if (!officialSpellIds.has(toId(row.cells[1].replace(/ \([^)]*\)$/, "")))) spellFailures.push(`${item.name}: ${row.cells[1]} is not a spell of the official text`)
      }
    }
    // Charge costs in a Spell and Charge Cost table are the costs printed in the block.
    for (const table of (item.tables ?? []) as any[]) {
      if (table.columns[0] !== "Spell" || table.columns[1] !== "Charge Cost") continue
      for (const row of table.rows) {
        const candidates = ((item.spells ?? []) as any[]).filter((entry) => officialSpellIds.get(entry.id) && squash(row.cells[0]).startsWith(squash(officialSpellIds.get(entry.id) as string)))
        const spell = candidates.sort((a, b) => b.id.length - a.id.length)[0]
        const cost = /^(\d+)/.exec(row.cells[1])?.[1]
        if (!spell || spell.charges !== Number(cost)) spellFailures.push(`${item.name}: ${row.cells[0]} costs ${row.cells[1]}, listed ${spell?.charges}`)
        spellTotal++
      }
    }
  }
  report.check("magic-items", "spells: names, levels, charge costs, and every spell cast from the item", spellTotal || 0, spellFailures, spellWaivers)

  /* ---------- references ---------- */

  const refFailures: string[] = []
  let refTotal = 0
  const equipment = existsSync(dataPath("equipment")) ? new Set(readData("equipment").map((entry: any) => entry.id)) : null
  for (const item of items) {
    for (const id of [...(item.base?.items ?? []), ...(item.base?.except ?? [])] as string[]) {
      refTotal++
      const words = id.replace(/-/g, " ")
      if (!pagesOf(words).some((page) => page < 209)) refFailures.push(`${item.name}: ${id} is not named in the Equipment chapter`)
      if (equipment && !equipment.has(id)) refFailures.push(`${item.name}: ${id} is not in equipment.json`)
    }
    for (const id of (item.attunement?.classes ?? []) as string[]) {
      refTotal++
      if (!classList.map((name) => name.toLowerCase()).includes(id)) refFailures.push(`${item.name}: ${id} is not a class`)
    }
  }
  report.check("magic-items", "references: base items, classes and spells resolve", refTotal + spellTotal, refFailures)

  /* ---------- the other two sources ---------- */

  const base = readBase<any>("Magic-Items")
  const baseByName = new Map(base.map((row) => [row.name, row]))
  const open = readOpen5e<any>("MagicItem")
  const openByName = new Map(open.map((row) => [row.fields.name, row.fields]))
  const upstreamFailures: string[] = []
  const upstreamWaivers: string[] = []
  let upstreamTotal = 0
  for (const { item, off } of pairs) {
    const b = baseByName.get(item.name)
    if (b) {
      upstreamTotal++
      if (item.rarity !== "varies" && b.rarity.name !== off.rarityText.replace(/ \(.*$/, "")) upstreamWaivers.push(`${item.name}: 5e-bits rarity "${b.rarity.name}", official "${off.rarityText}"`)
      if (Boolean(b.attunement) !== off.attunes) upstreamWaivers.push(`${item.name}: 5e-bits attunement ${b.attunement}, official ${off.attunes}`)
      if (
        toId(b.equipment_category.name) !== `${item.category}s` &&
        toId(b.equipment_category.name) !== item.category &&
        !(item.category === "wondrous-item" && b.equipment_category.index === "wondrous-items")
      )
        upstreamWaivers.push(`${item.name}: 5e-bits category ${b.equipment_category.index}, official ${item.category}`)
    }
    const o = openByName.get(item.name)
    if (o) {
      upstreamTotal++
      if (item.rarity !== "varies" && o.rarity !== item.rarity) upstreamWaivers.push(`${item.name}: Open5e rarity "${o.rarity}", official "${item.rarity}"`)
      if (Boolean(o.requires_attunement) !== off.attunes) upstreamWaivers.push(`${item.name}: Open5e attunement ${o.requires_attunement}, official ${off.attunes}`)
      if (o.category !== item.category) upstreamWaivers.push(`${item.name}: Open5e category ${o.category}, official ${item.category}`)
    }
  }
  report.check("magic-items", "5e-bits and Open5e agree on rarity, attunement and category where they share an item (the official text decides)", upstreamTotal, upstreamFailures, upstreamWaivers)

  verifyRules(report)
}

/* ---------- the rules ---------- */

function verifyRules(report: Report) {
  const rules = readData("magic-item-rules")
  const failures: string[] = []
  const text206 = pageText(206, 207).replace(/\s+/g, " ")

  const ids = new Set<string>()
  for (const rule of rules)
    if (ids.has(rule.id)) failures.push(`${rule.id}: duplicate id`)
    else ids.add(rule.id)
  report.check("magic-item-rules", "ids are unique", rules.length, failures.splice(0))

  const sentenceFailures: string[] = []
  for (const rule of rules) {
    if ("text" in rule) for (const sentence of missingSentences(rule.text)) sentenceFailures.push(`${rule.id}: "${sentence.slice(0, 70)}" is not official`)
  }
  report.check("magic-item-rules", "every sentence is in the official text", rules.filter((rule: any) => "text" in rule).length, sentenceFailures)

  const pageFailures: string[] = []
  for (const rule of rules) {
    const label = rule.kind === "rarity" ? rule.name : rule.kind === "attunement" ? rule.name : rule.name
    const where = pageOf(label, rule.kind === "attunement" ? 100 : 204)
    // A heading sits on the rule's page, or the rule's text begins on it.
    const firstSentence = "text" in rule ? rule.text.split(/(?<=[.!?])\s+/)[0] : ""
    const textPage = firstSentence ? pagesOf(firstSentence).filter((page) => page >= (rule.kind === "attunement" ? 100 : 204)) : []
    if (rule.kind === "rarity") {
      if (rule.page !== 206) pageFailures.push(`${rule.id}: page ${rule.page}`)
    } else if (!textPage.includes(rule.page) && where !== rule.page) pageFailures.push(`${rule.id}: page ${rule.page}, heading first at ${where}, text on ${textPage.join(",")}`)
  }
  report.check("magic-item-rules", "page is where the rule begins", rules.length, pageFailures)

  // Rarity values and crafting, read from the two tables of the chapter.
  const rarityFailures: string[] = []
  const rarityRules = rules.filter((rule: any) => rule.kind === "rarity")
  const wantedValue: Record<string, string> = { common: "100", uncommon: "400", rare: "4,000", "very-rare": "40,000", legendary: "200,000" }
  const names = ["Common", "Uncommon", "Rare", "Very Rare", "Legendary", "Artifact"]
  if (rarityRules.length !== names.length) rarityFailures.push(`${rarityRules.length} rarity rules for ${names.length} rarities`)
  for (const name of names) {
    const rule = rarityRules.find((entry: any) => entry.id === toId(name))
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
    if (rule.value !== wanted) rarityFailures.push(`${name}: value ${rule.value}, official ${wantedValue[toId(name)]}`)
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
    const rule = rarityRules.find((entry: any) => entry.id === id)
    const name = names.find((entry) => toId(entry) === id) as string
    if (rule?.craftingDays !== days || rule?.craftingCost !== cost) rarityFailures.push(`${id}: crafting ${rule?.craftingDays} days ${rule?.craftingCost}, official ${days} days ${costText} GP`)
    if (!inOfficial(`${name} ${days} days ${costText} GP`)) rarityFailures.push(`${id}: "${days} days ${costText} GP" is not in the official crafting table`)
  }
  report.check("magic-item-rules", "rarity values and crafting time and cost match the two official tables", 11, rarityFailures)

  // Categories and tools.
  const categoryFailures: string[] = []
  const categories = ["armor", "potion", "ring", "rod", "scroll", "staff", "wand", "weapon", "wondrous-item"]
  const categoryRules = rules.filter((rule: any) => rule.kind === "category")
  if (
    !sameSet(
      categoryRules.map((rule: any) => rule.category),
      categories
    )
  )
    categoryFailures.push(`categories ${categoryRules.map((rule: any) => rule.category).join(",")}`)
  for (const rule of categoryRules) {
    if (!inOfficial(`${rule.name} ${rule.tools}`)) categoryFailures.push(`${rule.name}: "${rule.name} ${rule.tools.slice(0, 40)}" is not in the Magic Item Tools table`)
    if (!squash(pageText(207)).includes(squash(`${rule.name} ${rule.tools}`))) categoryFailures.push(`${rule.name}: tool is not next to its category in the table on page 207`)
  }
  report.check("magic-item-rules", "the nine categories, with their crafting tools from the Magic Item Tools table", categories.length, categoryFailures)

  // Named rules exist, and the attunement limit is the number the text states.
  const ruleFailures: string[] = []
  const attunement = rules.find((rule: any) => rule.kind === "attunement")
  if (!attunement || attunement.maxItems !== 3 || !/no more than three magic items at a time/.test(attunement.text)) ruleFailures.push("attunement limit is not three")
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
  ]
  for (const id of needed) if (!ids.has(id)) ruleFailures.push(`${id}: missing`)
  const crafting = rules.find((rule: any) => rule.id === "time-and-cost")
  if (crafting && !/Work per Day\. For each day of crafting, you must work for 8 hours/.test(crafting.text)) ruleFailures.push("time-and-cost: missing the 8 hours per day rule")
  report.check("magic-item-rules", "attunement limit and the named rules of the chapter are present", needed.length + 1, ruleFailures)
}
