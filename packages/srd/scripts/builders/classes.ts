import type { Class, ClassFeature, ClassLevel, FeatureOption, Subclass } from "../../src/schema/classes"
import { classFeatureSchema, classSchema, subclassSchema } from "../../src/schema/classes"
import { type ClassId, classIds } from "../../src/schema/common"
import { applyOverrides, toId, writeData } from "../lib/data"
import { pageOf, pages } from "../lib/official"
import { readBase } from "../lib/sources"
import { classOverrides, featureOverrides, subclassOverrides } from "../overrides/classes"

// Classes come from three places. Core traits, table numbers and spell lists come from the base source, with
// overrides where it errs. Feature and subclass prose comes from the official text, since the base source
// paraphrases and keeps the PDF's broken words. Mechanics are written out below from the official wording, and
// the check compares every one of them with it.

type Line = { text: string; page: number; hardHyphen: boolean }
type Paragraph = { label?: string; body: string; bullet: boolean; page: number }
type Mechanics = Partial<Omit<ClassFeature, "id" | "name" | "page" | "class" | "subclass" | "level" | "levels" | "description" | "options" | "laterText">>
type OptionMechanics = Partial<Omit<FeatureOption, "id" | "name" | "page" | "description" | "prerequisite" | "repeatable">>

const className = (id: ClassId) => id[0].toUpperCase() + id.slice(1)

function pageFor(text: string, from = 1): number {
  const page = pageOf(text, from)
  if (!page) throw new Error(`classes: not in the official text: ${text}`)
  return page
}

// The official text

/** The Classes chapter as lines. Soft hyphens go. A line that ends "- " ends with a real hyphen, as in "shape- shifting". */
function chapter(): Line[] {
  const first = pageFor("Classes Barbarian Core Barbarian Traits")
  const last = pageFor("Character Origins Character Backgrounds") - 1
  const lines: Line[] = []
  for (let page = first; page <= last; page++) {
    for (const raw of pages[page - 1].split("\n")) {
      const text = raw
      if (text.trim()) lines.push({ text: text.trimEnd(), page, hardHyphen: /-\s+$/.test(text) })
    }
  }
  return lines
}

const heading = /^Level (\d+): (.+)$/
const tableTitles = new Set([
  "Beast Shapes",
  "Creating Spell Slots",
  "Life Domain Spells",
  "Arid Land",
  "Polar Land",
  "Temperate Land",
  "Tropical Land",
  "Nature’s Ward",
  "Oath of Devotion Spells",
  "Draconic Spells",
  "Fiend Spells",
])
/** Boxed text set inside a feature, by title and the words that end it. */
const sidebarEnds: Record<string, string> = { "Breaking Your Oath": "and adopt another one.", "Expanding and Replacing a Spellbook": "backup spellbook." }

