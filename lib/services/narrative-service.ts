import { generateObject } from "@/lib/ai";
import { z } from "zod";

const rollRequirementSchema = z.object({
  rollType: z.string(),
  difficulty: z.number().int(),
  modifier: z.number().int().optional(),
});

const rollModifierSchema = z.object({
  modifier: z.number().int(),
});

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

Narrative continuation:`.trim();

  const res = await fetch("/api/ai/generate/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: prompt }),
  });
  if (!res.ok) throw new Error("Failed to generate narrative");
  const data = await res.json();
  return data.result || data.text.text.text || "";
}

export async function formatNarrativeAction({
  characterName,
  gender,
  playerInput,
  narrativeContext,
  characterInfo,
}: {
  characterName: string;
  gender?: string;
  playerInput: string;
  narrativeContext: string;
  characterInfo?: {
    archetype?: string;
    race?: string;
    appearance?: string;
    personality?: string;
    motivation?: string;
    specialAbilities?: string[];
    skills?: string[];
    equipment?: { name: string }[];
  };
}): Promise<string> {
  console.log("[LLM DM] Starting narrative action formatting", JSON.stringify({
    characterName,
    gender,
    playerInput,
    narrativeContextLength: narrativeContext.length,
    narrativeContextPreview: narrativeContext.substring(0, 200) + (narrativeContext.length > 200 ? "..." : "")
  }, null, 2));

  // Build pronoun guidance based on gender
  const normalizedGender = (gender || "").trim().toLowerCase();
  let pronounGuidance: string;
  if (["female", "woman", "f"].includes(normalizedGender)) {
    pronounGuidance = `Use she/her pronouns for ${characterName}. Do not use he/him.`;
  } else if (["male", "man", "m"].includes(normalizedGender)) {
    pronounGuidance = `Use he/him pronouns for ${characterName}. Do not use she/her.`;
  } else if (["nonbinary", "non-binary", "nb", "they", "genderqueer", "agender"].includes(normalizedGender)) {
    pronounGuidance = `Use they/them pronouns for ${characterName}. Avoid gendered titles.`;
  } else if (normalizedGender) {
    pronounGuidance = `Respect ${characterName}'s gender: ${gender}. Use appropriate pronouns and titles; do not assume otherwise.`;
  } else {
    pronounGuidance = `Avoid gendered pronouns. Prefer ${characterName}'s name or singular they/them.`;
  }

  // Build compact Character Info block
  const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const infoLines: string[] = [];
  infoLines.push(`Name: ${characterName}`);
  if (characterInfo?.archetype) infoLines.push(`Archetype: ${characterInfo.archetype}`);
  if (characterInfo?.race) infoLines.push(`Race: ${characterInfo.race}`);
  if (characterInfo?.appearance) infoLines.push(`Appearance: ${truncate(characterInfo.appearance, 120)}`);
  if (characterInfo?.personality) infoLines.push(`Personality: ${truncate(characterInfo.personality, 120)}`);
  if (characterInfo?.motivation) infoLines.push(`Motivation: ${truncate(characterInfo.motivation, 120)}`);
  if (characterInfo?.specialAbilities && characterInfo.specialAbilities.length)
    infoLines.push(`Abilities: ${characterInfo.specialAbilities.slice(0, 3).join(', ')}`);
  if (characterInfo?.skills && characterInfo.skills.length)
    infoLines.push(`Skills: ${characterInfo.skills.slice(0, 3).join(', ')}`);
  if (characterInfo?.equipment && characterInfo.equipment.length)
    infoLines.push(`Equipment: ${characterInfo.equipment.slice(0, 2).map(e => e.name).join(', ')}`);
  const characterInfoBlock = infoLines.length ? `Character Info:\n${infoLines.join('\n')}` : '';

  // First, check if dialogue should be generated
  const dialogueEvalPrompt = `
  Context:
  ${narrativeContext}
  
  Player's action for ${characterName}: "${playerInput}"
  
  Does this player action suggest that ${characterName} should speak dialogue? Consider actions that naturally involve interaction with another person (guards, merchants, NPCs), such as: greet, ask, say, tell, speak, respond, answer, call out, whisper, shout, request, offer, pay, present, show papers, hand over, comply, bargain, negotiate, trade, apologize, thank.
  
  Answer only "yes" or "no".`.trim();
  
  console.log("[LLM DM] Evaluating if dialogue should be generated", JSON.stringify({
    dialogueEvalPromptLength: dialogueEvalPrompt.length,
    characterName
  }, null, 2));
  
  const dialogueEvalRes = await fetch("/api/ai/generate/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: dialogueEvalPrompt, stream: false }),
  });
  
  if (!dialogueEvalRes.ok) throw new Error("Failed to evaluate dialogue need");
  const dialogueEvalData = await dialogueEvalRes.json();
  const shouldGenerateDialogue = (dialogueEvalData.result || dialogueEvalData.text || "").trim().toLowerCase().startsWith("yes");

  console.log("[LLM DM] Dialogue evaluation result", JSON.stringify({
    shouldGenerateDialogue,
    rawResponse: dialogueEvalData.result || dialogueEvalData.text || "",
    characterName
  }, null, 2));

  let formattedNarrative = "";
  if (shouldGenerateDialogue) {
    console.log("[LLM DM] Generating dialogue for character", JSON.stringify({
      characterName,
      playerInput
    }, null, 2));

    // Generate dialogue
    const dialoguePrompt = `
    ${characterInfoBlock ? characterInfoBlock + "\n\n" : ""}${pronounGuidance}\n\nContext:
    ${narrativeContext}
    
    Player's action for ${characterName}: "${playerInput}"
    
    Write one brief paragraph in third-person present tense that includes actual dialogue for ${characterName}. Base the dialogue on what the player action suggests the character should say. Write only 1 or 2 sentences total. At least one sentence must contain dialogue in double quotes with a natural dialogue tag (e.g., says, asks, replies). Do not use semicolons. Never mention game mechanics, dice, or rules. Ensure all pronouns/titles match the guidance above, correcting any mismatches implied by the player input.
    
    Output only the paragraph.`.trim();

    console.log("[LLM DM] Sending dialogue generation prompt", JSON.stringify({
      dialoguePromptLength: dialoguePrompt.length,
      characterName
    }, null, 2));

    const dialogueRes = await fetch("/api/ai/generate/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: dialoguePrompt, stream: false }),
    });
    if (!dialogueRes.ok) throw new Error("Failed to generate dialogue");
    const dialogueData = await dialogueRes.json();
    formattedNarrative = dialogueData.result || dialogueData.text || "";
    formattedNarrative = limitToTwoSentences(formattedNarrative);

    console.log("[LLM DM] Dialogue generation completed", JSON.stringify({
      formattedNarrative,
      formattedNarrativeLength: formattedNarrative.length,
      characterName
    }, null, 2));
  } else {
    console.log("[LLM DM] Generating non-dialogue action for character", JSON.stringify({
      characterName,
      playerInput
    }, null, 2));

    // Logic for non-dialogue actions
    const prompt = `
${characterInfoBlock ? characterInfoBlock + "\n\n" : ""}${pronounGuidance}\n\nContext:
${narrativeContext}

Player's original action for ${characterName}: "${playerInput}"

Review the player's original action.
    If the action is already a well-written, third-person, present-tense narrative paragraph describing what ${characterName} said or did, then return the player's original action verbatim. However, if any pronouns or gendered titles conflict with the following guidance, correct them: ${pronounGuidance}
    Otherwise, rewrite the player's action into a vivid, engaging, third-person, present-tense narrative paragraph. If the action is minimal (like "attack" or "hide"), enhance it with appropriate descriptive details that fit the context. Describe how ${characterName} performs the action in a way that's immersive and engaging.
IMPORTANT:Do NOT write anything about the outcome of the action!
    Use the provided context to inform appropriate details (weapons, environment, targets, etc.) but focus on ${characterName}'s specific actions. Write in the style of an adventure novel. Do not use semicolons. Never mention game mechanics, dice, or rules.
    Write only 1 or 2 sentences total. Output a single paragraph.

Output only the narrative paragraph.`.trim();

    console.log("[LLM DM] Sending non-dialogue action generation prompt", JSON.stringify({
      promptLength: prompt.length,
      characterName
    }, null, 2));

    const res = await fetch("/api/ai/generate/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: prompt, stream: false }),
    });
    if (!res.ok) throw new Error("Failed to generate narrative action");
    const data = await res.json();
    formattedNarrative = data.result || data.text.text.text || "";
    formattedNarrative = limitToTwoSentences(formattedNarrative);

    console.log("[LLM DM] Non-dialogue action generation completed", JSON.stringify({
      formattedNarrative,
      formattedNarrativeLength: formattedNarrative.length,
      characterName
    }, null, 2));
  }

  console.log("[LLM DM] Narrative action formatting completed", JSON.stringify({
    characterName,
    originalInput: playerInput,
    formattedOutput: formattedNarrative,
    inputLength: playerInput.length,
    outputLength: formattedNarrative.length,
    wasDialogue: shouldGenerateDialogue
  }, null, 2));

  return formattedNarrative;
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
  characterName: string;
  rollType: string;
  rollResult: number;
  rollDifficulty: number;
  rollSuccess: boolean;
  narrativeContext: string;
  encounterIntro: string;
  encounterInstructions: string;
  playerAction: string;
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

