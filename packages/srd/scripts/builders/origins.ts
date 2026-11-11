import { backgroundSchema, featSchema, originRuleSchema, speciesSchema } from "../../src/schema/origins"
import { toId, writeData } from "../lib/data"
import { pageOf, pages } from "../lib/official"

// The base source (5e-bits) restructures the species traits, drops the Human Small size and the Dragonborn
// Breath Weapon, and keeps no mechanics. So every entry here is read from the official pages, and the typed
// mechanics are written by hand below next to the trait they describe. The check reads the same pages again,
// with its own parser, and compares both the text and every typed value.

type Mechanics = Record<string, unknown>

/** Join PDF lines into one line of text. Hyphenation at a line end is removed, and the zero width spaces the PDF carries. */
function joinLines(lines: string[]): string {
  let out = ""
  for (const raw of lines) {
    const line = raw.replace(/[\t​]/g, " ").replace(/\s+/g, " ").trim()
    if (!line) continue
    if (!out) out = line
    else if (/[a-z]-$/.test(out) && /^[a-z]/.test(line)) out = out.slice(0, -1) + line
    else out = `${out} ${line}`
  }
  return out
}

/** Split lines into paragraphs. A tab starts one, and so does any line `isStart` accepts. The first line always does. */
function paragraphs(lines: string[], isStart: (line: string) => boolean = () => false): string[] {
  const groups: string[][] = []
  for (const line of lines) {
    if (!line.trim()) continue
    if (!groups.length || line.startsWith("\t") || isStart(line)) groups.push([])
    groups.at(-1)?.push(line)
  }
  return groups.map(joinLines)
}

const lineIndex = (lines: string[], predicate: (line: string) => boolean, from = 0) => {
  const index = lines.findIndex((line, i) => i >= from && predicate(line))
  if (index < 0) throw new Error("expected line not found")
  return index
}

// Species ------------------------------------------------------------------------------------------------

const abilityChoice = ["int", "wis", "cha"]
const proficiencyBonusLong = { count: "proficiency-bonus", recharge: "long-rest" }
const onceLong = { count: 1, recharge: "long-rest" }