/** A label is a short run of capitalized words before a period, as in "Damage Resistance." or "Poison (Cost: 1d6)." */
const labelPattern = /^((?:[A-Z(][\w’+:()-]*|\d[\w+:()-]*)(?: (?:[A-Z(][\w’+:()-]*|\d[\w+:()-]*|of|the|or|and|a|an|to|with|into|from|in|on|via)){0,7})\. (?=\S)/

/**
 * Paragraph starts the PDF text does not mark: no tab, and the bullet before it does not end a sentence. On page 50
 * "You gain the following benefits" is its own paragraph after the Monk weapon bullets.
 */
const unmarkedStarts = new Set(["You gain the following benefits while you are un-"])

/**
 * Lines to paragraphs. A tab or a bullet starts one. So does a labeled line after a finished sentence (the rules
 * while shape-shifted are set without tabs), and a sentence after a finished bullet.
 */
function paragraphs(lines: Line[]): Paragraph[] {
  const out: (Paragraph & { last: Line })[] = []
  for (const line of lines) {
    const trimmed = line.text.replace(/^[•\t ]+/, "")
    const bullet = line.text.startsWith("•")
    const previous = out.at(-1)
    const ended = previous && /[.:]$/.test(previous.body)
    const starts = !previous || line.text.startsWith("\t") || bullet || unmarkedStarts.has(trimmed) || (ended && labelPattern.test(trimmed)) || (previous.bullet && ended && /^[A-Z]/.test(trimmed))
    if (starts) {
      out.push({ body: trimmed, bullet, page: line.page, last: line })
      continue
    }
    const end = previous.body
    if (end.endsWith("-") && !previous.last.hardHyphen) previous.body = end.slice(0, -1) + trimmed
    else if (end.endsWith("-") || end.endsWith("—")) previous.body = end + trimmed
    else previous.body = `${end} ${trimmed}`
    previous.last = line
  }
  return out.map(({ body, bullet, page }) => {
    const match = bullet ? null : body.match(labelPattern)
    return match ? { label: match[1], body: body.slice(match[0].length), bullet, page } : { body, bullet, page }
  })
}

const render = (paragraph: Paragraph) => (paragraph.label ? `${paragraph.label}. ${paragraph.body}` : paragraph.bullet ? `• ${paragraph.body}` : paragraph.body)
const prose = (list: Paragraph[]) => list.map(render).join("\n")

type Block = { level: number; name: string; page: number; paragraphs: Paragraph[] }
type Section = {
  id: ClassId
  page: number
  blocks: Block[]
  sidebars: { name: string; page: number; text: string }[]
  subclass: { name: string; page: number; tagline: string; description: string; blocks: Block[] }
  optionLines: Line[]
}

/** Split a class section into feature blocks, without the tables and sidebars set among them. */
function blocks(lines: Line[], name: string, sidebars: Section["sidebars"]): Block[] {
  const result: Block[] = []
  for (let index = 0; index < lines.length; index++) {
    const match = lines[index].text.match(heading)
    if (!match) continue
    let end = index + 1
    while (end < lines.length && !heading.test(lines[end].text)) end++
    const body: Line[] = []
    for (let at = index + 1; at < end; at++) {
      const line = lines[at]
      const text = line.text.trim()
      if (text === `${name} Features` || tableTitles.has(text)) {
        while (at + 1 < end && lines[at + 1].page === line.page) at++
      } else if (sidebarEnds[text]) {
        const start = at
        while (!lines[at].text.endsWith(sidebarEnds[text])) at++
        sidebars.push({ name: text, page: line.page, text: prose(paragraphs(lines.slice(start + 1, at + 1))) })
      } else body.push(line)
    }
    result.push({ level: Number(match[1]), name: match[2].trim(), page: lines[index].page, paragraphs: paragraphs(body) })
    index = end - 1
  }
  return result
}

function sections(subclassNames: Map<ClassId, string>): Section[] {
  const lines = chapter()
  const starts = classIds.map((id) => {
    const index = lines.findIndex((line, at) => line.text.trim() === className(id) && lines[at + 1]?.text.trim() === `Core ${className(id)} Traits`)
    if (index < 0) throw new Error(`classes: no section for ${id}`)
    return index
  })
  return classIds.map((id, k) => {
    const name = className(id)
    const all = lines.slice(starts[k], starts[k + 1] ?? lines.length)
    const at = (text: string) => all.findIndex((line) => line.text.trim() === text)
    const subclassStart = all.findIndex((line) => line.text.startsWith(`${name} Subclass:`))
    const optionsStart = Math.max(at("Metamagic Options"), at("Eldritch Invocation Options"))
    const ends = [at(`${name} Spell List`), optionsStart, subclassStart].filter((index) => index >= 0)
    const featuresEnd = Math.min(...ends)
    const featuresStart = all.findIndex((line) => heading.test(line.text))
    const sidebars: Section["sidebars"] = []
    const classBlocks = blocks(all.slice(featuresStart, featuresEnd), name, sidebars)

    // The subclass heading wraps: "Barbarian Subclass:" then "Path of the Berserker".
    const subclassName = subclassNames.get(id) as string
    let nameEnd = subclassStart
    let printed = all[subclassStart].text.slice(`${name} Subclass:`.length).trim()
    while (printed !== subclassName) {
      nameEnd++
      if (nameEnd > subclassStart + 2) throw new Error(`classes: subclass heading of ${id} does not read ${subclassName}`)
      printed = `${printed} ${all[nameEnd].text.trim()}`.trim()
    }
    const subclassLines = all.slice(nameEnd + 1)
    const firstHeading = subclassLines.findIndex((line) => heading.test(line.text))
    const subclassSidebars: Section["sidebars"] = []
    const subclass = {
      name: subclassName,
      page: all[subclassStart].page,
      tagline: subclassLines[0].text.trim(),
      description: prose(paragraphs(subclassLines.slice(1, firstHeading))),
      blocks: blocks(subclassLines.slice(firstHeading), name, subclassSidebars),
    }
    if (subclassSidebars.length) throw new Error(`classes: unexpected sidebar in the ${id} subclass`)
    const optionLines = optionsStart >= 0 ? all.slice(optionsStart + 1, Math.min(...ends.filter((index) => index > optionsStart))) : []
    return { id, page: all[0].page, blocks: classBlocks, sidebars, subclass, optionLines }
  })
}

// Options

/** Features whose labeled paragraphs are choices, by feature id and label. */
const optionLabels: Record<string, string[]> = {
  "barbarian-brutal-strike": ["Forceful Blow", "Hamstring Blow"],
  "barbarian-improved-brutal-strike": ["Staggering Blow", "Sundering Blow"],
  "cleric-divine-order": ["Protector", "Thaumaturge"],
  "cleric-channel-divinity": ["Divine Spark", "Turn Undead"],
  "cleric-blessed-strikes": ["Divine Strike", "Potent Spellcasting"],
  "cleric-improved-blessed-strikes": ["Divine Strike", "Potent Spellcasting"],
  "druid-primal-order": ["Magician", "Warden"],
  "druid-elemental-fury": ["Potent Spellcasting", "Primal Strike"],
  "druid-improved-elemental-fury": ["Potent Spellcasting", "Primal Strike"],
  "monk-monks-focus": ["Flurry of Blows", "Patient Defense", "Step of the Wind"],
  "paladin-fighting-style": ["Blessed Warrior"],
  "paladin-channel-divinity": ["Divine Sense"],
  "ranger-fighting-style": ["Druidic Warrior"],
  "rogue-cunning-strike": ["Poison", "Trip", "Withdraw"],
  "rogue-devious-strikes": ["Daze", "Knock Out", "Obscure"],
  "sorcerer-font-of-magic": ["Converting Spell Slots to Sorcery Points", "Creating Spell Slots"],
  "warrior-of-the-open-hand-open-hand-technique": ["Addle", "Push", "Topple"],
  "hunter-hunters-prey": ["Colossus Slayer", "Horde Breaker"],
  "hunter-defensive-tactics": ["Escape the Horde", "Multiattack Defense"],
  "thief-fast-hands": ["Sleight of Hand", "Use an Object"],
  "thief-supreme-sneak": ["Stealth Attack"],
}

/** Options set under their own titles after the class features. */
const optionTitles: Record<string, string[]> = {
  "sorcerer-metamagic": [
    "Careful Spell",
    "Distant Spell",
    "Empowered Spell",
    "Extended Spell",
    "Heightened Spell",
    "Quickened Spell",
    "Seeking Spell",
    "Subtle Spell",
    "Transmuted Spell",
    "Twinned Spell",
  ],
  "warlock-eldritch-invocations": [
    "Agonizing Blast",
    "Armor of Shadows",
    "Ascendant Step",
    "Devil’s Sight",
    "Devouring Blade",
    "Eldritch Mind",
    "Eldritch Smite",
    "Eldritch Spear",
    "Fiendish Vigor",
    "Gaze of Two Minds",
    "Gift of the Depths",
    "Gift of the Protectors",
    "Investment of the Chain Master",
    "Lessons of the First Ones",
    "Lifedrinker",
    "Mask of Many Faces",
    "Master of Myriad Forms",
    "Misty Visions",
    "One with Shadows",
    "Otherworldly Leap",
    "Pact of the Blade",
    "Pact of the Chain",
    "Pact of the Tome",
    "Repelling Blast",
    "Thirsting Blade",
    "Visions of Distant Realms",
    "Whispers of the Grave",
    "Witch Sight",
  ],
}

const costResource = (text: string): NonNullable<FeatureOption["spend"]> => {
  const dice = text.match(/^(\d+)d6$/)
  if (dice) return { resource: "sneak-attack-dice", amount: Number(dice[1]) }
  const points = text.match(/^(\d+) Sorcery Points?$/)
  if (points) return { resource: "sorcery-points", amount: Number(points[1]) }
  throw new Error(`classes: unread cost ${text}`)
}

function labeledOptions(featureId: string, list: Paragraph[]): { rest: Paragraph[]; options: FeatureOption[] } {
  const names = optionLabels[featureId]
  const nameOf = (paragraph: Paragraph) => paragraph.label?.replace(/ \(Cost: [^)]+\)$/, "")
  const first = list.findIndex((paragraph) => names.includes(nameOf(paragraph) ?? ""))
  if (first < 0) throw new Error(`classes: ${featureId} has no options`)
  const options: FeatureOption[] = []
  for (let index = first; index < list.length; index++) {
    const name = nameOf(list[index]) as string
    if (!names.includes(name)) throw new Error(`classes: ${featureId} has an unexpected paragraph after its options: ${list[index].body.slice(0, 40)}`)
    let end = index + 1
    while (end < list.length && !names.includes(nameOf(list[end]) ?? "")) end++
    const cost = list[index].label?.match(/\(Cost: ([^)]+)\)$/)
    options.push({
      id: toId(name),
      name,
      page: list[index].page,
      description: prose([{ ...list[index], label: undefined }, ...list.slice(index + 1, end)]),
      ...(cost ? { spend: costResource(cost[1]) } : {}),
      ...optionMechanics[`${featureId}/${toId(name)}`],
    })
    index = end - 1
  }
  if (options.length !== names.length) throw new Error(`classes: ${featureId} reads ${options.length} of ${names.length} options`)
  return { rest: list.slice(0, first), options }
}