Output only the narrative paragraph.`.trim();

  const res = await fetch("/api/ai/generate/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: prompt }),
  });
  if (!res.ok) throw new Error("Failed to generate roll outcome narrative");
  const data = await res.json();
  return data.result || data.text.text.text || "";
}

export async function getRollRequirementHelper(playerInput: string, context: { encounterIntro?: string; encounterInstructions?: string; narrativeContext?: string }) {
  console.log('getRollRequirementHelper - Raw player input:', JSON.stringify(playerInput, null, 2));
  console.log('getRollRequirementHelper - Context:', JSON.stringify(context, null, 2));

  const prompt = `
Encounter Intro:
${context.encounterIntro || ""}

Encounter Instructions:
${context.encounterInstructions || ""}

Narrative Context:
${context.narrativeContext || ""}

Player action or narrative: "${playerInput}"

CRITICAL: The encounter instructions are the highest priority. If they contain phrases like "No dice rolls should be necessary", "no rolls required", "automatic success", or similar language, then NO roll should be required for actions that follow the intended flow of the encounter.

Pay special attention to:
- If the instructions say no rolls are needed for a specific action (like paying entrance fees), then NO roll should be required for that action
- Only require rolls for actions that clearly violate the encounter's intended flow or involve actual deception/conflict

Given the above, decide if a D&D-style roll is required. If so, return the type of roll and a difficulty (DC) between 5 and 20.

