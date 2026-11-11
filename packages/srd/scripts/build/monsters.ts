import { abilityIds, conditionIds, damageTypeIds, sizes } from "../../src/schema/common"
import type { Area, Attack, DamagePart, Monster, MonsterFeature, Save, Spellcasting } from "../../src/schema/monsters"
import { creatureTypes, monsterSchema } from "../../src/schema/monsters"
import { applyOverrides, toId, writeData } from "../lib/data"
import { pages } from "../lib/official"
import { readBase } from "../lib/sources"
import { additions, featureFixes, overrides } from "../overrides/monsters"

// The Monsters chapter: "Monsters A–Z" opens on page 258 and "Animals" runs to the last page.
const firstPage = 258
const lastPage = 364

type Line = { text: string; page: number }
type Base = Record<string, any>

const abilityNames = ["Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma"]
const abilityOf = (name: string) => abilityIds[abilityNames.indexOf(name)]
const capital = (word: string) => word[0].toUpperCase() + word.slice(1)
const damageTypeNames = damageTypeIds.map(capital).join("|")
const conditionNames = conditionIds.map(capital).join("|")
const sizeNames = sizes.join("|")
/** The SRD prints a true minus sign, and once an en dash, in dice and bonuses. Data uses ASCII. */
const ascii = (text: string) => text.replace(/[−–]/g, "-")
const signed = (text: string) => Number(ascii(text))
const feet = (text: string) => {
  const match = /^(\d+) ft\.$/.exec(text.trim())
  if (!match) throw new Error(`not a distance in feet: ${text}`)
  return Number(match[1])
}

/** The chapter's lines with the running header and page numbers removed. Non-breaking spaces become spaces. */
function chapterLines(): Line[] {
  const result: Line[] = []
  for (let page = firstPage; page <= lastPage; page++) {
    for (const raw of pages[page - 1].split("\n")) {
      const text = raw.replace(/ /g, " ").replace(/\s+$/, "")
      if (text === "System Reference Document 5.2.1" || text === String(page)) continue
      result.push({ text, page })
    }
  }
  const start = result.findIndex((line) => line.text === "Monsters A–Z")
  if (start < 0) throw new Error("no Monsters A–Z heading")
  return result.slice(start)
}

/**
 * Pairs of words the official text or the base source hyphenates within a line, lowercase: "foot-wide",
 * "shape-shift". A word broken at a line end keeps its hyphen only when the pair is one of these.
 */
function hyphenPairs(base: Base[]): Set<string> {
  const pairs = new Set<string>()
  const add = (text: string) => {
    for (const word of text.match(/[\p{L}\d’]+(?:-[\p{L}\d’]+)+/gu) ?? []) {
      const parts = word.toLowerCase().split("-")
      for (let i = 1; i < parts.length; i++) pairs.add(`${parts[i - 1]}-${parts[i]}`)
    }
  }
  for (const page of pages) for (const line of page.split("\n")) add(line)
  for (const monster of base) {
    for (const key of ["special_abilities", "actions", "bonus_actions", "reactions", "legendary_actions"]) {
      for (const feature of monster[key] ?? []) add(feature.desc ?? "")
    }
  }
  return pairs
}

/** A line that starts an item of a list introduced by a colon: "Forbiddance. The…", "1–4. The…", "At Will: …". */
const listItem = /^(?:At Will:|\d+\/Day(?: Each)?:|\d+–\d+\. |[A-Z][\p{L}’-]*(?: [\p{L}’-]+){0,3}\. [A-Z])/u

/** Join wrapped lines into prose: one newline between paragraphs, a soft hyphen at a line end removed. */
function prose(lines: string[], pairs: Set<string>): string {
  let text = ""
  let list = false
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim().replace(/\s+/g, " ")
    if (!line) continue
    if (index === 0) text = line
    else if (/^\t/.test(raw) || (list && listItem.test(line))) text += `\n${line}`
    else if (text.endsWith("—") || /\d-$/.test(text)) text += line
    else if (/\p{L}-$/u.test(text) && /^\p{L}/u.test(line)) {
      const before = (/([\p{L}\d’]+)-$/u.exec(text) as RegExpExecArray)[1].toLowerCase()
      const after = (/^[\p{L}\d’]+/u.exec(line) as RegExpExecArray)[0].toLowerCase()
      text = pairs.has(`${before}-${after}`) ? text + line : text.slice(0, -1) + line
    } else text += ` ${line}`
    // A colon opens a list, except a label such as "Success:" or "Saving Throw:" whose text wraps to the next line.
    if (line.endsWith(":") && !/(?:Hit|Miss|Failure|Success|Trigger|Response|Throw|Roll):$/.test(line)) list = true
  }
  return text.replace(/'/g, "’")
}

