import assert from "node:assert/strict"
import { compileWorkbenchFiles, createRepresentativeWorkbenchState, summarizeWorkbenchArtifacts } from "@/lib/wiki-adventures/workbench-demo"

async function main() {
  const state = await createRepresentativeWorkbenchState()
  assert.equal(
    state.files.some((file) => file.path.endsWith("/adventure.md") && file.kind === "markdown"),
    true
  )
  assert.equal(
    state.files.some((file) => file.path.endsWith("/characters/vala-apprentice.json") && file.kind === "json"),
    true
  )
  assert.equal(state.summary.manifest.adventureId, "the-old-road")
  assert.equal(state.summary.graphNodes.length, 2)
  assert.equal(state.summary.validationReport.status, "passed")
  assert.equal(state.summary.publishPreview.artifactCount, 7)
  assert.ok(state.summary.publishPreview.latestVersionId.startsWith("2026-05-21T22-45-00Z-"))

  const brokenTransitionFiles = state.files.map((file) =>
    file.path.endsWith("/encounters/gatehouse-entry.md") ? { path: file.path, content: file.content.replace("[[encounter:market-square-arrival]]", "[[encounter:missing-market]]") } : file
  )
  const draftSummary = summarizeWorkbenchArtifacts(compileWorkbenchFiles(brokenTransitionFiles, "draftPreview"))
  assert.equal(draftSummary.validationReport.status, "passedWithWarnings")
  assert.equal(draftSummary.validationReport.findings.find((finding) => finding.code === "transition.target.missing")?.severity, "warning")

  const publishSummary = summarizeWorkbenchArtifacts(compileWorkbenchFiles(brokenTransitionFiles, "publish"))
  assert.equal(publishSummary.validationReport.status, "blocked")
  assert.equal(publishSummary.validationReport.findings.find((finding) => finding.code === "transition.target.missing")?.severity, "error")

  console.log("Batch C wiki authoring workbench checks passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