For spellcasting actions:
- If the player is attempting to cast a specific spell (like Charm Person, Fireball, Detect Magic, etc.), use the spell name followed by "Check" (e.g., "Charm Person Check", "Fireball Check") and adjust the difficulty based on the type of spell.
- If the player is attempting a general magical action without a specific spell, use "Arcana Check".

For non-spellcasting actions, use the appropriate skill check (Perception, Investigation, Stealth, Athletics, Acrobatics, Survival, Deception, Persuasion, Intimidation, Insight, Nature, Animal Handling, Medicine, History, Sleight of Hand, Performance, Attack, etc.)

Respond in JSON: { "rollType": string, "difficulty": number } or null if no roll is needed.
`;
  const result = await generateObject({ prompt, schema: rollRequirementSchema });
  
  console.log('getRollRequirementHelper - LLM Result:', JSON.stringify(result, null, 2));
  
  if (result.object) {
    console.log('getRollRequirementHelper - Returning LLM roll requirement:', JSON.stringify(result.object, null, 2));
    return result.object;
  }
  console.log('getRollRequirementHelper - No roll required (LLM returned null/none)');
  return null;
}

export async function getRollModifier(context: { scenario: unknown; rollRequirement: unknown; character: unknown }) {
  console.log("[LLM DM] Starting roll modifier calculation", JSON.stringify({
    rollType: typeof context.rollRequirement === 'object' && 
              context.rollRequirement !== null && 
              'rollType' in context.rollRequirement ? 
              String(context.rollRequirement.rollType) : '',
    characterName: typeof context.character === 'object' && 
                  context.character !== null && 
                  'name' in context.character ? 
                  String(context.character.name) : 'unknown',
    hasScenario: !!context.scenario,
    hasRollRequirement: !!context.rollRequirement,
    hasCharacter: !!context.character
  }, null, 2));

  // First, calculate base attribute modifier
  const rollType = typeof context.rollRequirement === 'object' && 
                  context.rollRequirement !== null && 
                  'rollType' in context.rollRequirement ? 
                  String(context.rollRequirement.rollType) : ''
  
  const { calculateAttributeModifier } = await import('@/lib/utils/modifier-utils')
  const baseAttributeModifier = calculateAttributeModifier(context.character, rollType)
  
  console.log("[LLM DM] Base attribute modifier calculated", JSON.stringify({
    rollType,
    baseAttributeModifier,
    characterName: typeof context.character === 'object' && 
                  context.character !== null && 
                  'name' in context.character ? 
                  String(context.character.name) : 'unknown'
  }, null, 2));
  
  // Then get situational modifier from LLM
  const prompt = `
