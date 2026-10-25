import type { AdventureEncounter, AdventurePlan } from "@/types/adventure-plan"
import type { Character, PCTemplate } from "@/types/character"
import { createSourceFile } from "./change-sets"
import { adventureSourcePrefix } from "./s3-keys"
import type { SourceFile } from "./types"

export type MigrationReport = {
  planId: string
  settingId: string
  generatedAt: string
  generatedFiles: Array<{ path: string; kind: string }>
  sourceFieldMappings: Array<{ source: string; destination: string; note?: string }>
  warnings: Array<{ code: string; message: string; source?: string }>
}

export type MyrAdventureMigrationOptions = {
  generatedAt?: Date
  assetHost?: string
  assetKeyPrefix?: string
}

type MigrationContext = {
  plan: AdventurePlan
  options: MyrAdventureMigrationOptions
  files: SourceFile[]
  report: MigrationReport
  encounterIds: Set<string>
}

export function migrateAdventurePlanToWikiSource(plan: AdventurePlan, options: MyrAdventureMigrationOptions = {}): { files: SourceFile[]; report: MigrationReport } {
  const encounters = plan.sections.flatMap((section) => section.scenes.flatMap((scene) => scene.encounters.map((encounter) => ({ section, scene, encounter }))))
  const ctx: MigrationContext = {
    plan,
    options,
    files: [],
    report: {
      planId: plan.id,
      settingId: plan.settingId,
      generatedAt: (options.generatedAt ?? new Date()).toISOString(),
      generatedFiles: [],
      sourceFieldMappings: [],
      warnings: [],
    },
    encounterIds: new Set(encounters.map(({ encounter }) => encounter.id)),
  }

  if (ctx.encounterIds.size !== encounters.length) {
    ctx.report.warnings.push({ code: "duplicate-encounter-id", message: "One or more legacy encounters share an id; publish validation will reject duplicate authored IDs." })
  }
  if (!ctx.encounterIds.has(plan.start)) {
    ctx.report.warnings.push({ code: "missing-start-encounter", message: `Adventure start "${plan.start}" does not match a migrated encounter.`, source: "AdventurePlan.start" })
  }

  addAdventureManifest(ctx)
  for (const [index, { section, scene, encounter }] of encounters.entries()) addEncounter(ctx, section.title, scene.title, index + 1, encounter)
  for (const [id, npc] of Object.entries(plan.npcs)) addNpc(ctx, id, npc)
  for (const pc of plan.premadePlayerCharacters) addPremadeCharacter(ctx, pc)

  return { files: ctx.files.sort((a, b) => a.path.localeCompare(b.path)), report: ctx.report }
}

function addAdventureManifest(ctx: MigrationContext) {
  const { plan } = ctx
  const content = markdownWithFrontmatter(
    {
      id: plan.id,
      type: "adventure",
      title: plan.title,
      settingId: plan.settingId,
      startEncounter: plan.start,
      minPlayers: plan.party[0],
      maxPlayers: plan.party[1],
      premadeCharacters: plan.premadePlayerCharacters.map((pc) => pc.id),
      image: normalizeAssetUrl(ctx, plan.image, "AdventurePlan.image"),
      nextAdventure: plan.nextAdventure,
    },
    [
      ["Teaser", plan.teaser],
      ["Summary", plan.overview],
      ["Authoring Notes", `Migrated from legacy AdventurePlan ${plan.id} by ${plan.author} at version ${plan.version}.`],
    ]
  )
  addFile(ctx, `${adventureSourcePrefix(plan.settingId, plan.id)}/adventure.md`, content, "adventure")
  map(ctx, "AdventurePlan.title", "adventure.md frontmatter.title")
  map(ctx, "AdventurePlan.teaser", "adventure.md ## Teaser")
  map(ctx, "AdventurePlan.overview", "adventure.md ## Summary")
  map(ctx, "AdventurePlan.party", "adventure.md frontmatter.minPlayers/maxPlayers")
  map(ctx, "AdventurePlan.start", "adventure.md frontmatter.startEncounter")
  map(ctx, "AdventurePlan.nextAdventure", "adventure.md frontmatter.nextAdventure")
  map(ctx, "AdventurePlan.premadePlayerCharacters[].id", "adventure.md frontmatter.premadeCharacters")
}

