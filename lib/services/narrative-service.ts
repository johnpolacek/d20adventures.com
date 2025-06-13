import { generateObject } from "@/lib/ai";
import wait from "waait";
import { z } from "zod";

const rollRequirementSchema = z.object({
  rollType: z.string(),
  difficulty: z.number(),
  modifier: z.number().optional(),
});

const rollModifierSchema = z.object({
  modifier: z.number(),
});

export async function isRedundantOrMinimalAction(action: string, aiNarrative: string, characterName: string): Promise<boolean> {
  const prompt = `
Given the following player action and AI-generated narrative for the character ${characterName}, does the action add any meaningful, non-redundant content that avoids mentioning game mechanics to the narrative? If the action is generic, minimal, or already fully captured by the narrative, answer "yes". Otherwise, answer "no".

Player action:
${action}

AI narrative:
${aiNarrative}

Answer:`.trim();

  const res = await fetch("/api/ai/generate/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: prompt }),
  });
  if (!res.ok) throw new Error("Failed to judge redundancy");
  const data = await res.json();
  const answer = (data.result || data.text || "").trim().toLowerCase();
  return answer.startsWith("yes");
}

export async function ensureNarrativeAction(characterName: string, playerInput: string): Promise<string> {
  const prompt = `
If the following player action is already a well-written, third-person, present-tense narrative paragraph suitable for a fantasy novel, return it unchanged. Otherwise, rewrite it as such, expanding minimally if needed replacing game mechanics with well-written narrative in the style of a novel..

Character name: ${characterName}

Player input:
${playerInput}

Final narrative action:`.trim();

  const res = await fetch("/api/ai/generate/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: prompt }),
  });
  if (!res.ok) throw new Error("Failed to process player action");
  const data = await res.json();
  return data.result || data.text || "";
}

export async function generateNarrativeUpdate(previousNarrative: string, playerReply: string): Promise<string> {
  const prompt = `
Continue the following fantasy adventure story as a single, concise paragraph of immersive third-person narrative prose, as if writing a novel. Write exactly two sentences and do not exceed 60 words. Do not use lists, bullet points, or markdown formatting. Write in present tense. Continue naturally from the previous events and the player's latest action. Do not use semicolons in your response. Never mention game mechanics, dice, or rules in your response.

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
  // First, check if dialogue should be generated
  const dialogueEvalPrompt = `
Context:
${narrativeContext}

Player's action for ${characterName}: "${playerInput}"

Does this player action suggest that ${characterName} should speak dialogue? Look for actions like "greet", "ask", "say", "tell", "speak", "respond", "answer", "call out", "whisper", "shout", or any action that implies the character is communicating verbally with someone.

Answer only "yes" or "no".`.trim();

  console.log("[formatNarrativeAction] dialogue evaluation prompt:\n", dialogueEvalPrompt);
  
  const dialogueEvalRes = await fetch("/api/ai/generate/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: dialogueEvalPrompt }),
  });
  
  if (!dialogueEvalRes.ok) throw new Error("Failed to evaluate dialogue need");
  const dialogueEvalData = await dialogueEvalRes.json();
  const shouldGenerateDialogue = (dialogueEvalData.result || dialogueEvalData.text || "").trim().toLowerCase().startsWith("yes");
  
  console.log("[formatNarrativeAction] should generate dialogue:", shouldGenerateDialogue);

  if (shouldGenerateDialogue) {
    // Generate dialogue
    const dialoguePrompt = `
Context:
${narrativeContext}

Player's action for ${characterName}: "${playerInput}"

Write a brief narrative paragraph in third-person present tense that includes actual dialogue for ${characterName}. Base the dialogue on what the player action suggests the character should say. Keep it concise and natural, with up to 2 sentences of narrative, in the style of a novel, with at least one complete sentence of prose. Include dialogue tags (e.g., "says", "asks", "replies"). Do not use semicolons. Never mention game mechanics, dice, or rules.

Output only the narrative paragraph with dialogue.`.trim();

    console.log("[formatNarrativeAction] dialogue generation prompt:\n", dialoguePrompt);
    const dialogueRes = await fetch("/api/ai/generate/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: dialoguePrompt }),
    });
    if (!dialogueRes.ok) throw new Error("Failed to generate dialogue");
    const dialogueData = await dialogueRes.json();
    const result = dialogueData.result || dialogueData.text || "";
    console.log("[formatNarrativeAction] dialogue result:", result);
    return result;
  }

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

Output only the final narrative paragraph.`.trim();

  await wait(500)
  console.log("[formatNarrativeAction] standard formatting prompt:\n", prompt);
  const res = await fetch("/api/ai/generate/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: prompt }),
  });
  if (!res.ok) throw new Error("Failed to process player action");
  const data = await res.json();
  console.log("[formatNarrativeAction] standard result:", data.result || data.text || "");
  return data.result || data.text || "";
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

