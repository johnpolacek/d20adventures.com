"use server"

import { startAdventure } from "@/app/_actions/start-adventure"
import type { CharacterChoiceMode } from "@/components/adventure/character-selection"
import type { Id } from "@/convex/_generated/dataModel"
import { api } from "@/convex/_generated/api"
import { convex } from "@/lib/convex/server"
import { canManageResource } from "@/lib/content-permissions"
import { readJsonFromS3, updateJsonOnS3 } from "@/lib/s3-utils"
import { toPCTemplate } from "@/lib/utils/character-mapping"
import { isLocalWikiAdventure, loadLocalWikiAdventureRuntime } from "@/lib/wiki-adventures/local-runtime"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { PCTemplate } from "@/types/character"
import type { Setting } from "@/types/setting"
import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

interface CreateAdventureInput {
  settingId: string
  adventurePlanId: string
  characterChoices: CharacterChoiceMode[]
  runType?: "campaign" | "practice"
  parentAdventureId?: Id<"adventures">
  parentTurnId?: Id<"turns">
}

export async function createAdventure(input: CreateAdventureInput) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const { settingId, adventurePlanId } = input
  // TODO: Use characterChoices in later stages for lobby state

  // Read the adventure plan to get the proper title
  const planPath = `settings/${settingId}/${adventurePlanId}.json`
  const plan = (await readJsonFromS3(planPath)) as AdventurePlan
  if (!plan || !plan.title) {
    throw new Error("Adventure plan not found or is invalid")
  }

  // Extract character choices and create the players array
  const { characterChoices } = input
  const localWikiRuntime = isLocalWikiAdventure(settingId, adventurePlanId) ? loadLocalWikiAdventureRuntime(settingId, adventurePlanId) : null
  const players = characterChoices
    .filter((choice) => choice.mode === "player") // Only include characters selected as "player"
    .map((choice) => ({
      userId: userId,
      characterId: normalizePlayerCharacterKey(userId, choice.characterId),
    }))

  // Ensure each selected character exists in the user's S3 path
  for (const choice of characterChoices.filter((c) => c.mode === "player")) {
    const userCharKey = normalizePlayerCharacterKey(userId, choice.characterId)
    let exists = false
    try {
      await readJsonFromS3(userCharKey)
      exists = true
    } catch {}
    if (!exists) {
      // Try to find the character in premade PCs or as a custom character
      let characterData: PCTemplate | unknown = localWikiRuntime?.artifacts.characterSheets.premadeCharacters[choice.characterId]?.sheet ?? plan.premadePlayerCharacters?.find((pc) => pc.id === choice.characterId)
      if (!characterData) {
        // Try to load as a custom character (should not throw if not found)
        try {
          const customChar = await readJsonFromS3(choice.characterId)
          characterData = customChar
        } catch {}
      }
      const pc = toPCTemplate(characterData)
      if (pc) {
        await updateJsonOnS3(userCharKey, pc)
      }
    }
  }

  // Create adventure in waiting state
  const now = Date.now()
  // Create the adventure using the existing Convex mutation
  const adventureId = await convex.mutation(api.adventure.createAdventure, {
    planId: adventurePlanId,
    settingId,
    ownerId: userId,
    runType: input.runType ?? "campaign",
    parentAdventureId: input.parentAdventureId,
    parentTurnId: input.parentTurnId,
    playerIds: [userId], // Keep for backwards compatibility
    players,
    status: "waitingForPlayers", // Start in lobby state
    title: plan.title, // Use the actual adventure title from the plan
    startedAt: now,
    contentRef: localWikiRuntime?.contentRef,
    currentEncounterId: localWikiRuntime?.artifacts.manifest.startEncounterId,
    adventureSummaryMarkdown: localWikiRuntime?.artifacts.manifest.summary,
  })

  // If only one player character AND the adventure plan expects only one player, auto-start the adventure
  const maxPartySize = plan.party?.[1] || 1
  const isSoloAdventure = maxPartySize === 1

  if (players.length === 1 && isSoloAdventure) {
    // Call startAdventure to create the first turn and redirect to it
    await startAdventure({ settingId, adventurePlanId, adventureId })
    return // startAdventure will handle the redirect
  }

  // For multi-character adventures or when more players might join, redirect to lobby
  redirect(`/settings/${settingId}/${adventurePlanId}/${adventureId}`)
}

