import { existsSync } from "node:fs"
import type { ConditionId } from "../../src/schema/common"
import { abilityIds, conditionIds, creatureTypes, damageTypeIds, sizes } from "../../src/schema/common"
import type { Area, Attack, DamagePart, Monster, MonsterFeature, Save, Spellcasting } from "../../src/schema/monsters"
import { monsterRuleSchema, monsterSchema } from "../../src/schema/monsters"
import { applyOverrides, dataPath, readData, toId, writeData } from "../lib/data"
import { pageOf, pages } from "../lib/official"
import { readBase } from "../lib/sources"
import { additions, featureFixes, overrides, saveGates, selfEffects } from "../overrides/monsters"

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
    // The chapter's X/Day rule: a Long Rest restores the uses.
    if (perDay) feature.uses = { count: Number(perDay[1]), ...(perDay[2] ? { countInLair: Number(perDay[2]) } : {}), recharge: "long-rest" }
    else if (recharge) feature.rechargeRoll = { min: Number(recharge[1]), max: Number(recharge[2] ?? recharge[1]) }
    else if (part === "Recharge after a Short or Long Rest") feature.uses = { count: 1, recharge: "short-or-long-rest" }
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

/** Outcome labels, longest first so "Failure or Success" is not read as "Failure". */
const outcomeLabel = /(Hit or Miss|Failure or Success|Failure by \d+ or More|First Failure|Second Failure|Subsequent Failures|Hit|Miss|Failure|Success): /g
const outcomeOf = (label: string) => (label.startsWith("Failure by") ? "failure-by-margin" : (toId(label) as NonNullable<DamagePart["on"]>))
const saveStart = new RegExp(`(${abilityNames.join("|")}) Saving Throw: DC (\\d+)`, "g")

/** The span of `text` that holds `index` and ends at a sentence end or a line break. */
function sentenceSpan(text: string, index: number) {
  let start = 0
  for (const match of text.slice(0, index).matchAll(/\. (?=[A-Z])|\n/g)) start = (match.index as number) + match[0].length
  const end = /\. (?=[A-Z])|\n|$/.exec(text.slice(index)) as RegExpExecArray
  return { start, end: index + end.index }
}

/**
 * Openings that tie an effect to an earlier effect of the same feature that lasts: the grapple, the swallow, the
 * curse. An effect under one of them carries the gate of that earlier effect, not a gate of its own.
 */
const lasting = [
  "Until the grapple ends",
  "Until the curse ends",
  "While Grappled",
  "While swallowed",
  "A swallowed creature",
  "An engulfed target",
  "While attached",
  "While the cloaker is attached",
  "While cursed",
  "While Poisoned",
  "While it has the Poisoned condition",
  "While Charmed",
  "While wounded",
  "While in the whirlwind",
  "While the target has any Exhaustion levels",
]

/** Words that open a gate. */
const gateWord = /\b(?:If|if|When|when|Whenever|whenever|While|Once|The first time)\b/g

/** The last gate in `clause`: from its opening word to the next comma. */
function lastGate(clause: string): string | undefined {
  const found = [...clause.matchAll(gateWord)].at(-1)
  if (!found) return undefined
  const rest = clause.slice(found.index)
  const comma = rest.indexOf(", ")
  return comma < 0 ? undefined : rest.slice(0, comma)
}

/** Outcome label at the start of a sentence, as printed, to be left out of a gate. */
const labelAtStart = /^(?:Hit or Miss|Failure or Success|Failure by \d+ or More|First Failure|Second Failure|Subsequent Failures|Hit|Miss|Failure|Success): /

type Link = { on?: NonNullable<DamagePart["on"]>; save?: number; label?: string; appliesWhen?: string; unless?: string }

/** A gate that runs on into another creature's save: "…, the behir must succeed on a DC 14 Constitution saving throw at the end of that turn or regurgitate the creature". */
const regurgitation = /^, the [\w’ ]+? must succeed on a DC \d+ \w+ saving throw at the end of that turn or regurgitate (?:the creature|all swallowed creatures)/

/**
 * What an effect at `index` depends on. The outcome is the last label before it in the feature. The gate is the last
 * "If …", "When …", "While …" clause before it in its sentence; under a lasting opening ("While swallowed") it is the
 * gate of the last earlier sentence of the same outcome that had one; failing both, the gate of its save.
 */
