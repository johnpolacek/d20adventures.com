import type { GmPorts } from "../ports"
import type { StoryBeat } from "../story/beats"
import { cleanStory } from "../story/clean"
import { storyRules } from "../story/prompt"
import { sceneFor, storyOutputObject, turnScript } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"
import { analyzePlayerInput } from "../utils/narrative-analysis"
import { fixMalformedQuotes, limitToTwoSentences, sanitizeUserVisibleProse } from "../utils/narrative-utils"

export function createNarrativeGenerationService(ports: GmPorts) {
  const generateText = ports.llm.generateText.bind(ports.llm)
  const generateObject = ports.llm.generateObject.bind(ports.llm)
  async function applyMinimalCorrections(input: string): Promise<string> {
    const prompt = `Fix ONLY formatting and punctuation errors in this text. Do NOT change the content, words, or narrative style. Only fix:
- Missing opening/closing quotation marks
- Incorrect punctuation spacing
- Capitalization errors
- Basic grammar mistakes

Keep the exact same words, dialogue, actions, and narrative voice. Return the corrected text with minimal changes.

Original text:
${input}

Corrected text:`.trim()

    try {
      const { text } = await generateText({ prompt })
      const corrected = text || input
      const originalWords = input.split(/\s+/).length
      const correctedWords = corrected.split(/\s+/).length
      const wordCountDiff = Math.abs(originalWords - correctedWords)
      if (wordCountDiff > Math.max(2, originalWords * 0.1)) return input
      return sanitizeUserVisibleProse(corrected.trim())
    } catch {
      return input
    }
  }

  async function generateNarrativeUpdate(previousNarrative: string, playerReply: string): Promise<string> {
    const prompt = `
Continue the following fantasy adventure story as a single, concise paragraph of immersive third-person narrative prose, as if writing a novel. Write exactly two sentences and do not exceed 60 words. Do not use lists, bullet points, or markdown formatting. Write in present tense. Continue naturally from the previous events and the player's latest action. Do not use semicolons in your response. Never mention game mechanics, dice, or rules in your response.

CRITICAL: You must ONLY reference elements that are explicitly mentioned in the previous narrative or player action. Do NOT invent new objects, people, events, or details that are not already established.

RESTRICTIONS:
- Only reference characters, objects, and locations explicitly mentioned in the previous narrative
- Do not create new characters, items, or events
- Do not add new details to the environment
- Stick strictly to what is already established

Previous narrative:
${previousNarrative}

Player action:
${playerReply}

Narrative continuation:`.trim()

    const { text } = await generateText({ prompt })
    return sanitizeUserVisibleProse(text || "")
  }

  async function formatNarrativeAction({
    characterName,
    gender,
    playerInput,
    narrativeContext,
    characterInfo,
  }: {
    characterName: string
    gender?: string
    playerInput: string
    narrativeContext: string
    characterInfo?: {
      archetype?: string
      race?: string
      appearance?: string
      personality?: string
      motivation?: string
      specialAbilities?: string[]
      skills?: string[]
      equipment?: { name: string }[]
    }
  }): Promise<string> {
    const inputAnalysis = analyzePlayerInput(playerInput, characterName)

    if (inputAnalysis.preserveOriginal) {
      return playerInput
    }

    if ((inputAnalysis.isWellWritten && !inputAnalysis.needsEnhancement) || inputAnalysis.useMinimalCorrections) {
      return applyMinimalCorrections(playerInput)
    }

    const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
    const infoLines: string[] = []
    infoLines.push(`Name: ${characterName}`)
    if (characterInfo?.archetype) infoLines.push(`Archetype: ${characterInfo.archetype}`)
    if (gender) infoLines.push(`Gender: ${gender}`)
    if (characterInfo?.race) infoLines.push(`Race: ${characterInfo.race}`)
    if (characterInfo?.personality) infoLines.push(`Personality: ${truncate(characterInfo.personality, 120)}`)
    if (characterInfo?.motivation) infoLines.push(`Motivation: ${truncate(characterInfo.motivation, 120)}`)
    if (characterInfo?.specialAbilities?.length) infoLines.push(`Abilities: ${characterInfo.specialAbilities.slice(0, 3).join(", ")}`)
    if (characterInfo?.skills?.length) infoLines.push(`Skills: ${characterInfo.skills.slice(0, 3).join(", ")}`)
    if (characterInfo?.equipment?.length)
      infoLines.push(
        `Equipment: ${characterInfo.equipment
          .slice(0, 2)
          .map((e) => e.name)
          .join(", ")}`
      )
    const characterInfoBlock = infoLines.length ? `Character Info:\n${infoLines.join("\n")}` : ""

    // Decide if dialogue should be generated
    const dialogueEvalPrompt = `
  Context:
  ${narrativeContext}
  
  Player's action for ${characterName}: "${playerInput}"
  
  Does this player action suggest that ${characterName} should speak dialogue? Consider actions that naturally involve direct conversation or verbal interaction with another person, such as: greet, ask, say, tell, speak, respond, answer, call out, whisper, shout, request, offer, bargain, negotiate, trade, apologize, thank, threaten verbally, make demands, give orders.
  
  Do NOT suggest dialogue for stealth actions, sneaky actions, or covert actions like: pickpocket, steal, sneak, hide, spy, eavesdrop, follow secretly, attack from behind, sabotage, or any action where speaking would defeat the purpose.
  
  Answer only "yes" or "no".`.trim()

    const evalRes = await generateText({ prompt: dialogueEvalPrompt })
    const shouldGenerateDialogue = (evalRes.text || "").trim().toLowerCase().startsWith("yes")

    if (shouldGenerateDialogue) {
      const dialoguePrompt = `
    ${characterInfoBlock ? `${characterInfoBlock}\n\n` : ""}\n\nContext:
    ${narrativeContext}
    
    Player's action for ${characterName}: "${playerInput}"
    
    Write one brief paragraph in third-person present tense describing ${characterName}'s complete action. If the action includes BOTH speaking AND a physical action (like attacking, shooting, moving, etc.), you MUST include BOTH elements in your response. Keep everything the player gave and add nothing the player did not say: no appearance, no description of gear, no scenery.
    
    CRITICAL FORMATTING RULES:
    1. Write in THIRD PERSON (e.g., "${characterName} shouts..." not "I shout...")
    2. Use STRAIGHT double quotes with BOTH opening AND closing (e.g., "Hello there," she says)
    3. NEVER use backticks (\`) or smart quotes - only straight double quotes (")
    4. Include a dialogue tag (says, shouts, calls out, yells, etc.)
    5. If there's a physical action (attack, shoot, etc.), describe it too
    
    PRESERVE THE PLAYER'S INTENDED ACTION completely - if they want to deceive, threaten, lie, manipulate, or do something morally questionable, maintain that intent exactly.
    
    Write exactly 1-2 sentences total. Do not use semicolons. Never mention game mechanics, dice, or rules.
    
    IMPORTANT: Do not sanitize or make the action more "nice" - this is an RPG where characters can be good, evil, or morally ambiguous. Stay true to the player's intent.
    
    Output only the paragraph.`.trim()

      const { text } = await generateText({ prompt: dialoguePrompt })
      let formattedNarrative = text || ""
      formattedNarrative = sanitizeUserVisibleProse(limitToTwoSentences(formattedNarrative))
      formattedNarrative = fixMalformedQuotes(formattedNarrative)
      return formattedNarrative
    }

    const prompt = `
${characterInfoBlock ? `${characterInfoBlock}\n\n` : ""}\n\nContext:
${narrativeContext}

Player's original action for ${characterName}: "${playerInput}"

CRITICAL FORMATTING RULES:
1. Write in THIRD PERSON present tense (e.g., "${characterName} moves..." not "I move...")
2. If the action includes dialogue, use STRAIGHT double quotes with BOTH opening AND closing (e.g., "Hello," he says)
3. NEVER use backticks (\`) or smart quotes - only straight double quotes (")

Review the player's original action.
If the action is already a well-written, third-person, present-tense narrative paragraph, return it verbatim.
Otherwise, rewrite it in plain third person, present tense. Keep every action the player gave, in the player's own words where they can stand, and add nothing the player did not say: no appearance, no description of gear, no scenery. If the action is minimal (like "attack" or "hide"), write one plain sentence saying how ${characterName} does it, naming a weapon or target from the context only when the action needs one.

CRITICAL: PRESERVE THE PLAYER'S INTENDED ACTION completely - if they want to pickpocket, steal, deceive, threaten, attack, or do something morally questionable, maintain that exact intent.

IMPORTANT: Do NOT write anything about the outcome of the action!
Use the provided context only to name a weapon or target the action needs. Do not use semicolons. Never mention game mechanics, dice, or rules.
Write 1 sentence, or 2 when the player gave more than one action. Stay close to the player's own length, at most 10 words longer. Output a single paragraph.

Output only the narrative paragraph.`.trim()

    const { text } = await generateText({ prompt })
    const formattedNarrative = sanitizeUserVisibleProse(limitToTwoSentences(text || ""))
    return formattedNarrative
  }

  async function generateRollOutcomeNarrativeWithContext({
    characterName,
    rollType,
    rollResult,
    rollDifficulty,
    rollSuccess,
    narrativeContext,
    encounterIntro,
    encounterInstructions,
    playerAction,
  }: {
    characterName: string
    rollType: string
    rollResult: number
    rollDifficulty: number
    rollSuccess: boolean
    narrativeContext: string
    encounterIntro: string
    encounterInstructions: string
    playerAction: string
  }): Promise<string> {
    const prompt = `
Context:
${narrativeContext}

Encounter Intro:
${encounterIntro}

Encounter Instructions:
${encounterInstructions}

Player action: "${playerAction}"

A dice roll was made for ${characterName}: ${rollType} (Result: ${rollResult}, Difficulty: ${rollDifficulty}, Success: ${rollSuccess ? "yes" : "no"}).

CRITICAL: You must ONLY reference elements that are explicitly mentioned in the encounter instructions, encounter intro, or existing narrative context. Do NOT invent new objects, people, events, or details that are not already established in the adventure plan.

Write a single, concise, immersive third-person narrative paragraph (exactly two sentences, max 60 words) describing the outcome of the roll. Focus on what the character perceives or the immediate result of their action based ONLY on the existing environment and NPCs described in the encounter.

RESTRICTIONS:
- Only reference NPCs, objects, and locations explicitly mentioned in the encounter instructions or intro
- Do not create new characters, items, or events
- Do not add new details to the environment
- Stick strictly to what is already established in the adventure plan

Write in present tense. Do not use lists, bullet points, or markdown formatting. Do not use semicolons in your response. Never mention game mechanics, dice, or rules in your response.

Output only the narrative paragraph.`.trim()

    const { text } = await generateText({ prompt })
    return sanitizeUserVisibleProse(text || "")
  }
  // A player's reply for their hero, written into the story as the hero's beats: what they do, and what they say word
  // for word. Nothing is added that the player did not give.
  async function writeReply(args: {
    character: TurnCharacter
    playerInput: string
    turn: { encounterId: string; narrative?: string; story?: StoryBeat[]; characters: TurnCharacter[] }
  }): Promise<StoryBeat[]> {
    const { character, playerInput } = args
    const by = { step: "reply" as const, character: character.id }
    const scene = await sceneFor(ports, args.turn)
    const info = [
      `Name: ${character.name} (id ${character.id})`,
      character.gender ? `Gender: ${character.gender}` : "",
      character.archetype ? `Archetype: ${character.archetype}` : "",
      character.race ? `Race: ${character.race}` : "",
      character.equipment?.length ? `Equipment: ${character.equipment.map((e) => e.name).join(", ")}` : "",
      (character.spells ?? []).some((s) => !s.isUsed)
        ? `Spells: ${(character.spells ?? [])
            .filter((s) => !s.isUsed)
            .map((s) => s.name)
            .join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n")
    const context = turnScript(args.turn).split(/\n\n+/).slice(-3).join("\n\n")
    const prompt = `A player has written what their hero does. Write it into the story as beats.

Hero:
${info}

Recent story:
${context}

The player's words for ${character.name}: """${playerInput.slice(0, 2000)}"""

Rules:
- Third person, present tense. Every action is "who": "${character.id}", and every spoken word is a line by "${character.id}".
- Keep every action the player gave, in the player's own words where they can stand. Add nothing the player did not say: no appearance, no description of gear, no scenery, no outcome.
- Spoken words go in lines exactly as the player wrote them, fixing only spelling and punctuation. Give no lines when the player gave no words.
- One action sentence, or two when the player gave more than one action, at most 10 words longer than the player's own. A minimal action ("attack", "hide") becomes one plain sentence, naming a weapon or target from the story only when it needs one.
- Keep the player's intent exactly, even when it deceives, threatens, steals or is cruel.
- Name the target with "to", and the effect of an attack or spell the hero makes, when the player's action shows one.
- Never mention game mechanics, dice or rules.

${storyRules(scene)}

Respond as JSON: { "beats": [...] }`
    try {
      const beats = cleanStory((await generateObject({ prompt, schema: storyOutputObject })).object.beats, scene, by)
      if (beats.length) return beats
    } catch (error) {
      console.error("[writeReply] Falling back to the player's words:", error)
    }
    return cleanStory([{ kind: "action", who: character.id, text: playerInput }], scene, by)
  }

  return { generateNarrativeUpdate, formatNarrativeAction, generateRollOutcomeNarrativeWithContext, writeReply }
}