function addEncounter(ctx: MigrationContext, sectionTitle: string, sceneTitle: string, moduleOrder: number, encounter: AdventureEncounter) {
  for (const transition of encounter.transitions ?? []) {
    if (!ctx.encounterIds.has(transition.encounter)) {
      ctx.report.warnings.push({
        code: "unresolved-transition",
        message: `Encounter "${encounter.id}" transitions to missing encounter "${transition.encounter}".`,
        source: `sections[].scenes[].encounters[${encounter.id}].transitions`,
      })
    }
  }
  if (encounter.resetHealth)
    ctx.report.warnings.push({ code: "runtime-flag-preserved-as-note", message: `Encounter "${encounter.id}" used resetHealth; migrated as a GM note.`, source: `${encounter.id}.resetHealth` })
  if (encounter.skipInitialNpcTurns)
    ctx.report.warnings.push({
      code: "runtime-flag-preserved-as-note",
      message: `Encounter "${encounter.id}" used skipInitialNpcTurns; migrated as a GM note.`,
      source: `${encounter.id}.skipInitialNpcTurns`,
    })
  if (encounter.map3d || encounter.map3dKey)
    ctx.report.warnings.push({ code: "map3d-deferred", message: `Encounter "${encounter.id}" has 3D map data; map asset migration is deferred.`, source: `${encounter.id}.map3d` })

  const notes = [
    encounter.instructions,
    encounter.resetHealth ? "Legacy runtime flag: resetHealth was true." : "",
    encounter.skipInitialNpcTurns ? "Legacy runtime flag: skipInitialNpcTurns was true." : "",
    encounter.map3dKey ? `Legacy map3dKey: ${encounter.map3dKey}` : "",
  ]
    .filter(Boolean)
    .join("\n\n")
  const transitions = (encounter.transitions ?? []).map((transition) => `- To [[encounter:${transition.encounter}]] when ${transition.condition}`).join("\n")
  const content = markdownWithFrontmatter(
    {
      moduleOrder,
      sceneTitle,
      sectionTitle,
      id: encounter.id,
      type: "encounter",
      title: encounter.title,
      settingId: ctx.plan.settingId,
      adventureId: ctx.plan.id,
      npcs: (encounter.npc ?? []).map((npc) => ({
        id: npc.id,
        behavior: npc.behavior,
        initialInitiative: npc.initialInitiative,
      })),
      image: normalizeAssetUrl(ctx, encounter.image, `${encounter.id}.image`),
    },
    [
      ["Intro", encounter.intro],
      ["GM Notes", notes],
      ["Transitions", transitions],
      ["Migration Context", `Legacy section: ${sectionTitle}\n\nLegacy scene: ${sceneTitle}`],
    ]
  )
  addFile(ctx, `${adventureSourcePrefix(ctx.plan.settingId, ctx.plan.id)}/encounters/${encounter.id}.md`, content, "encounter")
  map(ctx, `Encounter.${encounter.id}.intro`, `encounters/${encounter.id}.md ## Intro`)
  map(ctx, `Encounter.${encounter.id}.instructions`, `encounters/${encounter.id}.md ## GM Notes`)
  map(ctx, `Encounter.${encounter.id}.transitions`, `encounters/${encounter.id}.md ## Transitions`)
  map(ctx, `Encounter.${encounter.id}.npc`, `encounters/${encounter.id}.md frontmatter.npcs`)
}

function addNpc(ctx: MigrationContext, id: string, npc: Character) {
  const sheet = { ...npc, id, image: normalizeAssetUrl(ctx, npc.image, `AdventurePlan.npcs.${id}.image`) }
  const profile = markdownWithFrontmatter(
    {
      id,
      type: "npc",
      title: npc.name,
      settingId: ctx.plan.settingId,
      sheet: `${id}.json`,
      image: sheet.image,
    },
    [
      ["Summary", [npc.appearance, npc.personality, npc.background, npc.motivation].filter(Boolean).join("\n\n")],
      ["Behavior", npc.behavior ?? ""],
    ]
  )
  addFile(ctx, `content/settings/${ctx.plan.settingId}/npcs/${id}.md`, profile, "npc")
  addFile(ctx, `content/settings/${ctx.plan.settingId}/npcs/${id}.json`, `${JSON.stringify(sheet, null, 2)}\n`, "npcSheet")
  map(ctx, `AdventurePlan.npcs.${id}`, `content/settings/${ctx.plan.settingId}/npcs/${id}.json`)
  map(ctx, `AdventurePlan.npcs.${id}`, `content/settings/${ctx.plan.settingId}/npcs/${id}.md`)
}

