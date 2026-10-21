import type { GmPorts } from "../ports"
import type { StoryBeat } from "../story/beats"
import { cleanStory } from "../story/clean"
import { storyRules } from "../story/prompt"
import { characterScript, sceneFor, storyOutputObject } from "../story/turn"
import type { TurnCharacter } from "../types/adventure"

export function createNarrativeGenerationService(ports: GmPorts) {
  const generateObject = ports.llm.generateObject.bind(ports.llm)
  // A player's reply for their hero, written into the story as the hero's beats: what they do, and what they say word
  // for word. Nothing is added that the player did not give.
  async function writeReply(args: { character: TurnCharacter; playerInput: string; turn: { encounterId: string; story: StoryBeat[]; characters: TurnCharacter[] } }): Promise<StoryBeat[]> {
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
    const context = characterScript(args.turn, character.id).split(/\n\n+/).slice(-3).join("\n\n")
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
      const beats = cleanStory((await generateObject({ prompt, schema: storyOutputObject, viewer: character.id })).object.beats, scene, by)
      if (beats.length) return beats
    } catch (error) {
      console.error("[writeReply] Falling back to the player's words:", error)
    }
    return cleanStory([{ kind: "action", who: character.id, text: playerInput }], scene, by)
  }

  return { writeReply }
}
