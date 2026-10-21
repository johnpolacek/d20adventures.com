import { buildRecentTurnHistory, buildRollInfo, getEncounterTurnStatus, getRecentTurnsForContext } from "../services/advance-turn-prompt-service"
import { authoredText } from "../story/authored"
import type { StoryBeat } from "../story/beats"
import type { StoryScene } from "../story/clean"
import { type KnownFact, ledgerNote } from "../story/knowledge"
import { storyRules } from "../story/prompt"
import { lastStep, storyNames, storyText } from "../story/render"
import { turnScript } from "../story/turn"
import type { Turn, TurnCharacter } from "../types/adventure"
import { KNOWLEDGE_RULE } from "../utils/narrative-utils"
import type { ContentRef } from "./content-ref"
import { gmNotesWithRules } from "./player-safety"
import type { RuntimeArtifacts, RuntimeEncounter, RuntimeEntityRecord, RuntimeTransition } from "./types"

export type RuntimeTurnRow = {
  encounterId: string
  story: StoryBeat[]
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
  // What each character knows: see story/knowledge.ts.
  knowledge?: KnownFact[]
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
    // Everything in the current turn so far, in order: the GM's framing, each reply, roll and NPC turn.
    currentRound?: string
    // Every fact with its id and who knows it.
    ledger?: string
    mostRecentAction?: string
    rollInfo: string
  }
  graph: {
    legalTransitions: RuntimeTransition[]
    // Each transition target's intro, which players read straight after the GM's narrative on that transition.
    nextEncounterIntros: Record<string, string>
    currentEncounterLinks: RuntimeEncounter["typedLinks"]
  }
  outputContract: {
    allowedNextEncounterIds: string[]
    responseShape: "nextEncounterId+beats+adventurePatch"
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
  // The rescue transition is the core's to take, on health. The model is never offered it.
  const rescueEncounterId = args.artifacts.manifest.rescue?.encounterId
  const legalTransitions = args.artifacts.graph.encounterTransitions.filter(
    (transition) => transition.fromEncounterId === currentEncounter.id && transition.publishResolved && transition.toEncounterId !== rescueEncounterId
  )
  const liveCharacters = args.session.currentTurn.characters
  // Names of everyone met so far, so a fact known to someone from an earlier scene names them.
  const names = storyNames([...args.session.allTurns.flatMap((t) => t.characters ?? []), ...liveCharacters])
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
      intro: authoredText(currentEncounter.sections.intro ?? currentEncounter.sections.body ?? "", names),
      gmNotes: gmNotesWithRules(args.artifacts.manifest, currentEncounter.sections.gmNotes),
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
      currentRound: turnScript(args.session.currentTurn),
      ledger: ledgerNote(args.session.knowledge, names, true),
      mostRecentAction: storyText(lastStep(args.session.currentTurn.story), storyNames(args.session.currentTurn.characters)),
      rollInfo: buildRollInfo(args.session.currentTurn),
    },
    graph: {
      legalTransitions,
      nextEncounterIntros: Object.fromEntries(
        legalTransitions.map((transition) => [transition.toEncounterId, authoredText(args.artifacts.encounters[transition.toEncounterId]?.sections.intro ?? "", names).trim()])
      ),
      currentEncounterLinks: currentEncounter.typedLinks,
    },
    outputContract: {
      allowedNextEncounterIds: [currentEncounter.id, ...legalTransitions.map((transition) => transition.toEncounterId)],
      responseShape: "nextEncounterId+beats+adventurePatch",
      playerCharacterNames: liveCharacters.filter((character) => character.type === "pc").map((character) => character.name),
    },
    spatialContext: args.spatialContext,
  }
}

function linkedRecords(records: Record<string, RuntimeEntityRecord>, encounter: RuntimeEncounter): RuntimeEntityRecord[] {
  const ids = new Set(encounter.typedLinks.map((link) => (records[link.id] ? link.id : "")).filter(Boolean))
  return [...ids].map((id) => records[id]).filter(Boolean)
}

export function buildWikiEncounterProgressionPrompt(packet: LlmGameplayContextPacket, scene?: StoryScene): string {
  const transitionText = packet.graph.legalTransitions.length
    ? packet.graph.legalTransitions
        .map((transition, index) => {
          const intro = packet.graph.nextEncounterIntros[transition.toEncounterId]
          const option = `Transition Option ${index + 1} (leads to encounter ID: '${transition.toEncounterId}'):\n  Condition to check: ${transition.condition}`
          return intro ? `${option}\n  Intro players read straight after your narrative if you take it. It has not happened yet:\n${intro}` : option
        })
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
${packet.session.ledger ? `\n${packet.session.ledger}\n` : ""}
This Round So Far:
${packet.session.currentRound ?? ""}

Most Recent Action/Event:
${packet.session.mostRecentAction ?? ""}

Roll Context:
${packet.session.rollInfo}

Available Transition Options for '${packet.currentEncounter.id}':
${transitionText}

Allowed nextEncounterId values:
${packet.outputContract.allowedNextEncounterIds.join(", ")}

Your Task:
1. Decide from what has already happened, including everything this round and roll outcomes. A player's action this round counts even when an NPC spoke after it. If events so far satisfy a listed transition condition, transition now rather than extending a situation that is already resolved. Continue the current encounter only when no listed condition is satisfied yet, or when one depends on a player choice that has not been made.
2. If transitioning, set nextEncounterId to one of the listed transition target IDs.
3. If not transitioning, set nextEncounterId to the current encounter ID.
4. Return beats for players. Do not write new player decisions, lines, or internal thoughts for: ${packet.outputContract.playerCharacterNames.join(", ")}. End on the story itself. Never ask the players what they do and never speak to them directly: the game asks for each action.
5. Keep the beats short and new. Lengths count narration and action, and an NPC's spoken line is extra.
   - Players have just read everything under 'This Round So Far'. Tell none of it again: no action, roll outcome, description or line of dialogue from this round or from recent turns, and no character repeats what they have already said.
   - A question waiting for a player's answer is not asked again, by anyone, in any words. The game asks the player.
   - If not transitioning: at most 3 short sentences and 50 words. Say what has changed and what the players now face.
   - If transitioning: at most 2 short sentences and 35 words. The target's intro, listed with its transition option, is shown to players straight after your narrative. Carry the story to where that intro begins and stop. Describe nothing the intro describes.
   - An event the GM notes call for at this moment may take up to 5 sentences and 90 words.
   - Keep every fact the players need. Give one telling detail, not several, and cut any sentence that only adds mood.
   - No em dashes, en dashes or semicolons.
6. ${KNOWLEDGE_RULE}
7. Include an adventurePatch that updates the live Adventure playthrough record with summaries, discoveries, entity updates, character updates, open threads, resolved threads, and transition details when applicable.
8. In "knowledge", record what characters learned this round that matters later: a secret, a plan, a name, a place, a deadline, who is behind something. A word said aloud to the whole line counts as much as a secret. One sentence each, with "knownBy": the id of every character who saw, heard or was told it. Said or done in the open, it is known to everyone present who could see or hear it. Leave out what anyone can see in the scene now. Private beats are recorded already for those in them. When someone tells a fact listed under WHO KNOWS WHAT to others, give its id with everyone who knows it now. At most 4, or [] when nothing new was learned.
${scene ? `\n${storyRules(scene)}\n` : ""}
Respond in JSON:
{
  "nextEncounterId": string,
  "beats": [...],
  "knowledge": [...],
  "adventurePatch": object
}`
}
