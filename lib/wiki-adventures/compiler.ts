import { z } from "zod"
import { npcSchema, pcTemplateSchema } from "@/types/character"
import { hashJson } from "./hash"
import { parseMarkdownFile } from "./markdown"
import { isAllowedS3Url } from "./s3-keys"
import { createValidationReport, modeSeverity } from "./validation"
import type { ParsedMarkdownFile, RuntimeArtifacts, RuntimeEncounter, RuntimeEntityRecord, RuntimeTransition, SourceFile, ValidationFinding, ValidationMode } from "./types"

const adventureFrontmatterSchema = z.object({
  id: z.string().min(1),
  type: z.literal("adventure"),
  title: z.string().min(1),
  settingId: z.string().min(1),
  startEncounter: z.string().min(1),
  image: z.string().optional(),
  recommendedPlayers: z.number().optional(),
  minPlayers: z.number().optional(),
  maxPlayers: z.number().optional(),
  premadeCharacters: z.array(z.string()).optional(),
  nextAdventure: z.string().optional(),
})

const commonFrontmatterSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  settingId: z.string().min(1),
  adventureId: z.string().optional(),
  image: z.string().optional(),
  summary: z.string().optional(),
  sheet: z.string().optional(),
  location: z.string().optional(),
  npcs: z
    .array(
      z.union([
        z.string(),
        z.object({
          id: z.string().min(1),
          behavior: z.string().optional(),
          initialInitiative: z.number().optional(),
        }),
      ])
    )
    .optional(),
  assets: z.array(z.string()).optional(),
})

export type CompileOptions = {
  mode: ValidationMode
  contentVersion: string
  allowedAssetHosts?: string[]
}

export function compileAdventureSourceTree(files: SourceFile[], options: CompileOptions): RuntimeArtifacts {
  const findings: ValidationFinding[] = []
  const markdownFiles = files.filter((file) => file.path.endsWith(".md")).map(parseMarkdownFile)
  const jsonFiles = files.filter((file) => file.path.endsWith(".json"))
  const byId = new Map<string, ParsedMarkdownFile>()

  for (const file of markdownFiles) {
    const parsed = commonFrontmatterSchema.safeParse(file.frontmatter)
    if (!parsed.success) {
      findings.push({
        code: Object.keys(file.frontmatter).length ? "frontmatter.invalid" : "frontmatter.missing",
        severity: "error",
        sourcePath: file.path,
        message: `Invalid frontmatter: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`,
        aiFixable: true,
      })
      continue
    }
    const id = parsed.data.id
    if (byId.has(id)) {
      findings.push({
        code: "id.duplicate",
        severity: "error",
        sourcePath: file.path,
        sourceId: id,
        sourceType: parsed.data.type,
        message: `Duplicate authored ID "${id}".`,
        aiFixable: false,
      })
      continue
    }
    byId.set(id, file)
    validateAssetUrl(file, parsed.data.image, options, findings)
  }

  const adventureFile = markdownFiles.find((file) => file.frontmatter.type === "adventure")
  const adventureParse = adventureFile ? adventureFrontmatterSchema.safeParse(adventureFile.frontmatter) : null
  if (!adventureFile || !adventureParse?.success) {
    findings.push({
      code: "frontmatter.invalid",
      severity: "error",
      sourcePath: adventureFile?.path ?? "content/",
      sourceType: "adventure",
      message: "Adventure manifest is missing or invalid.",
      aiFixable: true,
    })
  }

  const adventure = adventureParse?.success ? adventureParse.data : null
  const encounters = markdownFiles.filter((file) => file.frontmatter.type === "encounter")
  const encounterIds = new Set(encounters.map((file) => String(file.frontmatter.id)))
  if (adventure && !encounterIds.has(adventure.startEncounter)) {
    findings.push({
      code: "adventure.startEncounter.missing",
      severity: "error",
      sourcePath: adventureFile!.path,
      sourceId: adventure.id,
      sourceType: "adventure",
      message: `Start encounter "${adventure.startEncounter}" does not resolve to an encounter.`,
      target: { type: "encounter", id: adventure.startEncounter },
      aiFixable: true,
      suggestedFix: { type: "createStubEncounter", id: adventure.startEncounter },
    })
  }

  const runtimeEncounters: Record<string, RuntimeEncounter> = {}
  const transitions: RuntimeTransition[] = []
  for (const file of encounters) {
    const frontmatter = commonFrontmatterSchema.parse(file.frontmatter)
    const extractedTransitions = extractTransitions(file, encounterIds, options.mode, findings)
    transitions.push(...extractedTransitions)
    runtimeEncounters[frontmatter.id] = {
      id: frontmatter.id,
      type: "encounter",
      title: frontmatter.title,
      settingId: frontmatter.settingId,
      adventureId: frontmatter.adventureId ?? adventure?.id ?? "",
      contentVersion: options.contentVersion,
      sourcePath: file.path,
      sourceHash: file.hash,
      image: frontmatter.image,
      assetIds: frontmatter.assets ?? [],
      locationId: frontmatter.location,
      npcRefs: (frontmatter.npcs ?? []).map((npc) => (typeof npc === "string" ? { id: npc } : npc)),
      sections: file.sections,
      summary: frontmatter.summary ?? file.sections.summary,
      typedLinks: file.typedLinks,
      transitions: extractedTransitions,
      validationStatus: extractedTransitions.every((entry) => entry.publishResolved) ? "valid" : options.mode === "publish" ? "blocked" : "draftOnly",
    }
  }

  const characterSheets = compileCharacterSheets(jsonFiles, markdownFiles, findings)
  const entities = compileEntities(markdownFiles, jsonFiles)
  const validationReport = createValidationReport(options.mode, findings)
  const manifest = {
    schemaVersion: 1 as const,
    settingId: adventure?.settingId ?? "",
    adventureId: adventure?.id ?? "",
    planId: adventure?.id ?? "",
    contentVersion: options.contentVersion,
    title: adventure?.title ?? "Invalid Adventure",
    image: adventure?.image,
    startEncounterId: adventure?.startEncounter ?? "",
    recommendedPlayers: adventure?.recommendedPlayers,
    minPlayers: adventure?.minPlayers,
    maxPlayers: adventure?.maxPlayers,
    premadeCharacterIds: adventure?.premadeCharacters ?? [],
    nextAdventureId: adventure?.nextAdventure,
    sourcePath: adventureFile?.path ?? "",
    contentHash: hashJson(files.map((file) => ({ path: file.path, hash: file.hash }))),
    validation: {
      mode: validationReport.mode,
      status: validationReport.status,
      ...validationReport.summary,
    },
  }

  return {
    manifest,
    encounters: runtimeEncounters,
    entities,
    characterSheets,
    graph: {
      startEncounterId: manifest.startEncounterId,
      encounterTransitions: transitions,
      typedLinks: markdownFiles.flatMap((file) =>
        file.typedLinks.map((link) => ({
          fromType: String(file.frontmatter.type ?? "unknown"),
          from: String(file.frontmatter.id ?? file.path),
          toType: link.type,
          to: link.id,
        }))
      ),
    },
    retrievalIndex: {
      records: [
        ...Object.values(runtimeEncounters).map((encounter) => ({
          id: `encounter:${encounter.id}`,
          kind: "encounter",
          title: encounter.title,
          summary: encounter.summary,
          sourcePath: encounter.sourcePath,
          tags: [],
          linkedRecordIds: encounter.typedLinks.map((link) => `${link.type}:${link.id}`),
          promptSections: Object.keys(encounter.sections),
        })),
        ...Object.values(entities.locations).map(entityToRetrievalRecord),
        ...Object.values(entities.npcProfiles).map(entityToRetrievalRecord),
      ],
    },
    validationReport,
  }
}