type TraitSpec = { name: string; mech?: Mechanics; options?: Record<string, Mechanics>; choice?: "table" | "text" }
const speciesSpecs: { name: string; traits: TraitSpec[] }[] = [
  {
    name: "Dragonborn",
    traits: [
      { name: "Draconic Ancestry", choice: "table" },
      {
        name: "Breath Weapon",
        mech: {
          damageTypeFromChoice: "draconic-ancestry",
          uses: proficiencyBonusLong,
          breathWeapon: {
            shapes: [
              { shape: "cone", feet: 15 },
              { shape: "line", feet: 30, width: 5 },
            ],
            save: { ability: "dex", dc: { plusModifierOf: "con" } },
            damage: [
              { level: 1, dice: "1d10" },
              { level: 5, dice: "2d10" },
              { level: 11, dice: "3d10" },
              { level: 17, dice: "4d10" },
            ],
            onSave: "half",
          },
        },
      },
      { name: "Damage Resistance", mech: { damageTypeFromChoice: "draconic-ancestry" } },
      { name: "Darkvision", mech: { darkvision: 60 } },
      { name: "Draconic Flight", mech: { level: 5, activation: ["bonus-action"], durationMinutes: 10, flySpeed: "speed", uses: onceLong } },
    ],
  },
  {
    name: "Dwarf",
    traits: [
      { name: "Darkvision", mech: { darkvision: 120 } },
      { name: "Dwarven Resilience", mech: { resistance: ["poison"], savingThrowAdvantage: { conditions: ["poisoned"] } } },
      { name: "Dwarven Toughness", mech: { hitPointBonus: { initial: 1, perLevel: 1 } } },
      { name: "Stonecunning", mech: { activation: ["bonus-action"], requires: "stone-surface", tremorsense: 60, durationMinutes: 10, uses: proficiencyBonusLong } },
    ],
  },
  {
    name: "Elf",
    traits: [
      { name: "Darkvision", mech: { darkvision: 60 } },
      {
        name: "Elven Lineage",
        choice: "table",
        mech: { spellcastingAbility: abilityChoice },
        options: { Drow: { darkvision: 120 }, "High Elf": {}, "Wood Elf": { speed: 35 } },
      },
      { name: "Fey Ancestry", mech: { savingThrowAdvantage: { conditions: ["charmed"] } } },
      { name: "Keen Senses", mech: { skillChoice: { count: 1, from: ["insight", "perception", "survival"] } } },
      { name: "Trance", mech: { longRestHours: 4, sleepImmunity: true } },
    ],
  },
  {
    name: "Gnome",
    traits: [
      { name: "Darkvision", mech: { darkvision: 60 } },
      { name: "Gnomish Cunning", mech: { savingThrowAdvantage: { abilities: ["int", "wis", "cha"] } } },
      {
        name: "Gnomish Lineage",
        choice: "text",
        mech: { spellcastingAbility: abilityChoice },
        options: {
          "Forest Gnome": {
            spells: [
              { spell: "minor-illusion", level: 1, cantrip: true },
              { spell: "speak-with-animals", level: 1, uses: proficiencyBonusLong },
            ],
          },
          "Rock Gnome": {
            spells: [
              { spell: "mending", level: 1, cantrip: true },
              { spell: "prestidigitation", level: 1, cantrip: true },
            ],
            clockworkDevice: { armorClass: 5, hitPoints: 1, maximum: 3, castMinutes: 10, durationHours: 8 },
          },
        },
      },
    ],
  },
  {
    name: "Goliath",
    traits: [
      {
        name: "Giant Ancestry",
        choice: "text",
        mech: { uses: proficiencyBonusLong },
        options: {
          "Cloud’s Jaunt": { activation: ["bonus-action"], teleportFeet: 30 },
          "Fire’s Burn": { trigger: "hit-with-attack-roll", damage: { dice: "1d10", type: "fire" } },
          "Frost’s Chill": { trigger: "hit-with-attack-roll", damage: { dice: "1d6", type: "cold" }, speedReduction: 10 },
          "Hill’s Tumble": { trigger: "hit-with-attack-roll", targetMaxSize: "Large", condition: "prone" },
          "Stone’s Endurance": { activation: ["reaction"], trigger: "take-damage", damageReduction: { dice: "1d12", ability: "con" } },
          "Storm’s Thunder": { activation: ["reaction"], trigger: "take-damage", damage: { dice: "1d8", type: "thunder" }, rangeFeet: 60 },
        },
      },
      { name: "Large Form", mech: { level: 5, activation: ["bonus-action"], sizeChange: "Large", durationMinutes: 10, speedBonus: 10, uses: onceLong } },
      { name: "Powerful Build", mech: { grappledEscapeAdvantage: true, carryingCapacitySizeBonus: 1 } },
    ],
  },
  {
    name: "Halfling",
    traits: [
      { name: "Brave", mech: { savingThrowAdvantage: { conditions: ["frightened"] } } },
      { name: "Halfling Nimbleness", mech: { moveThroughCreatures: { sizesLarger: 1, canStop: false } } },
      { name: "Luck", mech: { rerollD20On: 1 } },
      { name: "Naturally Stealthy", mech: { hideBehindCreatures: { minSizesLarger: 1 } } },
    ],
  },
  {
    name: "Human",
    traits: [
      { name: "Resourceful", mech: { heroicInspiration: "long-rest" } },
      { name: "Skillful", mech: { skillChoice: { count: 1, from: "any" } } },
      { name: "Versatile", mech: { featChoice: { category: "origin", recommended: "skilled" } } },
    ],
  },
  {
    name: "Orc",
    traits: [
      { name: "Adrenaline Rush", mech: { activation: ["bonus-action"], temporaryHitPoints: "proficiency-bonus", uses: { count: "proficiency-bonus", recharge: "short-or-long-rest" } } },
      { name: "Darkvision", mech: { darkvision: 120 } },
      { name: "Relentless Endurance", mech: { uses: onceLong } },
    ],
  },
  {
    name: "Tiefling",
    traits: [
      { name: "Darkvision", mech: { darkvision: 60 } },
      {
        name: "Fiendish Legacy",
        choice: "table",
        mech: { spellcastingAbility: abilityChoice },
        options: { Abyssal: { resistance: ["poison"] }, Chthonic: { resistance: ["necrotic"] }, Infernal: { resistance: ["fire"] } },
      },
      { name: "Otherworldly Presence", mech: { spells: [{ spell: "thaumaturgy", level: 1, cantrip: true }] } },
    ],
  },
]

