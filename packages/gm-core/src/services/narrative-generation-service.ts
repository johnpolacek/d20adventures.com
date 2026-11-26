import type { GmPorts } from "../ports"
import { spotWords } from "../sheet/placement"
import { castCost, spellsOf, spellWords } from "../sheet/spells"
import { spellNamed } from "./roll-requirement-service"
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
      spellWords(character) ? `Spells: ${spellWords(character)}` : "",
    ]
      .filter(Boolean)
      .join("\n")
    // Where the hero stands, so a bare "waits" is not told in the wrong place: Thalbern, hidden in a thicket on the bank,
    // "waits where he stands in the cabin".
    const floor = await Promise.resolve(ports.content.floor?.(args.turn.encounterId)).catch(() => undefined)
    const where = floor ? spotWords(character, floor) : undefined
    // A spell the player names that the hero does not know, or has no slot left for, is not cast, and the game tells so
    // after: the reply tells the attempt, never the spell cast. Lyra out of slots "loosed darts of force" at Reinhard.
    const named = spellNamed(playerInput)
    const unknown = named && (!spellsOf(character).some((k) => k.spell.id === named.id) || "problem" in castCost(character, named.id)) ? named : undefined
    const context = characterScript(args.turn, character.id).split(/\n\n+/).slice(-3).join("\n\n")
    const prompt = `A player has written what their hero does. Write it into the story as beats.

Hero:
${info}${where ? `\nWhere they are: ${where}. They are there unless the player's words move them.` : ""}

Recent story:
${context}

The player's words for ${character.name}: """${playerInput.slice(0, 2000)}"""

Rules:
- Third person, present tense. Every action is "who": "${character.id}", and every spoken word is a line by "${character.id}".
- Keep every action the player gave, in the player's own words where they can stand. Add no action, appearance or description of gear the player did not give, and never an outcome: the game decides what comes of it.
- Spoken words go in lines exactly as the player wrote them, fixing only spelling and punctuation. Give no lines when the player gave no words.
- One action sentence, or two when the player gave more than one action. A sentence the player wrote out stays at most 10 words longer than their own, with no scenery added.
- A bare action of a word or two ("attack", "hide", "look around") becomes one sentence of 8 to 16 words that shows how the hero sets about it, in the voice of the recent story. It may name a weapon the hero carries, a target the story has set before them, or one thing the recent story or the places below already hold, and nothing else. It names the hero, shows the attempt and stops before whether it works. "hide" in a wine cellar might become "${character.name} ducks behind the stacked casks and goes still."
- Keep the player's intent exactly, even when it deceives, threatens, steals or is cruel.
- Name the target with "to", and the effect of an attack or spell the hero makes, when the player's action shows one.
- Never mention game mechanics, dice or rules.${unknown ? `\n- ${character.name} cannot cast ${unknown.name} now. Tell them reaching for magic, and never that ${unknown.name} is cast or what it does.` : ""}

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
