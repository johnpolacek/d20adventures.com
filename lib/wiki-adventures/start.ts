import { after } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { maybeTriggerStoryviewAutoGeneration } from "@/lib/services/turn-audio-service"
import { buildLocalWikiTurnCharacters, loadWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"
import type { PCTemplate } from "@/types/character"

// Starts a wiki adventure in the lobby: its first turn from the start encounter's intro, with no model call.
export async function startWikiAdventure(adventure: Pick<Doc<"adventures">, "_id" | "settingId" | "planId" | "players">) {
  const { definition, artifacts, contentRef } = await loadWikiAdventureRuntime(adventure.settingId, adventure.planId)
  const firstEncounter = artifacts.encounters[artifacts.manifest.startEncounterId]
  if (!firstEncounter) throw new Error(`${adventure.planId} start encounter is missing from compiled wiki artifacts`)
  const { characters: existingPlayerCharacters, sheetsByCharacterId } = await loadExistingPlayerCharacters(adventure.players ?? [])
  const characters = buildLocalWikiTurnCharacters({
    artifacts,
    encounter: firstEncounter,
    players: adventure.players ?? [],
    existingPlayerCharacters,
    sheetsByCharacterId,
  })
  const turnId = await convex.mutation(api.adventure.createTurn, {
    adventureId: adventure._id,
    encounterId: firstEncounter.id,
    title: firstEncounter.title,
    narrative: firstEncounter.sections.intro ?? firstEncounter.sections.body ?? "",
    characters,
    order: 1,
    generatedBy: { promptVersion: `wiki-${definition.promptSlug}-start-v1`, contextHash: contentRef.contentHash },
  })
  await convex.mutation(api.adventure.patchAdventure, {
    adventureId: adventure._id,
    patch: {
      status: "active",
      currentTurnId: turnId,
      currentEncounterId: firstEncounter.id,
      contentRef,
      adventureSummaryMarkdown: artifacts.manifest.summary,
      updatedAt: Date.now(),
    },
  })
  after(() => maybeTriggerStoryviewAutoGeneration(turnId))
  return turnId as Id<"turns">
}

async function loadExistingPlayerCharacters(players: Array<{ userId: string; characterId: string }>) {
  const characters = []
  // Keyed by the storage key so lookups don't depend on a saved character's
  // file name matching the id inside its sheet.
  const sheetsByCharacterId: Record<string, PCTemplate> = {}

  for (const player of players) {
    if (!player.characterId.startsWith("characters/")) continue
    const sheet = (await readJsonFromS3(player.characterId)) as PCTemplate
    sheetsByCharacterId[player.characterId] = sheet
    characters.push({
      ...sheet,
      id: sheet.id,
      type: "pc" as const,
      userId: player.userId,
      initiative: 0,
      hasReplied: false,
      isComplete: false,
    })
  }

  return { characters, sheetsByCharacterId }
}