/** Pages 84 to 86 as lines, with the three tables taken out and returned apart, since the PDF sets them in the middle of the text. */
function speciesLines() {
  const p84 = pages[83].split("\n")
  const tableStart = lineIndex(p84, (line) => line === "Draconic Ancestors")
  const tableEnd = lineIndex(p84, (line) => line.startsWith("\t Breath Weapon."), tableStart)
  const p85 = pages[84].split("\n")
  const elfStart = lineIndex(p85, (line) => line === "Elven Lineages")
  const p86 = pages[85].split("\n")
  const tieflingStart = lineIndex(p86, (line) => line === "Fiendish Legacies")
  return {
    lines: [...p84.slice(0, tableStart), ...p84.slice(tableEnd), ...p85.slice(0, elfStart), ...p86.slice(0, tieflingStart)],
    dragonTable: p84.slice(tableStart, tableEnd),
    elfTable: p85.slice(elfStart),
    tieflingTable: p86.slice(tieflingStart),
  }
}

/** Dragon pairs. The cells come out four to a row (dragon, type, dragon, type), so pairs read in order. */
function dragonOptions(table: string[]) {
  const cells = table
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(5)
  const options = []
  for (let i = 0; i < cells.length; i += 2) options.push({ id: toId(cells[i]), name: cells[i], damageType: cells[i + 1].toLowerCase() })
  return options.sort((a, b) => a.name.localeCompare(b.name))
}

/** Lineage and legacy tables: a row is the name, the level 1 benefit lines, then the level 3 and level 5 spells. */
function lineageOptions(table: string[], names: string[], mechanics: Record<string, Mechanics>) {
  const cells = table.map((line) => line.trim()).filter(Boolean)
  const start = lineIndex(cells, (line) => line === "Level 5") + 1
  const rows = cells.slice(start)
  return names.map((name, i) => {
    const from = rows.indexOf(name)
    const to = i + 1 < names.length ? rows.indexOf(names[i + 1]) : rows.length
    const row = rows.slice(from + 1, to)
    const text = joinLines(row.slice(0, -2))
    const spells: Record<string, unknown>[] = []
    for (const match of text.matchAll(/know the ([A-Z][A-Za-z ]+?) cantrip/g)) spells.push({ spell: toId(match[1]), level: 1, cantrip: true })
    spells.push({ spell: toId(row.at(-2) as string), level: 3, uses: onceLong }, { spell: toId(row.at(-1) as string), level: 5, uses: onceLong })
    return { id: toId(name), name, text, ...mechanics[name], spells }
  })
}