/** Options under titles: a title line, then "Cost:" or "Prerequisite:" (which may wrap), then the text. */
function titledOptions(featureId: string, lines: Line[]): FeatureOption[] {
  const names = optionTitles[featureId]
  const starts = names.map((name) => {
    const index = lines.findIndex((line) => line.text.trim() === name)
    if (index < 0) throw new Error(`classes: no option ${name} for ${featureId}`)
    return index
  })
  return names.map((name, k) => {
    const body = lines.slice(starts[k] + 1, starts[k + 1] ?? lines.length)
    let skip = 0
    let cost: FeatureOption["spend"]
    let prerequisite: FeatureOption["prerequisite"]
    const first = body[0].text.trim()
    if (first.startsWith("Cost: ")) {
      cost = costResource(first.slice("Cost: ".length))
      skip = 1
    } else if (first.startsWith("Prerequisite: ")) {
      let text = first.slice("Prerequisite: ".length)
      skip = 1
      while (/^[A-Z][\w’]*(?: (?:[A-Z][\w’]*|a|an|of|the|via))*$/.test(body[skip].text.trim())) text = `${text} ${body[skip++].text.trim()}`
      const level = text.match(/Level (\d+)\+ Warlock/)
      const invocation = text.match(/((?:Pact of the|Thirsting) \w+) Invocation/)
      prerequisite = { text, ...(level ? { level: Number(level[1]) } : {}), ...(invocation ? { invocation: toId(invocation[1]) } : {}) }
    }
    const list = paragraphs(body.slice(skip))
    const repeatable = list.find((paragraph) => paragraph.label === "Repeatable")
    return {
      id: toId(name),
      name,
      page: lines[starts[k]].page,
      description: prose(list),
      ...(prerequisite ? { prerequisite } : {}),
      ...(repeatable ? { repeatable: { text: repeatable.body } } : {}),
      ...(cost ? { spend: cost } : {}),
      ...optionMechanics[`${featureId}/${toId(name)}`],
    }
  })
}

// Mechanics, as each feature's official text states them. The check reads every value back from that text.

const longRest = (count: number) => ({ count, recharge: "long-rest" as const })
/** Uses counted by a table column, all back on a Long Rest and one on a Short Rest. */
const column = (name: "rages" | "channelDivinity" | "wildShape" | "secondWind") => ({ count: { column: name }, recharge: "long-rest" as const, shortRestRegain: 1 as const })
const asi = { feat: { id: "ability-score-improvement", orAnother: true as const } }
const boon = (recommended: string) => ({ feat: { category: "epic-boon" as const, recommended, orAnother: true as const } })