function linkAt(text: string, index: number, saves: Save[]): Link & { first: boolean; gateOwn?: string } {
  const before = text.slice(0, index)
  const label = [...before.matchAll(outcomeLabel)].at(-1)
  const link: Link & { first: boolean; gateOwn?: string } = { first: false }
  const from = label ? (label.index as number) + label[0].length : 0
  if (label) {
    let on = outcomeOf(label[1])
    // A plain "Failure:" before a "Second Failure:" or "Subsequent Failures:" of the same save is the first stage.
    const nextSave = text.slice(from).search(saveStart)
    if (on === "failure" && /Second Failure: |Subsequent Failures: /.test(text.slice(from, nextSave < 0 ? undefined : from + nextSave))) on = "first-failure"
    link.on = on
    if (!on.startsWith("hit") && on !== "miss") link.save = [...text.slice(0, label.index).matchAll(saveStart)].length - 1
    link.first = !/\. (?=[A-Z])|\n/.test(before.slice(from))
  }
  // A named item of a list ("First Roar. …", "Running Water. …") labels what its paragraph holds.
  const paragraph = before.lastIndexOf("\n") + 1
  const item = paragraph > 0 ? /^([A-Z][\w’ ]{0,40})\. [A-Z]/.exec(text.slice(paragraph)) : null
  if (item && !link.label) link.label = item[1]
  const span = sentenceSpan(text, index)
  const clause = text.slice(span.start, index).replace(labelAtStart, "")
  const opening = lasting.find((words) => clause.startsWith(words))
  let own = opening ? undefined : lastGate(clause)
  if (own) {
    // A regurgitation gate holds the swallower's own save too, so it is not read as always landing.
    const on = regurgitation.exec(clause.slice(clause.lastIndexOf(own) + own.length))
    if (on) own += on[0]
    link.appliesWhen = own
    link.gateOwn = own
  } else if (/\b[Oo]therwise\b/.test(clause)) {
    // "Otherwise, the target takes …": the value holds unless the gate of the sentence before does.
    const previous = sentenceSpan(text, Math.max(from, span.start - 2))
    const gate = lastGate(text.slice(previous.start, previous.end).replace(labelAtStart, ""))
    if (gate) link.unless = gate
  } else if (opening) {
    // Back through the earlier sentences of the same outcome for the gate of the effect this one lasts with.
    let at = span.start
    while (at > from && !link.appliesWhen) {
      const previous = sentenceSpan(text, Math.max(from, at - 2))
      const gate = lastGate(text.slice(previous.start, previous.end).replace(labelAtStart, ""))
      // What lasts only while a grapple the monster chose lasts carries the words that say so, not the gate on the choice.
      if (gate && !lasting.some((words) => text.slice(previous.start).startsWith(words)))
        link.appliesWhen = / can give it the Grappled condition/.test(text.slice(previous.start, previous.end)) ? opening : gate
      at = previous.start
    }
  }
  if (!link.appliesWhen && link.save !== undefined && saves[link.save]?.appliesWhen) link.appliesWhen = saves[link.save].appliesWhen
  return link
}