function buildSpecies() {
  const { lines, dragonTable, elfTable, tieflingTable } = speciesLines()
  const headings = speciesSpecs.map((spec) => lines.findIndex((line, i) => line === spec.name && lines[i + 1]?.startsWith("Creature Type:")))
  return speciesSpecs.map((spec, n) => {
    const section = lines.slice(headings[n], headings[n + 1] ?? lines.length)
    const sizeAt = lineIndex(section, (line) => line.startsWith("Size:"))
    const speedAt = lineIndex(section, (line) => line.startsWith("Speed:"))
    const introAt = lineIndex(section, (line) => /^As an? \w+, you have (these|the following) special traits\.$/.test(line.trim()))
    const sizeText = joinLines(section.slice(sizeAt, speedAt)).replace(/^Size: /, "")
    const sizes = [...sizeText.matchAll(/(Tiny|Small|Medium|Large|Huge|Gargantuan) \((about [^)]+)\)/g)].map((match) => ({ size: match[1], height: match[2] }))
    const speed = Number(section[speedAt].trim().match(/^Speed: (\d+) feet$/)?.[1])
    const page = pages.findIndex((text) => `\n${text}`.includes(`\n${spec.name}\nCreature Type:`)) + 1

    // Paragraphs of the trait region. Options set without a tab start at their own name.
    const optionMarkers = spec.traits.flatMap((trait) => (trait.choice === "text" ? Object.keys(trait.options ?? {}) : []))
    const body = section.slice(introAt + 1)
    const isOption = (line: string) => optionMarkers.some((name) => line.startsWith(`${name}. `) || line.startsWith(`${name} (`))
    const texts = paragraphs(body, isOption)
    const traitOf = (text: string) => spec.traits.find((trait) => text.startsWith(`${trait.name}. `))
    const optionOf = (text: string) => optionMarkers.find((name) => text.startsWith(`${name}. `) || text.startsWith(`${name} (`))

    const traits = spec.traits.map((trait) => {
      const first = texts.findIndex((text) => traitOf(text) === trait)
      if (first < 0) throw new Error(`${spec.name}: trait ${trait.name} not found`)
      const own: string[] = []
      const optionTexts: Record<string, string[]> = {}
      let current: string[] = own
      for (let i = first; i < texts.length; i++) {
        const text = texts[i]
        if (i > first && traitOf(text)) break
        const option = optionOf(text)
        if (option) current = optionTexts[option] = []
        current.push(i === first ? text.slice(trait.name.length + 2) : text)
      }
      const out: Record<string, unknown> = { name: trait.name, text: own.join("\n"), ...trait.mech }
      if (trait.choice) {
        const options =
          trait.choice === "text"
            ? Object.entries(trait.options ?? {}).map(([name, mech]) => {
                const raw = optionTexts[name].join("\n")
                const giant = raw.match(/^[^(.]+ \(([^)]+)\)\. /)?.[1]
                return { id: toId(name), name, ...(giant ? { giant } : {}), text: raw.replace(/^[^(.]+?(?: \([^)]*\))?\. /, ""), ...mech }
              })
            : spec.name === "Dragonborn"
              ? dragonOptions(dragonTable)
              : spec.name === "Elf"
                ? lineageOptions(elfTable, Object.keys(trait.options ?? {}), trait.options ?? {})
                : lineageOptions(tieflingTable, Object.keys(trait.options ?? {}), trait.options ?? {})
        out.choice = { id: toId(trait.name), options }
      }
      delete out.options
      return out
    })
    return { id: toId(spec.name), name: spec.name, page, creatureType: "humanoid", sizes, speed, traits }
  })
}

// Backgrounds --------------------------------------------------------------------------------------------

// The background lists plurals and reads "Traveler’s Clothes", but the equipment table names the items Dagger, Pouch and "Clothes, Traveler’s" (page 95).
const singular: Record<string, string> = { Daggers: "Dagger", Pouches: "Pouch", "Traveler’s Clothes": "Clothes, Traveler’s" }
const abilityByName: Record<string, string> = { Strength: "str", Dexterity: "dex", Constitution: "con", Intelligence: "int", Wisdom: "wis", Charisma: "cha" }

function equipmentOption(option: string, text: string) {
  const parts = text.split(", ")
  const gp = Number(parts.pop()?.match(/^(\d+) GP$/)?.[1])
  const items = parts.map((part) => {
    const match = part.match(/^(?:(\d+) )?(.+?)(?: \((.+)\))?$/)
    if (!match) throw new Error(`equipment item ${part}`)
    const [, count, rawName, paren] = match
    const item: Record<string, unknown> = { quantity: Number(count ?? 1) }
    // "Gaming Set (same as above)" is one item of the kind the player chose for the tool proficiency.
    if (paren === "same as above") item.chooseFrom = [toId(rawName)]
    else item.item = toId(singular[rawName] ?? rawName)
    const sheets = paren?.match(/^(\d+) (sheets)$/)
    if (sheets) {
      item.quantity = Number(sheets[1])
      item.note = sheets[2]
    } else if (paren) item.note = paren
    // "20 Arrows" counts single arrows. The Ammunition table sells Arrows in bundles of 20 (page 96), so the background gives one bundle.
    if (item.item === "arrows") item.unit = "single"
    return item
  })
  return { option, ...(items.length ? { items } : {}), money: { amount: gp, unit: "gp" } }
}