const mechanics: Record<string, Mechanics> = {
  // Parts of the text the typed fields do not hold, by kind, and conditions on the feature itself.
  "path-of-the-berserker-frenzy": { untyped: ["damage"] },
  "barbarian-persistent-rage": { untyped: ["uses"] },
  "barbarian-danger-sense": { unless: "you have the Incapacitated condition" },
  "cleric-greater-divine-intervention": { untyped: ["uses"] },
  "circle-of-the-land-natural-recovery": { untyped: ["uses"] },
  "monk-martial-arts": { untyped: ["activation", "dice"] },
  "monk-evasion": { unless: "if you have the Incapacitated condition" },
  "rogue-evasion": { unless: "if you have the Incapacitated condition" },
  "rogue-elusive": { unless: "you have the Incapacitated condition" },
  "thief-use-magic-device": { untyped: ["dice"] },
  "thief-second-story-work": { untyped: ["speed"] },
  "fiend-patron-fiendish-resilience": { untyped: ["resistances"] },
  "draconic-sorcery-elemental-affinity": { untyped: ["resistances", "damage"] },
  "barbarian-rage": { activation: ["bonus-action"], uses: column("rages"), resistances: { damageTypes: ["bludgeoning", "piercing", "slashing"], while: "raging" } },
  "barbarian-unarmored-defense": { armorClass: { base: 10, abilities: ["dex", "con"], shield: true } },
  "barbarian-primal-knowledge": { skillProficiencies: { count: 1, from: ["animal-handling", "athletics", "intimidation", "nature", "perception", "survival"] } },
  "barbarian-ability-score-improvement": asi,
  "barbarian-extra-attack": { attacks: 2 },
  "barbarian-fast-movement": { speedBonus: { feet: 10, while: "no-heavy-armor" } },
  "barbarian-brutal-strike": { dice: "1d10", diceByLevel: [{ level: 17, dice: "2d10" }], attacksWith: ["strength-based"], oncePerTurn: "own-turn" },
  "barbarian-relentless-rage": { selfSave: { ability: "con", dc: 10, increasePerUse: 5, resetOn: "short-or-long-rest" } },
  "barbarian-epic-boon": boon("boon-of-irresistible-offense"),
  "barbarian-primal-champion": { abilityIncrease: { abilities: ["str", "con"], amount: 4, maximum: 25 } },
  "path-of-the-berserker-mindless-rage": { conditionImmunities: { conditions: ["charmed", "frightened"], while: "raging" } },
  "path-of-the-berserker-retaliation": { activation: ["reaction"], range: 5 },
  "path-of-the-berserker-intimidating-presence": {
    activation: ["bonus-action"],
    area: { shape: "emanation", size: 30, selective: true },
    save: { ability: "wis", dc: { plusModifierOf: "str" }, onSuccess: "none" },
    uses: { count: 1, recharge: "long-rest", restoredBy: { resource: "rage", amount: 1 } },
    untyped: ["conditions", "save"],
  },

  "bard-bardic-inspiration": {
    activation: ["bonus-action"],
    range: 60,
    uses: {
      count: { ability: "cha", minimum: 1 },
      recharge: "long-rest",
      rechargeByLevel: [{ level: 5, recharge: "short-or-long-rest" }],
      restoredBy: { resource: "spell-slot", amount: 1, fromLevel: 5 },
    },
  },
  "bard-font-of-inspiration": { activation: ["no-action"] },
  "bard-expertise": { expertise: { count: 2 } },
  "bard-ability-score-improvement": asi,
  "bard-countercharm": { activation: ["reaction"], range: 30 },
  "bard-epic-boon": boon("boon-of-spell-recall"),
  "bard-words-of-creation": { alwaysPrepared: ["power-word-heal", "power-word-kill"] },
  "college-of-lore-bonus-proficiencies": { skillProficiencies: { count: 3 } },
  "college-of-lore-cutting-words": { activation: ["reaction"], range: 60, spend: { resource: "bardic-inspiration", amount: 1 } },
  "college-of-lore-peerless-skill": { spend: { resource: "bardic-inspiration", amount: 1, keptOnFailure: true } },

  "cleric-channel-divinity": { uses: column("channelDivinity"), saveDc: "spell-save-dc" },
  "cleric-ability-score-improvement": asi,
  "cleric-sear-undead": { damage: { types: ["radiant"], appliesWhen: "that fails its saving throw against that use of Turn Undead" } },
  "cleric-divine-intervention": { activation: ["magic-action"], uses: longRest(1), untyped: ["uses"] },
  "cleric-epic-boon": boon("boon-of-fate"),
  "life-domain-preserve-life": { activation: ["magic-action"], spend: { resource: "channel-divinity", amount: 1 }, range: 30 },

  "druid-druidic": { alwaysPrepared: ["speak-with-animals"] },
  "druid-wild-shape": {
    activation: ["bonus-action"],
    uses: { ...column("wildShape"), restoredBy: { resource: "spell-slot", amount: 1, fromLevel: 5, whenNoneLeft: true, oncePerTurn: "own-turn" } },
  },
  "druid-wild-companion": { activation: ["magic-action"] },
  "druid-wild-resurgence": {
    activation: ["no-action"],
    parts: [
      {
        label: "give yourself one use by expending a spell slot",
        spend: { resource: "spell-slot", amount: 1 },
        oncePerTurn: "own-turn",
        usableWhen: "if you have no uses of Wild Shape left",
      },
      { label: "to give yourself a level 1 spell slot", spend: { resource: "wild-shape", amount: 1 }, uses: { count: 1, recharge: "long-rest" } },
    ],
  },
  "druid-archdruid": { label: "Nature Magician", activation: ["no-action"], uses: { count: 1, recharge: "long-rest" } },
  "druid-ability-score-improvement": asi,
  "druid-epic-boon": boon("boon-of-dimensional-travel"),
  "circle-of-the-land-lands-aid": {
    activation: ["magic-action"],
    spend: { resource: "wild-shape", amount: 1 },
    range: 60,
    area: { shape: "sphere", size: 10, selective: true },
    save: { ability: "con", dc: "spell-save-dc", onSuccess: "half" },
    dice: "2d6",
    diceByLevel: [
      { level: 10, dice: "3d6" },
      { level: 14, dice: "4d6" },
    ],
    damage: { types: ["necrotic"] },
  },
  "circle-of-the-land-natures-ward": { conditionImmunities: { conditions: ["poisoned"] } },
  "circle-of-the-land-natures-sanctuary": { activation: ["magic-action"], spend: { resource: "wild-shape", amount: 1 }, range: 120, area: { shape: "cube", size: 15, allies: true } },

  "fighter-fighting-style": { feat: { category: "fighting-style", recommended: "defense" } },
  "fighter-second-wind": { activation: ["bonus-action"], uses: column("secondWind"), dice: "1d10", rollAdds: ["class-level"] },
  "fighter-action-surge": {
    uses: {
      count: {
        byLevel: [
          { level: 2, count: 1 },
          { level: 17, count: 2 },
        ],
      },
      recharge: "short-or-long-rest",
    },
    oncePerTurn: "any-turn",
  },
  "fighter-tactical-mind": { spend: { resource: "second-wind", amount: 1, keptOnFailure: true }, dice: "1d10" },
  "fighter-ability-score-improvement": asi,
  "fighter-extra-attack": { attacks: 2 },
  "fighter-indomitable": {
    uses: {
      count: {
        byLevel: [
          { level: 9, count: 1 },
          { level: 13, count: 2 },
          { level: 17, count: 3 },
        ],
      },
      recharge: "long-rest",
    },
  },
  "fighter-two-extra-attacks": { attacks: 3 },
  "fighter-epic-boon": boon("boon-of-combat-prowess"),
  "fighter-three-extra-attacks": { attacks: 4 },
  "champion-improved-critical": { criticalHit: { minRoll: 19 }, attacksWith: ["weapon", "unarmed-strike"] },
  "champion-additional-fighting-style": { feat: { category: "fighting-style" } },
  "champion-superior-critical": { criticalHit: { minRoll: 18 }, attacksWith: ["weapon", "unarmed-strike"] },

  "monk-unarmored-movement": {
    speedBonus: { feet: 10, appliesWhen: "while you aren’t wearing armor or wielding a Shield" },
    speedBonusByLevel: [
      { level: 6, feet: 15 },
      { level: 10, feet: 20 },
      { level: 14, feet: 25 },
      { level: 18, feet: 30 },
    ],
  },
  "monk-unarmored-defense": { armorClass: { base: 10, abilities: ["dex", "wis"], shield: false } },
  "monk-monks-focus": { uses: { count: { column: "focusPoints" }, recharge: "short-or-long-rest" }, saveDc: { plusModifierOf: "wis" } },
  "monk-uncanny-metabolism": { uses: longRest(1), diceFromColumn: "martialArts", rollAdds: ["class-level"] },
  "monk-deflect-attacks": {
    activation: ["reaction"],
    dice: "1d10",
    rollAdds: ["dex", "class-level"],
    parts: [
      {
        label: "redirect some of the attack’s force",
        usableWhen: "If you reduce the damage to 0",
        spend: { resource: "focus-points", amount: 1 },
        save: { ability: "dex", onSuccess: "none" },
      },
    ],
  },
  "monk-slow-fall": { activation: ["reaction"] },
  "monk-ability-score-improvement": asi,
  "monk-extra-attack": { attacks: 2 },
  "monk-stunning-strike": {
    spend: { resource: "focus-points", amount: 1 },
    save: { ability: "con", onSuccess: "other" },
    attacksWith: ["monk-weapon", "unarmed-strike"],
    oncePerTurn: "any-turn",
    untyped: ["conditions"],
  },
  "monk-empowered-strikes": { damage: { types: ["force"], orNormalType: true }, attacksWith: ["unarmed-strike"] },
  "monk-disciplined-survivor": { savingThrowProficiencies: ["str", "dex", "con", "int", "wis", "cha"] },
  "monk-superior-defense": { spend: { resource: "focus-points", amount: 3 }, untyped: ["resistances"] },
  "monk-epic-boon": boon("boon-of-irresistible-offense"),
  "monk-body-and-mind": { abilityIncrease: { abilities: ["dex", "wis"], amount: 4, maximum: 25 } },
  "warrior-of-the-open-hand-wholeness-of-body": {
    activation: ["bonus-action"],
    diceFromColumn: "martialArts",
    rollAdds: ["wis"],
    uses: { count: { ability: "wis", minimum: 1 }, recharge: "long-rest" },
  },
  "warrior-of-the-open-hand-quivering-palm": {
    attacksWith: ["unarmed-strike"],
    spend: { resource: "focus-points", amount: 4 },
    save: { ability: "con", onSuccess: "half", timing: "When you end them" },
    damage: { dice: "10d12", types: ["force"], timing: "When you end them" },
  },

  "paladin-lay-on-hands": { activation: ["bonus-action"], pool: { perLevel: 5, recharge: "long-rest" } },
  "paladin-fighting-style": { feat: { category: "fighting-style" } },
  "paladin-paladins-smite": { alwaysPrepared: ["divine-smite"], freeCast: [{ spell: "divine-smite" }], uses: longRest(1) },
  "paladin-channel-divinity": { uses: column("channelDivinity"), saveDc: "spell-save-dc" },
  "paladin-ability-score-improvement": asi,
  "paladin-weapon-mastery": { weaponMasteries: 2 },
  "paladin-extra-attack": { attacks: 2 },
  "paladin-faithful-steed": { alwaysPrepared: ["find-steed"], freeCast: [{ spell: "find-steed" }], uses: longRest(1) },
  "paladin-aura-of-protection": { area: { shape: "emanation", size: 10, allies: true, unless: "while you have the Incapacitated condition" }, untyped: ["bonus"] },
  "paladin-abjure-foes": {
    activation: ["magic-action"],
    spend: { resource: "channel-divinity", amount: 1 },
    range: 60,
    save: { ability: "wis", selective: true, onSuccess: "none" },
    untyped: ["conditions"],
  },
  "paladin-aura-of-courage": { conditionImmunities: { conditions: ["frightened"], while: "in-aura-of-protection", allies: true } },
  "paladin-radiant-strikes": { damage: { dice: "1d8", types: ["radiant"] }, attacksWith: ["melee-weapon", "unarmed-strike"] },
  "paladin-aura-expansion": { area: { shape: "emanation", size: 30, allies: true } },
  "paladin-epic-boon": boon("boon-of-truesight"),
  "oath-of-devotion-sacred-weapon": { spend: { resource: "channel-divinity", amount: 1 }, damage: { types: ["radiant"], orNormalType: true }, attacksWith: ["imbued-weapon"], untyped: ["bonus"] },
  "oath-of-devotion-aura-of-devotion": { conditionImmunities: { conditions: ["charmed"], while: "in-aura-of-protection", allies: true } },
  "oath-of-devotion-holy-nimbus": {
    activation: ["bonus-action"],
    uses: { count: 1, recharge: "long-rest", restoredBy: { resource: "spell-slot", amount: 1, slotLevel: 5 } },
    parts: [{ label: "Radiant Damage", damage: { types: ["radiant"], appliesWhen: "Whenever an enemy starts its turn in the aura" } }],
    untyped: ["damage"],
  },

  "ranger-favored-enemy": { alwaysPrepared: ["hunters-mark"], freeCast: [{ spell: "hunters-mark" }], uses: { count: { column: "favoredEnemy" }, recharge: "long-rest" } },
  "ranger-deft-explorer": { expertise: { count: 1 } },
  "ranger-fighting-style": { feat: { category: "fighting-style" } },
  "ranger-ability-score-improvement": asi,
  "ranger-weapon-mastery": { weaponMasteries: 2 },
  "ranger-extra-attack": { attacks: 2 },
  "ranger-roving": { speedBonus: { feet: 10, while: "no-heavy-armor" }, untyped: ["speed"] },
  "ranger-expertise": { expertise: { count: 2 } },
  "ranger-tireless": { label: "Temporary Hit Points", activation: ["magic-action"], dice: "1d8", rollAdds: ["wis"], uses: { count: { ability: "wis", minimum: 1 }, recharge: "long-rest" } },
  "ranger-natures-veil": { untyped: ["conditions"], activation: ["bonus-action"], uses: { count: { ability: "wis", minimum: 1 }, recharge: "long-rest" } },
  "ranger-feral-senses": { senses: [{ type: "blindsight", range: 30 }] },
  "ranger-epic-boon": boon("boon-of-dimensional-travel"),
  "hunter-superior-hunters-prey": { oncePerTurn: "any-turn" },
  "hunter-superior-hunters-defense": { activation: ["reaction"], untyped: ["resistances"] },

  "rogue-expertise": { expertise: { count: 2 } },
  "rogue-sneak-attack": { diceFromColumn: "sneakAttack", attacksWith: ["finesse-weapon", "ranged-weapon"], oncePerTurn: "any-turn", untyped: ["dice"] },
  "rogue-weapon-mastery": { weaponMasteries: 2 },
  "rogue-cunning-action": { activation: ["bonus-action"] },
  "rogue-steady-aim": { activation: ["bonus-action"], usableWhen: "if you haven’t moved during this turn" },
  "rogue-ability-score-improvement": asi,
  "rogue-cunning-strike": { saveDc: { plusModifierOf: "dex" } },
  "rogue-uncanny-dodge": { activation: ["reaction"] },
  "rogue-slippery-mind": { savingThrowProficiencies: ["wis", "cha"] },
  "rogue-epic-boon": boon("boon-of-the-night-spirit"),
  "rogue-stroke-of-luck": { uses: { count: 1, recharge: "short-or-long-rest" } },
  "thief-fast-hands": { activation: ["bonus-action"] },

  "sorcerer-font-of-magic": { uses: { count: { column: "sorceryPoints" }, recharge: "long-rest" } },
  "sorcerer-innate-sorcery": { activation: ["bonus-action"], uses: longRest(2) },
  "sorcerer-ability-score-improvement": asi,
  "sorcerer-sorcerous-restoration": { uses: longRest(1) },
  "sorcerer-arcane-apotheosis": { oncePerTurn: "own-turn" },
  "sorcerer-epic-boon": boon("boon-of-dimensional-travel"),
  "draconic-sorcery-draconic-resilience": { armorClass: { base: 10, abilities: ["dex", "cha"] }, hitPointMaximum: { increase: 3, perLevel: 1, levelsCounted: "class" } },
  "draconic-sorcery-dragon-wings": { untyped: ["speed"], activation: ["bonus-action"], uses: { count: 1, recharge: "long-rest", restoredBy: { resource: "sorcery-points", amount: 3 } } },
  "draconic-sorcery-dragon-companion": { freeCast: [{ spell: "summon-dragon" }], uses: longRest(1) },

  "warlock-magical-cunning": { uses: longRest(1) },
  "warlock-ability-score-improvement": asi,
  "warlock-contact-patron": { alwaysPrepared: ["contact-other-plane"], freeCast: [{ spell: "contact-other-plane", usableWhen: "to contact your patron" }], uses: longRest(1) },
  "warlock-mystic-arcanum": {
    uses: { count: 1, per: "spell", recharge: "long-rest" },
    spellLevels: [
      { level: 11, spellLevel: 6 },
      { level: 13, spellLevel: 7 },
      { level: 15, spellLevel: 8 },
      { level: 17, spellLevel: 9 },
    ],
  },
  "warlock-epic-boon": boon("boon-of-fate"),
  "fiend-patron-dark-ones-own-luck": { dice: "1d10", uses: { count: { ability: "cha", minimum: 1 }, recharge: "long-rest" } },
  "fiend-patron-hurl-through-hell": {
    save: { ability: "cha", dc: "spell-save-dc", onSuccess: "none" },
    damage: { dice: "8d10", types: ["psychic"], notCreatureTypes: ["fiend"] },
    oncePerTurn: "any-turn",
    untyped: ["conditions"],
    uses: { count: 1, recharge: "long-rest", restoredBy: { resource: "pact-magic-slot", amount: 1 } },
  },

  "wizard-arcane-recovery": { uses: longRest(1) },
  "wizard-scholar": { expertise: { count: 1, from: ["arcana", "history", "investigation", "medicine", "nature", "religion"] } },
  "wizard-ability-score-improvement": asi,
  "wizard-epic-boon": boon("boon-of-spell-recall"),
  "wizard-signature-spells": { uses: { count: 1, per: "spell", recharge: "short-or-long-rest" } },
  "evoker-overchannel": { selfDamage: { from: "second-use", dicePerSlotLevel: "2d12", damageType: "necrotic", increaseAfterSecondUse: "1d12" } },
}

