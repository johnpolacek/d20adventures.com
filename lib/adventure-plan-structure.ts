import slugify from "slugify"
import { z } from "zod"
import type { AdventureEncounter, AdventureScene, AdventureSection } from "@/types/adventure-plan"

const encounterProposalSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1),
  intro: z.string().trim().min(1),
  instructions: z.string().trim().min(1),
  image: z.string().optional(),
  transitions: z.array(z.object({ condition: z.string(), encounter: z.string() })).optional(),
  npc: z.array(z.object({ id: z.string(), behavior: z.string(), initialInitiative: z.number().optional() })).optional(),
  skipInitialNpcTurns: z.boolean().optional(),
  resetHealth: z.boolean().optional(),
})

const sceneProposalSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  image: z.string().optional(),
  encounters: z.array(encounterProposalSchema).min(1),
})

const sectionProposalSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  image: z.string().optional(),
  scenes: z.array(sceneProposalSchema).min(1),
})

const structureOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("insertSection"),
    position: z.enum(["end", "afterSection"]).default("end"),
    afterSectionIndex: z.number().int().nonnegative().optional(),
    section: sectionProposalSchema,
  }),
  z.object({
    type: z.literal("insertScene"),
    sectionIndex: z.number().int().nonnegative(),
    position: z.enum(["end", "afterScene"]).default("end"),
    afterSceneIndex: z.number().int().nonnegative().optional(),
    scene: sceneProposalSchema,
  }),
  z.object({
    type: z.literal("insertEncounter"),
    sectionIndex: z.number().int().nonnegative(),
    sceneIndex: z.number().int().nonnegative(),
    position: z.enum(["end", "afterEncounter"]).default("end"),
    afterEncounterIndex: z.number().int().nonnegative().optional(),
    encounter: encounterProposalSchema,
  }),
])

export const structureProposalSchema = z.object({
  operations: z.array(structureOperationSchema).min(1),
})

export type StructureProposal = z.infer<typeof structureProposalSchema>

export type StructureProposalPreview = {
  sectionCount: number
  sceneCount: number
  encounterCount: number
  lines: string[]
}

export type StructureApplyResult = {
  sections: AdventureSection[]
  selection: {
    sectionIndex: number
    sceneIndex: number
    encounterId: string | null
  }
}

export function parseStructureProposal(json: string): StructureProposal {
  return structureProposalSchema.parse(JSON.parse(json))
}

function cloneSections(sections: AdventureSection[]) {
  return sections.map((section) => ({
    ...section,
    scenes: section.scenes.map((scene) => ({
      ...scene,
      encounters: scene.encounters.map((encounter) => ({ ...encounter })),
    })),
  }))
}

function collectEncounterIds(sections: AdventureSection[]) {
  return new Set(
    sections
      .flatMap((section) => section.scenes)
      .flatMap((scene) => scene.encounters)
      .map((encounter) => encounter.id)
      .filter(Boolean)
  )
}