function extractTransitions(file: ParsedMarkdownFile, encounterIds: Set<string>, mode: ValidationMode, findings: ValidationFinding[]): RuntimeTransition[] {
  const text = file.sections.transitions ?? file.body
  const transitions: RuntimeTransition[] = []
  for (const link of file.typedLinks.filter((entry) => entry.type === "encounter")) {
    const sourceLine = text
      .split(/\r?\n/)
      .find((line) => line.includes(`[[encounter:${link.id}`))
      ?.trim()
    if (!sourceLine) continue
    const resolved = encounterIds.has(link.id)
    if (!resolved) {
      findings.push({
        code: "transition.target.missing",
        severity: modeSeverity(mode, "error", "warning"),
        sourcePath: file.path,
        sourceId: String(file.frontmatter.id),
        sourceType: "encounter",
        message: `Transition target "${link.id}" does not resolve to an encounter.`,
        target: { type: "encounter", id: link.id },
        aiFixable: true,
        suggestedFix: { type: "createStubEncounter", id: link.id },
      })
    }
    transitions.push({
      fromEncounterId: String(file.frontmatter.id),
      toEncounterId: link.id,
      label: link.label,
      condition: sourceLine.replace(/^[-*]\s*/, ""),
      sourceText: sourceLine,
      publishResolved: resolved,
    })
  }
  return transitions
}

