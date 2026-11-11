import { existsSync } from "node:fs"
import { abilityIds, damageTypeIds } from "../../src/schema/common"
import { dataPath, readData, toId } from "../lib/data"
import { inOfficial, missingSentences, pageOf, pages, pagesOf, pageText, squash } from "../lib/official"
import type { Report } from "../lib/report"
import { hasUpstream, readBase, readOpen5e } from "../lib/sources"

// Reads the official pages with its own parser, apart from the builder. Typed fields are compared with what the
// entry's own text says, and the text is compared with the pages, so a wrong number cannot pass both.

const flat = (text: string) =>
  text
    .replace(/-\n(?=[a-z])/g, "")
    .replace(/[\t​]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const show = (value: unknown) => JSON.stringify(value) ?? "none"
const sortedCopy = <T>(list: T[]) => [...list].sort()

const abilityByName: Record<string, string> = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" }
const words: Record<string, number> = { one: 1, two: 2, three: 3 }
const damageTypeWords = damageTypeIds.map((id) => id[0].toUpperCase() + id.slice(1)).join("|")
const tableTitles = new Set(["Draconic Ancestors", "Elven Lineages", "Fiendish Legacies"])

/** The lines of pages `from` to `to`, with the tables the PDF sets inside the text left out (a table runs to the next tab paragraph or the page end). */
function textLines(from: number, to: number): string[] {
  const out: string[] = []
  for (let page = from; page <= to; page++) {
    let skipping = false
    for (const line of pages[page - 1].split("\n")) {
      if (tableTitles.has(line.trim())) skipping = true
      else if (line.startsWith("\t")) skipping = false
      if (!skipping) out.push(line)
    }
  }
  return out
}

/** Paragraphs that start with a tab, with their continuation lines, as flat text. */
function tabParagraphs(lines: string[]): string[] {
  const groups: string[][] = []
  for (const line of lines) {
    if (line.startsWith("\t")) groups.push([line])
    else if (groups.length && line.trim()) groups.at(-1)?.push(line)
  }
  return groups.map((group) => flat(group.join("\n")))
}

const named = (paragraph: string) => paragraph.match(/^([A-Z][A-Za-z0-9’ ]+?)\. /)

/** The uses a trait states about itself, apart from the sentence that gives a spell uses. */
const castSentence = /cast it (?:once )?without a spell slot/
function castUses(text: string) {
  const match = text.match(
    /cast it (once )?without a spell slot(?: a number of times equal to your Proficiency Bonus)?, and you regain (?:all expended uses|the ability to cast it in that way) when you finish a Long Rest/
  )
  if (!match) return undefined
  return { count: match[1] ? 1 : "proficiency-bonus", recharge: "long-rest" }
}
function ownUses(text: string) {
  const sentences = text.split(/(?<=\.)\s+/).filter((sentence) => !castSentence.test(sentence))
  const body = sentences.join(" ")
  const rest = body.match(/can’t (?:use it|do so) again until ([^.]+)\./)
  if (rest) {
    const recharge =
      rest[1] === "you finish a Long Rest"
        ? "long-rest"
        : rest[1] === "the start of your next turn"
          ? "start-of-next-turn"
          : rest[1] === "you roll Initiative or finish a Short or Long Rest"
            ? "initiative-or-short-or-long-rest"
            : rest[1]
    return { count: 1, recharge }
  }
  const times = body.match(/a number of times equal to your Proficiency Bonus, and you regain all expended uses when you finish an? ((?:Short or )?Long) Rest/)
  if (times) return { count: "proficiency-bonus", recharge: times[1] === "Long" ? "long-rest" : "short-or-long-rest" }
  return undefined
}

/**
 * What a text says in the fields an engine reads. Every field is read from the sentence that states it, with a
 * pattern of its own. `spellsOnItem` is true when the uses belong to spells listed on the item or its options.
 */
function derive(text: string, spellsOnItem: boolean): Record<string, unknown> {
  const t = flat(text)
  const out: Record<string, unknown> = {}
  const set = (key: string, value: unknown) => {
    if (value !== undefined) out[key] = value
  }
  const num = (pattern: RegExp) => {
    const match = t.match(pattern)
    return match ? Number(match[1]) : undefined
  }
  set("darkvision", num(/Darkvision (?:with a range of|increases to) (\d+) feet/))
  set("tremorsense", num(/Tremorsense with a range of (\d+) feet/))
  set("truesight", num(/Truesight with a range of (\d+) feet/))
  const resistance = [...t.matchAll(/Resistance to (\w+) damage/g)].map((match) => match[1].toLowerCase()).filter((type) => damageTypeIds.includes(type as never))
  if (resistance.length) set("resistance", resistance)
  const except = t.match(/Resistance to all damage except (\w+) and (\w+)/)
  if (except) set("resistanceExcept", [except[1].toLowerCase(), except[2].toLowerCase()])
  if (/the (?:damage )?type determined by your Draconic Ancestry trait/.test(t)) set("damageTypeFromChoice", "draconic-ancestry")
  const conditions = [...t.matchAll(/Advantage on saving throws you make to avoid or end the (\w+) condition/g)].map((match) => match[1].toLowerCase())
  const abilities = t.match(/Advantage on (Intelligence), (Wisdom), and (Charisma) saving throws/)
  if (conditions.length || abilities)
    set("savingThrowAdvantage", { ...(conditions.length ? { conditions } : {}), ...(abilities ? { abilities: [1, 2, 3].map((i) => abilityByName[abilities[i]]) } : {}) })
  const hp = t.match(/Hit Point maximum increases by (\d+), and it increases by (\d+) again whenever you gain a level/)
  if (hp) set("hitPointBonus", { initial: Number(hp[1]), perLevel: Number(hp[2]) })
  if (/\bas a Bonus Action\b/i.test(t) && !/^You can use this Bonus Action/.test(t)) set("activation", ["bonus-action"])
  else if (/take a Reaction to/.test(t)) set("activation", ["reaction"])
  set("level", num(/character level (\d+)\b/))
  set("durationMinutes", num(/(?:for|last for) (\d+) minutes/))
  const uses = ownUses(t) ?? (spellsOnItem ? undefined : castUses(t))
  set("uses", uses)
  if (/Intelligence, Wisdom, or Charisma is your spellcasting ability/.test(t)) set("spellcastingAbility", ["int", "wis", "cha"])
  const skills = t.match(/proficiency in the (\w+), (\w+), or (\w+) skill\./)
  if (skills) set("skillChoice", { count: 1, from: [1, 2, 3].map((i) => toId(skills[i])) })
  else if (/proficiency in one skill of your choice/.test(t)) set("skillChoice", { count: 1, from: "any" })
  set("speed", num(/Your Speed increases to (\d+) feet/))
  set("speedBonus", num(/your Speed increases by (\d+) feet/))
  set("speedReduction", num(/reduce its Speed by (\d+) feet/))
  if (/Fly Speed equal to your Speed/.test(t)) set("flySpeed", "speed")
  set("sizeChange", t.match(/change your size to (\w+)/)?.[1])
  set("longRestHours", num(/Long Rest in (\d+) hours/))
  if (/Temporary Hit Points equal to your Proficiency Bonus/.test(t)) set("temporaryHitPoints", "proficiency-bonus")
  if (/gain Heroic Inspiration whenever you finish a Long Rest/.test(t)) set("heroicInspiration", "long-rest")
  const damage = t.match(new RegExp(`(\\d+d\\d+) (${damageTypeWords}) damage to (?:that|the) (?:target|creature)`))
  if (damage) set("damage", { dice: damage[1], type: damage[2].toLowerCase() })
  const reduction = t.match(/roll (\d+d\d+)\. Add your (\w+) modifier to the number rolled and reduce the damage/)
  if (reduction) set("damageReduction", { dice: reduction[1], ability: abilityByName[reduction[2]] })
  set("teleportFeet", num(/teleport up to (\d+) feet/))
  set("rangeFeet", num(/within (\d+) feet of you/))
  const condition = t.match(/give (?:that target|yourself) the (\w+) condition/)
  if (condition) set("condition", condition[1].toLowerCase())
  const feat = t.match(/Origin feat of your choice \(see “Feats”\)\. (\w+) is recommended/)
  if (feat) set("featChoice", { category: "origin", recommended: toId(feat[1]) })
  const device = t.match(/\(AC (\d+), (\d+) HP\).*?(\w+) such devices in existence at a time, and each falls apart (\d+) hours after/)
  const minutes = t.match(/you can spend (\d+) minutes casting Prestidigitation/)
  if (device && minutes)
    set("clockworkDevice", { armorClass: Number(device[1]), hitPoints: Number(device[2]), maximum: words[device[3]], castMinutes: Number(minutes[1]), durationHours: Number(device[4]) })
  const cantrips = t.match(/learn (\w+) cantrips of your choice from the (\w+), (\w+), or (\w+) spell list/)
  if (cantrips) {
    set("cantrips", words[cantrips[1]])
    set(
      "spellLists",
      [2, 3, 4].map((i) => cantrips[i].toLowerCase())
    )
  }
  set("spellLevel", num(/Choose a level (\d) spell/))
  const choice = t.match(/proficiency in any combination of (\w+) skills or tools/)
  if (choice) set("proficiencyChoice", { count: words[choice[1]], kinds: ["skill", "tool"] })
  const attack = t.match(/\+(\d+) bonus to attack rolls you make with (Ranged|Melee) weapons/)
  if (attack) set("attackBonus", { bonus: Number(attack[1]), weapon: attack[2].toLowerCase() })
  const armor = t.match(/wearing (Light), (Medium), or (Heavy) armor, you gain a \+(\d+) bonus to Armor Class/)
  if (armor) set("armorClassBonus", { bonus: Number(armor[4]), armor: [1, 2, 3].map((i) => armor[i].toLowerCase()) })
  const floor = t.match(/with a Melee weapon that you are holding with two hands, you can treat any 1 or 2 on a damage die as a (\d)\. The weapon must have the (Two-Handed) or (Versatile) property/)
  if (floor) set("damageDieMinimum", { minimum: Number(floor[1]), weapon: "melee", heldWith: "two-hands", properties: [toId(floor[2]), toId(floor[3])] })
  const free = t.match(/level (\d)–(\d) spell slot, roll (\d+d\d+)\. If the number you roll is the same as the slot’s level/)
  if (free) {
    set("freeCasting", { minSlotLevel: Number(free[1]), maxSlotLevel: Number(free[2]) })
    set("dice", free[3])
  }
  if (/roll Initiative, you can add your Proficiency Bonus to the roll/.test(t)) set("initiativeBonus", "proficiency-bonus")
  if (/swap your Initiative with the Initiative of one willing ally.*can’t make this swap if you or the ally has the Incapacitated condition/.test(t))
    set("initiativeSwap", { allies: 1, blockedByCondition: "incapacitated" })
  if (/Once per turn when you hit a target with a weapon, you can roll the weapon’s damage dice twice and use either roll/.test(t)) set("damageDiceRolledTwice", { perTurn: 1 })
  const extra = t.match(/extra attack as a result of using a weapon that has the (\w+) property, you can add your ability modifier to the damage of that attack/)
  if (extra) set("addAbilityModifierToExtraAttack", { weaponProperty: extra[1].toLowerCase() })
  set("rerollD20On", num(/When you roll a (\d+) on the d20 of a D20 Test, you can reroll the die, and you must use the new roll/))
  if (/move through the space of any creature that is a size larger than you, but you can’t stop in the same space/.test(t)) set("moveThroughCreatures", { sizesLarger: 1, canStop: false })
  if (/Hide action even when you are obscured only by a creature that is at least one size larger than you/.test(t)) set("hideBehindCreatures", { minSizesLarger: 1 })
  if (/Advantage on any ability check you make to end the Grappled condition/.test(t)) set("grappledEscapeAdvantage", true)
  if (/count as one size larger when determining your carrying capacity/.test(t)) set("carryingCapacitySizeBonus", 1)
  if (/magic can’t put you to sleep/.test(t)) set("sleepImmunity", true)
  if (/must be on a stone surface or touching a stone surface/.test(t)) set("requires", "stone-surface")
  else if (/^While within Dim Light or Darkness/.test(t)) set("requires", "dim-light-or-darkness")
  if (/(?:^|\. )When you hit (?:a target|a Large or smaller creature) with an attack roll and deal damage/.test(t)) set("trigger", "hit-with-attack-roll")
  else if (/Once per turn when you hit a target with a weapon/.test(t)) set("trigger", "hit-with-weapon")
  else if (/(?:^|\. )When you take damage/.test(t)) set("trigger", "take-damage")
  set("targetMaxSize", t.match(/with an attack roll and deal damage to it, you can give that target the Prone condition/) ? t.match(/hit a (\w+) or smaller creature/)?.[1] : undefined)
  set("dice", t.match(/you can roll (\d+d\d+) and apply the total rolled/)?.[1] ?? out.dice)
  return out
}

const derivedKeys = [
  "darkvision",
  "tremorsense",
  "truesight",
  "resistance",
  "resistanceExcept",
  "damageTypeFromChoice",
  "savingThrowAdvantage",
  "hitPointBonus",
  "activation",
  "level",
  "durationMinutes",
  "uses",
  "spellcastingAbility",
  "skillChoice",
  "speed",
  "speedBonus",
  "speedReduction",
  "flySpeed",
  "sizeChange",
  "longRestHours",
  "temporaryHitPoints",
  "heroicInspiration",
  "damage",
  "damageReduction",
  "teleportFeet",
  "rangeFeet",
  "condition",
  "featChoice",
  "clockworkDevice",
  "cantrips",
  "spellLevel",
  "spellLists",
  "proficiencyChoice",
  "attackBonus",
  "armorClassBonus",
  "damageDieMinimum",
  "freeCasting",
  "dice",
  "initiativeBonus",
  "initiativeSwap",
  "damageDiceRolledTwice",
  "addAbilityModifierToExtraAttack",
  "rerollD20On",
  "moveThroughCreatures",
  "hideBehindCreatures",
  "grappledEscapeAdvantage",
  "carryingCapacitySizeBonus",
  "sleepImmunity",
  "requires",
  "trigger",
  "targetMaxSize",
]

/** Compare the derived fields of one item with its typed fields, both ways. Returns how many fields were compared. */
function compareMechanics(label: string, item: any, spellsOnItem: boolean, failures: string[]): number {
  const expected = derive(item.text, spellsOnItem)
  let total = 0
  for (const key of derivedKeys) {
    if (!(key in expected) && !(key in item)) continue
    total++
    if (!same(expected[key], item[key])) failures.push(`${label}: ${key} is ${show(item[key])}, the text gives ${show(expected[key])}`)
  }
  return total
}

/** Every dice expression in the typed fields, found anywhere in the item, compared with the dice the text names. */
function diceIn(value: unknown, found = new Set<string>()): Set<string> {
  if (typeof value === "string" && /^\d+d\d+$/.test(value)) found.add(value)
  else if (Array.isArray(value)) for (const entry of value) diceIn(entry, found)
  else if (value && typeof value === "object") for (const [key, entry] of Object.entries(value)) if (key !== "text") diceIn(entry, found)
  return found
}
const diceOfText = (text: string) => new Set(flat(text).match(/\d+d\d+/g) ?? [])

const spellCell = /^[A-Z][A-Za-z ]+$/

export default function verify(report: Report) {
  verifySpecies(report)
  verifyBackgrounds(report)
  verifyFeats(report)
  verifyRules(report)
}

// Rules ---------------------------------------------------------------------------------------------------

function verifyRules(report: Report) {
  const rules = readData("origin-rules")
  const failures: string[] = []
  const proseFailures: string[] = []
  const pageFailures: string[] = []
  const typedFailures: string[] = []
  let typed = 0
  const words: Record<string, number> = { one: 1, two: 2, three: 3 }
  const sentences = [
    "A background lists three of your character’s ability scores",
    "A background gives your character a specified Origin feat",
    "A background gives your character proficiency in two specified skills",
    "Each background gives a character proficiency with one tool",
    "Each background offers a choice between a package of equipment and 50 GP",
    "Every species in “Character Origins” is Humanoid",
    "Members of most species live for about 80 years",
    "If you’re instructed to choose a feat from a specific category",
    "To take a feat, you must meet any prerequisite in its description",
    "A feat can be taken only once unless its description states otherwise",
  ]
  // Every official rule sentence that carries a number or limit is in a rule, and every rule starts with one of them.
  for (const sentence of sentences) if (!rules.some((rule) => rule.text.startsWith(sentence))) failures.push(`no rule starts with the official sentence "${sentence}"`)
  for (const rule of rules) if (!sentences.some((sentence) => rule.text.startsWith(sentence))) failures.push(`rule ${rule.id} does not start with an official rule sentence`)
  for (const rule of rules) {
    for (const sentence of missingSentences(rule.text)) proseFailures.push(`${rule.id}: not in the official text: ${sentence}`)
    if (!inOfficial(rule.text)) proseFailures.push(`${rule.id}: the whole text is not one passage of the official text`)
    if (!pagesOf(rule.text).includes(rule.page) || pageOf(rule.text) !== rule.page) pageFailures.push(`${rule.id}: page ${rule.page}, the text begins on ${pageOf(rule.text)}`)
    // One official paragraph: the text has no break, and it sits inside one tab-delimited segment of its page.
    const segments = pages[rule.page - 1].split("\n\t").map(squash)
    if (rule.text.includes("\n") || !segments.some((segment) => segment.includes(squash(rule.text)))) proseFailures.push(`${rule.id}: the text is not one official paragraph`)
    if (rule.id !== toId(rule.name)) failures.push(`${rule.id}: id is not toId(name)`)

    // Typed numbers, read from the rule text with patterns of their own.
    const t = flat(rule.text)
    const expected: Record<string, unknown> = {}
    const score = t.match(
      /lists (\w+) of your character’s ability scores\. Increase one by (\d+) and another one by (\d+), or increase all (\w+) by (\d+)\. None of these increases can raise a score above (\d+)/
    )
    if (score) expected.abilityScoreIncrease = { listed: words[score[1]], options: [[Number(score[2]), Number(score[3])], Array(words[score[4]]).fill(Number(score[5]))], maximum: Number(score[6]) }
    const grant = t.match(/gives your character a specified Origin feat|proficiency in (\w+) specified skills|proficiency with (\w+) tool/)
    if (grant?.[0].includes("Origin feat")) expected.grants = { kind: "feat", count: 1, featCategory: "origin" }
    else if (grant?.[1]) expected.grants = { kind: "skill-proficiency", count: words[grant[1]] }
    else if (grant?.[2]) expected.grants = { kind: "tool-proficiency", count: words[grant[2]] }
    const gold = t.match(/choice between a package of equipment and (\d+) GP/)
    if (gold) expected.moneyInsteadOfEquipment = { amount: Number(gold[1]), unit: "gp" }
    const type = t.match(/Every species in “Character Origins” is (\w+);/)
    if (type) expected.creatureType = type[1].toLowerCase()
    const life = t.match(/live for about (\d+) years/)
    if (life) expected.typicalLifeSpanYears = Number(life[1])
    const levels = t.match(/you must have at least (\d+) level in that class/)
    if (levels) expected.minimumClassLevels = Number(levels[1])
    if (/can be taken only once unless/.test(t)) expected.defaultTimesTaken = 1
    if (/no category is specified, you can choose from any category/.test(t)) expected.anyCategoryWhenUnspecified = true
    const { id: _id, name: _name, page: _page, text: _text, ...actual } = rule
    typed += Math.max(Object.keys(expected).length, Object.keys(actual).length)
    if (!same(actual, expected)) typedFailures.push(`${rule.id}: typed fields ${show(actual)}, the text gives ${show(expected)}`)
  }
  report.check("origin-rules", `rules match the official sentences (${sentences.length} official)`, sentences.length + rules.length, failures)
  report.check("origin-rules", "rule text is the official wording", rules.length, proseFailures)
  report.check("origin-rules", "page where the rule begins", rules.length, pageFailures)
  report.check("origin-rules", "typed numbers and limits match the rule text", typed, typedFailures)

  // The rules agree with the data they describe: three scores, two skills, one tool, 50 GP, one Origin feat.
  const backgrounds = readData("backgrounds")
  const ruleFailures: string[] = []
  const rule = (id: string) => rules.find((r) => r.id === id)
  for (const b of backgrounds) {
    if (b.abilityScores.length !== rule("background-ability-scores")?.abilityScoreIncrease?.listed) ruleFailures.push(`${b.name}: ability score count`)
    if (b.skills.length !== rule("background-skill-proficiencies")?.grants?.count) ruleFailures.push(`${b.name}: skill count`)
    if (!same(b.equipment[1].money, rule("background-equipment")?.moneyInsteadOfEquipment)) ruleFailures.push(`${b.name}: gold instead of equipment`)
  }
  for (const e of readData("species")) if (e.creatureType !== rule("species-creature-type")?.creatureType) ruleFailures.push(`${e.name}: creature type`)
  report.check("origin-rules", "background and species data obey the rules", backgrounds.length * 3 + 9, ruleFailures)
}

// Species -------------------------------------------------------------------------------------------------

function verifySpecies(report: Report) {
  const species = readData("species")
  const heads: { name: string; page: number }[] = []
  for (let page = 83; page <= 90; page++) for (const match of `\n${pages[page - 1]}`.matchAll(/\n([A-Z][a-z]+)\nCreature Type: /g)) heads.push({ name: match[1], page })

  const failures: string[] = []
  for (const head of heads) if (!species.some((entry) => entry.name === head.name)) failures.push(`official species ${head.name} is not in the data`)
  for (const entry of species) if (!heads.some((head) => head.name === entry.name)) failures.push(`data species ${entry.name} is not in the official text`)
  if (heads.length !== 9) failures.push(`expected 9 official species, parsed ${heads.length}`)
  report.check("species", `coverage both ways (${heads.length} official)`, heads.length + species.length, failures)

  const pageFailures: string[] = []
  for (const entry of species) {
    const head = heads.find((h) => h.name === entry.name)
    if (head && head.page !== entry.page) pageFailures.push(`${entry.name}: page ${entry.page}, the heading is on ${head.page}`)
  }
  report.check("species", "page where the entry begins", species.length, pageFailures)

  const headerFailures: string[] = []
  const nameFailures: string[] = []
  const textFailures: string[] = []
  const coverFailures: string[] = []
  const mechFailures: string[] = []
  const dragonFailures: string[] = []
  const breathFailures: string[] = []
  const optionFailures: string[] = []
  const spellFailures: string[] = []
  const refFailures: string[] = []
  const paraFailures: string[] = []
  let paraTotal = 0
  let headerTotal = 0
  let nameTotal = 0
  let textTotal = 0
  let coverTotal = 0
  let mechTotal = 0
  let optionTotal = 0
  let spellTotal = 0
  let diceTotal = 0
  const diceFailures: string[] = []

  heads.forEach((head, n) => {
    const entry = species.find((e) => e.name === head.name)
    if (!entry) return
    const last = heads[n + 1]?.page ?? head.page
    const raw = pages.slice(head.page - 1, last).join("\n")
    const from = `\n${raw}`.indexOf(`\n${head.name}\nCreature Type: `)
    const next = heads[n + 1]
    const to = next ? `\n${raw}`.indexOf(`\n${next.name}\nCreature Type: `) : raw.length + 1
    const block = `\n${raw}`.slice(from, to)
    const blockSquash = squash(block)

    // Header: creature type, sizes, speed.
    const header = flat(block.slice(0, block.search(/As an? \w+, you have/)))
    const type = header.match(/Creature Type: (\w+)/)?.[1]
    const sizeText = header.match(/Size: (.+?) Speed:/)?.[1] ?? ""
    const sizes = [...sizeText.matchAll(/(Tiny|Small|Medium|Large|Huge|Gargantuan) \((about [^)]+)\)/g)].map((match) => ({ size: match[1], height: match[2] }))
    const speed = Number(header.match(/Speed: (\d+) feet/)?.[1])
    headerTotal += 3
    if (type?.toLowerCase() !== entry.creatureType) headerFailures.push(`${entry.name}: creature type ${entry.creatureType}, official ${type}`)
    if (!same(sizes, entry.sizes) || sizes.length === 0) headerFailures.push(`${entry.name}: sizes ${show(entry.sizes)}, official ${show(sizes)}`)
    if (speed !== entry.speed) headerFailures.push(`${entry.name}: speed ${entry.speed}, official ${speed}`)

    // The trait names, in order, from the tab paragraphs that open with "Name. ".
    const lines = textLines(head.page, last)
    const start = lines.findIndex((line) => line.trim() === head.name)
    const end = next ? lines.findIndex((line, i) => i > start && line.trim() === next.name && lines[i + 1]?.startsWith("Creature Type:")) : lines.length
    const own = lines.slice(start, end < 0 ? lines.length : end)
    const paragraphs = tabParagraphs(own)
    const traitNames = paragraphs.flatMap((paragraph) => {
      const match = paragraph.match(/^([A-Z][A-Za-z’ ]{1,40})\. /)
      return match ? [match[1]] : []
    })
    nameTotal++
    if (
      !same(
        traitNames,
        entry.traits.map((trait: any) => trait.name)
      )
    )
      nameFailures.push(`${entry.name}: traits ${show(entry.traits.map((t: any) => t.name))}, official ${show(traitNames)}`)

    // Paragraph breaks: each official paragraph start is a paragraph start in the data, in order, and the counts agree.
    const starts = (list: string[]) => list.map((paragraph) => squash(paragraph).slice(0, 30))
    const dataParagraphs = entry.traits.flatMap((trait: any) => `${trait.name}. ${trait.text}`.split("\n"))
    paraTotal += Math.max(paragraphs.length, dataParagraphs.length)
    if (!same(starts(paragraphs), starts(dataParagraphs))) paraFailures.push(`${entry.name}: ${dataParagraphs.length} paragraphs in the data, ${paragraphs.length} official, or the starts differ`)

    // Prose: every sentence is in the species own block, and every official paragraph is in the data.
    const dataText: string[] = []
    for (const trait of entry.traits) {
      const parts = [`${trait.name}. ${trait.text}`]
      for (const option of trait.choice?.options ?? []) if (option.text) parts.push(`${option.name}${option.giant ? ` (${option.giant})` : ""}. ${option.text}`)
      dataText.push(...parts)
      for (const [label, text] of [[trait.name, trait.text], ...(trait.choice?.options ?? []).filter((o: any) => o.text).map((o: any) => [`${trait.name}/${o.name}`, o.text])]) {
        textTotal++
        const pageSquash = squash(pageText(head.page, Math.min(head.page + 1, 86)))
        for (const sentence of missingSentences(text as string)) textFailures.push(`${entry.name} ${label}: not in the official text: ${sentence}`)
        for (const sentence of (text as string).split(/(?<=[.!?])\s+|\n+/).filter((s) => squash(s).length >= 12))
          if (!blockSquash.includes(squash(sentence)) && !pageSquash.includes(squash(sentence))) textFailures.push(`${entry.name} ${label}: not in this species' pages: ${sentence}`)
      }
    }
    const dataSquash = squash(dataText.join(" "))
    for (const paragraph of paragraphs) {
      coverTotal++
      if (!dataSquash.includes(squash(paragraph))) coverFailures.push(`${entry.name}: official paragraph missing from the data: ${paragraph.slice(0, 70)}`)
    }

    // Typed fields, from each trait and option text.
    for (const trait of entry.traits) {
      const spellsOnItem = Boolean(trait.choice) || Boolean(trait.spells)
      mechTotal += compareMechanics(`${entry.name} ${trait.name}`, trait, spellsOnItem, mechFailures)
      for (const option of trait.choice?.options ?? []) if (option.text) mechTotal += compareMechanics(`${entry.name} ${trait.name}/${option.name}`, option, Boolean(option.spells), mechFailures)
      const dice = diceIn({ ...trait, choice: undefined })
      const expectedDice = diceOfText(trait.text)
      diceTotal++
      if (!same(sortedCopy([...dice]), sortedCopy([...expectedDice]))) diceFailures.push(`${entry.name} ${trait.name}: dice ${show([...dice])}, text ${show([...expectedDice])}`)
      for (const option of trait.choice?.options ?? []) {
        if (!option.text) continue
        diceTotal++
        const optionDice = diceIn(option)
        const optionExpected = diceOfText(option.text)
        if (!same(sortedCopy([...optionDice]), sortedCopy([...optionExpected])))
          diceFailures.push(`${entry.name} ${trait.name}/${option.name}: dice ${show([...optionDice])}, text ${show([...optionExpected])}`)
      }

      // Breath weapon.
      if (trait.breathWeapon) {
        const t = flat(trait.text)
        const shapes = t.match(/(\d+)-foot Cone or a (\d+)-foot Line that is (\d+) feet wide/)
        const save = t.match(/make a (\w+) saving throw \(DC (\d+) plus your (\w+) modifier and Proficiency Bonus\)/)
        const first = t.match(/takes (\d+d\d+) damage of the type/)
        const steps = t.match(/character levels (\d+) \((\d+d\d+)\), (\d+) \((\d+d\d+)\), and (\d+) \((\d+d\d+)\)/)
        const expected = {
          shapes: shapes
            ? [
                { shape: "cone", feet: Number(shapes[1]) },
                { shape: "line", feet: Number(shapes[2]), width: Number(shapes[3]) },
              ]
            : [],
          save: save ? { ability: abilityByName[save[1]], dc: Number(save[2]) === 8 ? { plusModifierOf: abilityByName[save[3]] } : Number(save[2]) } : null,
          damage:
            first && steps
              ? [
                  { level: 1, dice: first[1] },
                  { level: Number(steps[1]), dice: steps[2] },
                  { level: Number(steps[3]), dice: steps[4] },
                  { level: Number(steps[5]), dice: steps[6] },
                ]
              : [],
          onSave: /On a successful save, a creature takes half as much damage/.test(t) ? "half" : "",
        }
        if (!same(trait.breathWeapon, expected)) breathFailures.push(`${entry.name} ${trait.name}: ${show(trait.breathWeapon)}, official ${show(expected)}`)
      }
    }
    if (entry.name === "Dragonborn") {
      const table = pages[head.page - 1].split("\n")
      const titleAt = table.findIndex((line) => line.trim() === "Draconic Ancestors")
      const cells = table
        .slice(
          titleAt + 1,
          table.findIndex((line, i) => i > titleAt && line.startsWith("\t"))
        )
        .map((line) => line.trim())
        .filter(Boolean)
      const body = cells.slice(cells.lastIndexOf("Damage Type") + 1)
      const pairs = []
      for (let i = 0; i < body.length; i += 2) pairs.push([body[i], body[i + 1].toLowerCase()])
      const options = entry.traits[0].choice.options
      const base = hasUpstream("5e-bits") ? readBase("Subspecies") : []
      optionTotal += pairs.length
      if (pairs.length !== 10 || options.length !== 10) dragonFailures.push(`expected 10 dragon ancestries, official ${pairs.length}, data ${options.length}`)
      for (const [dragon, type] of pairs) {
        const option = options.find((o: any) => o.name === dragon)
        if (!option) dragonFailures.push(`${dragon}: missing from the data`)
        else if (option.damageType !== type) dragonFailures.push(`${dragon}: damage type ${option.damageType}, official ${type}`)
        const upstream = base.find((s: any) => s.index === `draconic-ancestor-${toId(dragon)}`)
        if (upstream && upstream.damage_type.index !== type) dragonFailures.push(`${dragon}: the base source says ${upstream.damage_type.index}, official ${type}`)
      }
    }

    // Lineage and legacy tables: one row per option, with the level 1 text and the level 3 and 5 spells.
    for (const [title, traitName] of [
      ["Elven Lineages", "Elven Lineage"],
      ["Fiendish Legacies", "Fiendish Legacy"],
    ]) {
      if (!pages[head.page - 1].includes(`\n${title}\n`) && !pages[head.page].includes(`\n${title}\n`)) continue
      const trait = entry.traits.find((t: any) => t.name === traitName)
      if (!trait) continue
      const tablePage = [head.page, head.page + 1].find((p) => `\n${pages[p - 1]}`.includes(`\n${title}\n`)) as number
      const cells = pages[tablePage - 1]
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
      const rows = cells.slice(cells.indexOf("Level 5") + 1)
      const rowStarts = rows.flatMap((line, i) => (/^[A-Z][a-z]+(?: [A-Z][a-z]+)?$/.test(line) && /^(You|Your|The) /.test(rows[i + 1] ?? "") ? [i] : []))
      const levels = cells.slice(cells.indexOf("Lineage") + 1, cells.indexOf("Lineage") + 4).concat(cells.slice(cells.indexOf("Legacy") + 1, cells.indexOf("Legacy") + 4))
      optionTotal += rowStarts.length
      if (rowStarts.length !== trait.choice.options.length || rowStarts.length !== 3) optionFailures.push(`${entry.name}: ${rowStarts.length} official rows, ${trait.choice.options.length} options`)
      if (!levels.includes("Level 1") || !levels.includes("Level 3") || !levels.includes("Level 5")) optionFailures.push(`${entry.name}: the table columns are not levels 1, 3 and 5`)
      const parentUses = castUses(flat(trait.text))
      rowStarts.forEach((rowStart, k) => {
        const row = rows.slice(rowStart, rowStarts[k + 1] ?? rows.length)
        const option = trait.choice.options.find((o: any) => o.name === row[0])
        if (!option) {
          optionFailures.push(`${entry.name}: official row ${row[0]} is not an option`)
          return
        }
        const level1 = flat(row.slice(1, -2).join("\n"))
        if (squash(option.text) !== squash(level1)) optionFailures.push(`${entry.name} ${row[0]}: level 1 text differs from the table`)
        const expectedSpells = [
          ...[...level1.matchAll(/know the ([A-Z][A-Za-z ]+?) cantrip/g)].map((match) => ({ spell: toId(match[1]), level: 1, cantrip: true })),
          { spell: toId(row.at(-2) as string), level: 3, uses: parentUses },
          { spell: toId(row.at(-1) as string), level: 5, uses: parentUses },
        ]
        spellTotal += expectedSpells.length
        if (!same(option.spells, expectedSpells)) spellFailures.push(`${entry.name} ${row[0]}: spells ${show(option.spells)}, official ${show(expectedSpells)}`)
        if (!spellCell.test(row.at(-2) as string) || !spellCell.test(row.at(-1) as string)) spellFailures.push(`${entry.name} ${row[0]}: level 3 and 5 cells are not spell names`)
      })
    }

    // Options that the text lists without a table: gnome lineages and giant ancestries.
    for (const trait of entry.traits) {
      if (!trait.choice || entry.name === "Dragonborn" || entry.name === "Elf" || entry.name === "Tiefling") continue
      const names = [...flat(own.join("\n")).matchAll(/(?:^| )((?:Forest|Rock) Gnome|[A-Z][a-z]+’s [A-Z][a-z]+)(?: \(([A-Z][a-z]+ Giant)\))?\. (?=[A-Z])/g)].map((match) => ({
        name: match[1],
        giant: match[2],
      }))
      optionTotal += names.length
      const optionNames = trait.choice.options.map((o: any) => o.name)
      if (
        !same(
          names.map((n) => n.name),
          optionNames
        )
      )
        optionFailures.push(`${entry.name}: options ${show(optionNames)}, official ${show(names.map((n) => n.name))}`)
      for (const { name, giant } of names) {
        const option = trait.choice.options.find((o: any) => o.name === name)
        if (option && option.giant !== giant) optionFailures.push(`${entry.name} ${name}: giant ${show(option.giant)}, official ${show(giant)}`)
        if (option?.spells) {
          const t = flat(option.text)
          const cantripNames = [...t.matchAll(/know the ([A-Z][A-Za-z ]+?) cantrip\b/g)].map((m) => m[1])
          const pair = t.match(/know the ([A-Z][a-z]+) and ([A-Z][a-z]+) cantrips/)
          const prepared = t.match(/always have the ([A-Z][A-Za-z ]+?) spell prepared/)
          const expected = [
            ...(pair ? [pair[1], pair[2]] : cantripNames).map((spell) => ({ spell: toId(spell), level: 1, cantrip: true })),
            ...(prepared ? [{ spell: toId(prepared[1]), level: 1, uses: castUses(t) }] : []),
          ]
          spellTotal += expected.length
          if (!same(option.spells, expected)) spellFailures.push(`${entry.name} ${name}: spells ${show(option.spells)}, text ${show(expected)}`)
        }
      }
    }

    // A trait that names a spell it grants (Otherworldly Presence).
    for (const trait of entry.traits) {
      if (!trait.spells) continue
      const t = flat(trait.text)
      const expected = [...t.matchAll(/know the ([A-Z][A-Za-z ]+?) cantrip/g)].map((match) => ({ spell: toId(match[1]), level: 1, cantrip: true }))
      spellTotal += expected.length
      if (!same(trait.spells, expected)) spellFailures.push(`${entry.name} ${trait.name}: spells ${show(trait.spells)}, text ${show(expected)}`)
    }

    // References inside the species.
    for (const trait of entry.traits) {
      if (trait.damageTypeFromChoice && !entry.traits.some((t: any) => t.choice?.id === trait.damageTypeFromChoice))
        refFailures.push(`${entry.name} ${trait.name}: no choice trait ${trait.damageTypeFromChoice}`)
    }
  })

  report.check("species", "creature type, sizes with heights, speed", headerTotal, headerFailures)
  report.check("species", "trait names and order", nameTotal, nameFailures)
  report.check("species", "trait paragraph breaks match the official paragraph starts", paraTotal, paraFailures)
  report.check("species", "trait and option prose is the official wording, in the species' own pages", textTotal, textFailures)
  report.check("species", "every official trait paragraph is in the data", coverTotal, coverFailures)
  report.check("species", "typed fields match what each trait and option text says", mechTotal, mechFailures)
  report.check("species", "dice in typed fields are the dice in the text", diceTotal, diceFailures)
  report.check("species", "breath weapon shapes, save, DC and damage by level", 1, breathFailures)
  report.check("species", "choice options: dragon ancestries, lineage tables, gnome and giant options", optionTotal, [...dragonFailures, ...optionFailures])
  report.check("species", "granted spells, levels and uses", spellTotal, spellFailures)
  report.check(
    "species",
    "references inside species",
    species.reduce((sum, e) => sum + e.traits.filter((t: any) => t.damageTypeFromChoice).length, 0),
    refFailures
  )

  // Spell ids and the recommended feat, against the other categories when they exist.
  const spellIds = collectSpellIds(species)
  if (existsSync(dataPath("spells"))) {
    const known = new Set(readData("spells").map((spell) => spell.id))
    report.check(
      "species",
      "granted spell ids exist in spells.json",
      spellIds.length,
      spellIds.filter((id) => !known.has(id)).map((id) => `spell ${id} is not in spells.json`)
    )
  }
  const feats = readData("feats")
  const versatile = species.flatMap((e) => e.traits).filter((t: any) => t.featChoice)
  report.check(
    "species",
    "recommended feat resolves",
    versatile.length,
    versatile.filter((t: any) => !feats.some((f) => f.id === t.featChoice.recommended)).map((t: any) => `${t.name}: no feat ${t.featChoice.recommended}`)
  )

  // Open5e: names, sizes, speed.
  if (hasUpstream("open5e")) {
    const open = readOpen5e("Species")
    const traits = readOpen5e("SpeciesTrait")
    const openFailures: string[] = []
    let openTotal = 0
    for (const entry of species) {
      const rows = traits.filter((row) => row.fields.parent === `srd-2024_${entry.id}`)
      const size = rows.find((row) => row.fields.type === "SIZE")?.fields.desc ?? ""
      const speedRow = rows.find((row) => row.fields.type === "SPEED")?.fields.desc ?? ""
      const names = rows.filter((row) => !row.fields.type).map((row) => row.fields.name)
      openTotal += 3 + entry.traits.length
      if (!open.some((row) => row.fields.name === entry.name)) openFailures.push(`${entry.name}: not in Open5e`)
      for (const { size: s, height } of entry.sizes) if (!squash(size).includes(squash(`${s} (${height})`))) openFailures.push(`${entry.name}: Open5e size "${size}" lacks ${s} (${height})`)
      if (squash(speedRow) !== squash(`${entry.speed} feet`)) openFailures.push(`${entry.name}: Open5e speed "${speedRow}", data ${entry.speed}`)
      if (
        !same(
          names,
          entry.traits.map((t: any) => t.name)
        )
      )
        openFailures.push(`${entry.name}: Open5e traits ${show(names)}, data ${show(entry.traits.map((t: any) => t.name))}`)
      for (const trait of entry.traits) {
        const row = rows.find((r) => r.fields.name === trait.name)
        if (row && !squash(trait.text).startsWith(squash(row.fields.desc).slice(0, 50))) openFailures.push(`${entry.name} ${trait.name}: Open5e text begins differently`)
      }
    }
    report.crossCheck("species", "Open5e agrees on names, sizes, speed, trait names and trait text", openTotal, openFailures, [])
  } else report.skip("species", "Open5e agrees on names, sizes, speed, trait names and trait text")

  if (hasUpstream("5e-bits")) {
    const base = readBase("Species")
    const baseFailures: string[] = []
    for (const entry of species) {
      const row = base.find((b: any) => b.index === entry.id)
      if (!row) {
        baseFailures.push(`${entry.name}: not in the base source`)
        continue
      }
      if (row.speed !== entry.speed) baseFailures.push(`${entry.name}: base speed ${row.speed}, data ${entry.speed}`)
      if (row.type.toLowerCase() !== entry.creatureType) baseFailures.push(`${entry.name}: base type ${row.type}`)
    }
    report.crossCheck("species", "base source agrees on speed and creature type", species.length * 2, baseFailures, [])
  } else report.skip("species", "base source agrees on speed and creature type")
}

