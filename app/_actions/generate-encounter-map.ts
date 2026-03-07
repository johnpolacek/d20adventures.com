"use server"

import { generateObject, generateText } from "@/lib/ai"
import { createDefaultEncounterMap, enhanceEncounterMap } from "@/lib/map-utils"
import type { EncounterCharacterRef } from "@/types/adventure-plan"
import { encounter3dMapSchema } from "@/types/adventure-plan"
import { auth } from "@clerk/nextjs/server"

function buildMapPrompt(args: {
  prompt: string
  sectionTitle?: string
  sceneTitle?: string
  encounterTitle?: string
  encounterIntro?: string
  encounterInstructions?: string
  encounterNpcRefs?: EncounterCharacterRef[]
  maxPartySize: number
  existingMapJson?: string
}) {
  return `You are designing a tabletop 3D battlemap for a fantasy adventure app.

Return a single JSON object matching the requested schema. The output must be practical for a stylized tabletop renderer, not a cinematic full-detail scene.

Requirements:
- Favor readable tabletop layouts with strong composition, not empty boards.
- Keep dimensions compact and playable.
- Use terrain for large structural shapes and props for dressing.
- Always include a board, camera, and a short summary.
- Use radians for all rotation, yaw, pitch, and facing values.
- Create a clear focal area, meaningful perimeter treatment, and at least 2-3 thematic landmarks.
- Break up open space with cover, dressing, elevation changes, or pathing features so the scene feels intentionally staged.
- Include asymmetry and layered depth where the encounter supports it.
- Avoid sparse or unfinished scenes; corners, edges, and back lines should feel dressed.
- Make it feel like premium handcrafted tabletop terrain with scenic bases, lane shaping, clustered set dressing, and a few hero pieces that define the location.
- Prefer terrain and props that read as miniature wargame scenery: stepped risers, ruined walls, flanking cover, shrine pieces, trees, cargo, rock clusters, banners, and gate structures.
- Compose in foreground, midground, and background so the camera sees a staged diorama rather than isolated objects on a flat board.
- Include enough party token slots for up to ${args.maxPartySize} party members when the encounter supports combat or positioning.
- Include NPC token slots for any explicitly mentioned encounter NPC ids.
- Keep prompts and map edits grounded in the encounter text.

Adventure context:
- Section: ${args.sectionTitle || "Unknown"}
- Scene: ${args.sceneTitle || "Unknown"}
- Encounter: ${args.encounterTitle || "Unknown"}
- Intro: ${args.encounterIntro || "None"}
- Instructions: ${args.encounterInstructions || "None"}
- NPC refs: ${(args.encounterNpcRefs || []).map((npc) => `${npc.id}: ${npc.behavior}`).join("; ") || "None"}

${args.existingMapJson ? `Existing map JSON to revise:\n${args.existingMapJson}\n` : ""}

Owner request:
${args.prompt}`
}

function buildPromptAuthoringPrompt(args: {
  sectionTitle?: string
  sceneTitle?: string
  encounterTitle?: string
  encounterIntro?: string
  encounterInstructions?: string
  encounterNpcRefs?: EncounterCharacterRef[]
}) {
  return `You are helping an adventure designer write a high-quality prompt for generating a tabletop 3D environment.

Write a single concise prompt that tells a map-generation model what environment to build.

Requirements:
- Focus on physical environment, layout, mood, elevation, hazards, cover, landmarks, entrances, and likely starting positions.
- Push for denser, more intentional composition with focal points, perimeter treatment, layered depth, and scenic dressing.
- Ask for premium tabletop terrain language: handcrafted miniature scenery, flanking set pieces, clustered props, scenic bases, and readable lanes.
- Do not summarize the story; convert it into spatial directions.
- Mention the scene style as a stylized tabletop 3D battlemap.
- Keep it to 2-4 sentences.
- Output only the prompt text, with no bullets, labels, or quotation marks.

Encounter context:
- Section: ${args.sectionTitle || "Unknown"}
- Scene: ${args.sceneTitle || "Unknown"}
- Encounter: ${args.encounterTitle || "Unknown"}
- Intro: ${args.encounterIntro || "None"}
- Instructions: ${args.encounterInstructions || "None"}
- NPC refs: ${(args.encounterNpcRefs || []).map((npc) => `${npc.id}: ${npc.behavior}`).join("; ") || "None"}`
}

export async function generateEncounterMapAction(args: {
  prompt: string
  sectionTitle?: string
  sceneTitle?: string
  encounterTitle?: string
  encounterIntro?: string
  encounterInstructions?: string
  encounterNpcRefs?: EncounterCharacterRef[]
  maxPartySize: number
  existingMap?: unknown
}) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const existingMapJson = args.existingMap ? JSON.stringify(args.existingMap, null, 2) : undefined
  const result = await generateObject({
    prompt: buildMapPrompt({
      ...args,
      existingMapJson,
    }),
    schema: encounter3dMapSchema,
  })

  return enhanceEncounterMap(
    {
      ...createDefaultEncounterMap(),
      ...result.object,
      version: 1 as const,
      promptHistory: [...(args.existingMap && typeof args.existingMap === "object" && args.existingMap && "promptHistory" in args.existingMap ? (((args.existingMap as { promptHistory?: string[] }).promptHistory || [])) : []), args.prompt],
    },
    {
      maxPartySize: args.maxPartySize,
      npcIds: (args.encounterNpcRefs || []).map((entry) => entry.id),
    }
  )
}

export async function generateEncounterMapPromptAction(args: {
  sectionTitle?: string
  sceneTitle?: string
  encounterTitle?: string
  encounterIntro?: string
  encounterInstructions?: string
  encounterNpcRefs?: EncounterCharacterRef[]
}) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const { text } = await generateText({
    prompt: buildPromptAuthoringPrompt(args),
  })

  return text.trim().replace(/^["']|["']$/g, "")
}
