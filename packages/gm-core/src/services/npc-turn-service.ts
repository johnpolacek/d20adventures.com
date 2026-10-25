import type { GmPorts } from "../ports"
import { authoredText } from "../story/authored"
import type { StoryBeat } from "../story/beats"
import type { KnownFact } from "../story/knowledge"
import { type StoryNames, storyNames, storyText } from "../story/render"
import { sceneFor } from "../story/turn"
import type { Turn, TurnCharacter } from "../types/adventure"
import type { AdventurePlan } from "../types/adventure-plan"
import { isAiControlledPc } from "../utils/turn-actors"
import { gmNotesWithRules, keepPlayersAlive, type SafetyRules } from "../wiki-adventures/player-safety"
import { createAiPcTurnService } from "./ai-pc-turn-service"
import { createNpcTurnBranchService, handleSkipPassNpcTurn, type NpcTurnBranchResult } from "./npc-turn-branch-service"
import { buildDeadCharacterCompletion, buildNpcTurnUpdatePatch } from "./npc-turn-effects-service"
import { buildNpcActionContext, buildNpcActionPrompt, createNpcTurnGenerationService } from "./npc-turn-generation-service"
import { buildNpcInitiativeOrder, findEncounterInPlan, resolvePlanContextForEncounter } from "./npc-turn-intent-service"
import { applyNpcSpellPostProcessing, finalizeNpcTurnResponse } from "./npc-turn-postprocess-service"

// The encounter's intro as the GM reads it, private paragraphs marked, and its authored source, which each NPC reads as
// it knows it.
type EncounterContext = { intro?: string; introSource?: string; instructions?: string }
type DmEncounterContext = {
  encounterContext: EncounterContext
  sectionContext?: { title?: string; summary?: string }
  sceneContext?: { title?: string; summary?: string }
  adventureOverview?: string
  sectionTitle?: string
  sceneTitle?: string
  rules?: SafetyRules
  // The adventure's heroes start as strangers.
  strangers?: boolean
}

// An NPC's own turns in the scene's last three rounds, as a script. An NPC read only the round in front of it, so Bram
// said the same authored line two rounds running and Astrid tried the same failed Athletics four rounds in a row.
export function npcEarlierTurns(turns: { order?: number; encounterId: string; story: StoryBeat[]; characters: unknown[] }[], current: { order?: number; encounterId: string }, npcId: string): string {
  const earlier = turns.filter((t) => (t.order ?? 0) < (current.order ?? 0)).sort((a, b) => (b.order ?? 0) - (a.order ?? 0))
  const away = earlier.findIndex((t) => t.encounterId !== current.encounterId)
  return (away < 0 ? earlier : earlier.slice(0, away))
    .slice(0, 3)
    .reverse()
    .map((t) =>
      storyText(
        t.story.filter((b) => b.by.step === "npc" && b.by.character === npcId),
        storyNames(t.characters as TurnCharacter[])
      )
    )
    .filter(Boolean)
    .join("\n\n")
}

// An NPC whose behavior says it acts only when spoken to, such as a festival vendor, and whom no hero has spoken to,
// gone to or named since its last turn. Five vendors who each took every turn made rounds of nine turns that said little.
const WAITS = /\bacts? only\b[^.]*\bwhen\b[^.]*\b(?:spoken to|speaks to|talks to|addressed|addresses|approached|approaches)\b/i
export function waitsUnaddressed(npc: TurnCharacter, story: readonly StoryBeat[]): boolean {
  if (!npc.behavior || !WAITS.test(npc.behavior)) return false
  const first = npc.name.split(/\s+/)[0]?.toLowerCase()
  return !story.some((b) => {
    if (b.by.step !== "reply" && b.by.step !== "roll") return false
    if ((b.kind === "line" && b.to === npc.id) || (b.kind === "action" && (b.target === npc.id || b.move?.to === npc.id))) return true
    return !!first && "text" in b && new RegExp(`\\b${first.replace(/[^a-z0-9]/g, "")}\\b`, "i").test(b.text)
  })
}