function collectSpellIds(species: any[]): string[] {
  const ids: string[] = []
  const walk = (value: any) => {
    if (Array.isArray(value)) for (const entry of value) walk(entry)
    else if (value && typeof value === "object") {
      if (typeof value.spell === "string") ids.push(value.spell)
      for (const entry of Object.values(value)) walk(entry)
    }
  }
  walk(species)
  return [...new Set(ids)]
}

// Backgrounds ---------------------------------------------------------------------------------------------

function verifyBackgrounds(report: Report) {
  const backgrounds = readData("backgrounds")
  const page = flat(pages[82])
  const region = page.slice(page.indexOf("Background Descriptions") + "Background Descriptions".length, page.indexOf("Character Species")).trim()
  const officials = [
    ...region.matchAll(
      /(?:^| )([A-Z][a-z]+) Ability Scores: (.+?) Feat: (.+?) Skill Proficiencies: (.+?) Tool Proficiency: (.+?) Equipment: Choose A or B: \(A\) (.+?); or \(B\) (\d+) GP(?= [A-Z][a-z]+ Ability Scores:|$)/g
    ),
  ]

  const failures: string[] = []
  for (const official of officials) if (!backgrounds.some((b) => b.name === official[1])) failures.push(`official background ${official[1]} is not in the data`)
  for (const entry of backgrounds) if (!officials.some((o) => o[1] === entry.name)) failures.push(`data background ${entry.name} is not in the official text`)
  if (officials.length !== 4) failures.push(`expected 4 official backgrounds, parsed ${officials.length}`)
  report.check("backgrounds", `coverage both ways (${officials.length} official)`, officials.length + backgrounds.length, failures)

  const pageFailures = backgrounds.filter((b) => b.page !== 83 || !pages[82].includes(`\n${b.name}\nAbility Scores:`)).map((b) => `${b.name}: page ${b.page}`)
  report.check("backgrounds", "page where the entry begins", backgrounds.length, pageFailures)

  const fieldFailures: string[] = []
  const equipFailures: string[] = []
  let fields = 0
  let items = 0
  const feats = readData("feats")
  for (const official of officials) {
    const entry = backgrounds.find((b) => b.name === official[1])
    if (!entry) continue
    const [, , scores, feat, skills, tool, equipA, gpB] = official
    const abilities = scores.split(", ").map((name) => abilityByName[name])
    const featMatch = feat.replace(/ \(see “Feats”\)$/, "").match(/^(.+?)(?: \((Cleric|Druid|Wizard)\))?$/) as RegExpMatchArray
    const toolText = tool.replace(/ \(see “Equipment”\)$/, "")
    const kind = toolText.match(/^Choose one kind of (.+)$/)
    const expected: Record<string, unknown> = {
      abilityScores: abilities,
      feat: { id: toId(featMatch[1]), ...(featMatch[2] ? { spellList: featMatch[2].toLowerCase() } : {}) },
      skills: skills.split(" and ").map((skill) => toId(skill)),
      toolProficiency: kind ? { oneOfKind: toId(kind[1]) } : { tool: toId(toolText) },
    }
    for (const [key, value] of Object.entries(expected)) {
      fields++
      if (!same((entry as any)[key], value)) fieldFailures.push(`${entry.name}: ${key} is ${show((entry as any)[key])}, official ${show(value)}`)
    }
    // Equipment: options A and B in order, option A item by item, and the gold of both.
    const parts = equipA.split(", ")
    const gpA = Number(parts.pop()?.match(/^(\d+) GP$/)?.[1])
    const [optionA, optionB] = entry.equipment
    fields += 2
    if (entry.equipment.length !== 2 || optionA.option !== "A" || optionB.option !== "B") equipFailures.push(`${entry.name}: options are not A then B`)
    if (!same(optionA.money, { amount: gpA, unit: "gp" })) equipFailures.push(`${entry.name}: option A money ${show(optionA.money)}, official ${gpA} GP`)
    if (!same(optionB, { option: "B", money: { amount: Number(gpB), unit: "gp" } })) equipFailures.push(`${entry.name}: option B is ${show(optionB)}, official ${gpB} GP`)
    if (optionA.items.length !== parts.length) equipFailures.push(`${entry.name}: ${optionA.items.length} items, official ${parts.length}`)
    parts.forEach((part, i) => {
      items++
      const item = optionA.items[i]
      const count = part.match(/^(\d+) /)?.[1]
      const sheets = part.match(/\((\d+) sheets\)/)?.[1]
      const paren = part.match(/\(([^)]*)\)/)?.[1]
      const words = toId(part.replace(/^\d+ /, "").replace(/\s*\(.*\)$/, ""))
      if (!item) return
      const id = paren === "same as above" ? item.chooseFrom?.[0] : item.item
      if (paren === "same as above" ? item.item !== undefined : item.chooseFrom !== undefined) equipFailures.push(`${entry.name}: item ${i + 1} sets the wrong one of item and chooseFrom`)
      // The equipment table sorts "Clothes, Traveler’s" under its first word (page 95).
      const reversed = words === "travelers-clothes" ? "clothes-travelers" : words
      if (!id || !reversed.startsWith(id)) equipFailures.push(`${entry.name}: item ${i + 1} is ${id}, official "${part}"`)
      if (item.quantity !== Number(sheets ?? count ?? 1)) equipFailures.push(`${entry.name}: ${id} quantity ${item.quantity}, official "${part}"`)
      const noteExpected = sheets ? "sheets" : paren
      if (item.note !== noteExpected) equipFailures.push(`${entry.name}: ${id} note ${show(item.note)}, official ${show(noteExpected)}`)
      if (paren === "same as above" && JSON.stringify(item.chooseFrom) !== JSON.stringify([entry.toolProficiency.oneOfKind]))
        equipFailures.push(`${entry.name}: "same as above" must choose from the tool kind ${show(entry.toolProficiency.oneOfKind)}`)
    })
  }
  report.check("backgrounds", "ability scores, feat, skills, tool proficiency", fields, fieldFailures)
  report.check("backgrounds", "equipment items, quantities, notes and gold of both options", items + backgrounds.length * 2, equipFailures)

  const refFailures: string[] = []
  let refs = 0
  for (const entry of backgrounds) {
    refs++
    const feat = feats.find((f) => f.id === entry.feat.id)
    if (!feat) refFailures.push(`${entry.name}: feat ${entry.feat.id} is not in feats.json`)
    else if (feat.category !== "origin") refFailures.push(`${entry.name}: feat ${feat.id} is not an Origin feat`)
    if (entry.feat.spellList && entry.feat.id !== "magic-initiate") refFailures.push(`${entry.name}: spellList on ${entry.feat.id}`)
    if (entry.feat.id === "magic-initiate" && !entry.feat.spellList) refFailures.push(`${entry.name}: Magic Initiate has no spell list`)
  }
  report.check("backgrounds", "origin feat references resolve", refs, refFailures)

  if (existsSync(dataPath("equipment"))) {
    const equipment = readData("equipment")
    const ids = new Set(equipment.map((e) => e.id))
    const needed = [
      ...new Set(
        backgrounds.flatMap((b) => [
          ...b.equipment[0].items.flatMap((i: any) => i.chooseFrom ?? [i.item]),
          ...(b.toolProficiency.tool ? [b.toolProficiency.tool] : []),
          ...(b.toolProficiency.oneOfKind ? [b.toolProficiency.oneOfKind] : []),
        ])
      ),
    ]
    report.check(
      "backgrounds",
      "equipment and tool ids exist in equipment.json",
      needed.length,
      needed.filter((id) => !ids.has(id)).map((id) => `${id} is not in equipment.json`)
    )

    // Ammunition counts single pieces. The Ammunition table sells them in bundles, so the count must be whole bundles.
    const unitFailures: string[] = []
    let units = 0
    const tableAmount = Number(pages.join("\n").match(/\nArrows\n(\d+)\nQuiver\n/)?.[1])
    for (const b of backgrounds) {
      for (const item of b.equipment[0].items) {
        const entry = equipment.find((e) => e.id === item.item)
        if (!entry) continue
        units++
        if (entry.kind === "ammunition") {
          if (item.unit !== "single") unitFailures.push(`${b.name}: ${item.item} is ammunition and needs unit "single"`)
          if (item.item === "arrows" && entry.bundleSize !== tableAmount) unitFailures.push(`${b.name}: equipment Arrows amount ${entry.bundleSize}, the official table gives ${tableAmount}`)
          if (item.quantity % entry.bundleSize !== 0) unitFailures.push(`${b.name}: ${item.quantity} ${item.item} is not whole bundles of ${entry.bundleSize}`)
        } else if (item.unit) unitFailures.push(`${b.name}: ${item.item} is not ammunition but has a unit`)
      }
    }
    report.check("backgrounds", "ammunition counts single pieces and equals whole bundles of the equipment entry", units, unitFailures)
  }
  if (existsSync(dataPath("skills"))) {
    const known = new Set(readData("skills").map((skill) => skill.id))
    const used = [...new Set(backgrounds.flatMap((b) => b.skills))]
    report.check(
      "backgrounds",
      "skill ids exist in skills.json",
      used.length,
      used.filter((id) => !known.has(id)).map((id) => `skill ${id} is not in skills.json`)
    )
  }
  const knownAbilities = new Set(abilityIds as readonly string[])
  report.check(
    "backgrounds",
    "ability ids are valid and distinct",
    backgrounds.length,
    backgrounds.filter((b) => b.abilityScores.some((a: string) => !knownAbilities.has(a)) || new Set(b.abilityScores).size !== 3).map((b) => `${b.name}: ${show(b.abilityScores)}`)
  )

  // Open5e and the base source.
  if (hasUpstream("open5e")) {
    const open = readOpen5e("BackgroundBenefit")
    const openFailures: string[] = []
    let openTotal = 0
    for (const entry of backgrounds) {
      const rows = open.filter((row) => row.fields.parent === `srd-2024_${entry.id}`)
      const get = (type: string) => rows.find((row) => row.fields.type === type)?.fields.desc ?? ""
      const official = officials.find((o) => o[1] === entry.name)
      if (!official) continue
      openTotal += 5
      const [, , scores, feat, skills, tool, equipA, gpB] = official
      if (squash(get("ability_score")) !== squash(scores)) openFailures.push(`${entry.name}: Open5e ability scores "${get("ability_score")}"`)
      if (squash(get("feat")) !== squash(feat.replace(/ \(see “Feats”\)$/, ""))) openFailures.push(`${entry.name}: Open5e feat "${get("feat")}"`)
      if (squash(get("skill_proficiency")) !== squash(skills)) openFailures.push(`${entry.name}: Open5e skills "${get("skill_proficiency")}"`)
      if (squash(get("tool_proficiency")) !== squash(tool.replace(/ \(see “Equipment”\)$/, ""))) openFailures.push(`${entry.name}: Open5e tool "${get("tool_proficiency")}"`)
      if (squash(get("equipment")) !== squash(`Choose A or B: (A) ${equipA}; or (B) ${gpB} GP`)) openFailures.push(`${entry.name}: Open5e equipment "${get("equipment")}"`)
    }
    report.crossCheck("backgrounds", "Open5e agrees on every background field", openTotal, openFailures, [])
  } else report.skip("backgrounds", "Open5e agrees on every background field")

  if (hasUpstream("5e-bits")) {
    const base = readBase("Backgrounds")
    const baseFailures: string[] = []
    let baseTotal = 0
    for (const entry of backgrounds) {
      const row = base.find((b: any) => b.index === entry.id)
      if (!row) {
        baseFailures.push(`${entry.name}: not in the base source`)
        continue
      }
      baseTotal += 3
      if (
        !same(
          row.ability_scores.map((a: any) => a.index),
          entry.abilityScores
        )
      )
        baseFailures.push(`${entry.name}: base ability scores differ`)
      if (row.feat.index !== entry.feat.id) baseFailures.push(`${entry.name}: base feat ${row.feat.index}`)
      const skills = row.proficiencies.filter((p: any) => p.index.startsWith("skill-")).map((p: any) => p.index.slice(6))
      if (!same(skills, entry.skills)) baseFailures.push(`${entry.name}: base skills ${show(skills)}`)
    }
    report.crossCheck("backgrounds", "base source agrees on ability scores, feat and skills", baseTotal, baseFailures, [])
  } else report.skip("backgrounds", "base source agrees on ability scores, feat and skills")
}

