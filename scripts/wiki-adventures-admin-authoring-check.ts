import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { AdminAuthoringValidationError, assertAdminSourcePublishable, listAdminWikiAdventures, loadAdminWikiAdventureState } from "@/lib/wiki-adventures/admin-authoring"
import { createSourceFile } from "@/lib/wiki-adventures/change-sets"
import { getLocalWikiAdventureDefinition, readLocalWikiAdventureSourceFiles } from "@/lib/wiki-adventures/local-runtime"

async function main() {
  const summaries = await listAdminWikiAdventures()
  assert.equal(summaries.length, 4)
  assert.ok(summaries.some((summary) => summary.planId === "covert-cargo"))
  assert.ok(summaries.every((summary) => summary.encounterCount > 0))

  const state = await loadAdminWikiAdventureState("realm-of-myr", "covert-cargo")
  assert.equal(state.definition.planId, "covert-cargo")
  assert.equal(state.source, "local")
  assert.ok(state.files.some((file) => file.path.endsWith("/adventure.md")))
  assert.ok(state.artifacts.graph.startEncounterId)

  const definition = getLocalWikiAdventureDefinition("realm-of-myr", "march-of-davos")
  assert.ok(definition)
  const marchFiles = readLocalWikiAdventureSourceFiles(definition)
  assert.ok(
    marchFiles.some((file) => file.path.endsWith("/npcs/garlan-ironfist.md")),
    "March NPC source paths should be included from migration report"
  )
  const firstMarchEncounter = marchFiles.find((file) => file.path.endsWith("/encounters/the-gates-of-kordavos.md"))
  assert.ok(firstMarchEncounter?.content.includes('sectionTitle: "Arrival At Kordavos"'))
  assert.ok(firstMarchEncounter?.content.includes('sceneTitle: "Arrival at Kordavos"'))
  assert.ok(firstMarchEncounter?.content.includes("moduleOrder:"))
  assert.ok(firstMarchEncounter?.content.includes('  - id: "garlan-ironfist"'))
  assert.ok(firstMarchEncounter?.content.includes('behavior: "Diligent and fair'))

  const adminPage = readFileSync("app/admin/page.tsx", "utf8")
  assert.equal(adminPage.includes("/admin/adventure-plans"), false)
  assert.ok(adminPage.includes("/admin/wiki-adventures"))

  const editorPage = readFileSync("app/admin/wiki-adventures/[settingId]/[planId]/page.tsx", "utf8")
  assert.ok(editorPage.includes("AdminWikiAdventureEditor"))
  assert.ok(editorPage.includes("loadAdminWikiAdventureState"))

  // Canonical admin route family is /admin/wiki-adventures; the others redirect into it.
  const listPage = readFileSync("app/admin/wiki-adventures/page.tsx", "utf8")
  assert.ok(listPage.includes("listAdminWikiAdventures"), "/admin/wiki-adventures must be the canonical list page")
  for (const redirectRoute of ["app/admin/adventures-plans/page.tsx", "app/admin/adventure-plans/page.tsx"]) {
    const source = readFileSync(redirectRoute, "utf8")
    assert.ok(source.includes('redirect("/admin/wiki-adventures")'), `${redirectRoute} must redirect to the canonical /admin/wiki-adventures`)
  }
  const editorComponent = readFileSync("components/wiki-adventures/admin-wiki-adventure-editor.tsx", "utf8")
  assert.ok(editorComponent.includes("Module Art"))
  assert.ok(editorComponent.includes("Encounter NPCs"))
  assert.ok(editorComponent.includes("Read Aloud"))
  assert.ok(editorComponent.includes("moduleSections"))

  // Pre-write validation gate: valid source compiles and passes the gate.
  const covertDefinition = getLocalWikiAdventureDefinition("realm-of-myr", "covert-cargo")
  assert.ok(covertDefinition)
  const covertFiles = readLocalWikiAdventureSourceFiles(covertDefinition)
  const gated = assertAdminSourcePublishable(covertFiles, covertDefinition, [])
  assert.equal(gated.validationReport.status !== "blocked", true, "Clean covert-cargo source must pass the pre-write gate")

  // Corrupt an encounter so the proposed set has blocking errors, and confirm the gate refuses it.
  const encounterFile = covertFiles.find((file) => file.path.includes("/encounters/") && file.path.endsWith(".md"))
  assert.ok(encounterFile, "Expected a covert-cargo encounter source file")
  const brokenFiles = covertFiles.map((file) => (file.path === encounterFile.path ? createSourceFile(file.path, "no frontmatter here, just prose") : file))
  assert.throws(
    () => assertAdminSourcePublishable(brokenFiles, covertDefinition, [encounterFile.path]),
    (error: unknown) => {
      assert.ok(error instanceof AdminAuthoringValidationError, "Gate must throw AdminAuthoringValidationError")
      assert.equal(error.validation.status, "blocked")
      assert.ok(error.validation.summary.errorCount > 0)
      assert.deepEqual(error.changedPaths, [encounterFile.path])
      return true
    },
    "Broken source must be blocked before any canonical write"
  )
}

main()