/** Mechanics of options, by "<feature id>/<option id>". */
const optionMechanics: Record<string, OptionMechanics> = {
  "hunter-hunters-prey/colossus-slayer": { oncePerTurn: "any-turn", untyped: ["damage"] },
  "hunter-hunters-prey/horde-breaker": { oncePerTurn: "own-turn" },
  "cleric-channel-divinity/divine-spark": {
    activation: ["magic-action"],
    range: 30,
    dice: "1d8",
    diceByLevel: [
      { level: 7, dice: "2d8" },
      { level: 13, dice: "3d8" },
      { level: 18, dice: "4d8" },
    ],
    untyped: ["save", "damage"],
    rollAdds: ["wis"],
    spend: { resource: "channel-divinity", amount: 1 },
  },
  "cleric-channel-divinity/turn-undead": {
    activation: ["magic-action"],
    spend: { resource: "channel-divinity", amount: 1 },
    range: 30,
    save: { ability: "wis", onlyCreatureTypes: ["undead"], selective: true, onSuccess: "none" },
    untyped: ["conditions"],
  },
  "cleric-blessed-strikes/divine-strike": { dice: "1d8", diceByLevel: [{ level: 14, dice: "2d8" }], damage: { types: ["necrotic", "radiant"] }, attacksWith: ["weapon"], oncePerTurn: "own-turn" },
  "cleric-improved-blessed-strikes/potent-spellcasting": { range: 60 },
  "druid-elemental-fury/primal-strike": {
    dice: "1d8",
    diceByLevel: [{ level: 15, dice: "2d8" }],
    damage: { types: ["cold", "fire", "lightning", "thunder"] },
    attacksWith: ["weapon", "beast-form-attack"],
    oncePerTurn: "own-turn",
  },
  "monk-monks-focus/flurry-of-blows": { activation: ["bonus-action"], spend: { resource: "focus-points", amount: 1 } },
  "monk-monks-focus/patient-defense": { activation: ["bonus-action"] },
  "monk-monks-focus/step-of-the-wind": { activation: ["bonus-action"] },
  "warrior-of-the-open-hand-open-hand-technique/push": { save: { ability: "str", onSuccess: "none" } },
  "warrior-of-the-open-hand-open-hand-technique/topple": { save: { ability: "dex", onSuccess: "none" }, untyped: ["conditions"] },
  "paladin-channel-divinity/divine-sense": { activation: ["bonus-action"], spend: { resource: "channel-divinity", amount: 1 }, range: 60 },
  "rogue-cunning-strike/poison": {
    save: { ability: "con", onSuccess: "none" },
    requiresItem: "poisoners-kit",
    usableWhen: "you must have a Poisoner’s Kit on your person",
    untyped: ["conditions", "save"],
  },
  "rogue-cunning-strike/trip": { save: { ability: "dex", targetMaxSize: "Large", onSuccess: "none" }, untyped: ["conditions"] },
  "rogue-devious-strikes/daze": { save: { ability: "con", onSuccess: "none" } },
  "rogue-devious-strikes/knock-out": { save: { ability: "con", onSuccess: "none" }, untyped: ["conditions", "save"] },
  "rogue-devious-strikes/obscure": { save: { ability: "dex", onSuccess: "none" }, untyped: ["conditions"] },
  "sorcerer-font-of-magic/converting-spell-slots-to-sorcery-points": { activation: ["no-action"], spend: { resource: "spell-slot", amount: 1 } },
  "sorcerer-font-of-magic/creating-spell-slots": { activation: ["bonus-action"] },
  "warlock-eldritch-invocations/armor-of-shadows": { freeCast: [{ spell: "mage-armor", selfOnly: true }] },
  "warlock-eldritch-invocations/ascendant-step": { freeCast: [{ spell: "levitate", selfOnly: true }] },
  "warlock-eldritch-invocations/devils-sight": { range: 120 },
  "warlock-eldritch-invocations/devouring-blade": { attacks: 3, attacksWith: ["pact-weapon"] },
  "warlock-eldritch-invocations/eldritch-smite": {
    spend: { resource: "pact-magic-slot", amount: 1 },
    damage: { dice: "1d8", types: ["force"] },
    dicePerSlotLevel: "1d8",
    attacksWith: ["pact-weapon"],
    oncePerTurn: "any-turn",
    untyped: ["conditions"],
  },
  "warlock-eldritch-invocations/fiendish-vigor": { freeCast: [{ spell: "false-life", selfOnly: true }] },
  "warlock-eldritch-invocations/gaze-of-two-minds": { activation: ["bonus-action"] },
  "warlock-eldritch-invocations/investment-of-the-chain-master": { activation: ["bonus-action", "reaction"] },
  "warlock-eldritch-invocations/gift-of-the-depths": { freeCast: [{ spell: "water-breathing" }], uses: longRest(1), untyped: ["speed"] },
  "warlock-eldritch-invocations/lessons-of-the-first-ones": { feat: { category: "origin" } },
  "warlock-eldritch-invocations/lifedrinker": { damage: { dice: "1d6", types: ["necrotic", "psychic", "radiant"] }, attacksWith: ["pact-weapon"], oncePerTurn: "any-turn", untyped: ["healing"] },
  "warlock-eldritch-invocations/mask-of-many-faces": { freeCast: [{ spell: "disguise-self" }] },
  "warlock-eldritch-invocations/master-of-myriad-forms": { freeCast: [{ spell: "alter-self" }] },
  "warlock-eldritch-invocations/misty-visions": { freeCast: [{ spell: "silent-image" }] },
  "warlock-eldritch-invocations/one-with-shadows": { freeCast: [{ spell: "invisibility", selfOnly: true, usableWhen: "While you’re in an area of Dim Light or Darkness" }] },
  "warlock-eldritch-invocations/otherworldly-leap": { freeCast: [{ spell: "jump", selfOnly: true }] },
  "warlock-eldritch-invocations/pact-of-the-blade": { activation: ["bonus-action"], damage: { types: ["necrotic", "psychic", "radiant"], orNormalType: true }, attacksWith: ["pact-weapon"] },
  "warlock-eldritch-invocations/pact-of-the-chain": { activation: ["magic-action"], freeCast: [{ spell: "find-familiar" }] },
  "warlock-eldritch-invocations/thirsting-blade": { attacks: 2, attacksWith: ["pact-weapon"] },
  "warlock-eldritch-invocations/visions-of-distant-realms": { freeCast: [{ spell: "arcane-eye" }] },
  "warlock-eldritch-invocations/whispers-of-the-grave": { freeCast: [{ spell: "speak-with-dead" }] },
  "warlock-eldritch-invocations/witch-sight": { senses: [{ type: "truesight", range: 30 }] },
}