function compileCharacterSheets(jsonFiles: SourceFile[], markdownFiles: ParsedMarkdownFile[], findings: ValidationFinding[]): RuntimeArtifacts["characterSheets"] {
  const profilesById = new Map(markdownFiles.map((file) => [String(file.frontmatter.id), file]))
  const premadeCharacters: RuntimeArtifacts["characterSheets"]["premadeCharacters"] = {}
  const npcs: RuntimeArtifacts["characterSheets"]["npcs"] = {}

  for (const file of jsonFiles) {
    let parsed: unknown
    try {
      parsed = JSON.parse(file.content)
    } catch (error) {
      findings.push({
        code: "character.sheet.invalid",
        severity: "error",
        sourcePath: file.path,
        message: `Character sheet is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
        aiFixable: true,
      })
      continue
    }

    const pcResult = pcTemplateSchema.safeParse(parsed)
    if (pcResult.success) {
      const profile = profilesById.get(pcResult.data.id)
      premadeCharacters[pcResult.data.id] = {
        sheet: pcResult.data,
        sheetPath: file.path,
        profilePath: profile?.path,
        sheetHash: file.hash,
        profileHash: profile?.hash,
      }
      continue
    }

    const npcResult = npcSchema.safeParse(parsed)
    if (npcResult.success) {
      const profile = profilesById.get(npcResult.data.id)
      npcs[npcResult.data.id] = {
        sheet: npcResult.data,
        sheetPath: file.path,
        profilePath: profile?.path,
        sheetHash: file.hash,
        profileHash: profile?.hash,
      }
      continue
    }

    findings.push({
      code: "character.sheet.invalid",
      severity: "error",
      sourcePath: file.path,
      message: `Character sheet does not match PC template or NPC schema.`,
      aiFixable: true,
    })
  }

  return { premadeCharacters, npcs }
}

function compileEntities(markdownFiles: ParsedMarkdownFile[], jsonFiles: SourceFile[]): RuntimeArtifacts["entities"] {
  const blank: RuntimeArtifacts["entities"] = {
    locations: {},
    npcProfiles: {},
    premadeCharacterProfiles: {},
    factions: {},
    items: {},
    assets: {},
  } satisfies RuntimeArtifacts["entities"]

  const jsonPaths = new Set(jsonFiles.map((file) => file.path))
  for (const file of markdownFiles) {
    const parsed = commonFrontmatterSchema.safeParse(file.frontmatter)
    if (!parsed.success) continue
    const record = entityRecord(file, parsed.data.sheet, jsonPaths)
    if (parsed.data.type === "location") blank.locations[parsed.data.id] = record
    if (parsed.data.type === "npc") blank.npcProfiles[parsed.data.id] = { ...record, type: "npcProfile" }
    if (parsed.data.type === "premadeCharacter") blank.premadeCharacterProfiles[parsed.data.id] = record
    if (parsed.data.type === "faction") blank.factions[parsed.data.id] = record
    if (parsed.data.type === "item") blank.items[parsed.data.id] = record
    if (parsed.data.type === "asset") blank.assets[parsed.data.id] = record
  }
  return blank
}

function entityRecord(file: ParsedMarkdownFile, sheet: string | undefined, jsonPaths: Set<string>): RuntimeEntityRecord {
  const sheetPath = sheet ? resolveSiblingPath(file.path, sheet) : undefined
  return {
    id: String(file.frontmatter.id),
    type: String(file.frontmatter.type),
    title: String(file.frontmatter.title),
    sourcePath: file.path,
    image: typeof file.frontmatter.image === "string" ? file.frontmatter.image : undefined,
    summary: typeof file.frontmatter.summary === "string" ? file.frontmatter.summary : file.sections.summary,
    sections: file.sections,
    typedLinks: file.typedLinks,
    sourceHash: file.hash,
    sheetId: sheetPath && jsonPaths.has(sheetPath) ? String(file.frontmatter.id) : undefined,
    sheetPath,
  }
}

function entityToRetrievalRecord(entity: RuntimeEntityRecord) {
  return {
    id: `${entity.type}:${entity.id}`,
    kind: entity.type,
    title: entity.title,
    summary: entity.summary,
    sourcePath: entity.sourcePath,
    tags: [],
    linkedRecordIds: entity.typedLinks.map((link) => `${link.type}:${link.id}`),
    promptSections: Object.keys(entity.sections),
  }
}

function resolveSiblingPath(path: string, filename: string): string {
  return `${path.split("/").slice(0, -1).join("/")}/${filename}`
}

function validateAssetUrl(file: ParsedMarkdownFile, image: string | undefined, options: CompileOptions, findings: ValidationFinding[]) {
  if (!image) return
  const hosts = options.allowedAssetHosts ?? []
  if (!image.startsWith("https://")) {
    findings.push({
      code: "asset.url.invalid",
      severity: "warning",
      sourcePath: file.path,
      sourceId: String(file.frontmatter.id ?? ""),
      sourceType: String(file.frontmatter.type ?? ""),
      message: "Image fields must use full S3 HTTPS URLs.",
      aiFixable: true,
    })
    return
  }
  if (hosts.length > 0 && !isAllowedS3Url(image, hosts)) {
    findings.push({
      code: "asset.url.unapproved",
      severity: "warning",
      sourcePath: file.path,
      sourceId: String(file.frontmatter.id ?? ""),
      sourceType: String(file.frontmatter.type ?? ""),
      message: "Image URL is not from an approved S3 host.",
      aiFixable: true,
    })
  }
}
