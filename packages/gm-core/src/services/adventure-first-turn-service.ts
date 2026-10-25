import type { GmPorts } from "../ports"
import type { StoryBeat } from "../story/beats"
import { lastStep, storyNames, storyText } from "../story/render"
import type { TurnCharacter } from "../types/adventure"
import type { RollRequirement } from "../validations/roll-requirement-schema"
import { createNarrativeService } from "./narrative-service"
import { createRollModifierService } from "./roll-modifier-service"

export function createAdventureFirstTurnService(ports: GmPorts) {
  const { getRollRequirementHelper } = createNarrativeService(ports)
  const { getRollModifier } = createRollModifierService(ports)
  const loadAdventurePlanForRuntime = ports.content.loadPlan.bind(ports.content)
  async function buildFirstTurnSetup(args: { settingId: string; planId: string; encounterId: string; story: StoryBeat[]; playerInput: string; characters: TurnCharacter[] }): Promise<{
    turnTitle: string
    rollRequirement: RollRequirement
  }> {
    const plan = await loadAdventurePlanForRuntime(args.settingId, args.planId)
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

    const names = storyNames(args.characters)
    const paragraphs = storyText(args.story, names).split(/\n\n+/).filter(Boolean)
    const lastAction = storyText(lastStep(args.story), names)
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
  return { buildFirstTurnSetup }
}