// Tables printed inside features, read from the base source's text of the feature.

const crs: Record<string, number> = { "1/4": 0.25, "1/2": 0.5, "1": 1 }

function tableRows(text: string, pattern: RegExp): RegExpMatchArray[] {
  return text
    .split("\n")
    .map((line) => line.trim().match(pattern))
    .filter((match): match is RegExpMatchArray => match !== null)
}

function featureTables(baseText: Map<string, string>): Record<string, Mechanics> {
  const text = (id: string) => baseText.get(id) ?? ""
  return {
    "druid-wild-shape": {
      forms: tableRows(text("druid-wild-shape"), /^(\d+) \/ (\d+) \/ ([\d/]+) \/ (Yes|No)$/).map((row) => ({
        level: Number(row[1]),
        known: Number(row[2]),
        maxCr: crs[row[3]],
        flySpeed: row[4] === "Yes",
      })),
    },
    "sorcerer-font-of-magic": {
      slotCreation: tableRows(text("sorcerer-font-of-magic"), /^(\d) \| (\d+) \| (\d+)$/).map((row) => ({ slotLevel: Number(row[1]), cost: Number(row[2]), minLevel: Number(row[3]) })),
    },
    "circle-of-the-land-natures-ward": {
      landResistances: tableRows(text("land-natures-ward"), /^(Arid|Polar|Temperate|Tropical) \/ (\w+)$/).map((row) => ({
        land: row[1].toLowerCase() as "arid",
        damageType: row[2].toLowerCase() as "fire",
      })),
    },
  }
}

