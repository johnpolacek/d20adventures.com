import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { spells } from "@d20/srd/spells"
import { spellMechanics } from "../../src/sheet/spell-mechanics"
import { roundRules, spellRule } from "../../src/sheet/spell-rules"
import { spellById } from "../../src/sheet/spells"

test("the shared cast path names no spell: each spell's own rules live in its file under spell-mechanics", () => {
  const shared = ["spells.ts", "spell-effects.ts", "spell-rounds.ts", "spell-ends.ts", "spell-space.ts", "spell-rules.ts"]
  const named = shared.flatMap((file) => {
    const text = readFileSync(new URL(`../../src/sheet/${file}`, import.meta.url), "utf8")
    return spells.flatMap((each) => (text.includes(`"${each.id}"`) ? [`${file}: ${each.id}`] : []))
  })
  assert.deepEqual(named, [])
})

test("every spell a rule names is one of the SRD's, and no two files fill the same point of one spell", () => {
  const named = spellMechanics().flatMap((file) => file.spells)
  assert.deepEqual(
    named.filter((id) => !spellById.has(id)),
    []
  )
  // Laying the files together throws where two fill one point.
  for (const each of spells) spellRule(each.id)
  assert.equal(spellRule("sleep")?.endsOnDamage, true)
  assert.equal(spellRule("light"), undefined)
  // The round's rules run in the order the files are listed: the repeated saves, Sleep's, the burns, Acid Arrow's,
  // Spirit Guardians, the areas on the floor as turns end, as they drift and as turns start, then Vitriolic Sphere's later
  // burn, Flesh to Stone's and Contagion's counts, and Regenerate's hit point and Power Word Stun's save, and Ensnaring
  // Strike's burn, Find Steed's end with its rider, and Conjure Woodland Beings' spirits.
  assert.equal(roundRules().length, 16)
})
