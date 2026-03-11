"use server"

import { generateObject, generateText } from "@/lib/ai"
import { createDefaultEncounterMap, enhanceEncounterMap, formatEncounterSceneKit, inferEncounterSceneKit } from "@/lib/map-utils"
import type { Encounter3DSceneKit, EncounterCharacterRef } from "@/types/adventure-plan"
import { encounter3dMapSchema } from "@/types/adventure-plan"
import { auth } from "@clerk/nextjs/server"

function buildSceneKitGuidance(sceneKit: Encounter3DSceneKit) {
  switch (sceneKit) {
    case "checkpoint":
      return "Target a fortified checkpoint with flanking gate structures, an inspection platform, cargo or barricade clusters, and readable approach lanes."
    case "city_gate":
      return "Target a monumental city-gate entrance with one dominant central arch, flanking towers, banners, gate doors, and market dressing around the approach. Avoid repeated inner wall lines or multiple parallel wall rows behind the main gate facade."
    case "courtyard":
      return "Target a formal courtyard with a raised rear dais, partial colonnades or flanking structures, and cover clusters that keep the center playable."
    case "ruins":
      return "Target broken ruins with collapsed wall fragments, offset plinths, rubble clusters, and asymmetrical cover lines."
    case "shrine":
      return "Target a sacred shrine with a ceremonial dais or altar, a processional approach, flanking markers, and dense ritual dressing."
    case "camp":
      return "Target an encampment with command space, supply stacks, low barricades, and uneven lanes between clustered camp elements."
    case "road":
      return "Target a travel route or ambush lane with a clear road, flanking banks or obstacles, chokepoints, and roadside dressing."
    case "crypt":
      return "Target a tomb or crypt with a sarcophagus-like focal piece, funerary markers, oppressive side aisles, and broken burial dressing."
    case "cavern":
      return "Target a cave chamber with uneven shelves, rock spurs, choke points, and clustered boulders."
    case "generic":
    default:
      return "Target a compact tabletop encounter space with strong focal terrain, asymmetrical clustered cover, and clear lanes."
  }
}

function inferSceneKitFromArgs(args: {
  sectionTitle?: string
  sceneTitle?: string
  encounterTitle?: string
  encounterIntro?: string
  encounterInstructions?: string
  encounterNpcRefs?: EncounterCharacterRef[]
}) {
  return inferEncounterSceneKit({
    sectionTitle: args.sectionTitle,
    sceneTitle: args.sceneTitle,
    encounterTitle: args.encounterTitle,
    encounterIntro: args.encounterIntro,
    encounterInstructions: args.encounterInstructions,
    encounterNpcBehaviors: (args.encounterNpcRefs || []).map((npc) => npc.behavior),
  })
}

function buildMapPrompt(args: {
  prompt: string
  sectionTitle?: string
  sceneTitle?: string
  encounterTitle?: string
  encounterIntro?: string
  encounterInstructions?: string
  encounterNpcRefs?: EncounterCharacterRef[]
  maxPartySize: number
  sceneKit: Encounter3DSceneKit
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
- For city gates, prefer one monumental facade and side dressing over repeated wall layers.
- Compose in foreground, midground, and background so the camera sees a staged diorama rather than isolated objects on a flat board.
- Avoid leaving the center of the board as a large empty rectangle; add mid-board cover clusters, low walls, plinths, shelves, dunes, banks, or cargo groupings to break it up.
- Favor asymmetric clusters of 2-4 related pieces over evenly spaced single props.
- Include enough party token slots for up to ${args.maxPartySize} party members when the encounter supports combat or positioning.
- Include NPC token slots for any explicitly mentioned encounter NPC ids.
- Keep prompts and map edits grounded in the encounter text.
- Set "sceneKit" to the best fit from: generic, checkpoint, city_gate, courtyard, ruins, shrine, camp, road, crypt, cavern.
- Current best-fit scene kit: ${args.sceneKit} (${formatEncounterSceneKit(args.sceneKit)}).
- ${buildSceneKitGuidance(args.sceneKit)}

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
  sceneKit: Encounter3DSceneKit
}) {
  return `You are helping an adventure designer write a high-quality prompt for generating a tabletop 3D environment.

Write a single concise prompt that tells a map-generation model what environment to build.

Requirements:
- Focus on physical environment, layout, mood, elevation, hazards, cover, landmarks, entrances, and likely starting positions.
- Push for denser, more intentional composition with focal points, perimeter treatment, layered depth, and scenic dressing.
- Ask for premium tabletop terrain language: handcrafted miniature scenery, flanking set pieces, clustered props, scenic bases, and readable lanes.
- Ask for clustered mid-board cover and asymmetry so the scene avoids a large empty center.
- Do not summarize the story; convert it into spatial directions.
- Mention the scene style as a stylized tabletop 3D battlemap.
- Push the map toward this scene kit unless the encounter text strongly contradicts it: ${args.sceneKit} (${formatEncounterSceneKit(args.sceneKit)}).
- ${buildSceneKitGuidance(args.sceneKit)}
- If this is a city gate, prefer one dominant gate facade with stalls, wagons, banners, barrels, and posts instead of repeated secondary walls.
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

  const inferredSceneKit = inferSceneKitFromArgs(args)
  const sceneKit =
    args.existingMap && typeof args.existingMap === "object" && args.existingMap && "sceneKit" in args.existingMap
      ? (() => {
          const existingSceneKit = (args.existingMap as { sceneKit?: Encounter3DSceneKit }).sceneKit
          if (existingSceneKit === "checkpoint" && inferredSceneKit === "city_gate") {
            return inferredSceneKit
          }
          return existingSceneKit || inferredSceneKit
        })()
      : inferredSceneKit
  const existingMapJson = args.existingMap ? JSON.stringify(args.existingMap, null, 2) : undefined
  const result = await generateObject({
    prompt: buildMapPrompt({
      ...args,
      sceneKit,
      existingMapJson,
    }),
    schema: encounter3dMapSchema,
  })

  return enhanceEncounterMap(
    {
      ...createDefaultEncounterMap("", { sceneKit }),
      ...result.object,
      version: 1 as const,
      promptHistory: [
        ...(args.existingMap && typeof args.existingMap === "object" && args.existingMap && "promptHistory" in args.existingMap
          ? (((args.existingMap as { promptHistory?: string[] }).promptHistory || []))
          : []),
        args.prompt,
      ],
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

  const sceneKit = inferSceneKitFromArgs(args)
  const { text } = await generateText({
    prompt: buildPromptAuthoringPrompt({
      ...args,
      sceneKit,
    }),
  })

  return text.trim().replace(/^["']|["']$/g, "")
}
