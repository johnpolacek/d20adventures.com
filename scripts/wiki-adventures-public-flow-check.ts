import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { getLocalWikiAdventuresForSetting } from "@/lib/wiki-adventures/local-runtime"
import { loadLocalWikiAdventurePlanView } from "@/lib/wiki-adventures/plan-view"

const SETTING_ID = "realm-of-myr"

// The public play-flow pages must resolve registered wiki adventures through the wiki runtime
// (the plan-view adapter), not the legacy S3 AdventurePlan JSON.
function assertPagesBranchOnWiki() {
  const pages = [
    "app/settings/[settingId]/[adventurePlanId]/page.tsx",
    "app/settings/[settingId]/[adventurePlanId]/character-select/page.tsx",
    "app/settings/[settingId]/[adventurePlanId]/character-create/page.tsx",
  ]
  for (const page of pages) {
    const source = readFileSync(page, "utf8")
    assert.ok(source.includes("isLocalWikiAdventure"), `${page} does not branch on isLocalWikiAdventure`)
    assert.ok(source.includes("loadWikiAdventurePlanView"), `${page} does not load the wiki plan view`)
  }
}

// The prototype workbench server actions must be admin-gated.
function assertWorkbenchActionsGated() {
  const source = readFileSync("app/_actions/wiki-adventures/workbench-actions.ts", "utf8")
  assert.ok(source.includes("requireAdmin"), "workbench-actions does not import requireAdmin")
  assert.equal(source.match(/await assertAdmin\(\)/g)?.length, 2, "both workbench actions must call assertAdmin()")
}

type Expectation = {
  planId: string
  party: [number, number]
  start: string
  premadeIds: string[]
  hasOptions: boolean
}

const EXPECTATIONS: Expectation[] = [
  { planId: "the-midnight-summons", party: [1, 1], start: "broken-silence", premadeIds: ["thalbern"], hasOptions: false },
  { planId: "covert-cargo", party: [2, 2], start: "the-shipment", premadeIds: ["1749159962941", "1749307435667"], hasOptions: false },
  { planId: "the-road-to-kordavos", party: [1, 3], start: "well-met", premadeIds: [], hasOptions: true },
  { planId: "march-of-davos", party: [3, 5], start: "the-gates-of-kordavos", premadeIds: [], hasOptions: true },
]

function assertPlanViewShape() {
  for (const expected of EXPECTATIONS) {
    const plan = loadLocalWikiAdventurePlanView(SETTING_ID, expected.planId)
    const firstEncounter = plan.sections[0]?.scenes[0]?.encounters[0]

    assert.deepEqual(plan.party, expected.party, `${expected.planId} party mismatch`)
    assert.equal(plan.start, expected.start, `${expected.planId} start mismatch`)
    assert.equal(firstEncounter?.id, expected.start, `${expected.planId} first encounter is not the start encounter`)
    assert.ok(firstEncounter?.intro, `${expected.planId} first encounter has no intro`)
    assert.ok(plan.teaser, `${expected.planId} has no teaser`)
    assert.ok(plan.image, `${expected.planId} has no image`)

    assert.deepEqual(
      plan.premadePlayerCharacters.map((character) => character.id),
      expected.premadeIds,
      `${expected.planId} premade ids mismatch`
    )
    for (const character of plan.premadePlayerCharacters) {
      assert.ok(character.name && character.race && character.archetype && character.attributes, `${expected.planId} premade ${character.id} missing sheet fields`)
    }

    if (expected.hasOptions) {
      assert.ok((plan.availableCharacterOptions?.races.length ?? 0) > 0, `${expected.planId} should expose races`)
      assert.ok((plan.availableCharacterOptions?.archetypes.length ?? 0) > 0, `${expected.planId} should expose archetypes`)
    } else {
      assert.equal(plan.availableCharacterOptions, undefined, `${expected.planId} should be premade-only`)
    }
  }
}

// The adventure-listing grid (`/settings/[settingId]/play`) must source registered settings
// from the wiki runtime, ordered by planId so its positional intro/full curation is preserved.
function assertGridSourceAndOrder() {
  const playPage = readFileSync("app/settings/[settingId]/play/page.tsx", "utf8")
  assert.ok(playPage.includes("settingHasLocalWikiAdventures"), "play grid does not branch on settingHasLocalWikiAdventures")
  assert.ok(playPage.includes("loadWikiAdventurePlanViewsForSetting"), "play grid does not load wiki plan views")

  const order = getLocalWikiAdventuresForSetting(SETTING_ID).map((definition) => definition.planId)
  assert.deepEqual(order, ["covert-cargo", "march-of-davos", "the-midnight-summons", "the-road-to-kordavos"], "grid order changed — positional intro/full curation in the play page would break")
}

function main() {
  assertPagesBranchOnWiki()
  assertWorkbenchActionsGated()
  assertPlanViewShape()
  assertGridSourceAndOrder()
  console.log("Public play-flow wiki cutover checks passed")
}

main()