function addPremadeCharacter(ctx: MigrationContext, pc: PCTemplate) {
  const sheet = { ...pc, image: normalizeAssetUrl(ctx, pc.image, `premadePlayerCharacters.${pc.id}.image`) }
  const profile = markdownWithFrontmatter(
    {
      id: pc.id,
      type: "premadeCharacter",
      title: pc.name,
      settingId: ctx.plan.settingId,
      adventureId: ctx.plan.id,
      sheet: `${pc.id}.json`,
      image: sheet.image,
    },
    [
      ["Summary", [pc.appearance, pc.personality, pc.background, pc.motivation].filter(Boolean).join("\n\n")],
      ["Starting Sheet", "This authored JSON sheet is the source of truth for the default premade character state."],
    ]
  )
  const base = `${adventureSourcePrefix(ctx.plan.settingId, ctx.plan.id)}/characters`
  addFile(ctx, `${base}/${pc.id}.md`, profile, "premadeCharacter")
  addFile(ctx, `${base}/${pc.id}.json`, `${JSON.stringify(sheet, null, 2)}\n`, "premadeCharacterSheet")
  map(ctx, `AdventurePlan.premadePlayerCharacters.${pc.id}`, `${base}/${pc.id}.json`)
  map(ctx, `AdventurePlan.premadePlayerCharacters.${pc.id}`, `${base}/${pc.id}.md`)
}

function normalizeAssetUrl(ctx: MigrationContext, value: string | undefined, source: string): string | undefined {
  if (!value) return undefined
  if (value.startsWith("https://")) return value
  if (value.startsWith("http://")) {
    ctx.report.warnings.push({ code: "insecure-asset-url", message: `Asset field "${source}" used http; publish validation expects https S3 URLs.`, source })
    return value
  }
  if (!ctx.options.assetHost) {
    ctx.report.warnings.push({ code: "asset-host-missing", message: `Asset key "${value}" could not be converted to a full S3 URL without assetHost.`, source })
    return value
  }
  const key = [ctx.options.assetKeyPrefix, value].filter(Boolean).join("/").replace(/\/+/g, "/").replace(/^\/+/, "")
  const url = `https://${ctx.options.assetHost}/${key}`
  ctx.report.warnings.push({ code: "asset-key-converted", message: `Converted legacy asset key "${value}" to full S3 URL.`, source })
  return url
}

function addFile(ctx: MigrationContext, path: string, content: string, kind: string) {
  ctx.files.push(createSourceFile(path, content))
  ctx.report.generatedFiles.push({ path, kind })
}

function map(ctx: MigrationContext, source: string, destination: string, note?: string) {
  ctx.report.sourceFieldMappings.push({ source, destination, note })
}

function markdownWithFrontmatter(frontmatter: Record<string, unknown>, sections: Array<[string, string | undefined]>): string {
  const yaml = Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined && !(Array.isArray(value) && value.length === 0))
    .flatMap(([key, value]) => yamlLines(key, value))
    .join("\n")
  const body = sections
    .filter(([, value]) => value?.trim())
    .map(([heading, value]) => `## ${heading}\n\n${value?.trim()}`)
    .join("\n\n")
  return `---\n${yaml}\n---\n\n${body}\n`
}

function yamlLines(key: string, value: unknown): string[] {
  if (Array.isArray(value)) {
    return [
      `${key}:`,
      ...value.flatMap((entry) => {
        if (entry && typeof entry === "object") {
          const entries = Object.entries(entry).filter(([, entryValue]) => entryValue !== undefined && entryValue !== "")
          if (entries.length === 0) return []
          const [[firstKey, firstValue], ...rest] = entries
          return [`  - ${firstKey}: ${yamlScalar(firstValue)}`, ...rest.map(([entryKey, entryValue]) => `    ${entryKey}: ${yamlScalar(entryValue)}`)]
        }
        return `  - ${yamlScalar(entry)}`
      }),
    ]
  }
  if (typeof value === "number" || typeof value === "boolean") return [`${key}: ${value}`]
  return [`${key}: ${yamlScalar(value)}`]
}

function yamlScalar(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return JSON.stringify(String(value))
}