function parseDamage(text: string, saves: Save[]): DamagePart[] {
  const pattern = new RegExp(`(\\d+)(?: \\((\\d+d\\d+(?: [+−–] \\d+)?)\\))? (?:(${damageTypeNames}) )?damage`, "g")
  // A bare number with neither dice nor type is a threshold ("takes 30 damage or more"), not damage dealt.
  const matches = [...text.matchAll(pattern)].filter((match) => match[2] || match[3])
  const parts: DamagePart[] = matches.map((match, k) => {
    const index = match.index as number
    const { first, gateOwn, ...link } = linkAt(text, index, saves)
    const previous = matches[k - 1]
    const gap = previous ? text.slice((previous.index as number) + previous[0].length, index) : ""
    const alternative = previous && first && /^(?:,? or |—or )$/.test(gap)
    const after = text.slice(index + match[0].length, matches[k + 1]?.index ?? text.length)
    // A gate or a time printed right after the roll: "if the swarm is Bloodied", "at the start of each of its turns".
    const trailing = /^ ((?:if|for every) [^.,—]+)/.exec(after)?.[1]
    if (trailing && !gateOwn) link.appliesWhen = trailing
    // "… unless the azer has the Incapacitated condition": the words after "unless", in the roll's own sentence.
    const unless = /^[^.—]*? unless ([^.,—]+)/.exec(after)?.[1]
    if (unless) link.unless = unless
    const sentence = sentenceSpan(text, index)
    const opening = /^(At the (?:start|end) of [^,]+), /.exec(text.slice(sentence.start).replace(labelAtStart, ""))?.[1]
    const timing = /^ (at the (?:start|end) of [^.,—]+?)(?= unless | if |[.,—]|$)/.exec(after)?.[1] ?? opening
    return {
      ...(match[2] ? { dice: ascii(match[2]), average: Number(match[1]) } : { amount: Number(match[1]) }),
      ...(match[3] ? { type: match[3].toLowerCase() as DamagePart["type"] } : {}),
      ...link,
      ...(timing ? { timing } : {}),
      ...(alternative ? { alternativeTo: k - 1 } : {}),
    }
  })
  // One time for two rolls: "takes 10 (3d6) Acid damage plus 10 (3d6) Fire damage at the start of each of its turns".
  for (let k = parts.length - 2; k >= 0; k--) {
    const gap = text.slice((matches[k].index as number) + matches[k][0].length, matches[k + 1].index)
    if (!parts[k].timing && parts[k + 1].timing && gap === " plus ") parts[k] = { ...parts[k], timing: parts[k + 1].timing }
  }
  return parts
}

function parseSaves(text: string): Save[] {
  const starts = [...text.matchAll(saveStart)]
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
    // "If the target is a Humanoid, it is subjected to the following effect." limits who makes the save.
    const lead = text.slice(0, begin)
    const previous = lead.slice(Math.max(lead.lastIndexOf(". ", lead.length - 3) + 2, lead.lastIndexOf("\n") + 1))
    if (/(?:the following effect|the following saving throw)\. $/.test(previous)) {
      const gate = lastGate(previous.replace(labelAtStart, ""))
      if (gate) save.appliesWhen = gate
    }
    const item = /^([A-Z][\w’ ]{0,40})\. [A-Z]/.exec(text.slice(lead.lastIndexOf("\n") + 1))
    if (lead.lastIndexOf("\n") >= 0 && item) save.label = item[1]
    const targets = /^(?:\([^)]*\))?,? ?([\s\S]*?)\.(?: |$)/.exec(body)
    if (targets?.[1] && !/^(?:Failure|Success)/.test(targets[1])) save.targets = targets[1]
    const markers = [...body.matchAll(/(Failure or Success|Failure by (\d+) or More|First Failure|Second Failure|Subsequent Failures|Failure|Success): /g)]
    // A plain "Failure:" followed by "Second Failure:" is the first stage.
    const staged = markers.some((marker) => marker[1] === "Second Failure" || marker[1] === "Subsequent Failures")
    const field = {
      "Failure or Success": "failureOrSuccess",
      "First Failure": "firstFailure",
      "Second Failure": "secondFailure",
      "Subsequent Failures": "subsequentFailures",
      Failure: staged ? "firstFailure" : "failure",
      Success: "success",
    } as const
    for (const [i, marker] of markers.entries()) {
      const from = (marker.index as number) + marker[0].length
      const clause = body.slice(from, markers[i + 1]?.index ?? body.length).trim()
      if (marker[2]) save.failureBy = { margin: Number(marker[2]), text: clause }
      else save[field[marker[1] as keyof typeof field]] = clause
    }
    if (save.success && /^Half damage/.test(save.success)) save.halfOnSuccess = true
    return save
  })
}