function buildBackgrounds() {
  const lines = pages[82].split("\n")
  const from = lineIndex(lines, (line) => line === "Background Descriptions") + 1
  const to = lineIndex(lines, (line) => line === "Character Species")
  const body = lines.slice(from, to)
  const names = body.filter((_line, i) => body[i + 1]?.startsWith("Ability Scores:"))
  return names.map((name, n) => {
    const block = body.slice(body.indexOf(name) + 1, n + 1 < names.length ? body.indexOf(names[n + 1]) : body.length)
    const field = (label: string) => {
      const start = block.findIndex((line) => line.startsWith(`${label}:`))
      const end = block.findIndex((line, i) => i > start && /^(Ability Scores|Feat|Skill Proficiencies|Tool Proficiency|Equipment):/.test(line))
      return joinLines(block.slice(start, end < 0 ? block.length : end)).slice(label.length + 2)
    }
    const feat = field("Feat")
      .replace(/ \(see “Feats”\)$/, "")
      .match(/^(.+?)(?: \((Cleric|Druid|Wizard)\))?$/)
    const tool = field("Tool Proficiency").replace(/ \(see “Equipment”\)$/, "")
    const kind = tool.match(/^Choose one kind of (.+)$/)
    const equipment = field("Equipment").match(/^Choose A or B: \(A\) (.+); or \(B\) (.+)$/)
    if (!feat || !equipment) throw new Error(`${name}: background fields`)
    return {
      id: toId(name),
      name,
      page: 83,
      abilityScores: field("Ability Scores")
        .split(", ")
        .map((ability) => abilityByName[ability]),
      feat: { id: toId(feat[1]), ...(feat[2] ? { spellList: feat[2].toLowerCase() } : {}) },
      skills: field("Skill Proficiencies").split(" and ").map(toId),
      toolProficiency: kind ? { oneOfKind: toId(kind[1]) } : { tool: toId(tool) },
      equipment: [equipmentOption("A", equipment[1]), equipmentOption("B", equipment[2])],
    }
  })
}

// Feats --------------------------------------------------------------------------------------------------

const featCategoryIds: Record<string, string> = { Origin: "origin", General: "general", "Fighting Style": "fighting-style", "Epic Boon": "epic-boon" }
const allAbilities = { from: "any", maximum: 30 }
const boonScore = { ...allAbilities, choices: [{ count: 1, amount: 1 }] }
const fightingStyle = { features: ["fighting-style"] }

