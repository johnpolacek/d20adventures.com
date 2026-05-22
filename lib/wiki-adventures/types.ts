import { z } from "zod"
import { npcSchema, pcTemplateSchema } from "@/types/character"

export const wikiContentTypes = [
  "setting",
  "adventure",
  "encounter",
  "npc",
  "location",
  "premadeCharacter",
  "faction",
  "item",
  "asset",
] as const

export type WikiContentType = (typeof wikiContentTypes)[number]

export const validationModes = ["draftPreview", "publish"] as const
export type ValidationMode = (typeof validationModes)[number]

export const validationSeverities = ["error", "warning", "suggestion"] as const
export type ValidationSeverity = (typeof validationSeverities)[number]

export const validationFindingCodes = [
  "frontmatter.missing",
  "frontmatter.invalid",
  "id.duplicate",
  "adventure.startEncounter.missing",
  "transition.target.missing",
  "character.sheet.invalid",
  "asset.url.invalid",
  "asset.url.unapproved",
  "link.target.missing",
] as const

export type ValidationFindingCode = (typeof validationFindingCodes)[number]

export type SourceFile = {
  path: string
  content: string
  hash: string
}

export type ParsedMarkdownFile = SourceFile & {
  frontmatter: Record<string, unknown>
  body: string
  sections: Record<string, string>
  typedLinks: RuntimeLink[]
}

export type RuntimeLink = {
  type: string
  id: string
  label?: string
}

export type RuntimeTransition = {
  fromEncounterId: string
  toEncounterId: string
  label?: string
  condition: string
  sourceText: string
  publishResolved: boolean
}

export type ValidationFinding = {
  code: ValidationFindingCode
  severity: ValidationSeverity
  sourcePath: string
  sourceId?: string
  sourceType?: string
  message: string
  target?: {
    type: string
    id: string
  }
  aiFixable: boolean
  suggestedFix?: Record<string, unknown>
}

export type ValidationReport = {
  mode: ValidationMode
  status: "blocked" | "passed" | "passedWithWarnings"
  summary: {
    errorCount: number
    warningCount: number
    suggestionCount: number
  }
  findings: ValidationFinding[]
}

export type RuntimeManifest = {
  schemaVersion: 1
  settingId: string
  adventureId: string
  planId: string
  contentVersion: string
  title: string
  teaser?: string
  summary?: string
  image?: string
  startEncounterId: string
  recommendedPlayers?: number
  minPlayers?: number
  maxPlayers?: number
  premadeCharacterIds: string[]
  nextAdventureId?: string
  sourcePath: string
  contentHash: string
  validation: Pick<ValidationReport, "mode" | "status"> & ValidationReport["summary"]
}

export type RuntimeEncounter = {
  id: string
  type: "encounter"
  title: string
  settingId: string
  adventureId: string
  contentVersion: string
  sourcePath: string
  sourceHash: string
  image?: string
  assetIds: string[]
  locationId?: string
  npcRefs: Array<{ id: string; behavior?: string; initialInitiative?: number }>
  sections: Record<string, string>
  summary?: string
  typedLinks: RuntimeLink[]
  transitions: RuntimeTransition[]
  validationStatus: "valid" | "draftOnly" | "blocked"
}

export type RuntimeEntityRecord = {
  id: string
  type: string
  title: string
  sourcePath: string
  image?: string
  summary?: string
  sections: Record<string, string>
  typedLinks: RuntimeLink[]
  sourceHash: string
  sheetId?: string
  sheetPath?: string
}

export type RuntimeArtifacts = {
  manifest: RuntimeManifest
  encounters: Record<string, RuntimeEncounter>
  entities: {
    locations: Record<string, RuntimeEntityRecord>
    npcProfiles: Record<string, RuntimeEntityRecord>
    premadeCharacterProfiles: Record<string, RuntimeEntityRecord>
    factions: Record<string, RuntimeEntityRecord>
    items: Record<string, RuntimeEntityRecord>
    assets: Record<string, RuntimeEntityRecord>
  }
  characterSheets: {
    premadeCharacters: Record<string, { sheet: z.infer<typeof pcTemplateSchema>; sheetPath: string; profilePath?: string; sheetHash: string; profileHash?: string }>
    npcs: Record<string, { sheet: z.infer<typeof npcSchema>; sheetPath: string; profilePath?: string; sheetHash: string; profileHash?: string }>
  }
  graph: {
    startEncounterId: string
    encounterTransitions: RuntimeTransition[]
    typedLinks: Array<{ fromType: string; from: string; toType: string; to: string }>
  }
  retrievalIndex: {
    records: Array<{
      id: string
      kind: string
      title: string
      summary?: string
      sourcePath: string
      tags: string[]
      linkedRecordIds: string[]
      promptSections: string[]
    }>
  }
  validationReport: ValidationReport
}

export type AuthoringChangeSet = {
  id: string
  intent: string
  source: "ai" | "human"
  target: {
    settingId: string
    planId?: string
    draftId: string
  }
  changes: Array<
    | { op: "create"; path: string; content: string }
    | { op: "update"; path: string; beforeHash: string; content: string }
    | { op: "rename"; fromPath: string; toPath: string; beforeHash: string }
    | { op: "delete"; path: string; beforeHash: string }
  >
  affectedEntities: Array<{
    type: WikiContentType | "character"
    id: string
  }>
  risks: string[]
}