/** An area of effect: one the text puts creatures "in", or one that something "fills". "Destroys a 1-foot Cube" is not one. */
function parseArea(text: string): Area | undefined {
  const lead = "(?:in an?|fills a) "
  const found: { index: number; area: Area }[] = []
  for (const m of text.matchAll(new RegExp(`${lead}(\\d+)-foot-long, (\\d+)-foot-wide Line`, "g")))
    found.push({ index: m.index as number, area: { shape: "line", size: Number(m[1]), width: Number(m[2]) } })
  for (const m of text.matchAll(new RegExp(`${lead}(\\d+)-foot-radius, (\\d+)-foot-high Cylinder`, "g")))
    found.push({ index: m.index as number, area: { shape: "cylinder", size: Number(m[1]), height: Number(m[2]) } })
  for (const m of text.matchAll(new RegExp(`${lead}(\\d+)-foot(?:-radius)? (Cone|Cube|Emanation|Sphere)`, "g")))
    found.push({ index: m.index as number, area: { shape: m[2].toLowerCase() as Area["shape"], size: Number(m[1]) } })
  return found.sort((a, b) => a.index - b.index)[0]?.area
}

/**
 * Conditions the text gives: "has the Prone condition", "gives it the Grappled condition", "with the Prone condition",
 * "exiting Prone", "gains 1 Exhaustion level", "has 1 Exhaustion level". A clause that is a precondition or a negation
 * gives nothing: the words from the clause start (a comma, period, colon, semicolon, dash, parenthesis or "but") to
 * the phrase are checked. Each is linked to the outcome before it in its paragraph. A sentence with its own "if",
 * "unless", "while", "whenever" or "otherwise", or no outcome at all, sets `appliesWhen`.
 */
