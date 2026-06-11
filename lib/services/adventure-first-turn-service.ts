import { readJsonFromS3 } from "@/lib/s3-utils"
import { getRollRequirementHelper } from "@/lib/services/narrative-service"
import { getRollModifier } from "@/lib/services/roll-modifier-service"
import type { RollRequirement } from "@/lib/validations/roll-requirement-schema"
import type { TurnCharacter } from "@/types/adventure"
import type { AdventurePlan } from "@/types/adventure-plan"

export async function buildFirstTurnSetup(args: { settingId: string; planId: string; encounterId: string; narrative: string; playerInput: string; characters: TurnCharacter[] }): Promise<{
  turnTitle: string
  rollRequirement: RollRequirement
}> {
  const plan = (await readJsonFromS3(`settings/${args.settingId}/${args.planId}.json`)) as AdventurePlan
  if (!plan || !plan.sections) {
    throw new Error("Adventure plan not found or is invalid")
  }

  const firstEncounter = plan.sections
    .flatMap((section) => section.scenes)
    .flatMap((scene) => scene.encounters)
    .find((encounter) => encounter.id === args.encounterId)
  if (!firstEncounter || !firstEncounter.title) {
    throw new Error(`First encounter (ID: ${args.encounterId}) not found in plan or is missing a title.`)
  }

  const paragraphs = (args.narrative || "").split(/\n\n+/).filter(Boolean)
  const lastAction = paragraphs[paragraphs.length - 1] || ""
  const encounterIntro = ""
  const encounterInstructions = ""
  const narrativeContext = paragraphs.slice(-2).join("\n\n")

  const actor = args.characters[0]
  const resolveWithModifier = async (actionText: string): Promise<RollRequirement> => {
    const rollRequirement = await getRollRequirementHelper(actionText, {
      encounterIntro,
      encounterInstructions,
      narrativeContext,
    })
    if (!rollRequirement || !actor) {
      return rollRequirement
    }

    const modifier = await getRollModifier({
      scenario: { encounterIntro, encounterInstructions, narrativeContext },
      rollRequirement,
      character: actor,
    })
    if (typeof modifier === "number") {
      rollRequirement.modifier = modifier
    }
    return rollRequirement
  }

  let rollRequirement: RollRequirement = null
  if (args.playerInput && args.playerInput.trim().length > 0) {
    rollRequirement = await resolveWithModifier(args.playerInput)
  }
  if (!rollRequirement && lastAction && lastAction.trim().length > 0) {
    rollRequirement = await resolveWithModifier(lastAction)
  }

  return {
    turnTitle: firstEncounter.title,
    rollRequirement,
  }
}