/**
 * Always-prepared spell tables from the base text. Rows read "3 | Aid, Bless" or "3 / Aid, Bless", sometimes two to
 * a line. A land table starts with its land: "Arid Land".
 */
function preparedTables(text: string): Subclass["alwaysPrepared"] {
  const rows: NonNullable<Subclass["alwaysPrepared"]> = []
  let land: "arid" | "polar" | "temperate" | "tropical" | undefined
  for (const raw of text.split("\n")) {
    const landMatch = raw.trim().match(/^(Arid|Polar|Temperate|Tropical) Land$/)
    if (landMatch) land = landMatch[1].toLowerCase() as typeof land
    for (const cell of raw.split(/\s*(?=\b\d+ [|/] )/)) {
      const row = cell.match(/^(\d+) [|/] (.+)$/)
      if (!row) continue
      const spells = row[2].split(",").map((name) => toId(name.trim()))
      rows.push({ level: Number(row[1]), spells, ...(land ? { land } : {}) })
    }
  }
  return rows.length ? rows : undefined
}

// The base source

type BaseRef = { index: string; name: string }
type BaseOption = { option_type: string; count?: number; unit?: string; of?: BaseRef; items?: BaseOption[]; choice?: unknown }

const skillOf = (ref: BaseRef) => ref.index.replace(/^skill-/, "")

function weaponsOf(indexes: string[]): Class["weapons"] {
  return (["simple", "martial"] as const).filter((category) => indexes.includes(`${category}-weapons`)).map((category) => ({ category }))
}

function armorOf(indexes: string[]): Class["armor"] {
  const all = indexes.includes("all-armor")
  const armor = (["light", "medium", "heavy"] as const).filter((kind) => all || indexes.includes(`${kind}-armor`))
  const list = [...armor, ...(indexes.includes("shields") ? (["shields"] as const) : [])]
  return list.length ? list : undefined
}

function itemsOf(option: BaseOption): Pick<Class["startingEquipment"][number], "items" | "money"> {
  const parts = option.option_type === "multiple" ? (option.items ?? []) : [option]
  const items = parts.filter((part) => part.option_type === "counted_reference").map((part) => ({ item: part.of?.index as string, quantity: part.count as number }))
  const gp = parts.filter((part) => part.option_type === "money").reduce((sum, part) => sum + (part.count ?? 0), 0)
  return { ...(items.length ? { items } : {}), money: { amount: gp, unit: "gp" } }
}

/** Spellcasting details from the base source's spellcasting text. */
function spellcastingOf(id: ClassId, base: any, spellList: NonNullable<Class["spellcasting"]>["spellList"]): Class["spellcasting"] {
  if (!base.spellcasting) return undefined
  const info = new Map<string, string>((base.spellcasting.info as { name: string; desc: string[] }[]).map((entry) => [entry.name, entry.desc.join(" ")]))
  const focus = (info.get("Spellcasting Focus") ?? "").match(/use (?:a|an) (.+?) as a Spellcasting Focus/)?.[1] ?? ""
  const changing = info.get("Changing Your Prepared Spells") ?? ""
  const cantrips = info.get("Cantrips") ?? ""
  const cantripChange = cantrips.match(/Whenever you (finish a Long Rest|gain a \w+ level), you can replace one of your cantrips/)
  return {
    feature: id === "warlock" ? "warlock-pact-magic" : `${id}-spellcasting`,
    ability: base.spellcasting.spellcasting_ability.index,
    focus: focus.split(/ or (?:your )?/).map(toId),
    slotsRestore: /Short or Long Rest/.test(info.get("Spell Slots") ?? "") ? "short-or-long-rest" : "long-rest",
    // Page 25: all levels of full casters count, half of Paladin and Ranger levels (round up), and Pact Magic none.
    ...(id === "warlock" ? {} : { multiclassLevels: id === "paladin" || id === "ranger" ? ("half-round-up" as const) : ("all" as const) }),
    changePrepared: { when: /finish a Long Rest/.test(changing) ? "long-rest" : "level-up", ...(/replace one spell/.test(changing) ? { count: 1 as const } : {}) },
    ...(cantripChange ? { changeCantrip: { when: cantripChange[1].startsWith("finish") ? ("long-rest" as const) : ("level-up" as const), count: 1 as const } } : {}),
    ...(id === "wizard" ? { ritualFromSpellbook: true as const } : {}),
    spellList,
  }
}

function levelRow(id: ClassId, base: any, features: string[], subclassFeature: boolean): ClassLevel {
  const special = base.class_specific ?? {}
  const casting = base.spellcasting
  const positive = (value: number | undefined) => (value ? value : undefined)
  const slots = casting ? Array.from({ length: 9 }, (_, index) => casting[`spell_slots_level_${index + 1}`] as number) : []
  const row: ClassLevel = {
    level: base.level,
    proficiencyBonus: base.prof_bonus,
    ...(features.length ? { features } : {}),
    ...(subclassFeature ? { subclassFeature: true as const } : {}),
    rages: positive(special.rage_count),
    rageDamage: positive(special.rage_damage_bonus),
    weaponMastery: positive(special.weapon_mastery),
    bardicDie: positive(special.bardic_inspiration_die) as ClassLevel["bardicDie"],
    channelDivinity: positive(special.channel_divinity_charges),
    wildShape: positive(special.wild_shape_uses),
    secondWind: positive(special.second_wind_uses),
    martialArts: special.martial_arts_die ? `1d${special.martial_arts_die}` : undefined,
    focusPoints: positive(special.focus_points),
    unarmoredMovement: positive(special.unarmored_movement_bonus),
    favoredEnemy: positive(special.favored_enemies),
    sneakAttack: special.sneak_attack ? `${special.sneak_attack.dice_count}d${special.sneak_attack.dice_value}` : undefined,
    sorceryPoints: positive(special.sorcery_points),
    invocations: positive(special.eldritch_invocations),
    cantrips: positive(casting?.cantrips_known),
    preparedSpells: positive(casting?.prepared_spells),
  }
  if (id === "warlock") {
    const level = slots.findIndex((count) => count > 0)
    row.pactSlots = slots[level]
    row.slotLevel = level + 1
  } else if (casting) row.spellSlots = id === "paladin" || id === "ranger" ? slots.slice(0, 5) : slots
  for (const key of Object.keys(row) as (keyof ClassLevel)[]) if (row[key] === undefined) delete row[key]
  return row
}