type FeatSpec = { prerequisite?: Mechanics; abilityScoreIncrease?: Mechanics; mech?: Mechanics; benefits?: Record<string, Mechanics> }
const featSpecs: Record<string, FeatSpec> = {
  Alert: { benefits: { "Initiative Proficiency": { initiativeBonus: "proficiency-bonus" }, "Initiative Swap": { initiativeSwap: { allies: 1, blockedByCondition: "incapacitated" } } } },
  "Magic Initiate": {
    benefits: {
      "Two Cantrips": { cantrips: 2, spellLists: ["cleric", "druid", "wizard"], spellcastingAbility: abilityChoice },
      "Level 1 Spell": { spellLevel: 1, uses: onceLong },
    },
  },
  "Savage Attacker": { mech: { trigger: "hit-with-weapon", damageDiceRolledTwice: { perTurn: 1 } } },
  Skilled: { mech: { proficiencyChoice: { count: 3, kinds: ["skill", "tool"] } } },
  "Ability Score Improvement": {
    prerequisite: { level: 4 },
    abilityScoreIncrease: {
      from: "any",
      choices: [
        { count: 1, amount: 2 },
        { count: 2, amount: 1 },
      ],
      maximum: 20,
    },
  },
  Grappler: {
    prerequisite: { level: 4, abilityMinimum: { abilities: ["str", "dex"], minimum: 13 } },
    abilityScoreIncrease: { from: ["str", "dex"], choices: [{ count: 1, amount: 1 }], maximum: 20 },
  },
  Archery: { prerequisite: fightingStyle, mech: { attackBonus: { bonus: 2, weapon: "ranged" } } },
  Defense: { prerequisite: fightingStyle, mech: { armorClassBonus: { bonus: 1, armor: ["light", "medium", "heavy"] } } },
  "Great Weapon Fighting": { prerequisite: fightingStyle, mech: { damageDieMinimum: { minimum: 3, weapon: "melee", heldWith: "two-hands", properties: ["two-handed", "versatile"] } } },
  "Two-Weapon Fighting": { prerequisite: fightingStyle, mech: { addAbilityModifierToExtraAttack: { weaponProperty: "light" } } },
  "Boon of Combat Prowess": { prerequisite: { level: 19 }, abilityScoreIncrease: boonScore, benefits: { "Peerless Aim": { uses: { count: 1, recharge: "start-of-next-turn" } } } },
  "Boon of Dimensional Travel": { prerequisite: { level: 19 }, abilityScoreIncrease: boonScore, benefits: { "Blink Steps": { teleportFeet: 30 } } },
  "Boon of Fate": {
    prerequisite: { level: 19 },
    abilityScoreIncrease: boonScore,
    benefits: { "Improve Fate": { dice: "2d4", rangeFeet: 60, uses: { count: 1, recharge: "initiative-or-short-or-long-rest" } } },
  },
  "Boon of Irresistible Offense": { prerequisite: { level: 19 }, abilityScoreIncrease: { from: ["str", "dex"], choices: [{ count: 1, amount: 1 }], maximum: 30 } },
  "Boon of Spell Recall": {
    prerequisite: { level: 19, features: ["spellcasting"] },
    abilityScoreIncrease: { from: ["int", "wis", "cha"], choices: [{ count: 1, amount: 1 }], maximum: 30 },
    benefits: { "Free Casting": { dice: "1d4", freeCasting: { minSlotLevel: 1, maxSlotLevel: 4 } } },
  },
  "Boon of the Night Spirit": {
    prerequisite: { level: 19 },
    abilityScoreIncrease: boonScore,
    benefits: {
      "Merge with Shadows": { activation: ["bonus-action"], requires: "dim-light-or-darkness", condition: "invisible" },
      "Shadowy Form": { requires: "dim-light-or-darkness", resistanceExcept: ["psychic", "radiant"] },
    },
  },
  "Boon of Truesight": { prerequisite: { level: 19 }, abilityScoreIncrease: boonScore, benefits: { Truesight: { truesight: 60 } } },
}

function prerequisiteOf(text: string | undefined, spec: Mechanics | undefined) {
  if (!text) return undefined
  return { text, ...spec }
}

function buildFeats() {
  const lines = [...pages[86].split("\n"), ...pages[87].split("\n")]
  const start = lineIndex(lines, (line) => line === "Origin Feats") + 1
  const sections = new Set(["General Feats", "Fighting Style Feats", "Epic Boon Feats"])
  const rest = lines.slice(start).filter((line) => !sections.has(line))
  const heads = rest.flatMap((line, i) => (/^(Origin|General|Fighting Style|Epic Boon) Feat/.test(rest[i + 1] ?? "") && !/^(Origin|General|Fighting Style|Epic Boon) Feat/.test(line) ? [i] : []))
  return heads.map((head, n) => {
    const name = rest[head].trim()
    const spec = featSpecs[name]
    if (!spec) throw new Error(`no spec for feat ${name}`)
    // The category line may wrap onto a second line inside its parentheses.
    let end = head + 2
    let category = rest[head + 1]
    while (category.includes("(") && !category.includes(")")) category += ` ${rest[end++]}`
    const header = joinLines([category]).match(/^(Origin|General|Fighting Style|Epic Boon) Feat(?: \(Prerequisite: (.+)\))?$/)
    if (!header) throw new Error(`${name}: category line`)
    const body = paragraphs(rest.slice(end, heads[n + 1] ?? rest.length))
    const repeatAt = body.findIndex((text) => text.startsWith("Repeatable. "))
    const repeatText = repeatAt >= 0 ? body.splice(repeatAt, 1)[0].slice("Repeatable. ".length) : undefined
    const out: Record<string, unknown> = {
      id: toId(name),
      name,
      page: pages.findIndex((text, i) => i >= 86 && `\n${text}`.includes(`\n${name}\n`)) + 1,
      category: featCategoryIds[header[1]],
    }
    const prerequisite = prerequisiteOf(header[2], spec.prerequisite)
    if (prerequisite) out.prerequisite = prerequisite
    if (repeatText) out.repeatable = { text: repeatText, ...(name === "Magic Initiate" ? { differentSpellList: true } : {}) }
    if (spec.abilityScoreIncrease) out.abilityScoreIncrease = spec.abilityScoreIncrease
    const named = body.slice(1).filter((text) => /^[A-Z][A-Za-z0-9’ ]+?\. /.test(text))
    if (body[0] === "You gain the following benefits.") {
      out.text = body[0]
      out.benefits = named.map((text) => {
        const benefitName = (text.match(/^([A-Z][A-Za-z0-9’ ]+?)\. /) as RegExpMatchArray)[1]
        return { name: benefitName, text: text.slice(benefitName.length + 2), ...spec.benefits?.[benefitName] }
      })
    } else {
      out.text = body.join("\n")
      Object.assign(out, spec.mech)
    }
    return out
  })
}

