// Temporary diagnostic: one generation attempt, print zod issues + raw text tail.
import { google } from "@ai-sdk/google"
import { generateObject } from "ai"
import { buildMap2DPrompt } from "@/lib/mapview/generate"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import { encounter2dGenerationSchema } from "@/types/encounter-map-2d"

async function main() {
  const plan = await loadAdventurePlanForRuntime("realm-of-myr", "the-midnight-summons")
  const enc = plan.sections[0].scenes[0].encounters[0]
  const prompt = buildMap2DPrompt({
    sectionTitle: plan.sections[0].title,
    sceneTitle: plan.sections[0].scenes[0].title,
    encounterTitle: enc.title,
    encounterIntro: enc.intro,
    encounterInstructions: enc.instructions,
    npcIds: [],
    sceneKit: "generic",
    ownerPrompt: "Night, dense dark forest, trail toward standing stones, interest zone for the noise.",
  })
  try {
    const r = await generateObject({
      model: google("gemini-3-flash-preview"),
      prompt,
      schema: encounter2dGenerationSchema,
      temperature: 0.8,
      maxOutputTokens: 8000,
      providerOptions: { google: { structuredOutputs: false } },
    })
    console.log("OK", JSON.stringify(r.object.board))
  } catch (error) {
    const e = error as { message: string; cause?: { issues?: unknown; message?: string }; text?: string }
    console.log("ERROR:", e.message)
    if (e.cause) console.log("CAUSE:", JSON.stringify(e.cause?.issues ?? e.cause?.message ?? e.cause).slice(0, 2000))
    if (e.text) console.log("TEXT TAIL:", e.text.slice(-600))
  }
}
main()