/** The base source splits shape-shifters into one entry per form. The official text prints one stat block. */
function mergedBase(): Map<string, Base[]> {
  const merged = new Map<string, Base[]>()
  for (const entry of [...readBase("Monsters"), ...additions.map((addition) => addition.entry)]) {
    const name = (/^(.*), .* Form$/.exec(entry.name) ?? [])[1] ?? entry.name
    merged.set(name, [...(merged.get(name) ?? []), entry])
  }
  // The block's header is the form the official text prints first: the vampire, or the lycanthrope's human form.
  for (const [name, forms] of merged) {
    if (forms.length === 1) continue
    const primary = forms.find((form) => /, (Vampire|Human) Form$/.test(form.name))
    if (!primary) throw new Error(`${name}: no primary form`)
    merged.set(name, [primary, ...forms.filter((form) => form !== primary)])
  }
  return merged
}

const heading = /^[A-Z][\p{L}’-]*(?: (?:[A-Z][\p{L}’–-]*|of))*$/u
const sizeLine = new RegExp(`^(?:${sizeNames})(?: or (?:${sizeNames}))* `)
const sections = { Traits: "traits", Actions: "actions", "Bonus Actions": "bonusActions", Reactions: "reactions", "Legendary Actions": "legendaryActions" } as const

function parseUses(note: string | undefined, feature: Partial<MonsterFeature>) {
  if (!note) return
  const rest: string[] = []
  for (const part of note.split("; ")) {
    const perDay = /^(\d+)\/Day(?:, or (\d+)\/Day in Lair)?$/.exec(part)
    const recharge = /^Recharge (\d)(?:–(\d))?$/.exec(part)
    if (perDay) {
      feature.perDay = Number(perDay[1])
      if (perDay[2]) feature.perDayInLair = Number(perDay[2])
    } else if (recharge) feature.recharge = { min: Number(recharge[1]), max: Number(recharge[2] ?? recharge[1]) }
    else if (part === "Recharge after a Short or Long Rest") feature.rechargeAfterRest = true
    else rest.push(part)
  }
  if (rest.length) feature.note = rest.join("; ")
}

function parseAttack(text: string): Attack | undefined {
  const match = /(Melee or Ranged|Melee|Ranged) Attack Roll: ([+−]\d+)(?: to hit)?(?: \(([^)]*)\))?, (.*?)\.? (?:Hit|Miss|Hit or Miss):/.exec(text)
  if (!match) {
    if (/Attack Roll:/.test(text)) throw new Error(`unparsed attack: ${text}`)
    return undefined
  }
  const reach = /reach (\d+) (?:ft|feet)/.exec(match[4])
  const range = /range (\d+)(?:\/(\d+))? (?:ft|feet)/.exec(match[4])
  if (!reach && !range) throw new Error(`attack with no reach or range: ${text}`)
  return {
    kind: match[1] === "Melee" ? "melee" : match[1] === "Ranged" ? "ranged" : "melee-or-ranged",
    bonus: signed(match[2]),
    ...(reach ? { reach: Number(reach[1]) } : {}),
    ...(range ? { range: { normal: Number(range[1]), ...(range[2] ? { long: Number(range[2]) } : {}) } } : {}),
    ...(match[3] ? { bonusNote: match[3] } : {}),
  }
}

const outcomes: Record<string, DamagePart["on"]> = {
  Hit: "hit",
  Miss: "miss",
  "Hit or Miss": "hit-or-miss",
  Failure: "failure",
  Success: "success",
  "Failure or Success": "failure-or-success",
}

/** The outcome whose first sentence holds this position, if any. */
function outcomeAt(text: string, index: number): DamagePart["on"] {
  let found: RegExpExecArray | undefined
  for (const match of text.slice(0, index).matchAll(/(Hit or Miss|Failure or Success|Hit|Miss|Failure|Success): /g)) found = match
  if (!found) return undefined
  const between = text.slice((found.index as number) + found[0].length, index)
  return /\.\s|\n/.test(between) ? undefined : outcomes[found[1]]
}

