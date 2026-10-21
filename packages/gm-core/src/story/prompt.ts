import { EFFECT_KINDS, ELEMENTS, OBJECT_KINDS } from "./beats"
import type { StoryScene } from "./clean"

const EFFECTS: Record<(typeof EFFECT_KINDS)[number], string> = {
  arrow: "an arrow, bolt or thrown blade in flight",
  bolt: "a spell flung at someone",
  beam: "a ray from caster to target",
  burst: "a blast or wave where it lands",
  aura: "a glow around someone, a ward or a blessing",
  sparkles: "motes of healing or a charm",
  slash: "a blade, claw or bite striking",
  impact: "a heavy blow, a slam or a fall",
  mist: "fog, smoke or a vanishing",
}

// How a step writes its story, for every prompt that asks the GM for beats: the kinds, the rules, and the menus of
// ids it may use. The scene's places are offered only when it has a 3D set.
// The pronoun a sheet's gender gives, so the story never turns a woman into "he" halfway through a scene.
const pronoun = (gender?: string) => (!gender ? undefined : /^f|^wom/i.test(gender) ? "she" : /^m/i.test(gender) ? "he" : /non|they|^n/i.test(gender) ? "they" : undefined)

export function storyRules(scene: StoryScene): string {
  const cast = scene.cast
    .map((c) => {
      const notes = [pronoun(c.gender), c.type === "pc" ? "a player's hero" : undefined].filter(Boolean)
      return `${c.id}: ${c.name}${notes.length ? ` (${notes.join(", ")})` : ""}`
    })
    .join("; ")
  const places = scene.places?.length ? scene.places.map((p) => `${p.id}: ${p.label}`).join("; ") : ""
  return `Write the story as "beats", a list in the order things happen:
- narration: the scene or an outcome, in the narrator's voice.${places ? ' "place": the id of a place it shows.' : ""}
- action: one character doing something. "who": their id. "to": the id of whoever it is aimed at.${places ? ' "place": where they go, if they move: the id of a place, or of a character to close in on. "from": where they come from, if they enter the scene. "pace": walk, hurry or sneak.' : ""} "effect" and "element": what an attack or spell looks like, if anything visible happens. "object": something they show or hand over.
- line: words one character says aloud. "text" holds only the spoken words, with no quote marks. "who": the speaker. "to": whom they speak to. "delivery": how, in a word or two.
An action or line that no one else present could see or hear, such as a whisper, a word said low to one person, a note slipped across, or someone hidden acting unseen, has "private": true. Only its actor or speaker and whoever it is aimed at know of it. Leave it out for anything said or done in the open.
Narration and action text never hold a listed character's words: every word a listed character says goes in a line. Someone not in the list, such as a guest in a crowd, has no lines: their words go in quote marks in the narration that shows them speaking. A beat is one or two sentences.
Characters, by id: ${cast}.${places ? `\nPlaces, by id: ${places}.` : ""}
Effects: ${EFFECT_KINDS.map((k) => `${k} (${EFFECTS[k]})`).join(", ")}.
Elements: ${ELEMENTS.join(", ")}, or none for a weapon.
Objects: ${OBJECT_KINDS.join(", ")}.
Use only these ids and words. Leave a field out rather than invent one.`
}
