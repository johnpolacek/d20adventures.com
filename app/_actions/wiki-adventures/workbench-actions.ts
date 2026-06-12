"use server"

import { requireAdmin } from "@/lib/auth-utils"
import type { SourceFile, ValidationMode } from "@/lib/wiki-adventures"
import { type AiAuthoringToolInput, proposeAiAuthoringChangeSet } from "@/lib/wiki-adventures/ai-authoring-tools"
import { compileWorkbenchFiles, summarizeWorkbenchArtifacts } from "@/lib/wiki-adventures/workbench-demo"

async function assertAdmin() {
  const result = await requireAdmin()
  if (!result.isAdmin) throw new Error("Unauthorized")
}

export async function validateWikiAdventureWorkbenchFiles(files: Array<Pick<SourceFile, "path" | "content">>, mode: ValidationMode) {
  await assertAdmin()
  const artifacts = compileWorkbenchFiles(files, mode)
  return summarizeWorkbenchArtifacts(artifacts)
}

export async function proposeWikiAdventureAiChangeSet(files: SourceFile[], input: AiAuthoringToolInput) {
  await assertAdmin()
  return proposeAiAuthoringChangeSet(files, input, {
    mode: "draftPreview",
    allowedAssetHosts: ["d20adventures-content.s3.us-east-1.amazonaws.com"],
  })
}