function parseDamage(text: string): DamagePart[] {
  const parts: DamagePart[] = []
  const pattern = new RegExp(`(\\d+)(?: \\((\\d+d\\d+(?: [+−–] \\d+)?)\\))? (?:(${damageTypeNames}) )?damage`, "g")
  for (const match of text.matchAll(pattern)) {
    // A bare number with neither dice nor type is a threshold ("takes 30 damage or more"), not damage dealt.
    if (!match[2] && !match[3]) continue
    const on = outcomeAt(text, match.index as number)
    parts.push({
      average: Number(match[1]),
      ...(match[2] ? { dice: ascii(match[2]) } : {}),
      ...(match[3] ? { type: match[3].toLowerCase() as DamagePart["type"] } : {}),
      ...(on ? { on } : {}),
    })
  }
  return parts
}

function parseSaves(text: string): Save[] {
  const pattern = new RegExp(`(${abilityNames.join("|")}) Saving Throw: DC (\\d+)`, "g")
  const starts = [...text.matchAll(pattern)]
  return starts.map((match, index) => {
    const begin = match.index as number
    let end = text.length
    const next = starts[index + 1]
    if (next) {
      // A later save in its own paragraph ends this one at that paragraph.
      const paragraph = text.lastIndexOf("\n", next.index)
      end = paragraph > begin ? paragraph : (next.index as number)
    }
    const body = text.slice(begin + match[0].length, end).trim()
    const save: Save = { ability: abilityOf(match[1]), dc: Number(match[2]) }
    const targets = /^(?:\([^)]*\))?,? ?(.*?)\.(?: |$)/s.exec(body)
    if (targets?.[1] && !/^(?:Failure|Success)/.test(targets[1])) save.targets = targets[1]
    const markers = [...body.matchAll(/(Failure or Success|Failure|Success): /g)]
    for (const [i, marker] of markers.entries()) {
      const from = (marker.index as number) + marker[0].length
      const clause = body.slice(from, markers[i + 1]?.index ?? body.length).trim()
      if (marker[1] === "Failure") save.failure = clause
      else if (marker[1] === "Success") save.success = clause
      else save.failureOrSuccess = clause
    }
    if (save.success && /^Half damage/.test(save.success)) save.halfOnSuccess = true
    return save
  })
}

function parseArea(text: string): Area | undefined {
  const found: { index: number; area: Area }[] = []
  for (const m of text.matchAll(/(\d+)-foot-long, (\d+)-foot-wide Line/g)) found.push({ index: m.index as number, area: { shape: "line", size: Number(m[1]), width: Number(m[2]) } })
  for (const m of text.matchAll(/(\d+)-foot-radius, (\d+)-foot-high Cylinder/g)) found.push({ index: m.index as number, area: { shape: "cylinder", size: Number(m[1]), height: Number(m[2]) } })
  for (const m of text.matchAll(/(\d+)-foot(?:-radius)? (Cone|Cube|Emanation|Sphere)/g)) found.push({ index: m.index as number, area: { shape: m[2].toLowerCase() as Area["shape"], size: Number(m[1]) } })
  return found.sort((a, b) => a.index - b.index)[0]?.area
}

/** Conditions the text gives: "has the Prone condition", "gives it the Grappled condition", not "doesn’t have the …" or "while the vampire has the …". */
function parseConditions(text: string): MonsterFeature["conditions"] {
  const found = new Set<string>()
  const pattern = new RegExp(`\\b(?:has|have|gains|gain|gives? (?:it|the target)|with) the ((?:${conditionNames})(?:(?:,? and |,? or |, )(?:${conditionNames}))*) conditions?`, "g")
  for (const match of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, (match.index as number) - 40), match.index)
    // A precondition or a negation names a condition without giving it.
    if (/(?:n’t|\bnot|\b(?:if|while|whenever|unless|until|that|who)(?: \S+){0,3}) $/.test(before)) continue
    for (const name of match[1].split(/,? and |,? or |, /)) found.add(name.toLowerCase())
  }
  return found.size ? (conditionIds.filter((id) => found.has(id)) as MonsterFeature["conditions"]) : undefined
}

