import { buildRecentTurnHistory, buildRollInfo, getEncounterTurnStatus, getRecentTurnsForContext } from "@/lib/services/advance-turn-prompt-service"
import type { Turn, TurnCharacter } from "@/types/adventure"
import type { ContentRef } from "./artifact-loader"
import type { RuntimeArtifacts, RuntimeEncounter, RuntimeEntityRecord, RuntimeTransition } from "./types"

export type RuntimeTurnRow = {
  encounterId: string
  narrative?: string
  order?: number
  characters?: TurnCharacter[]
}

export type RuntimeSessionSnapshot = {
  adventureInstanceId: string
  currentTurnOrder: number
  currentEncounterTurnNumber?: number
  narrativeSummary?: string
  currentTurn: Turn
  allTurns: RuntimeTurnRow[]
  activeCharacterId?: string
}

export type LlmGameplayContextPacket = {
  contentRef: {
    source: ContentRef["source"] | "resolvedPublished"
    settingId: string
    adventureId: string
    planId: string
    contentVersion: string
    contentHash: string
    currentEncounterId: string
  }
  adventure: {
    title: string
    summary?: string
    startEncounterId: string
  }
  currentEncounter: Pick<RuntimeEncounter, "id" | "title" | "summary" | "sections" | "locationId" | "npcRefs" | "image" | "assetIds"> & {
    intro: string
    gmNotes?: string
    checks?: string
    transitions: RuntimeTransition[]
    imageRefs: string[]
  }
  linkedContext: {
    locations: RuntimeEntityRecord[]
    npcProfiles: RuntimeEntityRecord[]
    characterProfiles: RuntimeEntityRecord[]
    items: RuntimeEntityRecord[]
    factions: RuntimeEntityRecord[]
    assets: RuntimeEntityRecord[]
  }
  characters: {
    live: TurnCharacter[]
    baselines: Array<{ id: string; type: "pc" | "npc"; name: string; sheetPath: string }>
    activeCharacterId?: string
  }
  session: {
    adventureInstanceId: string
    currentTurnOrder: number
    currentEncounterTurnNumber: number
    recentTurnHistory: string
    narrativeSummary?: string
    mostRecentAction?: string
    rollInfo: string
  }
  graph: {
    legalTransitions: RuntimeTransition[]
    currentEncounterLinks: RuntimeEncounter["typedLinks"]
  }
  outputContract: {
    allowedNextEncounterIds: string[]
    responseShape: "nextEncounterId+narrative+adventurePatch"
    playerCharacterNames: string[]
  }
  /** Battle-map staging summary (lib/mapview/spatial-summary.ts); absent when the encounter has no stored map. */
  spatialContext?: string
}

