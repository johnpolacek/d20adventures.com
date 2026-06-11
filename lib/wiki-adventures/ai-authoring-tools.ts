import { applyAuthoringChangeSet, createSourceTree } from "./change-sets"
import { compileAdventureSourceTree } from "./compiler"
import { hashContent } from "./hash"
import { adventureSourcePrefix } from "./s3-keys"
import type { AuthoringChangeSet, SourceFile, ValidationMode, ValidationReport, WikiContentType } from "./types"

export const aiAuthoringToolIds = [
  "createEncounter",
  "expandEncounter",
  "splitEncounter",
  "linkTransition",
  "repairMissingTransition",
  "summarizeEntity",
  "addTransition",
  "createCharacterPair",
] as const

export type AiAuthoringToolId = (typeof aiAuthoringToolIds)[number]

export type AiAuthoringToolInput =
  | {
      tool: "createEncounter"
      settingId: string
      planId: string
      encounterId: string
      title: string
      intro: string
      gmNotes?: string
    }
  | {
      tool: "expandEncounter"
      path: string
      expansion: string
    }
  | {
      tool: "splitEncounter"
      sourcePath: string
      newEncounterId: string
      newTitle: string
      movedText: string
      transitionCondition: string
    }
  | {
      tool: "linkTransition"
      sourcePath: string
      targetEncounterId: string
      condition: string
      label?: string
    }
  | {
      tool: "repairMissingTransition"
      settingId: string
      planId: string
      targetEncounterId: string
      title?: string
    }
  | {
      tool: "summarizeEntity"
      path: string
      summary: string
    }
  | {
      tool: "addTransition"
      sourcePath: string
      targetEncounterId: string
      condition: string
    }
  | {
      tool: "createCharacterPair"
      settingId: string
      planId: string
      characterType: "npc" | "premadeCharacter"
      characterId: string
      name: string
      image: string
      archetype: string
      race: string
      appearance: string
    }

export type ChangePreview = {
  op: AuthoringChangeSet["changes"][number]["op"]
  path: string
  before?: string
  after?: string
  beforeHash?: string
  afterHash?: string
}

export type AiAuthoringProposal = {
  tool: AiAuthoringToolId
  changeSet: AuthoringChangeSet
  diff: ChangePreview[]
  validationBefore: ValidationReport
  validationAfter: ValidationReport
  requiresMechanicalConfirmation: boolean
}

export function proposeAiAuthoringChangeSet(files: SourceFile[], input: AiAuthoringToolInput, options: { mode?: ValidationMode; allowedAssetHosts?: string[] } = {}): AiAuthoringProposal {
  const mode = options.mode ?? "draftPreview"
  const before = compileAdventureSourceTree(files, { mode, contentVersion: "authoring-before", allowedAssetHosts: options.allowedAssetHosts })
  const changeSet = buildChangeSet(files, input)
  const tree = createSourceTree(files)
  const nextTree = applyAuthoringChangeSet(tree, changeSet)
  const nextFiles = [...nextTree.values()].sort((a, b) => a.path.localeCompare(b.path))
  const after = compileAdventureSourceTree(nextFiles, { mode, contentVersion: "authoring-after", allowedAssetHosts: options.allowedAssetHosts })
  return {
    tool: input.tool,
    changeSet,
    diff: previewChanges(files, changeSet),
    validationBefore: before.validationReport,
    validationAfter: after.validationReport,
    requiresMechanicalConfirmation: changeSet.changes.some((change) => ("path" in change ? change.path : change.toPath).endsWith(".json")),
  }
}