function parseSpellcasting(text: string): Spellcasting | undefined {
  const lists = text
    .split("\n")
    .map((line) => /^(At Will|(\d+)\/Day( Each)?): (.*)$/.exec(line))
    .filter((match): match is RegExpExecArray => !!match)
  if (!lists.length) return undefined
  const ability = new RegExp(`using (${abilityNames.join("|")}) as (?:the )?spellcasting ability`).exec(text)
  if (!ability) throw new Error(`spellcasting with no ability: ${text}`)
  const dc = /spell save DC (\d+)/.exec(text)
  const attack = /([+−]\d+) to hit with spell attacks/.exec(text)
  return {
    ability: abilityOf(ability[1]),
    ...(dc ? { saveDc: Number(dc[1]) } : {}),
    ...(attack ? { attackBonus: signed(attack[1]) } : {}),
    lists: lists.map((match) => ({
      frequency: match[2] ? Number(match[2]) : ("at-will" as const),
      ...(match[3] ? { each: true as const } : {}),
      spells: splitTop(match[4]).map((spell) => {
        const parts = /^(.*?)(?: \((.*)\))?$/.exec(spell) as RegExpExecArray
        return { id: toId(parts[1]), ...(parts[2] ? { note: parts[2] } : {}) }
      }),
    })),
  }
}

/** Split on commas outside parentheses. */
function splitTop(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of text) {
    if (char === "(") depth++
    if (char === ")") depth--
    if (char === "," && depth === 0) {
      parts.push(current.trim())
      current = ""
    } else current += char
  }
  parts.push(current.trim())
  return parts.filter(Boolean)
}

function feature(name: string, text: string): MonsterFeature {
  let rest = text.slice(name.length)
  let note: string | undefined
  if (rest.startsWith(" (")) {
    const close = rest.indexOf(").")
    note = rest.slice(2, close).replace(/\s+/g, " ")
    rest = rest.slice(close + 1)
  }
  if (!rest.startsWith(". ")) throw new Error(`${name}: no ". " after the name: ${text.slice(0, 80)}`)
  const body = rest.slice(2)
  const result: Partial<MonsterFeature> = { name, text: body }
  parseUses(note, result)
  const attack = parseAttack(body)
  if (attack) result.attack = attack
  const saves = parseSaves(body)
  if (saves.length) result.saves = saves
  const damage = parseDamage(body)
  if (damage.length) result.damage = damage
  const conditions = parseConditions(body)
  if (conditions) result.conditions = conditions
  const escape = /escape DC (\d+)/.exec(body)
  if (escape) result.escapeDc = Number(escape[1])
  const area = parseArea(body)
  if (area) result.area = area
  const spellcasting = parseSpellcasting(body)
  if (spellcasting) result.spellcasting = spellcasting
  return result as MonsterFeature
}

