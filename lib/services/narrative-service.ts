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
  return data.result || data.text || "";
}

export async function formatNarrativeAction({
  characterName,
  playerInput,
  narrativeContext,
}: {
  characterName: string;
  playerInput: string;
  narrativeContext: string;
}): Promise<string> {
  console.log("[LLM DM] Starting narrative action formatting", JSON.stringify({
    characterName,
    playerInput,
    narrativeContextLength: narrativeContext.length,
    narrativeContextPreview: narrativeContext.substring(0, 200) + (narrativeContext.length > 200 ? "..." : "")
  }, null, 2));

  // First, check if dialogue should be generated
  const dialogueEvalPrompt = `
Context:
${narrativeContext}

Player's action for ${characterName}: "${playerInput}"

Does this player action suggest that ${characterName} should speak dialogue? Look for actions like "greet", "ask", "say", "tell", "speak", "respond", "answer", "call out", "whisper", "shout", or any action that implies the character is communicating verbally with someone.

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
Context:
${narrativeContext}

Player's action for ${characterName}: "${playerInput}"

Write a brief narrative paragraph in third-person present tense that includes actual dialogue for ${characterName}. Base the dialogue on what the player action suggests the character should say. Keep it concise and natural, with up to 2 sentences of narrative, in the style of a novel, with at least one complete sentence of prose. Include dialogue tags (e.g., "says", "asks", "replies"). Do not use semicolons. Never mention game mechanics, dice, or rules.

Output only the narrative paragraph with dialogue.`.trim();

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
Context:
${narrativeContext}

Player's original action for ${characterName}: "${playerInput}"

Review the player's original action.
If the action is already a well-written, third-person, present-tense narrative paragraph describing what ${characterName} said or did, then return the player's original action verbatim.
Otherwise, rewrite the player's action into a vivid, engaging, third-person, present-tense narrative paragraph. If the action is minimal (like "attack" or "hide"), enhance it with appropriate descriptive details that fit the context. Describe how ${characterName} performs the action in a way that's immersive and engaging.
IMPORTANT:Do NOT write anything about the outcome of the action!
Use the provided context to inform appropriate details (weapons, environment, targets, etc.) but focus on ${characterName}'s specific actions. Write in the style of an adventure novel. Do not use semicolons. Never mention game mechanics, dice, or rules.

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
    formattedNarrative = data.result || data.text || "";

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
  return data.result || data.text || "";
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

  // --- Fallback: detect roll type keywords if LLM returns null ---
  // This ensures actions like "sneak away", "hide", "attack", etc. require the appropriate check
  const lower = playerInput.toLowerCase();
  console.log('getRollRequirementHelper - Checking keyword fallbacks for:', JSON.stringify(lower, null, 2));
  
  // Attack
  if (/(attack|strike|shoot|stab|slash|hit|swing|fire|punch|kick|smash|lunge|thrust|snipe|ambush|assault|charge|fight|brawl|clash|engage|swing at|fire at|shoot at)/.test(lower)) {
    console.log('getRollRequirementHelper - Keyword match: Attack Roll');
    return { rollType: "Attack Roll", difficulty: 13 };
  }
  // Stealth
  if (/(sneak|hide|conceal|slip away|evade|escape|stealth|shadow|blend in|slink|creep|tiptoe|slither|prowl|skulk|lurk|camouflage|mask|cover|avoid|dodge|elude|flee|retreat|withdraw|vanish|disappear)/.test(lower)) {
    return { rollType: "Stealth Check", difficulty: 15 };
  }
  // Athletics
  if (/(climb|jump|run|swim|lift|push|pull|drag|break|force open|athletic|scale|vault|heave|hoist|tug|haul|sprint|dash|leap|wrestle|grapple|carry|throw|toss|hurl|shove|barge|ram|bust|burst|athletics)/.test(lower)) {
    return { rollType: "Athletics Check", difficulty: 14 };
  }
  // Acrobatics
  if (/(acrobatics|flip|tumble|roll|cartwheel|somersault|dive|dodge|evade|balance|tightrope|spring|vault|slide|slip|twist|spin|pirouette|leap|agile|agility|nimble|dexterous|somersault|handspring|backflip|frontflip|handstand)/.test(lower)) {
    return { rollType: "Acrobatics Check", difficulty: 14 };
  }
  // Survival
  if (/(track|forage|hunt|survive|navigate|find food|find water|build shelter|endure|weather|survival|trail|wilderness|outdoors|camp|trap|snare|follow tracks|read tracks|nature lore)/.test(lower)) {
    return { rollType: "Survival Check", difficulty: 13 };
  }
  // Deception
  if (/(deceiv|lie|bluff|trick|mislead|con|fake|forg|falsif|cheat|hoax|dupe|deception|fib|fabricat|pretend|disguise|mask intent|cover up|conceal intent)/.test(lower)) {
    return { rollType: "Deception Check", difficulty: 13 };
  }
  // Persuasion
  if (/(persuad|convince|influence|charm|appeal|negotiate|bargain|diplomacy|diplomat|reason with|plead|entreat|coax|sway|talk into|win over|persuasion)/.test(lower)) {
    return { rollType: "Persuasion Check", difficulty: 13 };
  }
  // Intimidation
  if (/(intimidat|threaten|bully|coerce|frighten|scare|menace|terrorize|daunt|cow|browbeat|overawe|dominate|intimidation)/.test(lower)) {
    return { rollType: "Intimidation Check", difficulty: 13 };
  }
  // Insight
  if (/(insight|sense motive|discern motive|read emotion|read intent|detect lie|intuition|gut feeling|hunch|perceive motive|perceive intent|understand motive|understand intent)/.test(lower)) {
    return { rollType: "Insight Check", difficulty: 12 };
  }
  // Investigation
  if (/(investigat|search for clues|examin|inspect|analy[sz]e|scrutinize|probe|study|investigation|look for evidence|find evidence|detect|deduce|uncover|solve|research|inquire|delve|explore|question|interrogate)/.test(lower)) {
    return { rollType: "Investigation Check", difficulty: 14 };
  }
  // Nature
  if (/(nature|identify plant|identify animal|recognize animal|recognize plant|natural world|wilderness lore|herbalism|animal lore|plant lore|track animal|animal tracks|plant identification|forage|herb|flora|fauna)/.test(lower)) {
    return { rollType: "Nature Check", difficulty: 13 };
  }
  // Animal Handling
  if (/(animal handling|calm animal|train animal|control animal|soothe animal|befriend animal|command animal|handle animal|ride animal|mount animal|tame|break horse|lead animal|animal empathy|pet|feed animal|groom animal)/.test(lower)) {
    return { rollType: "Animal Handling Check", difficulty: 12 };
  }
  // Medicine
  if (/(medicine|heal|treat wound|bandage|diagnose|cure|first aid|medical|doctor|nurse|tend wound|set bone|apply poultice|stop bleeding|check pulse|revive|resuscitate|medic|herbal remedy|herbal medicine)/.test(lower)) {
    return { rollType: "Medicine Check", difficulty: 12 };
  }
  // History
  if (/(history|recall history|remember event|ancient|legend|lore|historical|present event|old story|ancestry|genealogy|chronicle|record|archive|historian|antiquity|antique|artifact|relic|old tale|old legend)/.test(lower)) {
    return { rollType: "History Check", difficulty: 12 };
  }
  // Arcana
  if (/(arcana|magic|spell|identify spell|recognize spell|magical|arcane|wizardry|sorcery|enchantment|rune|glyph|sigil|ritual|incantation|occult|mystic|eldritch|divination|conjuration|abjuration|evocation|illusion|necromancy|transmutation|spellcraft|magical knowledge)/.test(lower)) {
    return { rollType: "Arcana Check", difficulty: 14 };
  }
  // Sleight of Hand
  if (/(sleight of hand|pickpocket|palm|conceal object|quick fingers|legerdemain|trickery|filch|swipe|steal|lift|plant|switch|swap|hand trick|card trick|coin trick|nimble fingers|deft fingers|dexterous fingers|slide of hand)/.test(lower)) {
    return { rollType: "Sleight of Hand Check", difficulty: 14 };
  }
  // Performance
  if (/(perform|performance|sing|dance|play instrument|recite|act|entertain|show|display talent|put on show|storytell|orate|speech|monologue|soliloquy|juggle|acrobatics performance|musical|theater|theatre|comedy|drama|improv|recital|concert|showcase|presentation)/.test(lower)) {
    return { rollType: "Performance Check", difficulty: 12 };
  }
  // Perception (keep last, as it's a common fallback)
  if (/(perceiv|perception|look|figure out|search|spot|notice|discern|determine|find|sense|scan|study|observe|see|hear|smell|taste|touch|listen|watch|glance|peek|peer|survey|examine|inspect|observe|check|detect|discover|recognize|identify|locate|explore|scout|patrol|monitor|track|survey|scrutinize|investigate)/.test(lower)) {
    console.log('getRollRequirementHelper - Keyword match: Perception Check');
    return { rollType: "Perception Check", difficulty: 14 };
  }
  console.log('getRollRequirementHelper - No roll required (no keyword matches)');
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