function buildChangeSet(files: SourceFile[], input: AiAuthoringToolInput): AuthoringChangeSet {
  const source = new Map(files.map((file) => [file.path, file]))
  const plan = inferTarget(files, input)
  const base = {
    id: `ai-${input.tool}-${Date.now()}`,
    intent: authoringIntent(input),
    source: "ai" as const,
    target: { settingId: plan.settingId, planId: plan.planId, draftId: "active" },
    risks: risksFor(input),
  }

  if (input.tool === "createEncounter") {
    const path = `${adventureSourcePrefix(input.settingId, input.planId)}/encounters/${input.encounterId}.md`
    return {
      ...base,
      changes: [{ op: "create", path, content: encounterMarkdown(input.settingId, input.planId, input.encounterId, input.title, input.intro, input.gmNotes) }],
      affectedEntities: [{ type: "encounter", id: input.encounterId }],
    }
  }

  if (input.tool === "expandEncounter") {
    const file = requiredFile(source, input.path)
    return {
      ...base,
      changes: [{ op: "update", path: file.path, beforeHash: file.hash, content: appendSection(file.content, "GM Notes", input.expansion) }],
      affectedEntities: [entityFromPath(file.path, "encounter")],
    }
  }

  if (input.tool === "splitEncounter") {
    const file = requiredFile(source, input.sourcePath)
    const planId = plan.planId ?? "unknown-adventure"
    const settingId = plan.settingId
    const newPath = `${adventureSourcePrefix(settingId, planId)}/encounters/${input.newEncounterId}.md`
    return {
      ...base,
      changes: [
        { op: "update", path: file.path, beforeHash: file.hash, content: appendTransition(file.content, input.newEncounterId, input.transitionCondition) },
        { op: "create", path: newPath, content: encounterMarkdown(settingId, planId, input.newEncounterId, input.newTitle, input.movedText, "Split from a larger source encounter.") },
      ],
      affectedEntities: [entityFromPath(file.path, "encounter"), { type: "encounter", id: input.newEncounterId }],
    }
  }

  if (input.tool === "linkTransition" || input.tool === "addTransition") {
    const file = requiredFile(source, input.sourcePath)
    return {
      ...base,
      changes: [
        {
          op: "update",
          path: file.path,
          beforeHash: file.hash,
          content: appendTransition(file.content, input.targetEncounterId, input.condition, input.tool === "linkTransition" ? input.label : undefined),
        },
      ],
      affectedEntities: [entityFromPath(file.path, "encounter"), { type: "encounter", id: input.targetEncounterId }],
    }
  }

  if (input.tool === "repairMissingTransition") {
    const path = `${adventureSourcePrefix(input.settingId, input.planId)}/encounters/${input.targetEncounterId}.md`
    return {
      ...base,
      changes: [
        {
          op: "create",
          path,
          content: encounterMarkdown(
            input.settingId,
            input.planId,
            input.targetEncounterId,
            input.title ?? titleFromId(input.targetEncounterId),
            "Planning stub for an unresolved transition target.",
            "Replace this stub before publish if the encounter needs full authored content."
          ),
        },
      ],
      affectedEntities: [{ type: "encounter", id: input.targetEncounterId }],
    }
  }

  if (input.tool === "summarizeEntity") {
    const file = requiredFile(source, input.path)
    return {
      ...base,
      changes: [{ op: "update", path: file.path, beforeHash: file.hash, content: upsertSection(file.content, "Summary", input.summary) }],
      affectedEntities: [entityFromPath(file.path, "adventure")],
    }
  }

  const paths = characterPairPaths(input.settingId, input.planId, input.characterType, input.characterId)
  return {
    ...base,
    changes: [
      { op: "create", path: paths.markdownPath, content: characterProfileMarkdown(input) },
      { op: "create", path: paths.jsonPath, content: `${JSON.stringify(characterSheet(input), null, 2)}\n` },
    ],
    affectedEntities: [{ type: input.characterType === "npc" ? "npc" : "premadeCharacter", id: input.characterId }],
  }
}

function previewChanges(files: SourceFile[], changeSet: AuthoringChangeSet): ChangePreview[] {
  const source = new Map(files.map((file) => [file.path, file]))
  return changeSet.changes.map((change) => {
    if (change.op === "create") return { op: change.op, path: change.path, after: change.content, afterHash: hashContent(change.content) }
    if (change.op === "update") {
      const before = source.get(change.path)
      return { op: change.op, path: change.path, before: before?.content, after: change.content, beforeHash: change.beforeHash, afterHash: hashContent(change.content) }
    }
    if (change.op === "delete") {
      const before = source.get(change.path)
      return { op: change.op, path: change.path, before: before?.content, beforeHash: change.beforeHash }
    }
    const before = source.get(change.fromPath)
    return { op: change.op, path: change.toPath, before: before?.content, after: before?.content, beforeHash: change.beforeHash, afterHash: before?.hash }
  })
}

function requiredFile(source: Map<string, SourceFile>, path: string): SourceFile {
  const file = source.get(path)
  if (!file) throw new Error(`Source file not found: ${path}`)
  return file
}

