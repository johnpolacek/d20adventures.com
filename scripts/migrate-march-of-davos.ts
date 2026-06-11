import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import slugify from "slugify"
import { compileAdventureSourceTree } from "@/lib/wiki-adventures/compiler"
import { migrateAdventurePlanToWikiSource } from "@/lib/wiki-adventures/myr-migration"
import type { AdventureEncounter, AdventurePlan, AdventureScene, AdventureSection } from "@/types/adventure-plan"
import type { Character } from "@/types/character"

type MarchLegacyNpc = {
  name: string
  race?: string
  gender?: string
  characterClass?: string
  level?: string
  appearance?: string
  personality?: string
  abilities?: string
  characterId: string
  image?: string
  specialAbilities?: Array<{ name?: string; description?: string }>
}

type MarchLegacyEncounter = {
  name: string
  narrative?: string
  notes?: string
  image?: string
  npcs?: MarchLegacyNpc[]
  stages?: MarchLegacyEncounter[]
}

type MarchLegacyScene = {
  title: string
  description?: string
  encounters: MarchLegacyEncounter[]
}

type MarchLegacySection = {
  title?: string
  plot?: string
  scenes: MarchLegacyScene[]
}

type MarchLegacyPlan = Omit<AdventurePlan, "sections" | "npcs"> & {
  summary?: string
  sections: MarchLegacySection[]
  npcs?: Record<string, Character>
}

const sourcePath = "wiki/sources/adventure plans/the-march-of-davos-plan.json"
const assetHost = "d20-public.s3.us-east-1.amazonaws.com"
const cloudfrontHost = "d1dkwd3w4hheqw.cloudfront.net"
const legacyS3Host = "s3.us-east-1.amazonaws.com"
const contentVersion = "2026-05-23T00-00-00Z-march-of-davos-migration"

const legacyPlan = JSON.parse(readFileSync(sourcePath, "utf8")) as MarchLegacyPlan
const { plan, normalizedEncounterCount, normalizedNpcCount } = normalizeLegacyPlan(legacyPlan)

const migration = migrateAdventurePlanToWikiSource(plan, {
  generatedAt: new Date("2026-05-23T00:00:00.000Z"),
  assetHost,
})

migration.report.warnings.push({
  code: "legacy-format-normalized",
  message: `Normalized older March of Davos encounter shape into ${normalizedEncounterCount} AdventurePlan encounters and ${normalizedNpcCount} reusable NPC sheets.`,
  source: "sections[].scenes[].encounters[]",
})
migration.report.warnings.push({
  code: "legacy-start-repaired",
  message: 'Set blank AdventurePlan.start to "the-gates-of-kordavos", the first authored encounter in March of Davos.',
  source: "AdventurePlan.start",
})
migration.report.warnings.push({
  code: "linear-transitions-inferred",
  message: "Inferred linear transitions between legacy encounters because the source did not include explicit transition targets.",
  source: "sections[].scenes[].encounters[]",
})

for (const file of migration.files) {
  mkdirSync(dirname(file.path), { recursive: true })
  writeFileSync(file.path, file.content)
}

const reportPath = `content/settings/${plan.settingId}/adventures/${plan.id}/migration-report.json`
mkdirSync(dirname(reportPath), { recursive: true })
writeFileSync(reportPath, `${JSON.stringify(migration.report, null, 2)}\n`)

const compiled = compileAdventureSourceTree(migration.files, {
  mode: "publish",
  contentVersion,
  allowedAssetHosts: [assetHost, cloudfrontHost, legacyS3Host],
})

if (compiled.validationReport.status === "blocked") {
  console.error(JSON.stringify(compiled.validationReport, null, 2))
  throw new Error("March of Davos migration did not pass publish validation")
}

console.log(`Migrated ${migration.files.length} source files plus ${reportPath}`)
console.log(`Publish validation: ${compiled.validationReport.status}`)

