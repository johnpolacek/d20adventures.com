import { sanitizeUserVisibleProse } from "../utils/narrative-utils"
import type { ActionBeat, LineBeat, StoryBeat, StoryBy, StoryOutput } from "./beats"

// Who and where a step may name: the characters in the scene, and the set's named places when it has a 3D scene.
export interface StoryCast {
  id: string
  name: string
  type?: string
}
export interface StoryPlace {
  id: string
  label: string
}
export interface StoryScene {
  cast: readonly StoryCast[]
  places?: readonly StoryPlace[]
}

const QUOTE = /["“”]([^"“”]+)["“”]/g
// What is left of a sentence once its quote is taken out, when it only said who spoke ("she says.", ", Wollandora
// replies,").
const TAG_ONLY =
  /^[\s,.:]*(?:(?:he|she|they|it|[A-Z][\w'-]*(?:\s[A-Z][\w'-]*)?)\s+)?(?:says|said|asks|asked|replies|replied|whispers|murmurs|growls|calls|shouts|adds|answers|mutters|snaps|warns|continues)(?:\s+(?:softly|quietly|firmly|gently|again|coldly|calmly))?[\s,.:]*$/i

const lower = (s: string) => s.trim().toLowerCase()

export function findCharacter(scene: StoryScene, value: string | undefined): StoryCast | undefined {
  if (!value?.trim()) return undefined
  const v = lower(value)
  return (
    scene.cast.find((c) => lower(c.id) === v) ??
    scene.cast.find((c) => lower(c.name) === v) ??
    scene.cast.find((c) => lower(c.name).split(/\s+/)[0] === v.split(/\s+/)[0] && v.split(/\s+/)[0].length > 2)
  )
}

export function findPlace(scene: StoryScene, value: string | undefined): StoryPlace | undefined {
  if (!value?.trim() || !scene.places) return undefined
  const v = lower(value)
  return scene.places.find((p) => lower(p.id) === v) ?? scene.places.find((p) => lower(p.label) === v)
}

const isHero = (c: StoryCast | undefined) => c?.type === "pc"
// A hero speaks only in their own reply. Any other step that gives a hero words is writing for the player.
const maySpeak = (speaker: StoryCast, by: StoryBy) => !isHero(speaker) || (by.step === "reply" && by.character === speaker.id)

// Spoken words without their quote marks. A line cut from before its speech tag ("We have a problem," she says) ends
// on a full stop.
const unquote = (text: string) =>
  text
    .trim()
    .replace(/^["“”']+|["“”']+$/g, "")
    .trim()
    .replace(/,$/, ".")

// The beats a step wrote, checked against the scene: ids resolved from names, anything off a menu dropped, spoken words
// kept out of narration and actions, and every text cleaned as prose shown to players.
export function cleanStory(output: StoryOutput, scene: StoryScene, by: StoryBy): StoryBeat[] {
  const beats: StoryBeat[] = []
  const line = (speaker: StoryCast, text: string, to?: StoryCast, delivery?: string) => {
    const words = unquote(sanitizeUserVisibleProse(text))
    if (!words || !maySpeak(speaker, by)) return
    const beat: LineBeat = { kind: "line", by, text: words, speaker: speaker.id }
    if (to && to.id !== speaker.id) beat.to = to.id
    const how = delivery?.trim().replace(/[.,]+$/, "")
    if (how && how.length <= 40) beat.delivery = how
    beats.push(beat)
  }
  for (const out of output) {
    // One beat reads as one paragraph: a line break inside it would split it in the text views.
    const text = sanitizeUserVisibleProse((out.text ?? "").replace(/\s*\n\s*/g, " ")).trim()
    if (!text) continue
    const who = findCharacter(scene, out.who)
    const to = findCharacter(scene, out.to)
    if (out.kind === "line") {
      if (who) line(who, text, to, out.delivery)
      else beats.push({ kind: "narration", by, text: `"${unquote(text)}"` })
      continue
    }
    if (out.kind === "action" && who) {
      // Spoken words in an action are the actor's, split out as their lines after what they do.
      const spoken = [...text.matchAll(QUOTE)].map((m) => m[1])
      const rest = text
        .replace(QUOTE, " ")
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.trim() && !TAG_ONLY.test(s))
        .join(" ")
        .replace(/\s+([,.!?])/g, "$1")
        .replace(/\s{2,}/g, " ")
        .trim()
      const action: ActionBeat = { kind: "action", by, text: rest, actor: who.id }
      if (to && to.id !== who.id) action.target = to.id
      const dest = findPlace(scene, out.place)?.id ?? findCharacter(scene, out.place)?.id
      const from = findPlace(scene, out.from)?.id
      if ((dest && dest !== who.id) || from) action.move = { ...(dest && dest !== who.id ? { to: dest } : {}), ...(from ? { from } : {}), ...(out.pace ? { pace: out.pace } : {}) }
      if (out.effect) action.effect = { kind: out.effect, ...(out.element ? { element: out.element } : {}) }
      if (out.object) action.object = { kind: out.object, ...(action.target ? { to: action.target } : {}) }
      if (rest && /\w/.test(rest)) beats.push(action)
      for (const words of spoken) line(who, words, to)
      continue
    }
    const place = findPlace(scene, out.place)?.id
    beats.push(place ? { kind: "narration", by, text, place } : { kind: "narration", by, text })
  }
  return beats
}