function createUniqueEncounterId(title: string, existingIds: Set<string>, preferredId?: string) {
  const base = slugify(preferredId || title, { lower: true, strict: true }) || "encounter"
  let candidate = base
  let suffix = 2
  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`
    suffix += 1
  }
  existingIds.add(candidate)
  return candidate
}

function normalizeEncounter(encounter: z.infer<typeof encounterProposalSchema>, existingIds: Set<string>): AdventureEncounter {
  return {
    id: createUniqueEncounterId(encounter.title, existingIds, encounter.id),
    title: encounter.title,
    intro: encounter.intro,
    instructions: encounter.instructions || "",
    image: encounter.image || "",
    transitions: encounter.transitions || [],
    npc: encounter.npc || [],
    skipInitialNpcTurns: encounter.skipInitialNpcTurns || false,
    resetHealth: encounter.resetHealth || false,
  }
}

function normalizeScene(scene: z.infer<typeof sceneProposalSchema>, existingIds: Set<string>): AdventureScene {
  return {
    title: scene.title,
    summary: scene.summary || "",
    image: scene.image,
    encounters: scene.encounters.map((encounter) => normalizeEncounter(encounter, existingIds)),
  }
}

function normalizeSection(section: z.infer<typeof sectionProposalSchema>, existingIds: Set<string>): AdventureSection {
  return {
    title: section.title,
    summary: section.summary || "",
    image: section.image,
    scenes: section.scenes.map((scene) => normalizeScene(scene, existingIds)),
  }
}

function insertAt<T>(items: T[], index: number, item: T) {
  return [...items.slice(0, index), item, ...items.slice(index)]
}

function assertIndex(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message)
  }
}

export function applyStructureProposal(currentSections: AdventureSection[], rawProposal: StructureProposal): StructureApplyResult {
  const proposal = structureProposalSchema.parse(rawProposal)
  let sections = cloneSections(currentSections)
  const existingIds = collectEncounterIds(sections)
  let selection: StructureApplyResult["selection"] | null = null

  for (const operation of proposal.operations) {
    if (operation.type === "insertSection") {
      const section = normalizeSection(operation.section, existingIds)
      const insertIndex = operation.position === "afterSection" ? (operation.afterSectionIndex ?? sections.length - 1) + 1 : sections.length
      assertIndex(insertIndex >= 0 && insertIndex <= sections.length, `Invalid section insert index ${insertIndex}.`)
      sections = insertAt(sections, insertIndex, section)
      selection ||= {
        sectionIndex: insertIndex,
        sceneIndex: 0,
        encounterId: section.scenes[0]?.encounters[0]?.id ?? null,
      }
      continue
    }

    assertIndex(Boolean(sections[operation.sectionIndex]), `Invalid section index ${operation.sectionIndex}.`)

    if (operation.type === "insertScene") {
      const section = sections[operation.sectionIndex]
      const scene = normalizeScene(operation.scene, existingIds)
      const insertIndex = operation.position === "afterScene" ? (operation.afterSceneIndex ?? section.scenes.length - 1) + 1 : section.scenes.length
      assertIndex(insertIndex >= 0 && insertIndex <= section.scenes.length, `Invalid scene insert index ${insertIndex}.`)
      sections[operation.sectionIndex] = {
        ...section,
        scenes: insertAt(section.scenes, insertIndex, scene),
      }
      selection ||= {
        sectionIndex: operation.sectionIndex,
        sceneIndex: insertIndex,
        encounterId: scene.encounters[0]?.id ?? null,
      }
      continue
    }

    const section = sections[operation.sectionIndex]
    assertIndex(Boolean(section.scenes[operation.sceneIndex]), `Invalid scene index ${operation.sceneIndex}.`)
    const scene = section.scenes[operation.sceneIndex]
    const encounter = normalizeEncounter(operation.encounter, existingIds)
    const insertIndex = operation.position === "afterEncounter" ? (operation.afterEncounterIndex ?? scene.encounters.length - 1) + 1 : scene.encounters.length
    assertIndex(insertIndex >= 0 && insertIndex <= scene.encounters.length, `Invalid encounter insert index ${insertIndex}.`)
    sections[operation.sectionIndex] = {
      ...section,
      scenes: section.scenes.map((entry, index) =>
        index === operation.sceneIndex
          ? {
              ...scene,
              encounters: insertAt(scene.encounters, insertIndex, encounter),
            }
          : entry
      ),
    }
    selection ||= {
      sectionIndex: operation.sectionIndex,
      sceneIndex: operation.sceneIndex,
      encounterId: encounter.id,
    }
  }

  return {
    sections,
    selection: selection || { sectionIndex: 0, sceneIndex: 0, encounterId: null },
  }
}

export function summarizeStructureProposal(proposal: StructureProposal): StructureProposalPreview {
  let sectionCount = 0
  let sceneCount = 0
  let encounterCount = 0
  const lines: string[] = []

  for (const operation of proposal.operations) {
    if (operation.type === "insertSection") {
      sectionCount += 1
      lines.push(`Section: ${operation.section.title}`)
      for (const scene of operation.section.scenes) {
        sceneCount += 1
        lines.push(`Scene: ${scene.title}`)
        for (const encounter of scene.encounters) {
          encounterCount += 1
          lines.push(`Encounter: ${encounter.title}`)
        }
      }
    } else if (operation.type === "insertScene") {
      sceneCount += 1
      lines.push(`Scene: ${operation.scene.title}`)
      for (const encounter of operation.scene.encounters) {
        encounterCount += 1
        lines.push(`Encounter: ${encounter.title}`)
      }
    } else {
      encounterCount += 1
      lines.push(`Encounter: ${operation.encounter.title}`)
    }
  }

  return { sectionCount, sceneCount, encounterCount, lines }
}