function parseConditions(text: string, saves: Save[]): MonsterFeature["conditions"] {
  const found: { index: number; names: string[] }[] = []
  const phrases = [
    new RegExp(`\\b(?:has|have|gains|gain|gives? (?:it|the target)|with) the ((?:${conditionNames})(?:(?:,? and |,? or |, )(?:${conditionNames}))*) conditions?`, "g"),
    /\b(?:has|gains?) \d+ (Exhaustion) levels?/g,
    /\bexit(?:ing)? (Prone)\b/g,
  ]
  for (const pattern of phrases) {
    for (const match of text.matchAll(pattern)) {
      const before = text.slice(0, match.index)
      const clause = before.slice(Math.max(...[",", ".", ":", ";", "—", "(", "\n", " but "].map((mark) => before.lastIndexOf(mark) + mark.length)))
      // "that" or "who" right before the verb makes a precondition ("one creature that has the Prone condition").
      if (/(?:n’t|\bnot\b|\bno longer\b|\b(?:if|while|whenever|unless|until)\b)/i.test(clause) || /\b(?:that|who) $/.test(clause)) continue
      found.push({ index: match.index as number, names: match[1].split(/,? and |,? or |, /) })
    }
  }
  const out: NonNullable<MonsterFeature["conditions"]> = []
  for (const { index, names } of found.sort((a, b) => a.index - b.index)) {
    const { first: _first, gateOwn: _own, ...link } = linkAt(text, index, saves)
    // A count or rate right after the condition limits it: "1 Exhaustion level for each missing limb".
    const trailing = /^[^.,]*? ((?:for each|for every) [^.,]+)/.exec(text.slice(index))?.[1]
    if (trailing && !link.appliesWhen) link.appliesWhen = trailing
    const instead = /instead of dealing damage/.test(text.slice(index, sentenceSpan(text, index).end))
    for (const name of names) {
      const entry = { condition: name.toLowerCase() as ConditionId, ...link, ...(instead ? { insteadOfDamage: true as const } : {}) }
      if (!out.some((other) => JSON.stringify(other) === JSON.stringify(entry))) out.push(entry)
    }
  }
  return out.length ? out : undefined
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

/** Spell ids, when the spells data is built, to prove each name a feature casts is a spell. */
const spellIds = existsSync(dataPath("spells")) ? new Set(readData("spells").map((spell) => spell.id as string)) : undefined

/**
 * Features whose casting the shape cannot hold, left as prose. Pit Fiend: casts Fireball twice and may swap one for
 * another spell. The hags' Coven Magic: only near two hag allies, and once per Long Rest for each spell.
 */
const castingInProse = new Set(["Hellfire Spellcasting", "Coven Magic"])

/** One spell as printed, "Mind Spike (level 4 version)", as an id and a note. */
function spellRef(name: string) {
  const parts = /^(?:the )?(.*?)(?: spell)?(?: \((.*)\))?$/.exec(name.trim()) as RegExpExecArray
  const id = toId(parts[1])
  if (spellIds && !spellIds.has(id)) throw new Error(`not a spell: ${name}`)
  return { id, ...(parts[2] ? { note: parts[2] } : {}) }
}

/**
 * A feature that casts named spells outside a spell list: "The vampire casts Command, requiring no spell components and
 * using Charisma as the spellcasting ability (spell save DC 17)", "using the same spellcasting ability as
 * Spellcasting", or "uses Spellcasting to cast Fear".
 */
function parseCasts(name: string, text: string): Spellcasting | undefined {
  if (castingInProse.has(name)) return undefined
  const own =
    /\bcasts ((?:the )?[A-Z][\s\S]*?)(?: on itself| on that creature| in response to the spell’s trigger)?, (?:requiring [^,]*?(?:,| and) )?using (?:(\w+) as the spellcasting ability|the same spellcasting ability as Spellcasting)/.exec(
      text
    )
  const via = [...text.matchAll(/Spellcasting to cast ([A-Z][^.,]*?(?: \([^)]*\))?)(?= on itself|,|\.| or \(|$)/g)]
  if (own) {
    const dc = /\(spell save DC (\d+)\)/.exec(text)
    return {
      ...(own[2] ? { ability: abilityOf(own[2]) } : { sameAsSpellcasting: true as const }),
      ...(dc ? { saveDc: Number(dc[1]) } : {}),
      spells: own[1].split(/, or |, | or /).map(spellRef),
    }
  }
  if (via.length) return { sameAsSpellcasting: true, spells: via.map((match) => spellRef(match[1])) }
  return undefined
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

function feature(id: string, name: string, text: string): MonsterFeature {
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
  if (/can’t take this action again until the start of its next turn/.test(body)) {
    if (result.uses) throw new Error(`${name}: two kinds of uses`)
    result.uses = { count: 1, recharge: "start-of-next-turn" }
  }
  const attack = parseAttack(body)
  if (attack) result.attack = attack
  const saves = parseSaves(body)
  for (const fix of saveGates.filter((gate) => gate.id === id && gate.feature === name)) {
    if (saves[fix.save].appliesWhen === fix.appliesWhen) throw new Error(`${id} ${name}: save gate fix changes nothing. Remove it.`)
    saves[fix.save].appliesWhen = fix.appliesWhen
  }
  if (saves.length) result.saves = saves
  const damage = parseDamage(body, saves)
  if (damage.length) result.damage = damage
  const conditions = parseConditions(body, saves)
  if (conditions) result.conditions = conditions
  const escapeDc = /escape DC (\d+)/.exec(body)
  if (escapeDc) result.escapeDc = Number(escapeDc[1])
  const area = parseArea(body)
  if (area) result.area = area
  if (selfEffects.some((effect) => effect.id === id && effect.feature === name)) {
    for (const value of [...(result.damage ?? []), ...(result.conditions ?? [])]) if (!value.on) value.self = true
  }
  const spellcasting = parseSpellcasting(body) ?? parseCasts(name, body)
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
    })
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
  // Anything that is not a plain damage type is a qualified defense. The overrides give its official wording.
  const conditional: { kind: string; appliesWhen: string }[] = []
  const damageList = (key: string, kind: string) => {
    const ids = (base[key] as string[]).filter((value) => (damageTypeIds as readonly string[]).includes(value))
    for (const value of base[key] as string[]) if (!ids.includes(value)) conditional.push({ kind, appliesWhen: value })
    return ids.length ? ids : undefined
  }
  const vulnerabilities = damageList("damage_vulnerabilities", "vulnerability")
  const resistances = damageList("damage_resistances", "resistance")
  const immunities = damageList("damage_immunities", "immunity")
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
    ...(conditional.length ? { conditionalDefenses: conditional } : {}),
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
  writeData("monster-rules", monsterRuleSchema, rules())
}

/** The table that follows a heading on its page, as one string of cells joined by line breaks. */
function table(heading: string, until: string) {
  const page = pageOf(heading, 254) as number
  const text = pages[page - 1]
  const start = text.indexOf(`${heading}\n`)
  if (start < 0) throw new Error(`no table ${heading}`)
  return { page, text: text.slice(start + heading.length, text.indexOf(until, start)) }
}

