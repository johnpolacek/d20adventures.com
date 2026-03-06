"use server"

import { generateObject } from "@/lib/ai"
import { createDefaultEncounterMap } from "@/lib/map-utils"
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
- Favor readable tabletop layouts over clutter.
- Keep dimensions compact and playable.
- Use terrain for large structural shapes and props for dressing.
- Always include a board, camera, and a short summary.
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

  return {
    ...createDefaultEncounterMap(),
    ...result.object,
    version: 1 as const,
    promptHistory: [...(args.existingMap && typeof args.existingMap === "object" && args.existingMap && "promptHistory" in args.existingMap ? (((args.existingMap as { promptHistory?: string[] }).promptHistory || [])) : []), args.prompt],
  }
}
