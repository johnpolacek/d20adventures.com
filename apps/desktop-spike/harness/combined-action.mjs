import assert from "node:assert/strict"
import { z } from "zod"
import { sourceLoader } from "./trusted-source.mjs"

// Fixture experiment: reuse the current formatting and adjudication instructions
// in one response. The engine still computes the ability modifier and rolls later.
export async function combinedAction({ formatting, input, character, encounter, narrative, sources }) {
  const captured = []
  const { load, sources: promptSources } = sourceLoader(
    {
      "@/lib/ai": {
        generateObject: async (args) => {
          captured.push(args)
          return { object: args.schema.shape.rollType ? { rollType: "none", difficulty: 0 } : { modifier: 0 } }
        },
      },
    },
    []
  )
  await load("@/lib/services/roll-requirement-service").getRollRequirementForAction(input, character, {
    encounterInstructions: encounter.sections.gmNotes ?? "",
    encounterIntro: encounter.sections.intro ?? "",
    narrativeContext: narrative,
  })
  const placeholder = { rollType: "CHOSEN_ROLL_TYPE", difficulty: 0 }
  await load("@/lib/services/roll-modifier-service").getRollModifier({
    scenario: { encounterIntro: encounter.sections.gmNotes ?? "", encounterInstructions: encounter.sections.gmNotes ?? "", narrativeContext: narrative },
    rollRequirement: placeholder,
    character,
  })
  Object.assign(sources, promptSources)
  assert.equal(captured.length, 2)
  const modifierPrompt = captured[1].prompt.replace(JSON.stringify(placeholder, null, 2), "Use the rollRequirement you choose in task 2 below.")
  return {
    prompt: `Perform these three pre-roll tasks in one JSON response. Each task's prose/JSON-only instruction applies to its field, not the outer response.
Task 1, formattedAction: follow the current formatting instructions exactly. Do not describe an outcome.
${formatting.prompt}

Task 2, rollRequirement: use the original player input, not any embellished formatting.
${captured[0].prompt}

Task 3, situationalModifier: use your chosen roll requirement. Return only the additional situational integer, not the attribute modifier. If no roll is required return 0.
${modifierPrompt}

No dice have been rolled. Do not predict success or generate NPC reactions.`,
    schema: z.strictObject({
      formattedAction: z.string().min(1),
      rollRequirement: captured[0].schema.omit({ modifier: true }).strict(),
      situationalModifier: captured[1].schema.shape.modifier,
    }),
  }
}
