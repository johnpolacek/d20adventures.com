import { withArrival } from "@d20/gm-core/character/hero-draft"
import { withArrivals } from "@d20/gm-core/story/authored"
import { introTurn } from "@d20/gm-core/story/turn"
import { after } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Doc, Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { readJsonFromS3 } from "@/lib/s3-utils"
import { maybeTriggerStoryviewAutoGeneration } from "@/lib/services/turn-audio-service"
import { buildLocalWikiTurnCharacters, loadWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"
import type { PCTemplate } from "@/types/character"

// Starts a wiki adventure in the lobby: its first turn from the start encounter's intro, with no model call. In a
// hosted game, created heroes arrive with the paragraphs the host's GM wrote for them, and why they came and what
// others see go on this game's copy of their sheet.
export async function startWikiAdventure(adventure: Pick<Doc<"adventures">, "_id" | "settingId" | "planId" | "players" | "host">) {
  const { definition, artifacts, contentRef } = await loadWikiAdventureRuntime(adventure.settingId, adventure.planId)
  const firstEncounter = artifacts.encounters[artifacts.manifest.startEncounterId]
  if (!firstEncounter) throw new Error(`${adventure.planId} start encounter is missing from compiled wiki artifacts`)
  const { characters: existingPlayerCharacters, sheetsByCharacterId, arrivals } = await loadExistingPlayerCharacters(adventure.players ?? [], adventure.host?.arrivals)
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
    ...introTurn(withArrivals(firstEncounter.sections.intro ?? firstEncounter.sections.body ?? "", arrivals), { cast: characters }),
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
      ...(Object.keys(arrivals).length ? { arrivals } : {}),
      updatedAt: Date.now(),
    },
  })
  after(() => maybeTriggerStoryviewAutoGeneration(turnId))
  return turnId as Id<"turns">
}

type Arrival = NonNullable<NonNullable<Doc<"adventures">["host"]>["arrivals"]>[string]

async function loadExistingPlayerCharacters(players: Array<{ userId: string; characterId: string }>, arrivals: Record<string, Arrival> = {}) {
  const characters = []
  // Keyed by the storage key so lookups don't depend on a saved character's
  // file name matching the id inside its sheet.
  const sheetsByCharacterId: Record<string, PCTemplate> = {}
  // The arrival paragraphs, by the hero's id in the turn.
  const intros: Record<string, string> = {}

  for (const player of players) {
    if (!player.characterId.startsWith("characters/")) continue
    // Arrivals are kept by the sheet's file name.
    const arrival = arrivals[player.characterId.split("/").pop()?.replace(".json", "") ?? ""]
    const sheet = withArrival((await readJsonFromS3(player.characterId)) as PCTemplate, arrival)
    sheetsByCharacterId[player.characterId] = sheet
    if (arrival) intros[sheet.id] = arrival.intro
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

  return { characters, sheetsByCharacterId, arrivals: intros }
}