export default function build() {
  const baseClasses = readBase("Classes")
  const baseLevels = readBase("Levels")
  const baseFeatures = readBase("Features")
  const baseSubclasses = readBase("Subclasses")
  const baseSpells = readBase("Spells")

  const subclassOf = new Map<ClassId, any>(baseSubclasses.map((entry) => [entry.class.index as ClassId, entry]))
  const subclassId = (id: ClassId) => toId(subclassOf.get(id).name)
  const official = sections(new Map(classIds.map((id) => [id, subclassOf.get(id).name as string])))

  // Base feature names, with the base subclass feature texts, which hold the tables.
  const featureName = new Map<string, string>(baseFeatures.map((entry) => [entry.index as string, entry.name as string]))
  const baseText = new Map<string, string>(baseFeatures.map((entry) => [entry.index as string, entry.description as string]))
  const tables = featureTables(baseText)

  const classes: Class[] = []
  const features: ClassFeature[] = []
  const subclasses: Subclass[] = []

  for (const section of official) {
    const id = section.id
    const base = baseClasses.find((entry) => entry.index === id)
    const name = base.name as string
    const subclassBase = subclassOf.get(id)
    const subId = subclassId(id)
    const subclassFeatureId = `${id}-${toId(`${name} Subclass`)}`

    // The class table rows, from the base levels. The base marks both "Barbarian Subclass" and "Subclass feature" rows
    // with one feature, so the subclass level tells them apart.
    const rows = baseLevels.filter((entry) => entry.class?.index === id && !entry.subclass).sort((a, b) => a.level - b.level)
    const levelsOf = new Map<string, number[]>()
    const levels = rows.map((row) => {
      const ids: string[] = []
      let subclassFeature = false
      for (const ref of row.features as BaseRef[]) {
        if (ref.index === `${id}-subclass`) {
          if (row.level === subclassBase.features[0].level) ids.push(subclassFeatureId)
          else subclassFeature = true
          continue
        }
        ids.push(`${id}-${toId(featureName.get(ref.index) ?? ref.name)}`)
      }
      const unique = [...new Set(ids)]
      for (const feature of unique) levelsOf.set(feature, [...(levelsOf.get(feature) ?? []), row.level])
      return levelRow(id, row, unique, subclassFeature)
    })

    // Features, from the official headings. A name printed under two headings is one feature with later text.
    const byId = new Map<string, ClassFeature>()
    const addFeature = (block: Block, featureId: string, subclass?: string) => {
      const existing = byId.get(featureId)
      if (existing) {
        existing.laterText = [...(existing.laterText ?? []), { level: block.level, page: block.page, description: prose(block.paragraphs) }]
        return
      }
      let list = block.paragraphs
      let options: FeatureOption[] | undefined
      if (optionLabels[featureId]) ({ rest: list, options } = labeledOptions(featureId, list))
      if (optionTitles[featureId]) options = titledOptions(featureId, section.optionLines)
      const levelsGained = subclass ? [block.level] : levelsOf.get(featureId)
      if (!levelsGained) throw new Error(`classes: the base levels never list ${featureId}`)
      const feature: ClassFeature = {
        id: featureId,
        name: block.name,
        page: block.page,
        class: id,
        ...(subclass ? { subclass } : {}),
        level: block.level,
        levels: levelsGained,
        description: prose(list),
        ...(options ? { options } : {}),
        ...mechanics[featureId],
        ...tables[featureId],
      }
      byId.set(featureId, feature)
      features.push(feature)
    }
    for (const block of section.blocks) addFeature(block, `${id}-${toId(block.name)}`)
    for (const block of section.subclass.blocks) addFeature(block, `${subId}-${toId(block.name)}`, subId)
    for (const featureId of levelsOf.keys()) if (!byId.has(featureId)) throw new Error(`classes: no official heading for ${featureId}`)

    // Spell lists, from the base spells' class lists. They follow each spell's own header where it names a class
    // that the printed class list omits (Phantasmal Force, Mind Spike), since the entry's own block wins.
    const spellList = Array.from({ length: 10 }, (_, level) => ({
      level,
      spells: baseSpells
        .filter((spell) => spell.level === level && (spell.classes as BaseRef[]).some((ref) => ref.index === id))
        .map((spell) => toId(spell.name))
        .sort(),
    })).filter((entry) => entry.spells.length)

    const proficiencies = (base.proficiencies as BaseRef[]).map((ref) => ref.index)
    const skillChoice = base.proficiency_choices[0]
    const multiclass = base.multi_classing
    const multiclassIndexes = ((multiclass.proficiencies ?? []) as BaseRef[]).map((ref) => ref.index)
    const multiclassSkill = (multiclass.proficiency_choices ?? [])[0]
    const primary = base.primary_ability
    classes.push({
      id,
      name,
      page: section.page,
      primaryAbility: primary.ability_score_options
        ? { any: primary.ability_score_options.from.options.map((option: { item: BaseRef }) => option.item.index) }
        : { all: primary.ability_scores.map((ref: BaseRef) => ref.index) },
      hitDie: base.hit_die,
      savingThrows: (base.saving_throws as BaseRef[]).map((ref) => ref.index) as Class["savingThrows"],
      skills: { count: skillChoice.choose, from: skillChoice.from.options.map((option: { item: BaseRef }) => skillOf(option.item)).sort() },
      weapons: weaponsOf(proficiencies),
      armor: armorOf(proficiencies),
      tools: proficiencies.filter((index) => index === "herbalism-kit" || index.startsWith("tool-")).map((index) => ({ tool: index.replace(/^tool-/, "") })),
      startingEquipment: (base.starting_equipment_options[0].from.options as BaseOption[]).map((option, index) => ({
        option: (["A", "B", "C"] as const)[index],
        ...itemsOf(option),
      })),
      multiclass: {
        hitPointDie: true,
        weapons: weaponsOf(multiclassIndexes),
        armor: armorOf(multiclassIndexes),
        ...(multiclassSkill ? { skills: { count: multiclassSkill.choose, from: multiclassSkill.from.options.map((option: { item: BaseRef }) => skillOf(option.item)).sort() } } : {}),
        tools: multiclassIndexes.filter((index) => index.startsWith("tool-")).map((index) => ({ tool: index.replace(/^tool-/, "") })),
      },
      spellcasting: spellcastingOf(id, base, spellList),
      levels,
      subclasses: [subId],
      ...(section.sidebars.length ? { sidebars: section.sidebars } : {}),
    })

    subclasses.push({
      id: subId,
      name: section.subclass.name,
      page: section.subclass.page,
      class: id,
      level: subclassBase.features[0].level,
      tagline: section.subclass.tagline,
      description: section.subclass.description,
      features: [...new Set(section.subclass.blocks.map((block) => block.level))].map((level) => ({
        level,
        features: section.subclass.blocks.filter((block) => block.level === level).map((block) => `${subId}-${toId(block.name)}`),
      })),
      alwaysPrepared: preparedTables(
        baseFeatures
          .filter((feature) => feature.subclass?.index === subclassBase.index && / Spells$/.test(feature.name))
          .map((feature) => feature.description as string)
          .join("\n")
      ),
    })
  }

  for (const entry of [...classes, ...subclasses] as Record<string, unknown>[]) dropEmpty(entry)
  writeData("classes", classSchema, applyOverrides("classes", classes, classOverrides))
  writeData("class-features", classFeatureSchema, applyOverrides("class-features", features, featureOverrides))
  writeData("subclasses", subclassSchema, applyOverrides("subclasses", subclasses, subclassOverrides))
}

/** Leave out fields that do not apply: undefined values and empty lists, at any depth. */
function dropEmpty(value: unknown): void {
  if (!value || typeof value !== "object") return
  for (const [key, inner] of Object.entries(value)) {
    dropEmpty(inner)
    if (inner === undefined || (Array.isArray(inner) && inner.length === 0)) delete (value as Record<string, unknown>)[key]
  }
}