/** Header fields the base source carries, mapped to our shape. */
function fromBase(base: Base): Record<string, unknown> {
  const proficiencies = new Map<string, number>((base.proficiencies ?? []).map((p: Base) => [p.proficiency.index, p.value]))
  const scores = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((key) => base[key] as number)
  const abilities = Object.fromEntries(
    abilityIds.map((id, i) => {
      const mod = Math.floor((scores[i] - 10) / 2)
      return [id, { score: scores[i], mod, save: proficiencies.get(`saving-throw-${id}`) ?? mod }]
    }),
  ) as Monster["abilities"]
  const skills = Object.fromEntries([...proficiencies].filter(([key]) => key.startsWith("skill-")).map(([key, value]) => [key.slice(6), value]))
  const speed: Record<string, number | true> = {}
  for (const [mode, value] of Object.entries(base.speed as Record<string, string | boolean>)) speed[mode] = value === true ? true : feet(value as string)
  const senses: Record<string, number | string> = {}
  for (const [sense, value] of Object.entries(base.senses as Record<string, string | number>)) {
    if (sense === "passive_perception") senses.passivePerception = value as number
    else {
      const match = /^(\d+) ft\.(?: \((.*)\))?$/.exec(value as string) as RegExpExecArray
      senses[sense] = Number(match[1])
      if (match[2]) senses[`${sense}Note`] = match[2]
    }
  }
  const notes: Record<string, string> = {}
  const damageList = (key: string, note: string) => {
    const ids = (base[key] as string[]).filter((value) => (damageTypeIds as readonly string[]).includes(value))
    const other = (base[key] as string[]).filter((value) => !ids.includes(value))
    if (other.length) notes[note] = other.join(", ")
    return ids.length ? ids : undefined
  }
  const vulnerabilities = damageList("damage_vulnerabilities", "vulnerabilities")
  const resistances = damageList("damage_resistances", "resistances")
  const immunities = damageList("damage_immunities", "immunities")
  const conditionImmunities = (base.condition_immunities as Base[]).map((condition) => condition.index)
  const [languages, telepathy] = (base.languages as string).split("; telepathy ")
  const telepathyMatch = telepathy ? (/^(\d+) ft\.(?: \((.*)\))?$/.exec(telepathy) as RegExpExecArray) : undefined
  const gear = base.gear
    ? splitTop(base.gear).map((item) => {
        const match = /^(.*?)(?: \((\d+)\))?$/.exec(item) as RegExpExecArray
        // A counted item prints its plural: "Javelins (6)" is the Javelin.
        return match[2] ? { id: toId(match[1].replace(/s$/, "")), quantity: Number(match[2]) } : { id: toId(match[1]) }
      })
    : undefined
  return {
    ac: base.armor_class[0].value,
    hp: { average: base.hit_points, formula: ascii(base.hit_points_roll) },
    speed: speed as Monster["speed"],
    abilities,
    ...(Object.keys(skills).length ? { skills } : {}),
    ...(vulnerabilities ? { vulnerabilities } : {}),
    ...(resistances ? { resistances } : {}),
    ...(immunities ? { immunities } : {}),
    ...(conditionImmunities.length ? { conditionImmunities: conditionImmunities as Monster["conditionImmunities"] } : {}),
    ...(Object.keys(notes).length ? { defenseNotes: notes } : {}),
    ...(gear ? { gear } : {}),
    senses: senses as Monster["senses"],
    languages: languages.replace(/'/g, "’"),
    ...(telepathyMatch ? { telepathy: Number(telepathyMatch[1]), ...(telepathyMatch[2] ? { telepathyNote: telepathyMatch[2] } : {}) } : {}),
    cr: base.challenge_rating,
    xp: base.xp,
    ...(base.xp_in_lair ? { xpInLair: base.xp_in_lair } : {}),
    pb: base.proficiency_bonus,
  }
}

export default function build() {
  const merged = mergedBase()
  const lines = chapterLines()
  const pairs = hyphenPairs([...merged.values()].flat())

  // Locate each stat block: its name line, then the size line.
  const starts = [...merged.keys()]
    .map((name) => {
      const found = lines.flatMap((line, index) => (line.text === name && sizeLine.test(lines[index + 1]?.text ?? "") ? [index] : []))
      if (found.length !== 1) throw new Error(`${name}: ${found.length} stat blocks in the official text`)
      return { name, index: found[0] }
    })
    .sort((a, b) => a.index - b.index)

  let section: Monster["section"] = "Monsters A–Z"
  let group: string | undefined
  const entries = starts.map(({ name, index }, order) => {
    // Headings sit between the previous block's last sentence and this name line.
    const own: string[] = []
    for (let i = index - 1; i >= 0 && heading.test(lines[i].text) && !/[.:,)]$/.test(lines[i].text); i--) own.unshift(lines[i].text)
    for (const title of own) {
      if (title === "Monsters A–Z") section = "Monsters A–Z"
      else if (title === "Animals") {
        section = "Animals"
        group = undefined
      } else group = title
    }
    let end = starts[order + 1]?.index ?? lines.length
    while (end > index && heading.test(lines[end - 1].text) && !/[.:,)]$/.test(lines[end - 1].text)) end--
    const block = lines.slice(index, end)
    const forms = merged.get(name) as Base[]
    const entry: Record<string, unknown> = { ...fromBase(forms[0]), ...official(name, block, forms, pairs), section, ...(group && group !== name ? { group } : {}) }
    // Keys in the order the schema names them, so the data reads like a stat block.
    return Object.fromEntries(Object.keys(monsterSchema.shape).flatMap((key) => (key in entry ? [[key, entry[key]]] : [])))
  })
  writeData("monsters", monsterSchema, applyOverrides("monsters", entries as Monster[], overrides))
}

