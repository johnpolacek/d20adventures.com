import { readData } from "../lib/data"
import { registry } from "../lib/registry"
import type { Report } from "../lib/report"

/**
 * Every field that holds the id of an entry in another file, or of another entry in its own file. A path is the
 * keys from the entry down, with [] for "each item": "traits[].spells[].spell".
 */
const references: Record<string, [path: string, target: string][]> = {
  backgrounds: [
    ["equipment.a.items[].id", "equipment"],
    ["feat.id", "feats"],
    ["feat.spellList", "classes"],
    ["toolProficiency.tool", "equipment"],
    ["toolProficiency.oneOfKind", "equipment"],
  ],
  "class-features": [
    ["class", "classes"],
    ["subclass", "subclasses"],
    ["alwaysPrepared[]", "spells"],
    ["freeCast[]", "spells"],
    ["options[].freeCast[]", "spells"],
    ["feat.id", "feats"],
    ["feat.recommended", "feats"],
  ],
  classes: [
    ["levels[].features[]", "class-features"],
    ["spellcasting.feature", "class-features"],
    ["spellcasting.spellList[].spells[]", "spells"],
    ["spellcasting.focus[]", "equipment"],
    ["startingEquipment[].items[].item", "equipment"],
    ["subclasses[]", "subclasses"],
    ["tools[].tool", "equipment"],
    ["multiclass.tools[].tool", "equipment"],
    ["multiclass.tools[].from[]", "equipment"],
    ["weapons[].withProperty[]", "weapon-properties"],
  ],
  equipment: [
    ["ammunition", "equipment"],
    ["capacity.holds[].item", "equipment"],
    ["contents[].item", "equipment"],
    ["craft.items[]", "equipment"],
    ["craft.categories[].except[]", "equipment"],
    ["light.fuel", "equipment"],
    ["members[]", "equipment"],
    ["storage", "equipment"],
    ["tier", "equipment"],
    ["variantOf", "equipment"],
    ["variants[]", "equipment"],
    ["mastery", "weapon-masteries"],
    ["properties[]", "weapon-properties"],
    ["statBlock", "monsters"],
    ["usedBy[]", "classes"],
    ["magicItem", "magic-items"],
  ],
  "equipment-rules": [["tool", "equipment"]],
  feats: [
    ["benefits[].spellLists[]", "classes"],
    ["damageDieMinimum.properties[]", "weapon-properties"],
  ],
  "magic-items": [
    ["attunement.classes[]", "classes"],
    ["base.items[]", "equipment"],
    ["base.except[]", "equipment"],
    ["spells[].id", "spells"],
    ["tables[].rows[].spells[]", "spells"],
  ],
  monsters: [
    ["gear[].id", "equipment"],
    ["actions[].spellcasting.lists[].spells[].id", "spells"],
  ],
  species: [
    ["traits[].spells[].spell", "spells"],
    ["traits[].choice.options[].spells[].spell", "spells"],
    ["traits[].featChoice.recommended", "feats"],
  ],
  spells: [["classes[]", "classes"]],
  subclasses: [
    ["class", "classes"],
    ["features[].features[]", "class-features"],
    ["alwaysPrepared[].spells[]", "spells"],
  ],
}

/**
 * Ids that name something the SRD describes outside the chapter that would hold its entry. Each is printed as a
 * waiver on every run.
 */
const unresolved: Record<string, string> = {
  "classes wizard spellbook": "the SRD describes the spellbook in the Wizard’s Spellcasting feature (page 78), not in Equipment, so it has no equipment entry",
}

/**
 * Fields whose values match ids of another file but are not references to it. Each is a fixed list typed as an
 * enum in its schema, which already rejects an unknown value.
 */
const notReferences: Record<string, string> = {
  "magic-items category": "the nine categories are an enum; magic-item-rules has a row describing each",
  "magic-items variants[].rarity": "the rarities are an enum; magic-item-rules has a row describing each",
  "magic-item-rules category": "the nine categories are an enum",
}

/** The values at a path, where [] walks every item of an array. */
function valuesAt(value: unknown, path: string[]): unknown[] {
  if (value === undefined || value === null) return []
  if (path.length === 0) return [value]
  const [head, ...rest] = path
  if (head === "[]") return Array.isArray(value) ? value.flatMap((item) => valuesAt(item, rest)) : []
  return typeof value === "object" ? valuesAt((value as Record<string, unknown>)[head], rest) : []
}

const split = (path: string) => path.split(/\.|(?=\[\])/).filter(Boolean)

/** Every string-valued path in a file with its distinct values, with array indices folded to []. */
function stringPaths(entries: unknown[]): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>()
  const walk = (value: unknown, path: string) => {
    if (typeof value === "string") {
      if (!found.has(path)) found.set(path, new Set())
      found.get(path)?.add(value)
    } else if (Array.isArray(value)) for (const item of value) walk(item, `${path}[]`)
    else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) walk(item, path ? `${path}.${key}` : key)
  }
  for (const entry of entries) walk(entry, "")
  return found
}

/** Cross references between the data files: every id that points at another entry finds it. */
export default function verify(report: Report) {
  const data = Object.fromEntries(Object.keys(registry).map((name) => [name, readData<{ id: string }>(name)]))
  const ids = Object.fromEntries(Object.entries(data).map(([name, entries]) => [name, new Set(entries.map((entry) => entry.id))]))

  const failures: string[] = []
  const waived = new Set<string>()
  let total = 0
  const emptyPaths: string[] = []
  for (const [name, fields] of Object.entries(references)) {
    for (const [path, target] of fields) {
      let seen = 0
      for (const entry of data[name]) {
        for (const value of valuesAt(entry, split(path))) {
          seen++
          total++
          if (typeof value === "string" && ids[target].has(value)) continue
          const reason = unresolved[`${name} ${entry.id} ${value}`]
          if (reason) waived.add(`${name} ${entry.id} ${path} ${value}: ${reason}`)
          else failures.push(`${name} ${entry.id} ${path}: ${JSON.stringify(value)} is not in ${target}`)
        }
      }
      // A listed path that matches nothing is a stale listing, and would hide a renamed field.
      if (seen === 0) emptyPaths.push(`${name} ${path} matches no value`)
    }
  }
  report.check("references", "every id that points at another entry resolves", total, failures, [...waived])
  report.check("references", "every listed reference field exists in the data", Object.values(references).flat().length, emptyPaths)

  // A field whose every value is an id of one other file is a reference. It must be listed above, so a new
  // reference field cannot go unchecked.
  const unlisted: string[] = []
  let fields = 0
  for (const [name, entries] of Object.entries(data)) {
    const listed = new Set((references[name] ?? []).map(([path]) => path))
    for (const [path, values] of stringPaths(entries)) {
      fields++
      if (path === "id" || listed.has(path) || notReferences[`${name} ${path}`] || values.size < 3) continue
      for (const [target, targetIds] of Object.entries(ids)) {
        // The small fixed tables are typed as enums in the schemas, which checks them already.
        if (["abilities", "skills", "conditions", "damage-types", "magic-schools", "coins"].includes(target)) continue
        if ([...values].every((value) => targetIds.has(value))) unlisted.push(`${name} ${path} holds only ids of ${target} but is not a listed reference`)
      }
    }
  }
  report.check("references", "no reference field is unlisted", fields, unlisted)
}