Given the following scenario, roll requirement, and character (paying attention to their archetype, skills, and how they might interact with the environment), determine if there should be an additional situational bonus or penalty (modifier) to the roll.
This modifier should reflect:
1. Environmental factors (e.g., darkness, weather, noise).
2. How the character's specific archetype (e.g., a Ranger's attunement to forests, a Rogue's expertise in shadows) or skills (e.g., Survival, Stealth, Perception proficiency in certain conditions) would uniquely affect their performance in THIS specific situation.

Note: The character's raw ability score modifier (e.g., from Wisdom for Perception) has ALREADY been factored in. You are to provide ONLY the *additional* modifier based on the situation and the character's specific fitness for it.

Scenario: ${JSON.stringify(context.scenario, null, 2)}
Roll Requirement: ${JSON.stringify(context.rollRequirement, null, 2)}
Character: ${JSON.stringify(context.character, null, 2)}

Respond in JSON: { "modifier": number } (can be negative, zero, or positive).
`;

  console.log("[LLM DM] Sending situational modifier prompt to LLM", JSON.stringify({
    promptLength: prompt.length,
    rollType,
    characterName: typeof context.character === 'object' && 
                  context.character !== null && 
                  'name' in context.character ? 
                  String(context.character.name) : 'unknown'
  }, null, 2));

  const result = await generateObject({ prompt, schema: rollModifierSchema });
  const situationalModifier = result.object?.modifier ?? 0;
  
  console.log("[LLM DM] Situational modifier from LLM", JSON.stringify({
    situationalModifier,
    rawResult: result.object,
    characterName: typeof context.character === 'object' && 
                  context.character !== null && 
                  'name' in context.character ? 
                  String(context.character.name) : 'unknown'
  }, null, 2));
  
  // Combine base attribute modifier with situational modifier
  const totalModifier = Math.round(baseAttributeModifier + situationalModifier);
  
  console.log("[LLM DM] Roll modifier calculation completed", JSON.stringify({
    baseAttributeModifier,
    situationalModifier,
    totalModifier,
    rollType,
    characterName: typeof context.character === 'object' && 
                  context.character !== null && 
                  'name' in context.character ? 
                  String(context.character.name) : 'unknown'
  }, null, 2));

  return totalModifier;
}

// Ensures output is at most two sentences and a single paragraph
function limitToTwoSentences(text: string): string {
  if (!text) return "";
  // Normalize whitespace and newlines to a single paragraph first
  const oneParagraph = text.replace(/\s+/g, ' ').trim();
  // Split on sentence boundaries (. ! ?), keeping delimiters
  const parts = oneParagraph.split(/([.!?])[\s\"]*/).filter(Boolean);
  if (parts.length <= 2) return oneParagraph;
  // Reconstruct sentences: token + delimiter pairs
  const sentences: string[] = [];
  for (let i = 0; i < parts.length - 1; i += 2) {
    const sentence = (parts[i] + (parts[i + 1] || '')).trim();
    if (sentence) sentences.push(sentence);
    if (sentences.length === 2) break;
  }
  return sentences.join(' ');
}

/**
 * Appends new narrative content to the previous narrative, ensuring consistent formatting.
 * Does NOT attempt to diff or remove duplication—callers must ensure newContent is truly new.
 * @param previousNarrative The narrative so far
 * @param newContent The new narrative content to append (string or array of strings)
 * @returns The updated narrative
 */
export function appendNarrative(previousNarrative: string, newContent: string | string[]): string {
  const toAppend = Array.isArray(newContent) ? newContent.filter(Boolean).join('\n') : newContent;
  if (!toAppend) return previousNarrative || '';
  if (!previousNarrative) return toAppend;
  // Always separate with two newlines for clarity
  return previousNarrative.trimEnd() + '\n\n' + toAppend.trimStart();
} 

/**
 * Normalizes narrative prose formatting for display:
 * - Converts Windows newlines to Unix
 * - Removes em/en/figure dashes and replaces with comma + space
 * - Collapses excessive spaces and newlines
 * - Trims leading/trailing whitespace
 */
export function normalizeNarrative(text: string): string {
  if (!text) return "";
  let result = text.replace(/\r\n/g, "\n");
  // Replace em dash, en dash, figure dash, horizontal bar with comma + space
  result = result.replace(/[\u2012\u2013\u2014\u2015]/g, ", ");
  // Normalize comma spacing and collapse duplicates created by replacements
  result = result
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/,\s*,+/g, ", ");
  // Collapse multiple spaces
  result = result.replace(/[ \t]{2,}/g, " ");
  // Normalize paragraph breaks (max one blank line)
  result = result.replace(/\n{3,}/g, "\n\n");
  return result.trim();
}