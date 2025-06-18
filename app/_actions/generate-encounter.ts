'use server'

import { auth } from "@clerk/nextjs/server"
import { generateObject } from "@/lib/ai"
import type { AdventureSection, AdventureEncounter } from "@/types/adventure-plan"
import { adventureEncounterSchema } from "@/types/adventure-plan"
import slugify from "slugify"

const encounterGenerationSchema = adventureEncounterSchema.omit({ id: true, image: true })

export async function generateEncounterAction({
  prompt,
  sections,
  availableNpcs,
  sectionIndex,
  sceneIndex,
}: {
  prompt: string
  sections: AdventureSection[]
  availableNpcs: Record<string, { id: string; name: string }>
  sectionIndex: number
  sceneIndex: number
}): Promise<AdventureEncounter> {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  // Get context from the current section and scene
  const currentSection = sections[sectionIndex]
  const currentScene = currentSection?.scenes[sceneIndex]
  
  // Get all existing encounter IDs for transition references
  const existingEncounterIds = sections
    .flatMap(section => section.scenes)
    .flatMap(scene => scene.encounters)
    .map(encounter => encounter.id)
    .filter(Boolean)

  // Build context for the AI
  const contextString = [
    currentSection?.title ? `Section Title: ${currentSection.title}` : "",
    currentSection?.summary ? `Section Summary: ${currentSection.summary}` : "",
    currentScene?.title ? `Scene Title: ${currentScene.title}` : "",
    currentScene?.summary ? `Scene Summary: ${currentScene.summary}` : "",
    `Available NPCs: ${Object.values(availableNpcs).map(npc => `${npc.name} (${npc.id})`).join(", ")}`,
    existingEncounterIds.length > 0 ? `Existing Encounter IDs: ${existingEncounterIds.join(", ")}` : "",
  ].filter(Boolean).join("\n")

  const aiPrompt = `You are an expert Game Master creating encounters for a tabletop RPG adventure. Based on the user's description and the current adventure context, generate a complete encounter.

Context:
${contextString}

User's Description:
${prompt}

Generate an encounter that fits naturally into the current scene and section. The encounter should:
1. Have a short title (2-5 words) that captures the essence
2. Include an immersive intro that sets the scene and draws players in (1-2 paragraphs)
3. Provide clear instructions for the AI Game Master about how to run the encounter (1-4 paragraphs)
4. Optionally include relevant NPCs from the available list: ${Object.values(availableNpcs).map(npc => `${npc.name} (${npc.id})`).join(", ")}

Respond with a complete encounter object that includes all necessary fields.`

  const result = await generateObject({
    prompt: aiPrompt,
    schema: encounterGenerationSchema,
  })

  const generatedEncounter = result.object

  // Generate a unique ID based on the title
  const encounterId = slugify(generatedEncounter.title, { lower: true, strict: true })
  
  return {
    id: encounterId,
    title: generatedEncounter.title,
    intro: generatedEncounter.intro,
    instructions: generatedEncounter.instructions || "",
    image: "",
    npc: generatedEncounter.npc || [],
    transitions: generatedEncounter.transitions || [],
    skipInitialNpcTurns: generatedEncounter.skipInitialNpcTurns || false,
    resetHealth: generatedEncounter.resetHealth || false,
  }
} 