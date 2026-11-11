import { existsSync } from "node:fs"
import type { Area, Healing, Spell, SpellStatBlock } from "../../src/schema/spells"
import { dataPath, readData, toId } from "../lib/data"
import { missingSentences, pages, pageText, squash } from "../lib/official"
import type { Report } from "../lib/report"
import { hasUpstream, readOpen5e } from "../lib/sources"

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

/** Paragraphs the PDF sets flush after a list of run-in items, which no tab or heading marks. */
const flushStarts = ["The stress of casting Wish to produce any effect"]

/** Where a reading of the prose cannot reach what the text states, and the data holds it by a recorded override. */
const readingWaivers: Record<string, { fields: string[]; reason: string }> = {
  befuddlement: {
    fields: ["saves", "damage"],
    reason: "page 112 prints the first save’s outcome, “half as much damage only”, in a paragraph after the repeated save every 30 days",
  },
  wish: { fields: ["damage"], reason: irregularDamage.wish },
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
    .flatMap((piece) => piece.replace(/([.!?:])\s+/g, "$1\n").split("\n"))
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

/** A paragraph cut into sentences. */
const sentencesOf = (text: string) =>
  text
    .replace(/([.!?])\s+(?=[A-Z“•])/g, "$1\n")
    .split("\n")
    .filter(Boolean)

const abilityIdOf: Record<string, string> = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" }
const conditionWords = "Blinded|Charmed|Deafened|Exhaustion|Frightened|Grappled|Incapacitated|Invisible|Paralyzed|Petrified|Poisoned|Prone|Restrained|Stunned|Unconscious"
const typeWords = typeNames.join("|")
const listOf = (words: string) => `((?:${words})(?:(?:, and |, or |, | and | or )(?:${words}))*)`
const split = (list: string) => list.split(/, and |, or |, | and | or /).map((name) => name.toLowerCase())

type ReadSave = { ability: string; dc: number | "spell-save-dc"; when: string; onSuccess: string; target?: string }
type Reading = { saves: ReadSave[]; damage: string[]; conditions: string[]; casterConditions: string[]; healing?: Healing; area?: Area }

/**
 * Read what a spell's prose says it does, as a referee would: every saving throw with its moment and what a success
 * does, every damage roll and condition with the hit or failed save its own sentence ties it to, the dice each roll
 * adds per slot level, healing, and the area of effect. The prose read here is the data's, which the checks above
 * prove is the official wording, sentence by sentence and paragraph by paragraph. Written apart from the builder.
 */
function readSpell(spell: Spell): Reading {
  const prose = spell.description.split("\n")
  const rows = (spell.tables ?? []).flatMap((table) => table.rows.map((row) => row[row.length - 1]))
  const units = [...prose.map((text) => ({ text, row: false })), ...rows.map((text) => ({ text, row: true }))].flatMap((paragraph, number) =>
    sentencesOf(paragraph.text).map((text) => ({ text, number, row: paragraph.row }))
  )

  // Saving throws, in order, with the sentence each sits in.
  type Event = { at: number; position: number; ability: string; again: boolean; lead: string }
  const events: Event[] = []
  let previous = ""
  units.forEach((unit, at) => {
    const found: Event[] = []
    for (const match of unit.text.matchAll(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) saving throw(s?)/g)) {
      const lead = unit.text.slice(0, match.index)
      if (match[2] || /(Advantage|Disadvantage|bonus|penalty) (on|to) (all |its |their |your |any )?$/.test(lead)) continue
      found.push({ at, position: match.index ?? 0, ability: abilityIdOf[match[1]], again: /another $/.test(lead), lead })
    }
    for (const match of unit.text.matchAll(/\brepeats? the save\b/g)) {
      const position = match.index ?? 0
      const ability = [...found].reverse().find((event) => event.position < position)?.ability ?? previous
      found.push({ at, position, ability, again: true, lead: unit.text.slice(0, position) })
    }
    found.sort((a, b) => a.position - b.position)
    if (found.length) previous = found[found.length - 1].ability
    events.push(...found)
  })

  const saves: ReadSave[] = []
  const savesOf = new Map<Event, string[]>()
  let tableEvent: Event | undefined
  events.forEach((event, order) => {
    const sentence = units[event.at].text
    const next = events[order + 1]
    // What follows the save, up to the next save, within the prose or within one table row, and not past an ability check.
    const scope = [sentence.slice(event.position, next && next.at === event.at ? next.position : undefined)]
    for (let at = event.at + 1; at < units.length && (!next || at < next.at); at++) {
      if ((units[at].row && units[at].number !== units[event.at].number) || /\bmakes? an? [\w ()]*?check\b/.test(units[at].text)) break
      scope.push(units[at].text)
    }
    const read = scope.join(" ")
    let onSuccess = "none"
    const success = /(On a successful save|On a success|If it succeeds|if it succeeds|If it successfully saves[^,]*), ([^.]*)/.exec(read)
    if (/half as much damage|half the initial damage|half damage/i.test(read)) onSuccess = "half"
    else if (/ending (the spell|the effect|the condition)( on itself)? on a success|saving throw to end (the|this) effect/.test(read)) onSuccess = "ends"
    else if (success) {
      if (/three times/.test(success[1])) onSuccess = "other"
      else if (/isn’t affected|is unaffected|has no effect|resists your efforts/.test(success[2])) onSuccess = "none"
      else if (/\bends\b|is no longer (affected|Restrained)|isn’t Restrained/.test(success[2])) onSuccess = "ends"
      else onSuccess = "other"
    }
    // A save that sends the creature to a table of outcomes takes the rows' outcome: the same in every row, or "other".
    if (/\btable\b/.test(read) && rows.some((row) => row.includes("Failed Save:"))) {
      const each = new Set(rows.filter((row) => row.includes("Failed Save:")).map((row) => (row.includes("Successful Save: Half as much damage") ? "half" : "none")))
      onSuccess = each.size === 1 ? [...each][0] : "other"
      tableEvent = event
    }
    const near = `${event.lead} ${sentence.slice(event.position, event.position + 60).replace(/^\w+ saving throw|^repeats? the save/, "")}`
    const when: string[] = []
    if (/[Aa]t the end of each of (its|the target’s) turns|(If|if) the [\w ]*?creature ends its turn|at which point it must/.test(near)) when.push("end-of-turn")
    if (/[Aa]t the start of each of its turns|at the start of your next turn/.test(near)) when.push("start-of-turn")
    if (/(each time|whenever|Whenever) (it|the target) takes damage|damages the (\w+ )?creature/.test(event.lead)) when.push("on-damage")
    if (/take an action to [^.]*$/.test(event.lead)) when.push("action")
    if (!when.length) when.push(event.again ? "later" : "initial")
    const dc = /DC (\d+) $/.exec(event.lead)
    const caster = /\byou make a $|When you cast this spell, make a (DC \d+ )?$/.test(event.lead)
    const keys: string[] = []
    for (const moment of when) {
      const save: ReadSave = { ability: event.ability, dc: dc ? Number(dc[1]) : "spell-save-dc", when: moment, onSuccess, ...(caster ? { target: "caster" } : {}) }
      if (!saves.some((other) => JSON.stringify(other) === JSON.stringify(save))) saves.push(save)
      keys.push(`${save.ability}/${save.when}/${save.onSuccess}`)
    }
    savesOf.set(event, keys)
  })

  // What a roll or a condition at `position` of sentence `at` follows, by the words of that sentence.
  const tie = (at: number, position: number) => {
    const text = units[at].text
    const before = events.filter((event) => event.at === at && event.position < position)
    if (before.length) return `failed-save:${savesOf.get(before[before.length - 1])?.[0]}`
    if (/\b[Oo]n a hit\b/.test(text)) return "hit"
    if (units[at].row && tableEvent && /(^|\. )Failed Save:/.test(text)) return `failed-save:${savesOf.get(tableEvent)?.[0]}`
    if (/[Oo]n (a )?failed save|Failed Save:|fails (the|its|this|that)( second)? save|succeed on that save or/.test(text)) {
      const earlier = events.filter((event) => event.at < at || (event.at === at && event.position < position))
      if (earlier.length) return `failed-save:${savesOf.get(earlier[earlier.length - 1])?.[0]}`
    }
    return "untied"
  }

  // Damage rolls in the prose. Table rows type theirs through the table and are read by the table check.
  type Roll = { at: number; position: number; end: number; dice?: string; amount?: number; modifier: boolean; types: string[]; paragraph: number }
  const rolls: Roll[] = []
  const choice = (() => {
    const named = new RegExp(`(?:[Cc]hoose|a type you choose:|This damage is) ${listOf(typeWords)}`).exec(spell.description)
    if (named) return split(named[1])
    return [...spell.description.matchAll(new RegExp(`\\((${typeWords})\\)`, "g"))].map((match) => match[1].toLowerCase())
  })()
  units.forEach((unit, at) => {
    if (unit.row) return
    const text = unit.text
    const found: Roll[] = []
    const add = (match: RegExpMatchArray, roll: Partial<Roll>) =>
      found.push({ at, position: match.index ?? 0, end: (match.index ?? 0) + match[0].length, modifier: false, types: [], paragraph: unit.number, ...roll })
    for (const match of text.matchAll(new RegExp(`(\\d+d\\d+(?: \\+ \\d+)?)( plus your spellcasting ability modifier)? ${listOf(typeWords)} damage`, "g")))
      add(match, { dice: match[1], modifier: Boolean(match[2]), types: split(match[3]) })
    for (const match of text.matchAll(new RegExp(`${listOf(typeWords)} damage (to the target )?equal to (\\d+d\\d+)( plus your spellcasting ability modifier)?`, "g")))
      add(match, { dice: match[3], modifier: Boolean(match[4]), types: split(match[1]) })
    for (const match of text.matchAll(/(\d+d\d+) damage( of the chosen type| of a type you choose| of the spirit’s type| when you hit)/g)) add(match, { dice: match[1], types: choice })
    for (const match of text.matchAll(new RegExp(`(\\d+) (${typeWords}) damage`, "g"))) {
      const lead = text.slice(0, match.index)
      if (/(\d|d|\+ |at least )$/.test(lead) || /^ to any structure/.test(text.slice((match.index ?? 0) + match[0].length))) continue
      add(match, { amount: Number(match[1]), types: [match[2].toLowerCase()] })
    }
    // Delayed Blast Fireball gives its roll as a base: "takes Fire damage equal to the total", "The spell’s base damage is 12d6".
    for (const match of text.matchAll(/base damage is (\d+d\d+)/g)) {
      const type = new RegExp(`takes (${typeWords}) damage equal to the total`).exec(spell.description)
      if (type) add(match, { dice: match[1], types: [type[1].toLowerCase()] })
    }
    found.sort((a, b) => a.position - b.position)
    // One roll of either of two types: "3d8 Radiant damage (if you are good or neutral) or 3d8 Necrotic damage (if you are evil)".
    for (let index = found.length - 1; index > 0; index--) {
      const between = text.slice(found[index - 1].end, found[index].position)
      if (found[index - 1].dice && found[index - 1].dice === found[index].dice && / or $/.test(between) && !/[.;]/.test(between)) {
        found[index - 1].types.push(...found[index].types)
        found.splice(index, 1)
      }
    }
    rolls.push(...found)
  })
  // Per slot: each "… damage increases by XdY" clause raises the rolls it names by type, "initial", or words of their paragraph.
  const perSlot = new Map<Roll, string>()
  for (const match of (spell.higherLevel ?? "").matchAll(/([\w ]*?)damage([\w ’()]*?) increases? by (\d+d\d+)/g)) {
    const words = `${match[1]} ${match[2]}`.trim()
    const types = [...words.matchAll(new RegExp(typeWords, "g"))].map((type) => type[0].toLowerCase())
    const key = words
      .replace(/^(The|the|and the|All the|Both types of)\s*/, "")
      .split(" ")
      .slice(-2)
      .join(" ")
      .toLowerCase()
    rolls.forEach((roll, index) => {
      const raised = types.length
        ? roll.types.some((type) => types.includes(type))
        : /both|All|healing and|^(The|the)?$/.test(words) || !key
          ? true
          : /initial/.test(words)
            ? index === 0
            : prose[roll.paragraph].toLowerCase().includes(key)
      if (raised) perSlot.set(roll, match[3])
    })
  }
  const upgrade = /levels 5 \((\d+d\d+)\), 11 \((\d+d\d+)\), and 17 \((\d+d\d+)\)/.exec(spell.cantripUpgrade ?? "")
  const damage = rolls.map((roll) => {
    const text = units[roll.at].text
    const target = /you and any creature traveling with you each take/.test(text) ? "caster-and-companions" : /\byou take\b|damage to you\b/.test(text) ? "caster" : "targets"
    return JSON.stringify([roll.dice ?? roll.amount, [...roll.types].sort(), roll.modifier, target, tie(roll.at, roll.position), perSlot.get(roll) ?? "", upgrade ? upgrade.slice(1) : ""])
  })

  // Conditions the prose gives, and those it ends, prevents, makes immune or names as already present, which it does not.
  const conditions: string[] = []
  const casterConditions: string[] = []
  units.forEach((unit, at) => {
    const text = unit.text
    const found = [
      ...[...text.matchAll(new RegExp(`\\b(has|have|gains?|is given|giving it|having|with) the ${listOf(conditionWords)} conditions?`, "g"))].map((match) => ({
        position: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        names: split(match[2]),
        rowForm: /^ha(s|ve)$/.test(match[1]),
      })),
      ...[...text.matchAll(new RegExp(`\\b(is|be|falls?) (${conditionWords})\\b`, "g"))].map((match) => ({
        position: match.index ?? 0,
        end: (match.index ?? 0) + match[0].length,
        names: [match[2].toLowerCase()],
        rowForm: false,
      })),
    ]
    for (const match of found) {
      if (unit.row && !match.rowForm) continue
      const lead = text.slice(0, match.position)
      const clause = lead.split(/, (and |or |but )?/).pop() ?? lead
      const after = text.slice(match.end)
      const notGiven =
        /\b(if|If|unless) (it|the creature|the target|you|a target|they)\b[^,]*$|can’t (gain|be|have)|neither|Immunity|immune|from such creatures|no longer|\bthat (is possessed by or )?$/.test(
          clause
        ) || /^[^.]*?(removed|the condition ends|doesn’t end)|^ (conditions? )?from (such|one or more)/.test(after)
      if (notGiven) continue
      const onCaster = /^(You|On a failed save, you|If expelled, you)\b/.test(lead)
      for (const name of match.names) {
        if (onCaster) {
          if (!casterConditions.includes(name)) casterConditions.push(name)
        } else {
          const key = JSON.stringify([name, tie(at, match.position)])
          if (!conditions.includes(key)) conditions.push(key)
        }
      }
    }
  })

  // Healing.
  const text = spell.description
  const higher = spell.higherLevel ?? ""
  const dice = /regains? (a number of )?Hit Points equal to (\d+d\d+( \+ \d+)?)( plus your spellcasting ability modifier)?/.exec(text)
  const plainDice = /regains? (\d+d\d+( \+ \d+)?) Hit Points/.exec(text)
  const amount = /(regains?|restoring|restores) (\d+) Hit Points?\b/.exec(text)
  const temporary = /gains? (\d+d\d+( \+ \d+)?) Temporary Hit Points/.exec(text)
  const temporaryModifier = /gains Temporary Hit Points equal to your spellcasting ability modifier/.test(text)
  const healDice = /healing (and damage )?increases? by (\d+d\d+) for each spell slot level/.exec(higher)
  const healAmount = /healing (and damage )?increases? by (\d+) for each spell slot level/.exec(higher) ?? /gain (\d+) additional Temporary Hit Points for each spell slot level/.exec(higher)
  let healing: Healing | undefined
  const rolled = temporary?.[1] ?? dice?.[2] ?? plainDice?.[1]
  if (rolled || amount || temporaryModifier) {
    healing = {
      ...(rolled ? { dice: rolled } : amount ? { amount: Number(amount[2]) } : {}),
      ...((dice?.[4] && !temporary) || temporaryModifier ? { modifier: true as const } : {}),
      ...(temporary || temporaryModifier ? { temporary: true as const } : {}),
      ...(healDice ? { perSlot: healDice[2] } : {}),
      ...(healAmount ? { perSlotAmount: Number(healAmount[healAmount.length - 1]) } : {}),
    }
  }

  // The first sized area of effect that is not a limit on an object or illusion, a portion, or one of many Cubes.
  const shapes: [RegExp, (match: RegExpMatchArray) => Area][] = [
    [/(\d+)-foot-radius Sphere/g, (match) => ({ shape: "sphere", size: Number(match[1]) })],
    [/(\d+)-foot[- ](Cone|Cube|Emanation)\b/g, (match) => ({ shape: match[2].toLowerCase() as Area["shape"], size: Number(match[1]) })],
    [/(\d+)-foot-wide, (\d+)-foot-long Line/g, (match) => ({ shape: "line", size: Number(match[2]), width: Number(match[1]) })],
    [/(\d+)-foot-long, (\d+)-foot-wide Line/g, (match) => ({ shape: "line", size: Number(match[1]), width: Number(match[2]) })],
    [/Line of [\w ]+? (\d+) feet long and (\d+) feet wide/g, (match) => ({ shape: "line", size: Number(match[1]), width: Number(match[2]) })],
    [/(\d+)-foot-radius, (\d+)-foot[- ](high|tall) Cylinder/g, (match) => ({ shape: "cylinder", size: Number(match[1]), height: Number(match[2]) })],
    [/(\d+)-foot-tall, (\d+)-foot-radius Cylinder/g, (match) => ({ shape: "cylinder", size: Number(match[2]), height: Number(match[1]) })],
  ]
  const areas = shapes
    .flatMap(([pattern, make]) => [...text.matchAll(pattern)].map((match) => ({ position: match.index ?? 0, match, area: make(match) })))
    .filter(
      ({ position, match }) =>
        !/(no larger than|fit in|contained within|unoccupied|ten|contiguous) (an? )?$/.test(text.slice(0, position)) && !/^(s\b| portion)/.test(text.slice(position + match[0].length))
    )
    .sort((a, b) => a.position - b.position)

  return { saves, damage, conditions, casterConditions, healing, area: areas[0]?.area }
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
        // Each part of the material is a clause before ", and". A price is consumed when its part says the spell consumes it.
        const costs = parts[3]
          .split(/, and /)
          .flatMap((part) =>
            [...part.matchAll(/([\d,]+)\+? (GP|SP|CP|Gold Pieces|Silver Pieces|Copper Pieces)\b/g)].map(
              (match) => `${match[1].replace(/,/g, "")} ${coins[match[2]]}${/consume/.test(part) ? " consumed" : ""}`
            )
          )
        const dataCosts = (material.costs ?? []).map(({ cost, consumed }) => `${cost.amount} ${cost.unit}${consumed ? " consumed" : ""}`)
        if (costs.join() !== dataCosts.join()) fail("material cost", costs, dataCosts)
        const consumed = !/consume/.test(parts[3]) ? "none" : costs.some((cost) => !cost.endsWith(" consumed")) ? "some" : "all"
        if (consumed !== material.consumed) fail("material consumed", consumed, material.consumed)
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
        for (const sentence of sentencesOf(piece)) if (squash(sentence).length >= 12 && !own.includes(squash(sentence))) failures.push(`${spell.id}: not on pages ${from}–${to}: "${sentence}"`)
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

  // Paragraphs: every paragraph start in the official text is a paragraph start in the data, and back. A start is a
  // tabbed line, a bullet, a run-in heading after a full stop, the first line after a table, or a paragraph the PDF
  // sets flush after a list (Wish's stress). Starts are compared by their first words across the chapter, so text the
  // PDF sets in a neighbour's block still counts.
  {
    const failures: string[] = []
    const prefix = (text: string) => squash(text).slice(0, 20)
    const runIn = /^[A-Z0-9][\w’–-]*( ([A-Z0-9][\w’–-]*|of|the|and|or|a|an|to|in|on|with|for|from))*\. [A-Z“]/
    const officialStarts = new Map<string, string>()
    for (const header of official) {
      const spell = byName.get(header.name)
      const lines = header.body.map((line) => line.text).filter((line) => line.trim())
      const stop = lines.findIndex((_, index) => /^(Tiny|Small|Medium|Large|Huge|Gargantuan)\b/.test(lines[index + 1] ?? "") && lines[index + 2]?.startsWith("AC "))
      const own = stop < 0 ? lines : lines.slice(0, stop)
      const tables = spell?.tables ?? []
      const cells = new Set(tables.flatMap((table) => [...(table.title ? [table.title] : []), ...table.columns, ...table.rows.flat()]).map(squash))
      const inTable = (line: string) => [...cells].some((cell) => cell.includes(squash(line)))
      const lastCells = tables.map((table) => squash(table.rows[table.rows.length - 1][table.rows[0].length - 1]))
      own.forEach((line, index) => {
        const text = line.trim()
        const previous = own[index - 1]?.trim() ?? ""
        if (index > 0 && inTable(text)) return
        const start =
          index === 0 ||
          /^\s*\t/.test(line) ||
          text.startsWith("•") ||
          (/[.:!?”)]$/.test(previous) && runIn.test(text)) ||
          flushStarts.some((flush) => text.startsWith(flush)) ||
          lastCells.some((cell) => cell.endsWith(squash(previous)) && squash(previous).length > 0)
        // A start whose first line is short is a short paragraph, so its key is that line alone.
        if (start) officialStarts.set(prefix(squash(text).length >= 20 ? join(own.slice(index, index + 3)) : text), `${header.name}: ${text.slice(0, 40)}`)
      })
    }
    const dataStarts = new Map<string, string>()
    for (const spell of spells) {
      const paragraphs = [
        ...spell.description.split("\n"),
        ...(spell.higherLevel ? [`Using a Higher-Level Spell Slot. ${spell.higherLevel}`] : []),
        ...(spell.cantripUpgrade ? [`Cantrip Upgrade. ${spell.cantripUpgrade}`] : []),
      ]
      for (const paragraph of paragraphs) dataStarts.set(prefix(paragraph), `${spell.id}: ${paragraph.slice(0, 40)}`)
    }
    for (const [key, where] of officialStarts) if (!dataStarts.has(key)) failures.push(`${where}: a paragraph starts here in the official text, not in the data`)
    for (const [key, where] of dataStarts) if (!officialStarts.has(key)) failures.push(`${where}: a paragraph starts here in the data, not in the official text`)
    report.check(category, "paragraph starts match the official text both ways", officialStarts.size + dataStarts.size, failures)
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
    return sentencesOf(bodyOf(spell))
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
        const sentence = sentencesOf(own).find((line) => line.includes(roll)) ?? ""
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
        if (typeof save.dc === "number" && !text.includes(`DC ${save.dc} ${abilityNames[save.ability]} saving throw`)) failures.push(`${spell.id}: DC ${save.dc} is not in its text`)
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
        const dc = match[2] ? Number(match[2]) : "spell-save-dc"
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
      for (const { condition } of spell.conditions ?? []) {
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

  // The typed effects against a reading of each spell's prose, both ways: the same saves with the same moment and
  // outcome, the same damage rolls and conditions tied to the same hit or failed save, the same scaling, healing and
  // area. A field the data lacks, holds wrongly, or invents fails here.
  {
    const failures: string[] = []
    const waived: string[] = []
    let total = 0
    const saveKey = (save: { ability: string; when: string; onSuccess: string }) => `${save.ability}/${save.when}/${save.onSuccess}`
    for (const spell of spells) {
      const reading = readSpell(spell)
      const saves = spell.saves ?? []
      const tieOf = (link: { trigger?: string; save?: number }) =>
        link.trigger === "hit" ? "hit" : link.trigger === "failed-save" ? `failed-save:${link.save === undefined ? "?" : saves[link.save] ? saveKey(saves[link.save]) : "missing"}` : "untied"
      const compare = (field: string, text: unknown, data: unknown) => {
        total++
        if (JSON.stringify(text) === JSON.stringify(data)) return
        const line = `${spell.id}: ${field} reads ${JSON.stringify(text)} in its text, the data ${JSON.stringify(data)}`
        if (readingWaivers[spell.id]?.fields.includes(field)) waived.push(`${spell.id}: ${field}: ${readingWaivers[spell.id].reason}`)
        else failures.push(line)
      }
      compare(
        "saves",
        reading.saves,
        saves.map(({ ability, dc, when, onSuccess, target }) => ({ ability, dc, when, onSuccess, ...(target ? { target } : {}) }))
      )
      const damage = (spell.damage ?? [])
        .filter((part) => !part.table)
        .map((part) =>
          JSON.stringify([
            part.dice ?? part.amount,
            [...part.types].sort(),
            Boolean(part.modifier),
            part.target ?? "targets",
            tieOf(part),
            part.perSlot ?? "",
            part.cantrip ? [part.cantrip[5], part.cantrip[11], part.cantrip[17]] : "",
          ])
        )
      compare("damage", [...new Set(reading.damage)].sort(), [...new Set(damage)].sort())
      compare("conditions", [...reading.conditions].sort(), (spell.conditions ?? []).map((entry) => JSON.stringify([entry.condition, tieOf(entry)])).sort())
      compare("caster conditions", [...reading.casterConditions].sort(), [...(spell.casterConditions ?? [])].sort())
      compare("healing", reading.healing ?? null, spell.healing ?? null)
      compare("area", reading.area ?? null, spell.range.area ?? null)
      // Every link points at a save that exists.
      for (const link of [...(spell.damage ?? []), ...(spell.conditions ?? [])]) {
        total++
        if ((link.trigger === "failed-save") !== (link.save !== undefined) || (link.save !== undefined && !saves[link.save]))
          failures.push(`${spell.id}: a link names no save, or a save without a failed-save trigger`)
      }
    }
    report.check(category, "saves, damage, conditions, healing and areas match a reading of the spell’s own text, both ways", total, failures, waived)
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
      const specific = Boolean(material && (material.consumed !== "none" || material.costs?.some(({ cost }) => cost.unit === "gp")))
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
      ["conditions", (spell) => [...(spell.conditions ?? []).map((entry) => entry.condition), ...(spell.casterConditions ?? [])]],
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
  const open5eCheck = "agrees with Open5e, or the official text settles it"
  if (!hasUpstream("open5e")) report.skip(category, open5eCheck)
  else {
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
        compare(
          "material consumed",
          fields.material_consumed,
          spell.components.material.consumed !== "none",
          /consume/.test(header?.components ?? "") === (spell.components.material.consumed !== "none")
        )
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
    report.crossCheck(category, open5eCheck, total, failures, settled)
  }
}
