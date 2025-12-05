import { generateText } from "@/lib/ai"
import { analyzePlayerInput } from "@/lib/utils/narrative-analysis"
import { fixMalformedQuotes, limitToTwoSentences } from "@/lib/utils/narrative-utils"

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
    return corrected.trim()
  } catch {
    return input
  }
}

export async function generateNarrativeUpdate(previousNarrative: string, playerReply: string): Promise<string> {
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
  return text || ""
}

export async function formatNarrativeAction({
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
  if (characterInfo?.appearance) infoLines.push(`Appearance: ${truncate(characterInfo.appearance, 120)}`)
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
    
    Write one brief paragraph in third-person present tense that includes actual dialogue for ${characterName}. PRESERVE THE PLAYER'S INTENDED ACTION completely - if they want to deceive, threaten, lie, manipulate, or do something morally questionable, maintain that intent exactly. Base the dialogue on what the player action suggests the character should say to accomplish their goal.
    
    Write only 1 or 2 sentences total. At least one sentence must contain dialogue in PROPERLY FORMATTED double quotes with BOTH opening and closing quotes (e.g., "Hello there," she says). Include a natural dialogue tag (e.g., says, asks, replies). Do not use semicolons. Never mention game mechanics, dice, or rules. Ensure all pronouns/titles match the guidance above, correcting any mismatches implied by the player input.
    
    CRITICAL: Make sure the response is grammatically correct, and in the style of a well written rpg novel.
    
    IMPORTANT: Do not sanitize or make the action more "nice" - this is an RPG where characters can be good, evil, or morally ambiguous. Stay true to the player's intent.
    
    Output only the paragraph.`.trim()

    const { text } = await generateText({ prompt: dialoguePrompt })
    let formattedNarrative = text || ""
    formattedNarrative = limitToTwoSentences(formattedNarrative)
    formattedNarrative = fixMalformedQuotes(formattedNarrative)
    return formattedNarrative
  }

  const prompt = `
${characterInfoBlock ? `${characterInfoBlock}\n\n` : ""}\n\nContext:
${narrativeContext}

Player's original action for ${characterName}: "${playerInput}"

Review the player's original action.
    If the action is already a well-written, third-person, present-tense narrative paragraph describing what ${characterName} said or did, then return the player's original action verbatim.
    Otherwise, rewrite the player's action into a vivid, engaging, third-person, present-tense narrative paragraph. If the action is minimal (like "attack" or "hide"), enhance it with appropriate descriptive details that fit the context. Describe how ${characterName} performs the action in a way that's immersive and engaging.

CRITICAL: PRESERVE THE PLAYER'S INTENDED ACTION completely - if they want to pickpocket, steal, deceive, threaten, attack, or do something morally questionable, maintain that exact intent. This is an RPG where characters can be good, evil, or morally ambiguous. Do not sanitize or make actions more "nice" or socially acceptable.

IMPORTANT: Do NOT write anything about the outcome of the action!
    Use the provided context to inform appropriate details (weapons, environment, targets, etc.) but focus on ${characterName}'s specific actions. Write in the style of an adventure novel. Do not use semicolons. Never mention game mechanics, dice, or rules.
    Write only 1 or 2 sentences total. Output a single paragraph.

Output only the narrative paragraph.`.trim()

  const { text } = await generateText({ prompt })
  const formattedNarrative = limitToTwoSentences(text || "")
  return formattedNarrative
}

export async function generateRollOutcomeNarrativeWithContext({
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
  return text || ""
}