// Rules ----------------------------------------------------------------------------------------------------

const ruleSpecs: { name: string; text: string; mech: Mechanics }[] = [
  {
    name: "Background Ability Scores",
    text: "A background lists three of your character’s ability scores. Increase one by 2 and another one by 1, or increase all three by 1. None of these increases can raise a score above 20.",
    mech: {
      abilityScoreIncrease: {
        listed: 3,
        options: [
          [2, 1],
          [1, 1, 1],
        ],
        maximum: 20,
      },
    },
  },
  { name: "Background Feat", text: "A background gives your character a specified Origin feat (described in “Feats”).", mech: { grants: { kind: "feat", count: 1, featCategory: "origin" } } },
  { name: "Background Skill Proficiencies", text: "A background gives your character proficiency in two specified skills.", mech: { grants: { kind: "skill-proficiency", count: 2 } } },
  {
    name: "Background Tool Proficiency",
    text: "Each background gives a character proficiency with one tool—either a specific tool or one chosen from the Artisan’s Tools category.",
    mech: { grants: { kind: "tool-proficiency", count: 1 } },
  },
  { name: "Background Equipment", text: "Each background offers a choice between a package of equipment and 50 GP.", mech: { moneyInsteadOfEquipment: { amount: 50, unit: "gp" } } },
  { name: "Species Creature Type", text: "Every species in “Character Origins” is Humanoid; playable non-Humanoid species appear in other books.", mech: { creatureType: "humanoid" } },
  {
    name: "Species Life Span",
    text: "Members of most species live for about 80 years, with exceptions noted in the text about the species in “Character Origins.”",
    mech: { typicalLifeSpanYears: 80 },
  },
  {
    name: "Feat Category Choice",
    text: "If you’re instructed to choose a feat from a specific category, such as the Origin category, that category must appear under the feat’s name. If you’re instructed to choose a feat and no category is specified, you can choose from any category.",
    mech: { anyCategoryWhenUnspecified: true },
  },
  {
    name: "Feat Prerequisite",
    text: "To take a feat, you must meet any prerequisite in its description unless a feature allows you to take the feat without the prerequisite. If a prerequisite includes a class, you must have at least 1 level in that class to take the feat.",
    mech: { minimumClassLevels: 1 },
  },
  { name: "Feat Repeatable", text: "A feat can be taken only once unless its description states otherwise in a “Repeatable” subsection.", mech: { defaultTimesTaken: 1 } },
]

function buildRules() {
  return ruleSpecs.map((rule) => {
    const page = pageOf(rule.text)
    if (!page) throw new Error(`${rule.name}: text not in the official pages`)
    return { id: toId(rule.name), name: rule.name, page, text: rule.text, ...rule.mech }
  })
}

export default function build() {
  writeData("species", speciesSchema, buildSpecies())
  writeData("backgrounds", backgroundSchema, buildBackgrounds())
  writeData("feats", featSchema, buildFeats())
  writeData("origin-rules", originRuleSchema, buildRules())
}