export function createNpcTurnService(ports: GmPorts) {
  const { processAiPcTurn } = createAiPcTurnService(ports)
  const { resolveNpcTurnRollOrDirectBranch } = createNpcTurnBranchService(ports)
  const { generateNpcAction } = createNpcTurnGenerationService(ports)
  const isLocalWikiAdventure = ports.content.isWikiAdventure.bind(ports.content)
  const loadWikiAdventureRuntime = ports.content.loadWikiRuntime.bind(ports.content)
  async function resolveDmContext(settingId: string, planId: string, encounterId: string, names: StoryNames): Promise<DmEncounterContext> {
    if (isLocalWikiAdventure(settingId, planId)) {
      const { artifacts } = await loadWikiAdventureRuntime(settingId, planId)
      const encounter = artifacts.encounters[encounterId]
      const introSource = encounter?.sections.intro ?? encounter?.sections.body ?? ""
      return {
        encounterContext: encounter ? { intro: authoredText(introSource, names), introSource, instructions: gmNotesWithRules(artifacts.manifest, encounter.sections.gmNotes) } : {},
        adventureOverview: artifacts.manifest.summary || undefined,
        rules: artifacts.manifest,
        strangers: artifacts.manifest.strangers,
      }
    }

    const plan = (await ports.content.loadLegacyPlan(settingId, planId)) as AdventurePlan
    if (!plan || !plan.id || !plan.sections || !plan.title) {
      throw new Error("Adventure plan is missing required fields or could not be loaded")
    }
    const planContext = resolvePlanContextForEncounter(plan, encounterId)
    const encounter = findEncounterInPlan(plan, encounterId)
    return {
      ...planContext,
      encounterContext: encounter ? { intro: encounter.intro, instructions: encounter.instructions } : {},
    }
  }

  async function processNpcTurnWithLLM({
    turn,
    npcId,
    encounterContext,
    sectionContext,
    sceneContext,
    adventureOverview,
    knowledge,
    strangers,
    earlier,
  }: {
    turn: Turn
    npcId: string
    encounterContext?: EncounterContext
    sectionContext?: { title?: string; summary?: string }
    sceneContext?: { title?: string; summary?: string }
    adventureOverview?: string
    // The adventure's facts, of which the NPC reads its own.
    knowledge?: KnownFact[]
    // The adventure's heroes start as strangers: the NPC is told whose names it has not heard.
    strangers?: boolean
    // The NPC's own turns in the scene's earlier rounds.
    earlier?: string
  }): Promise<{
    updatedCharacters: TurnCharacter[]
    beatsToAppend: StoryBeat[]
    actionSummary: string
    rollInfo?: { rollType: string; difficulty: number; baseRoll: number; modifier: number; result: number; success: boolean }
    effects?: Array<{ targetId: string; healthPercentDelta?: number; status?: string; equipmentToAdd?: Array<{ name: string; description?: string }> }>
  }> {
    console.log("[LLM] Starting NPC turn:", {
      npc: npcId,
      encounter: turn.encounterId,
    })

    // 1. LLM decides NPC action
    const npc = turn.characters.find((c) => c.id === npcId)
    if (!npc) throw new Error("NPC not found")

    // NPC turn processing

    const npcActionContext = buildNpcActionContext({
      turn,
      npc,
      encounterContext,
      sectionContext,
      sceneContext,
      adventureOverview,
      knowledge,
      strangers,
      earlier,
    })
    const scene = await sceneFor(ports, turn)
    const prompt1 = buildNpcActionPrompt({
      contextString: npcActionContext.contextString,
      npcDetails: npcActionContext.npcDetails,
      noteRules: npcActionContext.noteRules,
      npc,
      alivePlayerCharacters: npcActionContext.alivePlayerCharacters,
      deadPlayerCharacters: npcActionContext.deadPlayerCharacters,
      scene,
    })

    console.log(
      "[LLM] NPC action prompt:",
      JSON.stringify(
        {
          promptLength: prompt1.length,
          npc: npc.name,
          npcEquipment: npcActionContext.npcEquipmentList,
          targetPlayers: npcActionContext.playerCharacters.length,
        },
        null,
        2
      )
    )

    const actionResult = await generateNpcAction(prompt1, npc.id)

    console.log("[LLM] NPC action response:", {
      actionType: actionResult.actionType,
      beats: actionResult.beats.length,
      quality: actionResult.beats.length && actionResult.actionSummary ? "complete" : "incomplete",
      hasDialogue: actionResult.beats.some((b) => b.kind === "line"),
      hasEffects: !!actionResult.effects?.length,
    })

    // HANDLE SKIP/PASS FIRST to avoid unnecessary API calls
    if (actionResult.actionType === "skip" || actionResult.actionType === "pass" || actionResult.actionType === "flee" || actionResult.actionType === "die") {
      return handleSkipPassNpcTurn({
        turn,
        npc,
        actionResult,
        scene,
      })
    }

    const branchResult: Omit<NpcTurnBranchResult, "actionSummary"> = await resolveNpcTurnRollOrDirectBranch({
      turn,
      npc,
      actionResult,
      encounterContext,
      npcActionContext: {
        contextString: npcActionContext.contextString,
        npcDetails: npcActionContext.npcDetails,
        playerCharacters: npcActionContext.playerCharacters,
      },
      scene,
    })

    let updatedCharacters = branchResult.updatedCharacters
    const rollInfo = branchResult.rollInfo
    const effects = branchResult.effects
    const beatsToAppend = branchResult.beatsToAppend

    updatedCharacters = applyNpcSpellPostProcessing({
      updatedCharacters,
      rollInfo,
      npcId: npc.id,
    })

    return finalizeNpcTurnResponse({
      actionSummary: actionResult.actionSummary,
      updatedCharacters,
      rollInfo,
      effects,
      beatsToAppend,
      npcId: npc.id,
    })
  }

  async function processNpcTurnsAfterCurrent(turnId: string) {
    const limit = ports.npcTurnsPerCall ?? Number.POSITIVE_INFINITY
    let played = 0
    const npcRequestId = Math.random().toString(36).substring(7)
    console.log(`[NPC:${npcRequestId}] Starting NPC turns processing:`, {
      turnId: turnId.toString(),
    })

    let turn = await ports.store.getTurn({ turnId })
    if (!turn) throw new Error("Turn not found")

    console.log(
      `[NPC:${npcRequestId}] Loaded turn`,
      JSON.stringify(
        {
          turnId: turn._id.toString(),
          adventureId: turn.adventureId.toString(),
          encounterId: turn.encounterId,
          beats: turn.story.length,
          characterCount: turn.characters.length,
          characters: turn.characters.map((c) => ({
            id: c.id,
            name: c.name,
            type: c.type,
            hasReplied: c.hasReplied,
            isComplete: c.isComplete,
            initiative: c.initiative,
          })),
        },
        null,
        2
      )
    )

    const adventure = await ports.store.getAdventure({ adventureId: turn.adventureId })
    if (!adventure) throw new Error(`Adventure not found for ID: ${turn.adventureId.toString()}`)

    console.log(
      "[LLM DM] Loaded adventure",
      JSON.stringify(
        {
          adventureId: adventure._id.toString(),
          settingId: adventure.settingId,
          planId: adventure.planId,
          title: adventure.title,
        },
        null,
        2
      )
    )

    const { encounterContext, sectionContext, sceneContext, adventureOverview, sectionTitle, sceneTitle, rules, strangers } = await resolveDmContext(
      adventure.settingId,
      adventure.planId,
      turn.encounterId,
      storyNames(turn.characters)
    )

    console.log(
      "[LLM DM] Resolved encounter context",
      JSON.stringify(
        {
          encounterId: turn.encounterId,
          hasEncounterIntro: !!encounterContext.intro,
          hasEncounterInstructions: !!encounterContext.instructions,
          hasSection: !!sectionContext,
          hasScene: !!sceneContext,
          sectionTitle,
          sceneTitle,
          hasAdventureOverview: !!adventureOverview,
        },
        null,
        2
      )
    )

    const allTurns = await ports.store.getTurns({ adventureId: turn.adventureId })
    let characters = turn.characters as TurnCharacter[]
    // Take a snapshot of the current initiative order
    const initiativeOrder = buildNpcInitiativeOrder(characters)

    console.log(`[NPC:${npcRequestId}] Initiative order analysis:`, {
      totalCharacters: characters.length,
      incompleteCharacters: initiativeOrder.length,
      initiativeOrder: initiativeOrder.map((c) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        initiative: c.initiative,
        hasReplied: c.hasReplied,
        isComplete: c.isComplete,
        healthPercent: c.healthPercent,
        status: c.status,
      })),
    })

    let processedNpcCount = 0
    for (const char of initiativeOrder) {
      // Skip dead PCs and continue processing NPCs
      if (char.type === "pc" && (char.healthPercent === 0 || char.status === "dead")) {
        console.log("[LLM] Skipping dead player character:", char.name)
        continue // Skip dead PCs and continue with NPCs
      }
      if (isAiControlledPc(char)) {
        // AI companion: play their turn automatically, then keep walking the
        // initiative order. On failure leave them pending so the client-side
        // ensureNpcProcessed safety net can retry instead of wedging the turn.
        console.log("[LLM] Processing AI companion turn:", char.name)
        try {
          await processAiPcTurn({
            turnId,
            characterId: char.id,
            adventure: { _id: adventure._id, settingId: adventure.settingId, planId: adventure.planId, knowledge: adventure.knowledge },
          })
        } catch (error) {
          console.error("[LLM] AI companion turn failed, stopping loop for retry:", char.name, error)
          break
        }
        if (++played >= limit) break
        continue
      }
      if (char.type !== "npc") {
        console.log("[LLM] Stopping at player character:", char.name)
        break // Process NPCs in order, then stop
      }

      console.log(`[LLM] Processing NPC ${processedNpcCount + 1}:`, char.name)

      // Always reload the latest turn state before processing each NPC
      // as previous NPC actions in the same turn might have updated it.
      const currentTurnState = await ports.store.getTurn({ turnId })
      if (!currentTurnState) {
        console.warn("[LLM DM] Could not reload turn state, stopping NPC processing for this turn.")
        break
      }
      turn = currentTurnState // Update local turn variable
      characters = turn.characters as TurnCharacter[] // Update local characters variable

      console.log(
        "[LLM DM] Reloaded turn state",
        JSON.stringify(
          {
            turnId: turn._id.toString(),
            beats: turn.story.length,
            characterCount: characters.length,
            updatedCharacters: characters.map((c) => ({
              id: c.id,
              name: c.name,
              type: c.type,
              hasReplied: c.hasReplied,
              isComplete: c.isComplete,
              healthPercent: c.healthPercent,
            })),
          },
          null,
          2
        )
      )

      const npc = characters.find((c) => c.id === char.id && c.type === "npc" && !c.hasReplied && !c.isComplete)
      if (!npc) {
        console.log(
          "[LLM DM] NPC already processed or no longer eligible",
          JSON.stringify(
            {
              npcId: char.id,
              npcName: char.name,
              hasReplied: characters.find((c) => c.id === char.id)?.hasReplied,
              isComplete: characters.find((c) => c.id === char.id)?.isComplete,
            },
            null,
            2
          )
        )
        continue // NPC already processed or no longer eligible
      }

      // Since the NPC's last turn: the rest of the scene's last round, then this one.
      const prev = allTurns.find((t) => t.order === (turn!.order ?? 0) - 1 && t.encounterId === turn!.encounterId)
      const since = prev ? prev.story.slice(prev.story.map((b) => b.by.step === "npc" && b.by.character === npc.id).lastIndexOf(true) + 1) : []
      if (waitsUnaddressed(npc, [...since, ...turn.story])) {
        console.log("[LLM DM] NPC waits to be addressed, skipping:", npc.name)
        await ports.store.updateTurn({
          turnId: turn._id,
          patch: { characters: characters.map((c) => (c.id === npc.id ? { ...c, hasReplied: true, isComplete: true } : c)), updatedAt: Date.now() },
        })
        continue
      }

      console.log(
        "[LLM DM] Calling processNpcTurnWithLLM",
        JSON.stringify(
          {
            npcId: npc.id,
            npcName: npc.name,
            hasEncounterContext: !!encounterContext.intro || !!encounterContext.instructions,
            hasSectionContext: !!sectionContext,
            hasSceneContext: !!sceneContext,
            hasAdventureOverview: !!adventureOverview,
          },
          null,
          2
        )
      )

      // Pass new context fields to processNpcTurnWithLLM. On failure leave the
      // NPC pending and stop; the client-side safety net retries.
      let result: Awaited<ReturnType<typeof processNpcTurnWithLLM>>
      try {
        result = await processNpcTurnWithLLM({
          turn: { ...turn, id: turn._id, characters },
          npcId: npc.id,
          encounterContext,
          sectionContext,
          sceneContext,
          adventureOverview,
          knowledge: adventure.knowledge,
          strangers,
          earlier: npcEarlierTurns(allTurns, turn, npc.id),
        })
      } catch (error) {
        console.error("[LLM] NPC turn failed, stopping loop for retry:", npc.name, error)
        break
      }

      console.log(
        "[LLM DM] processNpcTurnWithLLM completed",
        JSON.stringify(
          {
            actionSummary: result.actionSummary,
            beatsToAppend: result.beatsToAppend.length,
            updatedCharacterCount: result.updatedCharacters.length,
            hasRollInfo: !!result.rollInfo,
            effectCount: result.effects?.length || 0,
          },
          null,
          2
        )
      )

      const turnPatch = buildNpcTurnUpdatePatch({
        turn,
        beatsToAppend: result.beatsToAppend,
        updatedCharacters: keepPlayersAlive(rules, result.updatedCharacters),
      })

      console.log(
        `[NPC:${npcRequestId}] Updating turn in database`,
        JSON.stringify(
          {
            turnId: turn._id.toString(),
            beats: turnPatch.story.length,
            updatedCharacterCount: result.updatedCharacters.length,
          },
          null,
          2
        )
      )

      await ports.store.updateTurn({
        turnId: turn._id,
        patch: turnPatch,
      })

      processedNpcCount++
      console.log(
        `[LLM DM] Completed processing NPC ${processedNpcCount}`,
        JSON.stringify(
          {
            npcName: npc.name,
            npcId: npc.id,
            processedNpcCount,
            totalNpcsInOrder: initiativeOrder.filter((c) => c.type === "npc").length,
          },
          null,
          2
        )
      )
      // A fallen NPC's turn only tells its fall, so it does not use up the call.
      if (!(npc.healthPercent === 0 || npc.status === "dead") && ++played >= limit) break
    }

    // After processing NPCs, mark all dead characters as complete
    const finalTurnState = await ports.store.getTurn({ turnId })
    if (finalTurnState) {
      const deadCharacterCompletion = buildDeadCharacterCompletion({
        characters: finalTurnState.characters as TurnCharacter[],
      })

      if (deadCharacterCompletion.hasChanges) {
        console.log(
          `[NPC:${npcRequestId}] Marking ${deadCharacterCompletion.deadCharacters.length} dead character(s) as complete:`,
          deadCharacterCompletion.deadCharacters.map((character) => character.name)
        )

        await ports.store.updateTurn({
          turnId: finalTurnState._id,
          patch: {
            characters: deadCharacterCompletion.updatedCharacters,
            updatedAt: Date.now(),
          },
        })
      }
    }

    console.log(`[NPC:${npcRequestId}] NPC turns processing completed:`, {
      processed: processedNpcCount,
      total: initiativeOrder.length,
    })
  }
  return { processNpcTurnWithLLM, processNpcTurnsAfterCurrent }
}