function normalizeLegacyPlan(input: MarchLegacyPlan) {
  const npcMap = new Map<string, Character>()
  const usedEncounterIds = new Map<string, number>()
  const allEncounters = input.sections.flatMap((section) => section.scenes.flatMap((scene) => scene.encounters.map((encounter) => ({ section, scene, encounter }))))
  const normalizedByEncounter = new Map<MarchLegacyEncounter, AdventureEncounter>()

  for (const { encounter } of allEncounters) {
    const id = uniqueSlug(encounter.name, usedEncounterIds)
    const npcRefs = (encounter.npcs ?? []).map((npc) => {
      const npcId = slugify(npc.characterId || npc.name, { lower: true, strict: true })
      if (!npcMap.has(npcId)) npcMap.set(npcId, normalizeNpc(npcId, npc))
      return { id: npcId, behavior: npc.personality ?? npc.abilities ?? "" }
    })
    normalizedByEncounter.set(encounter, {
      id,
      title: encounter.name,
      intro: encounter.narrative ?? "",
      instructions: [encounter.notes, formatStages(encounter.stages)].filter(Boolean).join("\n\n"),
      image: encounter.image,
      npc: npcRefs,
      transitions: [],
    })
  }

  const normalizedEncounters = allEncounters.map(({ encounter }) => normalizedByEncounter.get(encounter)!)
  for (let index = 0; index < normalizedEncounters.length - 1; index++) {
    normalizedEncounters[index].transitions = [
      {
        condition: `After resolving ${normalizedEncounters[index].title}, continue to ${normalizedEncounters[index + 1].title}.`,
        encounter: normalizedEncounters[index + 1].id,
      },
    ]
  }

  let encounterIndex = 0
  const sections: AdventureSection[] = input.sections.map((section, sectionIndex) => ({
    title: section.title ?? `Section ${sectionIndex + 1}`,
    summary: section.plot ?? "",
    scenes: section.scenes.map((scene): AdventureScene => {
      const encounters = scene.encounters.map(() => normalizedEncounters[encounterIndex++])
      return {
        title: scene.title,
        summary: scene.description ?? "",
        encounters,
      }
    }),
  }))

  const plan: AdventurePlan = {
    id: input.id,
    settingId: input.settingId,
    ownerId: input.ownerId,
    title: input.title,
    author: input.author,
    version: input.version,
    teaser: input.teaser,
    overview: input.overview || input.summary || "",
    party: input.party,
    tags: input.tags ?? [],
    image: input.image,
    start: normalizedEncounters[0]?.id ?? "",
    sections,
    premadePlayerCharacters: [],
    npcs: Object.fromEntries(npcMap.entries()),
    availableCharacterOptions: input.availableCharacterOptions,
    nextAdventure: input.nextAdventure,
  }

  return { plan, normalizedEncounterCount: normalizedEncounters.length, normalizedNpcCount: npcMap.size }
}

function normalizeNpc(id: string, npc: MarchLegacyNpc): Character {
  return {
    id,
    name: npc.name,
    type: "npc",
    image: npc.image || "/images/app/avatar/npc.png?v=1",
    archetype: npc.characterClass ?? "",
    race: npc.race ?? "",
    gender: npc.gender,
    appearance: npc.appearance ?? "",
    personality: npc.personality,
    behavior: npc.abilities,
    healthPercent: 100,
    specialAbilities: npc.specialAbilities?.map((ability) => [ability.name, ability.description].filter(Boolean).join(": ")).filter(Boolean),
  }
}

function uniqueSlug(value: string, used: Map<string, number>) {
  const base = slugify(value, { lower: true, strict: true }) || "encounter"
  const count = used.get(base) ?? 0
  used.set(base, count + 1)
  return count === 0 ? base : `${base}-${count + 1}`
}

function formatStages(stages: MarchLegacyEncounter[] | undefined): string {
  if (!stages?.length) return ""
  return [
    "Legacy stages:",
    ...stages.map((stage) => [`### ${stage.name}`, stage.narrative, stage.notes, stage.npcs?.length ? `NPCs: ${stage.npcs.map((npc) => npc.name).join(", ")}` : ""].filter(Boolean).join("\n\n")),
  ].join("\n\n")
}
