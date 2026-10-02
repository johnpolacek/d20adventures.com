import { createAdventureAccess } from "./access"
import { createGenerateAppearanceBackgroundAction } from "./character/generate-appearance-background-action"
import { createGenerateAttributesAction } from "./character/generate-attributes-action"
import { createGenerateCharacterAction } from "./character/generate-character-action"
import { createGenerateEquipmentAction } from "./character/generate-equipment-action"
import { createGeneratePersonalityMotivationBackstoryAction } from "./character/generate-personality-motivation-backstory-action"
import { createGenerateSkillsAction } from "./character/generate-skills-action"
import { createGenerateSpecialAbilitiesAction } from "./character/generate-special-abilities-action"
import { createGenerateSpellsAction } from "./character/generate-spells-action"
import { createAdvanceTurn } from "./orchestration/advance-turn"
import { createAdventure } from "./orchestration/adventure"
import type { GmPorts } from "./ports"
import { createAdvanceTurnFinalizationService } from "./services/advance-turn-finalization-service"
import { createAdventureFirstTurnService } from "./services/adventure-first-turn-service"
import { createAdventureRollResultService } from "./services/adventure-roll-result-service"
import { createAdventureTurnReplyService } from "./services/adventure-turn-reply-service"
import { createAiPcTurnService } from "./services/ai-pc-turn-service"
import { createNarrativeGenerationService } from "./services/narrative-generation-service"
import { createNarrativeService } from "./services/narrative-service"
import { createNpcTurnBranchService } from "./services/npc-turn-branch-service"
import { createNpcTurnGenerationService } from "./services/npc-turn-generation-service"
import { createNpcTurnResolutionService } from "./services/npc-turn-resolution-service"
import { createNpcTurnService } from "./services/npc-turn-service"
import { createRollModifierService } from "./services/roll-modifier-service"
import { createRollRequirementService } from "./services/roll-requirement-service"
import { createTurnUpdateService } from "./services/turn-update-service"

export type * from "./ports"

export function createGmCore(ports: GmPorts) {
  return {
    ...createAdvanceTurnFinalizationService(ports),
    ...createAdventureFirstTurnService(ports),
    ...createAdventureRollResultService(ports),
    ...createAdventureTurnReplyService(ports),
    ...createAiPcTurnService(ports),
    ...createNarrativeGenerationService(ports),
    ...createNarrativeService(ports),
    ...createNpcTurnBranchService(ports),
    ...createNpcTurnGenerationService(ports),
    ...createNpcTurnResolutionService(ports),
    ...createNpcTurnService(ports),
    ...createRollModifierService(ports),
    ...createRollRequirementService(ports),
    ...createTurnUpdateService(ports),
    ...createGenerateAppearanceBackgroundAction(ports),
    ...createGenerateAttributesAction(ports),
    ...createGenerateCharacterAction(ports),
    ...createGenerateEquipmentAction(ports),
    ...createGeneratePersonalityMotivationBackstoryAction(ports),
    ...createGenerateSkillsAction(ports),
    ...createGenerateSpecialAbilitiesAction(ports),
    ...createGenerateSpellsAction(ports),
    ...createAdvanceTurn(ports),
    ...createAdventure(ports),
    ...createAdventureAccess(ports),
  }
}
export type GmCore = ReturnType<typeof createGmCore>
