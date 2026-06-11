import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { listAdminWikiAdventures, loadAdminWikiAdventureState } from "@/lib/wiki-adventures/admin-authoring"
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
  const editorComponent = readFileSync("components/wiki-adventures/admin-wiki-adventure-editor.tsx", "utf8")
  assert.ok(editorComponent.includes("Module Art"))
  assert.ok(editorComponent.includes("Encounter NPCs"))
  assert.ok(editorComponent.includes("Read Aloud"))
  assert.ok(editorComponent.includes("moduleSections"))
}

main()