/** What the official block gives that the base source lacks: the header line, initiative, and every feature's text. */
function official(name: string, block: Line[], forms: Base[], pairs: Set<string>): Partial<Monster> {
  const header = new RegExp(`^((?:${sizeNames})(?: or (?:${sizeNames}))*) (?:Swarm of (${sizeNames}) )?(\\w+)(?: \\(([^)]*)\\))?, (.+)$`).exec(block[1].text)
  if (!header) throw new Error(`${name}: unparsed header ${block[1].text}`)
  const type = header[3].toLowerCase().replace(/s$/, "")
  if (!(creatureTypes as readonly string[]).includes(type)) throw new Error(`${name}: unknown type ${header[3]}`)
  const initiative = block.map((line) => /^Initiative ([+−]\d+) \((\d+)\)$/.exec(line.text.trim())).find(Boolean)
  if (!initiative) throw new Error(`${name}: no initiative`)
  const cr = block.findIndex((line) => /^CR /.test(line.text))

  // Every feature name the base source has for this monster, in any form. Each starts a line after a sentence end.
  // The base source sometimes keeps the parenthetical in the name: "Nightmare Haunting (Requires Soul Bag)".
  const names = new Set(
    forms.flatMap((form) => ["special_abilities", "actions", "bonus_actions", "reactions", "legendary_actions"].flatMap((key) => (form[key] ?? []).map((f: Base) => (f.name as string).replace(/ \(.*\)$/, "").replace(/'/g, "’")))),
  )
  for (const fix of featureFixes.filter((fix) => fix.id === toId(name))) {
    for (const add of fix.add ?? []) {
      if (names.has(add)) throw new Error(`${name}: feature fix adds ${add}, which the base source has. Remove it.`)
      names.add(add)
    }
    for (const remove of fix.remove ?? []) if (!names.delete(remove)) throw new Error(`${name}: feature fix removes ${remove}, which the base source lacks. Remove it.`)
  }
  const result: Record<string, any> = {}
  let kind: (typeof sections)[keyof typeof sections] | undefined
  let current: { name: string; lines: string[] } | undefined
  const intro: string[] = []
  const found = new Set<string>()
  const close = () => {
    if (!current || !kind) return
    const item = feature(current.name, prose(current.lines, pairs))
    if (kind === "legendaryActions") {
      result.legendaryActions ??= { actions: [] }
      result.legendaryActions.actions.push(item)
    } else (result[kind] ??= []).push(item)
    current = undefined
  }
  let previous = ""
  for (const line of block.slice(cr + 1)) {
    const text = line.text.trim()
    if (!text) continue
    const after = previous
    previous = text
    if (text in sections) {
      close()
      kind = sections[text as keyof typeof sections]
      continue
    }
    const starter = [...names].find((n) => text.startsWith(`${n}.`) || text.startsWith(`${n} (`))
    // A spell list line ends without a period, so the feature after it starts on the next line.
    const afterList = current?.lines.some((l) => /^(?:At Will|\d+\/Day(?: Each)?):/.test(l.trim()))
    if (starter && kind && (/[.:)]$/.test(after) || after in sections || afterList)) {
      close()
      found.add(starter)
      current = { name: starter, lines: [line.text] }
    } else if (current) current.lines.push(line.text)
    else if (kind === "legendaryActions") intro.push(line.text)
    else if (text) throw new Error(`${name}: text outside a feature: ${text}`)
  }
  close()
  const missing = [...names].filter((n) => !found.has(n))
  if (missing.length) throw new Error(`${name}: base features not found in the official block: ${missing.join(", ")}`)
  if (result.legendaryActions) {
    const text = prose(intro, pairs)
    const uses = /^Legendary Action Uses: (\d+)(?: \((\d+) in Lair\))?\./.exec(text)
    if (!uses) throw new Error(`${name}: no legendary action uses`)
    result.legendaryActions = { uses: Number(uses[1]), ...(uses[2] ? { usesInLair: Number(uses[2]) } : {}), text, actions: result.legendaryActions.actions }
  }
  return {
    id: toId(name),
    name,
    page: block[0].page,
    size: header[1].split(" or ") as Monster["size"],
    type: type as Monster["type"],
    ...(header[2] ? { swarmOf: header[2] as Monster["size"][number] } : {}),
    ...(header[4] ? { tags: header[4].split(", ").map(toId) } : {}),
    alignment: header[5],
    initiative: { modifier: signed(initiative[1]), score: Number(initiative[2]) },
    ...result,
  }
}