export function assembleGameplayContextPacket(args: {
  artifacts: RuntimeArtifacts
  contentRef: Exclude<ContentRef, { source: "latest" }>
  session: RuntimeSessionSnapshot
  spatialContext?: string
}): LlmGameplayContextPacket {
  const currentEncounter = args.artifacts.encounters[args.session.currentTurn.encounterId]
  if (!currentEncounter) throw new Error(`Current encounter ${args.session.currentTurn.encounterId} missing from runtime artifacts`)

  const recentTurns = getRecentTurnsForContext(args.session.allTurns, args.session.currentTurnOrder, args.session.adventureInstanceId)
  const turnStatus = getEncounterTurnStatus(args.session.allTurns, currentEncounter.id, args.session.currentTurnOrder)
  const legalTransitions = args.artifacts.graph.encounterTransitions.filter((transition) => transition.fromEncounterId === currentEncounter.id && transition.publishResolved)
  const liveCharacters = args.session.currentTurn.characters
  const npcIds = new Set(currentEncounter.npcRefs.map((ref) => ref.id))
  const liveIds = new Set(liveCharacters.map((character) => character.id))

  return {
    contentRef: {
      source: args.contentRef.source === "published" ? "resolvedPublished" : args.contentRef.source,
      settingId: args.artifacts.manifest.settingId,
      adventureId: args.artifacts.manifest.adventureId,
      planId: args.artifacts.manifest.planId,
      contentVersion: args.artifacts.manifest.contentVersion,
      contentHash: args.artifacts.manifest.contentHash,
      currentEncounterId: currentEncounter.id,
    },
    adventure: {
      title: args.artifacts.manifest.title,
      summary: args.artifacts.manifest.summary ?? args.artifacts.manifest.teaser,
      startEncounterId: args.artifacts.manifest.startEncounterId,
    },
    currentEncounter: {
      id: currentEncounter.id,
      title: currentEncounter.title,
      summary: currentEncounter.summary,
      sections: currentEncounter.sections,
      intro: currentEncounter.sections.intro ?? currentEncounter.sections.body ?? "",
      gmNotes: currentEncounter.sections.gmNotes,
      checks: currentEncounter.sections.checks,
      locationId: currentEncounter.locationId,
      npcRefs: currentEncounter.npcRefs,
      image: currentEncounter.image,
      imageRefs: [currentEncounter.image, ...currentEncounter.assetIds].filter((value): value is string => Boolean(value)),
      assetIds: currentEncounter.assetIds,
      transitions: legalTransitions,
    },
    linkedContext: {
      locations: currentEncounter.locationId ? [args.artifacts.entities.locations[currentEncounter.locationId]].filter(Boolean) : [],
      npcProfiles: [...npcIds].map((id) => args.artifacts.entities.npcProfiles[id]).filter(Boolean),
      characterProfiles: [...liveIds].map((id) => args.artifacts.entities.premadeCharacterProfiles[id]).filter(Boolean),
      items: linkedRecords(args.artifacts.entities.items, currentEncounter),
      factions: linkedRecords(args.artifacts.entities.factions, currentEncounter),
      assets: linkedRecords(args.artifacts.entities.assets, currentEncounter),
    },
    characters: {
      live: liveCharacters,
      baselines: [
        ...Object.values(args.artifacts.characterSheets.premadeCharacters)
          .filter((entry) => liveIds.has(entry.sheet.id))
          .map((entry) => ({ id: entry.sheet.id, type: "pc" as const, name: entry.sheet.name, sheetPath: entry.sheetPath })),
        ...Object.values(args.artifacts.characterSheets.npcs)
          .filter((entry) => npcIds.has(entry.sheet.id) || liveIds.has(entry.sheet.id))
          .map((entry) => ({ id: entry.sheet.id, type: "npc" as const, name: entry.sheet.name, sheetPath: entry.sheetPath })),
      ],
      activeCharacterId: args.session.activeCharacterId,
    },
    session: {
      adventureInstanceId: args.session.adventureInstanceId,
      currentTurnOrder: args.session.currentTurnOrder,
      currentEncounterTurnNumber: args.session.currentEncounterTurnNumber ?? turnStatus.currentEncounterTurnNumber,
      recentTurnHistory: buildRecentTurnHistory(recentTurns),
      narrativeSummary: args.session.narrativeSummary,
      mostRecentAction: (args.session.currentTurn.narrative ?? "").split(/\n\n/).filter(Boolean).at(-1),
      rollInfo: buildRollInfo(args.session.currentTurn),
    },
    graph: {
      legalTransitions,
      currentEncounterLinks: currentEncounter.typedLinks,
    },
    outputContract: {
      allowedNextEncounterIds: [currentEncounter.id, ...legalTransitions.map((transition) => transition.toEncounterId)],
      responseShape: "nextEncounterId+narrative+adventurePatch",
      playerCharacterNames: liveCharacters.filter((character) => character.type === "pc").map((character) => character.name),
    },
    spatialContext: args.spatialContext,
  }
}

function linkedRecords(records: Record<string, RuntimeEntityRecord>, encounter: RuntimeEncounter): RuntimeEntityRecord[] {
  const ids = new Set(encounter.typedLinks.map((link) => (records[link.id] ? link.id : "")).filter(Boolean))
  return [...ids].map((id) => records[id]).filter(Boolean)
}

export function buildWikiEncounterProgressionPrompt(packet: LlmGameplayContextPacket): string {
  const transitionText = packet.graph.legalTransitions.length
    ? packet.graph.legalTransitions
        .map((transition, index) => `Transition Option ${index + 1} (leads to encounter ID: '${transition.toEncounterId}'):\n  Condition to check: ${transition.condition}`)
        .join("\n")
    : "No explicit transitions defined for this encounter."

  return `Adventure: ${packet.adventure.title}
Content Version: ${packet.contentRef.contentVersion}
Content Hash: ${packet.contentRef.contentHash}

Adventure Summary:
${packet.adventure.summary ?? ""}

Current Encounter Title: ${packet.currentEncounter.title}
Current Encounter ID: ${packet.currentEncounter.id}
Current Encounter Intro:
${packet.currentEncounter.intro}
Current Encounter GM Notes:
${packet.currentEncounter.gmNotes ?? ""}

${
  packet.spatialContext
    ? `Battle Map Staging:
${packet.spatialContext}
Keep described distances, positioning, and movement consistent with this staging. A creature that starts far from the party must plausibly cross that distance (over one or more turns) before it can be in melee; a creature that starts adjacent should be described as immediately close. Use the map's place names when referring to locations.

`
    : ""
}${packet.session.recentTurnHistory}

Most Recent Action/Event:
${packet.session.mostRecentAction ?? ""}

Roll Context:
${packet.session.rollInfo}

Available Transition Options for '${packet.currentEncounter.id}':
${transitionText}

Allowed nextEncounterId values:
${packet.outputContract.allowedNextEncounterIds.join(", ")}

Your Task:
1. Continue the current encounter unless a listed transition condition is clearly satisfied by past player actions or roll outcomes.
2. If transitioning, set nextEncounterId to one of the listed transition target IDs.
3. If not transitioning, set nextEncounterId to the current encounter ID.
4. Return narrative for players. Do not write new player decisions, dialogue, or internal thoughts for: ${packet.outputContract.playerCharacterNames.join(", ")}.
5. Include an adventurePatch that updates the live Adventure playthrough record with summaries, discoveries, entity updates, character updates, open threads, resolved threads, and transition details when applicable.

Respond in JSON:
{
  "nextEncounterId": string,
  "narrative": string,
  "adventurePatch": object
}`
}