Write a single, concise, immersive third-person narrative paragraph (exactly two sentences, max 60 words) describing the outcome of the roll. Only reference things present in the context and instructions above. Do not invent new objects, people, or events. Write in present tense. Do not use lists, bullet points, or markdown formatting. Do not use semicolons in your response. Never mention game mechanics, dice, or rules in your response.

Output only the narrative paragraph.`.trim();

  console.log("[generateRollOutcomeNarrativeWithContext] prompt:\n", prompt);
  const res = await fetch("/api/ai/generate/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: prompt }),
  });
  if (!res.ok) throw new Error("Failed to generate roll outcome narrative");
  const data = await res.json();
  console.log("[generateRollOutcomeNarrativeWithContext] AI result:", data.result || data.text || "");
  return data.result || data.text || "";
}

export async function getRollRequirementHelper(playerInput: string, context: { encounterIntro?: string; encounterInstructions?: string; narrativeContext?: string }) {
  const prompt = `
Encounter Intro:
${context.encounterIntro || ""}

Encounter Instructions:
${context.encounterInstructions || ""}

Narrative Context:
${context.narrativeContext || ""}

Player action or narrative: "${playerInput}"

Given the above, decide if a D&D-style roll is required. If so, return the type of roll and a difficulty (DC) between 5 and 20.

For spellcasting actions:
- If the player is attempting to cast a specific spell (like Charm Person, Fireball, Detect Magic, etc.), use the spell name followed by "Check" (e.g., "Charm Person Check", "Fireball Check") and adjust the difficulty based on the type of spell.
- If the player is attempting a general magical action without a specific spell, use "Arcana Check".

For non-spellcasting actions, use the appropriate skill check (Perception, Investigation, Stealth, Athletics, Acrobatics, Survival, Deception, Persuasion, Intimidation, Insight, Nature, Animal Handling, Medicine, History, Sleight of Hand, Performance, Attack, etc.)

Respond in JSON: { "rollType": string, "difficulty": number } or null if no roll is needed.
`;
  const result = await generateObject({ prompt, schema: rollRequirementSchema });
  if (result.object) return result.object;

  // --- Fallback: detect roll type keywords if LLM returns null ---
  // This ensures actions like "sneak away", "hide", "attack", etc. require the appropriate check
  const lower = playerInput.toLowerCase();
  // Attack
  if (/(attack|strike|shoot|stab|slash|hit|swing|fire|punch|kick|smash|lunge|thrust|snipe|ambush|assault|charge|fight|brawl|clash|engage|swing at|fire at|shoot at)/.test(lower)) {
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
    return { rollType: "Perception Check", difficulty: 14 };
  }
  return null;
}

export async function getRollModifier(context: { scenario: unknown; rollRequirement: unknown; character: unknown }) {
  console.log('[getRollModifier] === STARTING MODIFIER CALCULATION ===')
  console.log('[getRollModifier] Input context:', JSON.stringify(context, null, 2))
  
  // First, calculate base attribute modifier
  const rollType = typeof context.rollRequirement === 'object' && 
                  context.rollRequirement !== null && 
                  'rollType' in context.rollRequirement ? 
                  String(context.rollRequirement.rollType) : ''
  
  console.log('[getRollModifier] Extracted roll type:', rollType)
  console.log('[getRollModifier] Character data being passed to calculateAttributeModifier:', JSON.stringify(context.character, null, 2))
  
  const { calculateAttributeModifier } = await import('@/lib/utils/modifier-utils')
  const baseAttributeModifier = calculateAttributeModifier(context.character, rollType)
  
  console.log('[getRollModifier] Base attribute modifier calculated:', baseAttributeModifier)
  
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
  console.log('[getRollModifier] LLM prompt for situational modifier:', prompt)
  
  const result = await generateObject({ prompt, schema: rollModifierSchema });
  const situationalModifier = result.object?.modifier ?? 0;
  
  console.log('[getRollModifier] LLM result object:', JSON.stringify(result.object, null, 2))
  console.log('[getRollModifier] Situational modifier from LLM:', situationalModifier)
  
  // Combine base attribute modifier with situational modifier
  const totalModifier = baseAttributeModifier + situationalModifier;
  
  console.log(`[getRollModifier] === FINAL CALCULATION ===`)
  console.log(`[getRollModifier] Roll Type: "${rollType}"`)
  console.log(`[getRollModifier] Base Attribute Modifier: ${baseAttributeModifier}`)
  console.log(`[getRollModifier] Situational Modifier: ${situationalModifier}`)
  console.log(`[getRollModifier] Total Modifier: ${totalModifier}`)
  console.log(`[getRollModifier] === END MODIFIER CALCULATION ===`)
  
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