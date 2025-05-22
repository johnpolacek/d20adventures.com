export async function isRedundantOrMinimalAction(action: string, aiNarrative: string, characterName: string): Promise<boolean> {
  const prompt = `
Given the following player action and AI-generated narrative for the character ${characterName}, does the action add any meaningful, non-redundant content to the narrative? If the action is generic, minimal, or already fully captured by the narrative, answer "yes". Otherwise, answer "no".

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
If the following player action is already a well-written, third-person, past-tense narrative paragraph (exactly two sentences) suitable for a fantasy novel, return it unchanged. Otherwise, rewrite it as such, expanding minimally if needed.

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
Continue the following fantasy adventure story as a single, concise paragraph of immersive third-person narrative prose, as if writing a novel. Write exactly two sentences and do not exceed 60 words. Do not use lists, bullet points, or markdown formatting. Write in past tense. Continue naturally from the previous events and the player's latest action. Do not use semicolons in your response. Never mention game mechanics, dice, or rules in your response.

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

export async function ensureNarrativeActionWithContext({
  characterName,
  playerInput,
  narrativeContext,
  encounterIntro,
  encounterInstructions,
}: {
  characterName: string;
  playerInput: string;
  narrativeContext: string;
  encounterIntro: string;
  encounterInstructions: string;
}): Promise<string> {
  const prompt = `
Context:
${narrativeContext}

Encounter Intro:
${encounterIntro}

Encounter Instructions:
${encounterInstructions}

Player action: "${playerInput}"

Rewrite the player action as a two-sentence, third-person, past-tense narrative paragraph. Only reference things present in the context and instructions above. If the action is ambiguous, interpret it as the character investigating or reacting to the most recent event or detail. Do not invent new objects, people, or events.

Output only the rewritten narrative paragraph. Do not use semicolons in your response. Never mention game mechanics, dice, or rules in your response.`.trim();

  console.log("[ensureNarrativeActionWithContext] prompt:\n", prompt);
  const res = await fetch("/api/ai/generate/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: prompt }),
  });
  if (!res.ok) throw new Error("Failed to process player action");
  const data = await res.json();
  console.log("[ensureNarrativeActionWithContext] AI result:", data.result || data.text || "");
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

Write a single, concise, immersive third-person narrative paragraph (exactly two sentences, max 60 words) describing the outcome of the roll. Only reference things present in the context and instructions above. Do not invent new objects, people, or events. Write in past tense. Do not use lists, bullet points, or markdown formatting. Do not use semicolons in your response. Never mention game mechanics, dice, or rules in your response.

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