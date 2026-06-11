"use server"

import type { SourceFile, ValidationMode } from "@/lib/wiki-adventures"
import { type AiAuthoringToolInput, proposeAiAuthoringChangeSet } from "@/lib/wiki-adventures/ai-authoring-tools"
import { compileWorkbenchFiles, summarizeWorkbenchArtifacts } from "@/lib/wiki-adventures/workbench-demo"

export async function validateWikiAdventureWorkbenchFiles(files: Array<Pick<SourceFile, "path" | "content">>, mode: ValidationMode) {
  const artifacts = compileWorkbenchFiles(files, mode)
  return summarizeWorkbenchArtifacts(artifacts)
}

export async function proposeWikiAdventureAiChangeSet(files: SourceFile[], input: AiAuthoringToolInput) {
  return proposeAiAuthoringChangeSet(files, input, {
    mode: "draftPreview",
    allowedAssetHosts: ["d20adventures-content.s3.us-east-1.amazonaws.com"],
  })
}