// Feats ---------------------------------------------------------------------------------------------------

const categoryIds: Record<string, string> = { Origin: "origin", General: "general", "Fighting Style": "fighting-style", "Epic Boon": "epic-boon" }

function verifyFeats(report: Report) {
  const feats = readData("feats")
  type Official = { name: string; page: number; category: string; prerequisite?: string; body: string[]; paragraphs: string[] }
  const officials: Official[] = []
  const sections = new Set(["Origin Feats", "General Feats", "Fighting Style Feats", "Epic Boon Feats"])
  for (const page of [87, 88]) {
    const lines = pages[page - 1].split("\n").filter((line) => !sections.has(line.trim()))
    lines.forEach((line, i) => {
      if (/^(Origin|General|Fighting Style|Epic Boon) Feat\b/.test(line) || !/^(Origin|General|Fighting Style|Epic Boon) Feat\b/.test(lines[i + 1] ?? "")) return
      if (page === 87 && lines.slice(0, i).some((l) => l.trim() === "Feat Descriptions") === false) return
      let j = i + 1
      let header = lines[j]
      while (header.includes("(") && !header.includes(")")) header += ` ${lines[++j]}`
      const match = flat(header).match(/^(Origin|General|Fighting Style|Epic Boon) Feat(?: \(Prerequisite: (.+)\))?$/)
      if (!match) return
      officials.push({ name: line.trim(), page, category: categoryIds[match[1]], prerequisite: match[2], body: [], paragraphs: [] })
      const entry = officials.at(-1) as Official
      const nextHead = lines.findIndex((l, k) => k > j && /^(Origin|General|Fighting Style|Epic Boon) Feat\b/.test(lines[k + 1] ?? "") && !/^(Origin|General|Fighting Style|Epic Boon) Feat\b/.test(l))
      entry.body = lines.slice(j + 1, nextHead < 0 ? lines.length : nextHead)
    })
  }
  // A body that runs to the end of page 87 continues on page 88 only when the next heading is on the same page, so each body is complete.
  for (const entry of officials) {
    const groups: string[][] = []
    for (const [index, line] of entry.body.entries()) {
      if (!line.trim()) continue
      if (index === 0 || line.startsWith("\t")) groups.push([line])
      else groups.at(-1)?.push(line)
    }
    entry.paragraphs = groups.map((group) => flat(group.join("\n")))
  }

  const failures: string[] = []
  for (const official of officials) if (!feats.some((f) => f.name === official.name)) failures.push(`official feat ${official.name} is not in the data`)
  for (const entry of feats) if (!officials.some((o) => o.name === entry.name)) failures.push(`data feat ${entry.name} is not in the official text`)
  if (officials.length !== 17) failures.push(`expected 17 official feats, parsed ${officials.length}`)
  report.check("feats", `coverage both ways (${officials.length} official)`, officials.length + feats.length, failures)

  const pageFailures: string[] = []
  const fieldFailures: string[] = []
  const textFailures: string[] = []
  const coverFailures: string[] = []
  const mechFailures: string[] = []
  const diceFailures: string[] = []
  const asiFailures: string[] = []
  const paraFailures: string[] = []
  let paraTotal = 0
  let fields = 0
  let textTotal = 0
  let coverTotal = 0
  let mechTotal = 0
  let diceTotal = 0
  let asiTotal = 0

  for (const official of officials) {
    const entry = feats.find((f) => f.name === official.name)
    if (!entry) continue
    if (entry.page !== official.page) pageFailures.push(`${entry.name}: page ${entry.page}, the heading is on ${official.page}`)
    if (entry.id !== toId(entry.name)) fieldFailures.push(`${entry.name}: id ${entry.id}`)

    // Category, prerequisite and repeatable.
    fields += 3
    if (entry.category !== official.category) fieldFailures.push(`${entry.name}: category ${entry.category}, official ${official.category}`)
    const prereq = official.prerequisite
    const expectedPrereq = prereq
      ? {
          text: prereq,
          ...(prereq.match(/Level (\d+)\+/) ? { level: Number(prereq.match(/Level (\d+)\+/)?.[1]) } : {}),
          ...(prereq.match(/(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?: or (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma))? (\d+)\+/)
            ? (() => {
                const m = prereq.match(
                  /(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma)(?: or (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma))? (\d+)\+/
                ) as RegExpMatchArray
                return { abilityMinimum: { abilities: [abilityByName[m[1]], ...(m[2] ? [abilityByName[m[2]]] : [])], minimum: Number(m[3]) } }
              })()
            : {}),
          ...(/Fighting Style Feature|Spellcasting Feature/.test(prereq)
            ? { features: [...(prereq.includes("Fighting Style Feature") ? ["fighting-style"] : []), ...(prereq.includes("Spellcasting Feature") ? ["spellcasting"] : [])] }
            : {}),
        }
      : undefined
    if (!same(entry.prerequisite, expectedPrereq)) fieldFailures.push(`${entry.name}: prerequisite ${show(entry.prerequisite)}, official ${show(expectedPrereq)}`)
    const repeatParagraph = official.paragraphs.find((p) => p.startsWith("Repeatable. "))
    const expectedRepeat = repeatParagraph ? { text: repeatParagraph.slice("Repeatable. ".length), ...(/different spell list/.test(repeatParagraph) ? { differentSpellList: true } : {}) } : undefined
    if (!same(entry.repeatable, expectedRepeat)) fieldFailures.push(`${entry.name}: repeatable ${show(entry.repeatable)}, official ${show(expectedRepeat)}`)

    // Benefits: the named tab paragraphs, in order, and the text before them.
    const rest = official.paragraphs.filter((p) => !p.startsWith("Repeatable. "))
    const intro = rest[0]
    const benefitParagraphs = rest.slice(1).filter((p) => named(p))
    fields += 2
    const expectedText = intro === "You gain the following benefits." ? intro : rest.join("\n")
    if (entry.text !== expectedText) fieldFailures.push(`${entry.name}: text differs from the official opening`)
    if (intro === "You gain the following benefits.") {
      const names = benefitParagraphs.map((p) => (named(p) as RegExpMatchArray)[1])
      if (
        !same(
          names,
          (entry.benefits ?? []).map((b: any) => b.name)
        )
      )
        fieldFailures.push(`${entry.name}: benefits ${show((entry.benefits ?? []).map((b: any) => b.name))}, official ${show(names)}`)
      for (const paragraph of benefitParagraphs) {
        const benefitName = (named(paragraph) as RegExpMatchArray)[1]
        const benefit = (entry.benefits ?? []).find((b: any) => b.name === benefitName)
        if (benefit && squash(benefit.text) !== squash(paragraph.slice(benefitName.length + 2))) fieldFailures.push(`${entry.name} ${benefitName}: text is not the official paragraph`)
      }
    } else if (entry.benefits) fieldFailures.push(`${entry.name}: has named benefits but the official text has none`)

    // Paragraph breaks: the official paragraph starts, in order, against the data.
    const dataParagraphs = [
      ...(entry.text ?? "").split("\n"),
      ...(entry.benefits ?? []).flatMap((b: any) => `${b.name}. ${b.text}`.split("\n")),
      ...(entry.repeatable ? `Repeatable. ${entry.repeatable.text}`.split("\n") : []),
    ]
    const startsOf = (list: string[]) => list.map((paragraph) => squash(paragraph).slice(0, 30))
    paraTotal += Math.max(official.paragraphs.length, dataParagraphs.length)
    if (!same(startsOf(official.paragraphs), startsOf(dataParagraphs)))
      paraFailures.push(`${entry.name}: ${dataParagraphs.length} paragraphs in the data, ${official.paragraphs.length} official, or the starts differ`)

    // Prose in the feat's own pages, and every official paragraph in the data.
    const dataText = [entry.text, ...(entry.benefits ?? []).map((b: any) => `${b.name}. ${b.text}`), ...(entry.repeatable ? [`Repeatable. ${entry.repeatable.text}`] : [])].filter(Boolean)
    const pageSquash = squash(pageText(entry.page, Math.min(entry.page + 1, 88)))
    for (const text of [entry.text, ...(entry.benefits ?? []).map((b: any) => b.text), entry.repeatable?.text].filter(Boolean) as string[]) {
      textTotal++
      for (const sentence of missingSentences(text)) textFailures.push(`${entry.name}: not in the official text: ${sentence}`)
      for (const sentence of text.split(/(?<=[.!?])\s+|\n+/).filter((s) => squash(s).length >= 12))
        if (!pageSquash.includes(squash(sentence))) textFailures.push(`${entry.name}: not in this feat's pages: ${sentence}`)
    }
    const dataSquash = squash(dataText.join(" "))
    for (const paragraph of official.paragraphs) {
      coverTotal++
      if (!dataSquash.includes(squash(paragraph))) coverFailures.push(`${entry.name}: official paragraph missing from the data: ${paragraph.slice(0, 70)}`)
    }

    // Typed fields. A feat with named benefits keeps them on the benefits, and a single description keeps them on the feat.
    if (entry.benefits) for (const benefit of entry.benefits) mechTotal += compareMechanics(`${entry.name} ${benefit.name}`, benefit, false, mechFailures)
    else mechTotal += compareMechanics(entry.name, entry, false, mechFailures)
    const dice = diceIn({ ...entry, text: undefined })
    const expectedDice = diceOfText([entry.text ?? "", ...(entry.benefits ?? []).map((b: any) => b.text)].join(" "))
    diceTotal++
    if (!same(sortedCopy([...dice]), sortedCopy([...expectedDice]))) diceFailures.push(`${entry.name}: dice ${show([...dice])}, text ${show([...expectedDice])}`)

    // Ability score increase, read from the sentence that starts "Increase".
    const body = flat([entry.text ?? "", ...(entry.benefits ?? []).map((b: any) => b.text)].join(" "))
    const split = body.match(/Increase one ability score of your choice by (\d+), or increase two ability scores of your choice by (\d+)\. This feat can’t increase an ability score above (\d+)\./)
    const any = body.match(/Increase one ability score of your choice by (\d+), to a maximum of (\d+)\./)
    const listed = body.match(/Increase your ([A-Za-z, ]+?) score by (\d+), to a maximum of (\d+)\./)
    let expectedAsi: unknown
    if (split)
      expectedAsi = {
        from: "any",
        choices: [
          { count: 1, amount: Number(split[1]) },
          { count: 2, amount: Number(split[2]) },
        ],
        maximum: Number(split[3]),
      }
    else if (any) expectedAsi = { from: "any", choices: [{ count: 1, amount: Number(any[1]) }], maximum: Number(any[2]) }
    else if (listed) expectedAsi = { from: listed[1].split(/, or |, | or /).map((name) => abilityByName[name]), choices: [{ count: 1, amount: Number(listed[2]) }], maximum: Number(listed[3]) }
    asiTotal++
    if (!same(entry.abilityScoreIncrease, expectedAsi)) asiFailures.push(`${entry.name}: ability score increase ${show(entry.abilityScoreIncrease)}, text ${show(expectedAsi)}`)
  }

  report.check("feats", "page where the entry begins", feats.length, pageFailures)
  report.check("feats", "category, prerequisite, repeatable, benefit names and opening text", fields, fieldFailures)
  report.check("feats", "paragraph breaks match the official paragraph starts", paraTotal, paraFailures)
  report.check("feats", "prose is the official wording, in the feat's own pages", textTotal, textFailures)
  report.check("feats", "every official paragraph is in the data", coverTotal, coverFailures)
  report.check("feats", "typed fields match what each benefit text says", mechTotal, mechFailures)
  report.check("feats", "dice in typed fields are the dice in the text", diceTotal, diceFailures)
  report.check("feats", "ability score increase options and cap", asiTotal, asiFailures)

  // References inside feats: none point at other feats, but the spell lists and abilities are enums. Check ids are unique and formed from names.
  const refFailures: string[] = []
  for (const entry of feats) if (entry.id !== toId(entry.name)) refFailures.push(`${entry.name}: id ${entry.id}`)
  report.check("feats", "ids are toId(name) and unique", feats.length, [...refFailures, ...(new Set(feats.map((f) => f.id)).size === feats.length ? [] : ["duplicate feat ids"])])

  // Open5e: category, prerequisite, benefit names and text. It lists the description of a feat without named benefits as an unnamed row.
  if (hasUpstream("open5e")) {
    const open = readOpen5e("Feat")
    const benefits = readOpen5e("FeatBenefit")
    const openFailures: string[] = []
    const openWaived: string[] = []
    const upstreamErrors = new Set(["Boon of Irresistible Offense/Ability Score Increase", "Boon of Spell Recall/Ability Score Increase"])
    let openTotal = 0
    for (const entry of feats) {
      const row = open.find((r) => r.pk === `srd-2024_${entry.id}`)
      if (!row) {
        openFailures.push(`${entry.name}: not in Open5e`)
        continue
      }
      openTotal += 3
      if (toId(row.fields.type) !== entry.category) openFailures.push(`${entry.name}: Open5e category ${row.fields.type}`)
      if ((row.fields.prerequisite || undefined) !== entry.prerequisite?.text)
        openFailures.push(`${entry.name}: Open5e prerequisite "${row.fields.prerequisite}", data ${show(entry.prerequisite?.text)}`)
      const rows = benefits.filter((b) => b.fields.parent === row.pk)
      const names = rows
        .map((b) => b.fields.name)
        .filter((name) => name && name !== "Repeatable")
        .map((name) => name.replace(/\bOne\b/, "1"))
      if (
        !same(
          names,
          (entry.benefits ?? []).map((b: any) => b.name)
        )
      )
        openFailures.push(`${entry.name}: Open5e benefits ${show(names)}, data ${show((entry.benefits ?? []).map((b: any) => b.name))}`)
      for (const benefit of entry.benefits ?? []) {
        const upstream = rows.find((b) => b.fields.name.replace(/\bOne\b/, "1") === benefit.name)
        if (!upstream || squash(upstream.fields.desc) === squash(benefit.text)) continue
        if (upstreamErrors.has(`${entry.name}/${benefit.name}`))
          openWaived.push(`${entry.name} ${benefit.name}: Open5e says "one ability score of your choice", the official text (page 88) limits it to the listed abilities`)
        else openFailures.push(`${entry.name} ${benefit.name}: Open5e text differs`)
      }
      const unnamed = rows.find((b) => !b.fields.name)
      if (unnamed && squash(unnamed.fields.desc) !== squash(entry.text ?? "")) openFailures.push(`${entry.name}: Open5e description differs`)
      const repeat = rows.find((b) => b.fields.name === "Repeatable")
      if (Boolean(repeat) !== Boolean(entry.repeatable) || (repeat && squash(repeat.fields.desc) !== squash(entry.repeatable?.text ?? "")))
        openFailures.push(`${entry.name}: Open5e repeatable differs`)
    }
    report.crossCheck("feats", "Open5e agrees on category, prerequisite, benefits, description and repeatable, or the official text settles it", openTotal, openFailures, openWaived)
  } else report.skip("feats", "Open5e agrees on category, prerequisite, benefits, description and repeatable, or the official text settles it")

  if (hasUpstream("5e-bits")) {
    const base = readBase("Feats")
    const baseFailures: string[] = []
    for (const entry of feats) {
      const row = base.find((b: any) => b.index === entry.id)
      if (!row) baseFailures.push(`${entry.name}: not in the base source`)
      else if (toId(row.type) !== entry.category) baseFailures.push(`${entry.name}: base category ${row.type}`)
      else if ((row.prerequisites?.minimum_level ?? undefined) !== entry.prerequisite?.level)
        baseFailures.push(`${entry.name}: base minimum level ${row.prerequisites?.minimum_level}, data ${entry.prerequisite?.level}`)
    }
    report.crossCheck("feats", "base source agrees on category and minimum level", feats.length, baseFailures, [])
  } else report.skip("feats", "base source agrees on category and minimum level")
}