const crNumber = (text: string) => (text.includes("/") ? 1 / Number(text.split("/")[1]) : Number(text))

/** The three tables of "Parts of a Stat Block", pages 255 and 256. The base source has none of them. */
function rules() {
  const xp = table("Experience Points by Challenge Rating", "Proficiency Bonus")
  const pb = table("Proficiency Bonus by Challenge Rating", "Traits")
  const dice = table("Hit Dice by Size", "A monster’s Constitution")
  const xpByCr = [...xp.text.matchAll(/\n(\d+(?:\/\d+)?)\n([\d,]+(?: or [\d,]+)?)(?=\n)/g)]
    .map((m) => ({ cr: crNumber(m[1]), xp: m[2].split(" or ").map((value) => Number(value.replace(/,/g, ""))) }))
    .sort((a, b) => a.cr - b.cr)
  const pbByCr = [...pb.text.matchAll(/\n(\d+)–(\d+)\n\+(\d+)(?=\n)/g)].map((m) => ({ minCr: Number(m[1]), maxCr: Number(m[2]), pb: Number(m[3]) })).sort((a, b) => a.minCr - b.minCr)
  const hitDiceBySize = [...dice.text.matchAll(new RegExp(`\\n(${sizeNames})\\nd(\\d+)\\n(\\d+)(½?)(?=\\n)`, "g"))].map((m) => ({
    size: m[1] as Monster["size"][number],
    die: Number(m[2]),
    averagePerDie: Number(m[3]) + (m[4] ? 0.5 : 0),
  }))
  // Each typed value of the page 257 rules stands on a sentence the page prints.
  const page = pages[256].replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2").replace(/\s+/g, " ")
  for (const sentence of [
    "a monster must finish a Long Rest to regain expended uses",
    "At the start of each of the monster’s turns, roll 1d6",
    "which also recharges when the monster finishes a Short or Long Rest",
    "the monster can use the stat block part once and must then finish a Short or Long Rest to use it again",
    "Only one of these actions can be taken at a time and only after another creature’s turn ends",
    "The monster expends one use whenever it takes a Legendary Action, and it regains all expended uses at the start of each of its turns",
    "can’t take a Legendary Action if it has the Incapacitated condition",
  ])
    if (!page.includes(sentence)) throw new Error(`page 257 does not read: ${sentence}`)
  return [
    {
      id: "limited-usage",
      name: "Limited Usage",
      page: 257,
      perDay: { recharge: "long-rest" },
      rechargeRoll: { count: 1, die: 6, rolledAt: "start-of-each-turn", alsoRestoredBy: "short-or-long-rest" },
      afterRest: { count: 1, recharge: "short-or-long-rest" },
    },
    {
      id: "legendary-actions",
      name: "Legendary Actions",
      page: 257,
      timing: "after-another-creatures-turn",
      oneAtATime: true,
      usesPerAction: 1,
      recharge: "start-of-next-turn",
      blockedBy: ["incapacitated"],
    },
    { id: "experience-points-by-challenge-rating", name: "Experience Points by Challenge Rating", page: xp.page, xpByCr },
    { id: "proficiency-bonus-by-challenge-rating", name: "Proficiency Bonus by Challenge Rating", page: pb.page, pbByCr },
    { id: "hit-dice-by-size", name: "Hit Dice by Size", page: dice.page, hitDiceBySize },
  ]
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
    forms.flatMap((form) =>
      ["special_abilities", "actions", "bonus_actions", "reactions", "legendary_actions"].flatMap((key) =>
        (form[key] ?? []).map((f: Base) => (f.name as string).replace(/ \(.*\)$/, "").replace(/'/g, "’"))
      )
    )
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
    const item = feature(toId(name), current.name, prose(current.lines, pairs))
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
    // "The dragon regains all expended uses at the start of each of its turns."
    if (!/regains all expended uses at the start of each of its turns\./.test(text)) throw new Error(`${name}: legendary uses are not regained at the start of its turns`)
    const count = { count: Number(uses[1]), ...(uses[2] ? { countInLair: Number(uses[2]) } : {}), recharge: "start-of-next-turn" }
    result.legendaryActions = { uses: count, text, actions: result.legendaryActions.actions }
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