function inferTarget(files: SourceFile[], input: AiAuthoringToolInput): { settingId: string; planId?: string } {
  if ("settingId" in input) return { settingId: input.settingId, planId: "planId" in input ? input.planId : undefined }
  const adventurePath = files.find((file) => file.path.endsWith("/adventure.md"))?.path
  const match = adventurePath?.match(/^content\/settings\/([^/]+)\/adventures\/([^/]+)\//)
  return { settingId: match?.[1] ?? "unknown-setting", planId: match?.[2] }
}

function authoringIntent(input: AiAuthoringToolInput): string {
  const labels: Record<AiAuthoringToolId, string> = {
    createEncounter: "Create a new encounter source file",
    expandEncounter: "Expand encounter prose",
    splitEncounter: "Split encounter content into a linked encounter",
    linkTransition: "Link encounter transition",
    repairMissingTransition: "Repair missing transition target with a stub encounter",
    summarizeEntity: "Summarize selected wiki entity",
    addTransition: "Add transition edge",
    createCharacterPair: "Create paired character profile and sheet",
  }
  return labels[input.tool]
}

function risksFor(input: AiAuthoringToolInput): string[] {
  if (input.tool === "createCharacterPair") return ["Creates mechanical JSON; requires explicit mechanical confirmation."]
  if (input.tool === "splitEncounter") return ["Creates a new encounter and changes graph shape."]
  if (input.tool === "repairMissingTransition") return ["Creates a planning stub that may need richer authored content before publish."]
  if (input.tool === "linkTransition" || input.tool === "addTransition") return ["Changes graph movement options."]
  return []
}

function appendTransition(content: string, targetEncounterId: string, condition: string, label?: string): string {
  const link = label ? `[[encounter:${targetEncounterId}|${label}]]` : `[[encounter:${targetEncounterId}]]`
  return appendSection(content, "Transitions", `- To ${link} when ${condition}`)
}

function appendSection(content: string, heading: string, text: string): string {
  if (content.includes(`## ${heading}`)) return `${content.trimEnd()}\n\n${text.trim()}\n`
  return `${content.trimEnd()}\n\n## ${heading}\n\n${text.trim()}\n`
}

function upsertSection(content: string, heading: string, text: string): string {
  const pattern = new RegExp(`(^## ${escapeRegExp(heading)}\\n\\n)[\\s\\S]*?(?=\\n## |$)`, "m")
  if (pattern.test(content)) return content.replace(pattern, `$1${text.trim()}\n`)
  return appendSection(content, heading, text)
}

function encounterMarkdown(settingId: string, planId: string, encounterId: string, title: string, intro: string, gmNotes?: string): string {
  return `---\nid: ${JSON.stringify(encounterId)}\ntype: "encounter"\ntitle: ${JSON.stringify(title)}\nsettingId: ${JSON.stringify(settingId)}\nadventureId: ${JSON.stringify(planId)}\n---\n\n## Intro\n\n${intro.trim()}\n\n${gmNotes ? `## GM Notes\n\n${gmNotes.trim()}\n` : ""}`
}

function characterPairPaths(settingId: string, planId: string, type: "npc" | "premadeCharacter", id: string): { markdownPath: string; jsonPath: string } {
  const base = type === "npc" ? `content/settings/${settingId}/npcs` : `${adventureSourcePrefix(settingId, planId)}/characters`
  return { markdownPath: `${base}/${id}.md`, jsonPath: `${base}/${id}.json` }
}

function characterProfileMarkdown(input: Extract<AiAuthoringToolInput, { tool: "createCharacterPair" }>): string {
  return `---\nid: ${JSON.stringify(input.characterId)}\ntype: ${JSON.stringify(input.characterType)}\ntitle: ${JSON.stringify(input.name)}\nsettingId: ${JSON.stringify(input.settingId)}\n${input.characterType === "premadeCharacter" ? `adventureId: ${JSON.stringify(input.planId)}\n` : ""}sheet: ${JSON.stringify(`${input.characterId}.json`)}\nimage: ${JSON.stringify(input.image)}\n---\n\n## Summary\n\n${input.appearance}\n`
}

function characterSheet(input: Extract<AiAuthoringToolInput, { tool: "createCharacterPair" }>) {
  return {
    id: input.characterId,
    type: input.characterType === "npc" ? "npc" : "pc",
    name: input.name,
    image: input.image,
    archetype: input.archetype,
    race: input.race,
    appearance: input.appearance,
    healthPercent: 100,
    attributes: input.characterType === "npc" ? { strength: 10, dexterity: 10, constitution: 10 } : { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    equipment: [],
    skills: [],
    spells: [],
    specialAbilities: [],
    effects: [],
  }
}

function entityFromPath(path: string, fallback: WikiContentType): { type: WikiContentType | "character"; id: string } {
  const filename = path
    .split("/")
    .at(-1)
    ?.replace(/\.(md|json)$/, "")
  if (path.includes("/encounters/")) return { type: "encounter", id: filename ?? "unknown" }
  if (path.includes("/npcs/")) return { type: "npc", id: filename ?? "unknown" }
  if (path.includes("/characters/")) return { type: "character", id: filename ?? "unknown" }
  if (path.endsWith("/adventure.md")) return { type: "adventure", id: path.split("/").at(-2) ?? "unknown" }
  return { type: fallback, id: filename ?? "unknown" }
}

function titleFromId(id: string): string {
  return id
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