export interface PracticeLineupSelection {
  source: "premade" | "saved"
  characterId: string
}

interface CreatePracticeAdventureInput {
  settingId: string
  adventurePlanId: string
  lineup: PracticeLineupSelection[]
  parentAdventureId?: Id<"adventures">
  parentTurnId?: Id<"turns">
}

export async function createPracticeAdventure(input: CreatePracticeAdventureInput) {
  const { userId } = await auth()
  if (!userId) {
    throw new Error("Unauthorized")
  }

  const { settingId, adventurePlanId, lineup } = input
  const planPath = `settings/${settingId}/${adventurePlanId}.json`
  const plan = (await readJsonFromS3(planPath)) as AdventurePlan
  if (!plan || !plan.title) {
    throw new Error("Adventure plan not found or is invalid")
  }

  let setting: Setting | null = null
  try {
    setting = (await readJsonFromS3(`settings/${settingId}/setting-data.json`)) as Setting
  } catch {
    setting = null
  }

  const canManagePlan = canManageResource(userId, plan) || (setting !== null && canManageResource(userId, setting))
  if (!canManagePlan) {
    throw new Error("Forbidden")
  }

  const minParty = plan.party?.[0] || 1
  const maxParty = plan.party?.[1] || 4
  if (lineup.length < minParty || lineup.length > maxParty) {
    throw new Error(`Practice lineup must include between ${minParty} and ${maxParty} characters`)
  }

  const selectedCharacterIds = new Set<string>()
  const players: { userId: string; characterId: string }[] = []

  for (const member of lineup) {
    if (selectedCharacterIds.has(member.characterId)) {
      throw new Error("Duplicate characters are not allowed in a practice lineup")
    }
    selectedCharacterIds.add(member.characterId)

    if (member.source === "premade") {
      const isValidPremade = plan.premadePlayerCharacters.some((pc) => pc.id === member.characterId)
      if (!isValidPremade) {
        throw new Error(`Unknown premade character: ${member.characterId}`)
      }
      players.push({ userId, characterId: member.characterId })
      continue
    }

    if (!member.characterId.startsWith(`characters/${userId}/`) || !member.characterId.endsWith(".json")) {
      throw new Error("Saved characters must belong to the current user")
    }

    await readJsonFromS3(member.characterId)
    players.push({ userId, characterId: member.characterId })
  }

  const now = Date.now()
  const localWikiRuntime = isLocalWikiAdventure(settingId, adventurePlanId) ? loadLocalWikiAdventureRuntime(settingId, adventurePlanId) : null
  const adventureId = await convex.mutation(api.adventure.createAdventure, {
    planId: adventurePlanId,
    settingId,
    ownerId: userId,
    runType: "practice",
    parentAdventureId: input.parentAdventureId,
    parentTurnId: input.parentTurnId,
    playerIds: [userId],
    players,
    status: "waitingForPlayers",
    title: `${plan.title} (Practice)`,
    startedAt: now,
    contentRef: localWikiRuntime?.contentRef,
    currentEncounterId: localWikiRuntime?.artifacts.manifest.startEncounterId,
    adventureSummaryMarkdown: localWikiRuntime?.artifacts.manifest.summary,
  })

  await startAdventure({ settingId, adventurePlanId, adventureId })
}

function normalizePlayerCharacterKey(userId: string, characterId: string) {
  if (characterId.startsWith("characters/")) return characterId
  if (characterId.endsWith(".json")) return `characters/${userId}/${characterId}`
  return `characters/${userId}/${characterId}.json`
}
