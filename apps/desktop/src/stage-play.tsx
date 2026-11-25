import { Heading } from "@d20/ui/typography/heading"
import { isHidden } from "@d20/gm-core/sheet/conditions"
import { levelOwed } from "@d20/gm-core/sheet/level-owed"
import type { LevelUpChoices } from "@d20/gm-core/sheet/level-up"
import { metres } from "@d20/gm-core/sheet/space"
import type { FeatureBeat, Ready, RollBeat, StoryBeat } from "@d20/gm-core/story/beats"
import { nameOf, rollSentence, storyNames, storyParagraphs } from "@d20/gm-core/story/render"
import { conditionLabel } from "@d20/gm-core/utils/condition-label"
import { findCurrentActor, hasFled, isDead, isDown } from "@d20/gm-core/utils/turn-actors"
import type { SoundCue, Stage } from "@d20/stage"
import { readingSeconds } from "@d20/stage/beats"
import { compose, planTakes, speakerShot, type Take } from "@d20/stage/director"
import { served } from "@d20/stage/served"
import type { StagingShot } from "@d20/stage/spec/staging"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSheetView, useSheetViews } from "@d20/ui/adventure/use-sheet-view"
import { CharacterCard } from "@d20/ui/stage/character-card"
import { CityMapInset, CityMapPanel } from "@d20/ui/stage/city-map"
import { NARRATOR_VOICES, narratorAvailable, sentenceOf, setNarratorNames, setNarratorVoice, spokenGender } from "@d20/ui/sound/narrator"
import { setSoundOn, soundOn } from "@d20/ui/sound/settings"
import { withCharacters } from "@d20/ui/sound/pronunciations"
import { useNarrator, useNarratorVoice } from "@d20/ui/sound/use-narrator"
import { useStageSound } from "@d20/ui/sound/use-stage-sound"
import { EndingRating, FeedbackButton, FeedbackPanel, type FeedbackStart } from "@d20/ui/stage/feedback"
import { IconButton, Pill, panel, StageHud, useCompact } from "@d20/ui/stage/hud"
import { type ChatLine, Journal, type JournalTurn } from "@d20/ui/stage/journal"
import { LevelUp } from "@d20/ui/stage/level-up"
import { Narration } from "@d20/ui/stage/narration"
import type { UnworkableSpell } from "@d20/gm-core/sheet/creature-gated-spells"
import { type CardCharacter, type CardMode, type CardRoll, type CardSuggestion, PromptCard } from "@d20/ui/stage/prompt-card"
import { ReactionCard, useExpired } from "@d20/ui/stage/reaction-card"
import { heroReactions, type StandingOrders } from "@d20/ui/stage/reaction-view"
import { prefersReducedMotion } from "@d20/ui/motion"
import { rollPace } from "@d20/ui/stage/roll-pace"
import { rollSeconds } from "@d20/ui/stage/roll-result"
import { featureView, type RollView, rollView } from "@d20/ui/stage/roll-view"
import { Bubbles, Plate } from "@d20/ui/stage/stage-dialogue"
import { passedOver, passedWords, standingOf } from "@d20/ui/stage/standing"
import { TurnOrder } from "@d20/ui/stage/turn-order"
import { useStage } from "@d20/ui/stage/use-stage"
import { Button } from "@d20/ui/button"
import { Presence } from "@d20/ui/presence"
import { cityMapTrail } from "@/lib/citymap"
import type { FeedbackDraft } from "@d20/ui/feedback-rules"
import type { Save } from "../runtime/store"
import { logShot, useAutopilot } from "./autopilot"
import { traceLine } from "./dev-trace"
import { characterInfo } from "./character-info"
import type { FigureArt } from "./figures"
import { storyMoments } from "./moments"
import { useSceneFiles } from "./files"
import { adventureOf, castIdFor, partyScene, portraitFor, sceneFor } from "./scenes"
import { loadPlay, loadPronunciations } from "./stage-data"

// The built looks the game plays its sets in, loaded with the stage.

type Paragraph = { text: string; roll?: RollBeat; feature?: FeatureBeat; beats: StoryBeat[] }
// A turn's story as paragraphs to read. A dice roll keeps its sentence, which the camera and screen readers read, and
// its numbers, which the narration shows as the roll itself. A class feature used keeps its sentence too, and the
// narration shows it as an entry of its own.
const story = (turn: { story: StoryBeat[] } | undefined, originals = false): Paragraph[] =>
  (turn ? storyParagraphs(turn.story) : []).flatMap((p) => {
    const first = p.beats[0]
    if (first.kind === "reply") return originals ? [{ text: `Player action: ${first.text}`, beats: p.beats }] : []
    if (first.kind === "roll") return [{ text: rollSentence(first), roll: first, beats: p.beats }]
    if (first.kind === "feature") return [{ text: first.text, feature: first, beats: p.beats }]
    return [{ text: p.text, beats: p.beats }]
  })
// Where a labelled paragraph puts the camera: on someone, on two people facing off, or on a place on the set.
type Aim = { pair: [string, string] } | { place: string } | { subject: string }
type View = Aim | null
// How fast someone comes on or goes off, in metres a second, by the pace the story gives their entrance or the staging
// their exit.
const PACE = { walk: 1.2, hurry: 2.4, sneak: 0.8 } as const
// A staging's walk can also be a stroll: unhurried, someone on their way through the woods.
const STROLL = 0.6
// Where an authored cue's words come in the story: the first paragraph that holds them, and the sentence in it.
const when = (text: string[], words: string) => {
  const at = text.findIndex((p) => p.toLowerCase().includes(words.toLowerCase()))
  return { at, s: at >= 0 ? sentenceOf(text[at], words) : 0 }
}
// How long a reveal holds on the way in before the one revealed steps out, in milliseconds.
const REVEAL_BEAT = 1400
// Whether a character is kept low on the stage: hidden by the Hide action, or about to roll for it, having gone to cover.
const keptLow = (c: Character) => isHidden(c) || c.rollRequired?.rollType === "Hide (Stealth)"
// A way off for someone who leaves with no exit of their own: about ten metres away from the heroes, or as near that way
// as the set lets them walk six metres or more. Null when nothing does.
function wayOff(stage: Stage, id: string, heroes: string[]): [number, number] | null {
  const me = stage.castAt(id)
  const party = heroes.filter((h) => h !== id && stage.isOnStage(h)).map((h) => stage.castAt(h))
  const cx = party.reduce((n, c) => n + c.x, 0) / Math.max(1, party.length)
  const cz = party.reduce((n, c) => n + c.z, 0) / Math.max(1, party.length)
  // Away from the heroes, or with none, the way they face.
  const away = party.length && Math.hypot(me.x - cx, me.z - cz) > 0.1 ? Math.atan2(me.x - cx, me.z - cz) : me.ry
  for (const off of [0, 30, -30, 60, -60, 90, -90, 135, -135]) {
    const a = away + (off * Math.PI) / 180
    const hit = stage.reach(id, { x: me.x + Math.sin(a) * 10, z: me.z + Math.cos(a) * 10 }, 10)
    if (hit.distance >= 6) return [hit.x, hit.z]
  }
  return null
}
// A shot the director has no take for still lives: once there, the camera circles a little and closes slowly, easing
// out over the paragraph. Paragraphs turn opposite ways, so a run of them does not wind round one way.
const SETTLE = { push: 0.07, rise: 0.12, seconds: 9 }
function alive(shot: StagingShot | string, turn: number): StagingShot | string {
  if (typeof shot === "string" || "orbit" in shot) return shot
  const way = turn % 2 ? -1 : 1
  return { ...shot, orbit: way * 2.5, sweep: 10 }
}
// The shot for an aim, framed on where everyone stands now.
function shotFor(stage: Stage, aim: Aim, heroes: string[]): StagingShot | string | null {
  // Framed for a person, and farther off and higher for someone much taller (speakerShot).
  const on = (id: string, shot: { distance: number; angle: number; height: number; lookHeight: number; fov: number }) => {
    const c = stage.cast.find((m) => m.id === id)
    return c ? speakerShot(c, shot) : { subject: id, ...shot }
  }
  if ("subject" in aim) return on(aim.subject, { distance: 4.5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 })
  if ("pair" in aim) {
    const [actor, target] = aim.pair
    // A shot the scene's author framed on both of them, clear of trees and walls.
    const both = Object.entries(stage.staging?.shots ?? {}).find(([, shot]) => "subjects" in shot && shot.subjects.includes(actor) && shot.subjects.includes(target))
    if (both) return both[0]
    const a = stage.castAt(actor)
    const b = stage.castAt(target)
    const d = Math.hypot(b.x - a.x, b.z - a.z)
    const dx = (b.x - a.x) / Math.max(d, 0.001)
    const dz = (b.z - a.z) / Math.max(d, 0.001)
    // Over the actor's shoulder toward the one the action is aimed at, when nothing solid stands behind the actor.
    // Someone much taller than a person would fill that frame with their back.
    const cam = { x: a.x - dx * 2.4 + dz * 0.9, z: a.z - dz * 2.4 - dx * 0.9 }
    if (d > 0.3 && d < 14 && a.height <= 2.2 && !stage.reach(actor, cam, 4).short)
      return { position: [cam.x, a.y + 1.9, cam.z], target: [a.x + dx * d * 0.6, a.y + (b.y - a.y) * 0.6 + 1.2, a.z + dz * d * 0.6], fov: 48 }
    return on(target, { distance: 6, angle: 25, height: 1.8, lookHeight: 1.2, fov: 48 })
  }
  const mark = stage.set.marks[aim.place]
  if (!mark) return null
  // From just behind the heroes, looking at the place.
  const onStage = stage.cast.filter((c) => stage.isOnStage(c.id))
  const party = onStage.some((c) => heroes.includes(c.id)) ? onStage.filter((c) => heroes.includes(c.id)) : onStage
  const px = party.reduce((n, c) => n + c.x, 0) / Math.max(1, party.length)
  const pz = party.reduce((n, c) => n + c.z, 0) / Math.max(1, party.length)
  const [mx, mz] = mark.at
  const d = Math.hypot(px - mx, pz - mz) || 1
  // Where the heroes themselves stand: the heroes, in the scene's own view of them when it has one.
  if (d < 2.5 && party.some((c) => heroes.includes(c.id))) {
    const ids = party.map((c) => c.id)
    const authored = Object.entries(stage.staging?.shots ?? {}).find(([, shot]) => "subjects" in shot && ids.every((id) => shot.subjects.includes(id)))
    return authored ? authored[0] : { subjects: ids, offset: [0, 1.7, 4.5], target: [0, 1.1, 0], relative: "facing", fov: 46 }
  }
  const cam = { x: px + ((px - mx) / d) * 3, z: pz + ((pz - mz) / d) * 3 }
  const hero = party[0]
  if (!hero || !stage.reach(hero.id, cam, 6).short) return { position: [cam.x, 2, cam.z], target: [mx, 1, mz], fov: 50 }
  // Something solid behind the heroes: the scene's own view that looks nearest the place.
  const near = Object.entries(stage.shots).sort(([, p], [, q]) => Math.hypot(p.target[0] - mx, p.target[2] - mz) - Math.hypot(q.target[0] - mx, q.target[2] - mz))[0]
  return near?.[0] ?? null
}

type Character = Save["turns"][number]["characters"][number]
// How long someone stays on their feet after the paragraph that fells them begins, in milliseconds: about the time the
// camera takes to reach them.
const FALL_DELAY = 1500

// What the card says while the GM plays an NPC's or AI hero's turn, when the sheet has no line of its own.
const MULLING = ["considers the moment…", "weighs the options…", "sizes up the scene…", "makes a choice…", "takes a breath…"]

// What the screen calls someone whose turn it is: a hero by first name, an NPC by the whole name, since NPC names
// often lead with a title or a trade ("Sister Danica", "Warehouse Thug").
const callName = (c: { name: string; type?: string }) => (c.type === "npc" ? c.name : c.name.split(" ")[0])

// The card while the GM works: the NPC or AI hero it is playing, with their own line or one picked by the turn, or the
// GM's own musings while it resolves a player's action.
function playing(turnId: string | undefined, actor: Character | undefined, ai: boolean, portrait: (c: Character) => string | undefined): CardMode {
  if (!actor || (actor.type !== "npc" && !ai)) return { kind: "thinking" }
  const name = callName(actor)
  let pick = 0
  for (const ch of `${turnId}:${actor.id}`) pick = (pick * 31 + ch.charCodeAt(0)) >>> 0
  const note = actor.thinking ?? `${name} ${MULLING[pick % MULLING.length]}`
  return { kind: "thinking", note, who: { id: actor.id, name, role: `${actor.race} ${actor.archetype}`, portrait: portrait(actor) } }
}

// Story view's painting: the encounter's art, drifting slowly, darkened at the edges and behind the text so the
// narration reads over it. Paintings are bundled under /stage/art (scripts/stage-encounter-art.ts). A new encounter's
// painting fades in over the last one, which goes once it has. One that is missing leaves the last, or the plain ground.
function StoryArt({ src }: { src: string }) {
  const [layers, setLayers] = useState<{ src: string; loaded: boolean }[]>([])
  useEffect(() => {
    setLayers((all) => (all.some((l) => l.src === src) ? all : [...all.slice(-1), { src, loaded: false }]))
  }, [src])
  const loaded = (at: string) => {
    setLayers((all) => all.map((l) => (l.src === at ? { ...l, loaded: true } : l)))
    setTimeout(() => setLayers((all) => all.slice(all.findIndex((l) => l.src === at))), FADE_MS)
  }
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {layers.map((l) => (
        <Painting key={l.src} src={l.src} shown={l.loaded} onLoad={() => loaded(l.src)} onError={() => setLayers((all) => all.filter((x) => x.src !== l.src))} />
      ))}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(12,8,5,.7) 100%)" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(12,8,5,.55), transparent 22%, transparent 62%, rgba(12,8,5,.75))" }} />
    </div>
  )
}
const FADE_MS = 1600
// How fast a paragraph is taken to be read before Continue presses itself, in words a minute.
const CONTINUE_WPM = 200
// After the narrator's last word, the pause before the story moves on.
const AFTER_VOICE_MS = 1200
// The moment a roll's verdict is given before the story moves on, in seconds, by the roll's pace.
const ROLL_REST = { full: 1.5, quick: 0.9 }
function Painting({ src, shown, onLoad, onError }: { src: string; shown: boolean; onLoad: () => void; onError: () => void }) {
  const img = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const el = img.current
    if (!el || !shown || prefersReducedMotion()) return
    const drift = el.animate([{ transform: "scale(1.04) translate(-1.2%, 0.6%)" }, { transform: "scale(1.13) translate(1.2%, -0.8%)" }], {
      duration: 70_000,
      iterations: Number.POSITIVE_INFINITY,
      direction: "alternate",
      easing: "ease-in-out",
    })
    return () => drift.cancel()
  }, [shown])
  return (
    <img
      ref={img}
      src={src}
      alt=""
      onLoad={onLoad}
      onError={onError}
      style={{ transitionDuration: `${FADE_MS}ms` }}
      className={`absolute inset-0 h-full w-full scale-[1.04] object-cover transition-opacity [filter:saturate(.85)_brightness(.78)] ${shown ? "opacity-100" : "opacity-0"}`}
    />
  )
}

// The stage-first play view: the 3D scene, the narration read paragraph by paragraph, and the prompt card for the
// player's own heroes. The desktop app plays local saves in it, and hosted games on the app and the website. The
// caller owns the game: it passes the save, says which heroes this player controls, and carries out each action.
export function StagePlay(props: {
  save: Save | null
  // The GM is working on an action, here or on the host's app.
  busy: boolean
  // Painted hero art by hero id.
  art: Record<string, FigureArt>
  // The encounter to show with no save, such as the chosen adventure's opening on the home screen.
  fallbackEncounter?: string
  // Whether this player acts for a hero on their turn. AI companions always act through Continue.
  controls: (character: Character) => boolean
  // A line under the name of the place, for what a player at a shared table needs to know: whether the GM is online.
  status?: string
  // Something over the stage, such as the home screen, which hides the play interface.
  overlay: boolean
  // Header buttons before Journal and Scene settings, and after them.
  actions?: ReactNode
  trailingActions?: ReactNode
  // Each resolves to whether the action was accepted.
  onReply: (turnId: string, characterId: string, text: string) => Promise<boolean>
  // Ends a hero's turn with no reply. Without it the card has no Skip button.
  onSkip?: (turnId: string, characterId: string) => Promise<boolean>
  // `result` is the first d20, and `second` the other of a roll with Advantage or Disadvantage.
  onRoll: (turnId: string, characterId: string, result: number, second?: number) => Promise<boolean>
  // Replies offered on a hero's turn, which fill the reply box. Without it none are offered.
  onSuggest?: (turnId: string, characterId: string) => Promise<CardSuggestion[]>
  onContinue: (turnId: string) => void
  // A player's answer to a reaction offered to their hero in the middle of an NPC's turn. Without it the offer shows
  // who is deciding, with no buttons. Resolves to whether it was taken.
  onReact?: (turnId: string, characterId: string, take: boolean) => Promise<boolean>
  // A hero's standing orders for their reactions, the whole set. Without it the hero's card shows none.
  onOrders?: (turnId: string, characterId: string, orders: StandingOrders) => Promise<boolean>
  // A player's choices for the level a finished adventure owes their hero. Resolves to what stopped the level, or
  // nothing when it was taken. Without it no level is offered.
  onLevel?: (turnId: string, characterId: string, choices: LevelUpChoices) => Promise<string | undefined>
  // NPC turns, AI heroes' turns and the end of a round run on their own. An NPC's or AI hero's turn is written while
  // the story before it is read, and the end of a round once the round has been read. One that fails leaves the
  // Continue button, to retry. Without it Continue always waits for a click.
  autoContinue?: boolean
  // The GM is writing a turn Continue asked for. Unlike `busy`, the story already told reads on, and the card shows
  // the turn being written only once it has been read.
  writing?: boolean
  // The table chat of a game with other players, and how a line is sent. Resolves to whether it was taken.
  chat?: ChatLine[]
  onChat?: (text: string) => Promise<boolean>
  // Buttons on the closing panel beside Journal.
  endActions?: ReactNode
  // Sends a player's feedback, resolving to an error or null. With it the top bar has the feedback button and the
  // closing panel asks for a rating.
  onFeedback?: (draft: FeedbackDraft) => Promise<string | null>
  // In place of the feedback form while it cannot be sent, such as the step to link an account.
  feedbackGate?: ReactNode
  onEscape?: () => void
  onError: (message: string) => void
  // Reports whether the scene is still loading and any stage error, for setup screens and the error panel.
  onStage?: (state: { waiting: boolean; error: string | null }) => void
  children?: ReactNode
}) {
  const { save, art, busy } = props
  const { onError, onEscape, onStage } = props

  const [draft, setDraft] = useState("")
  const [open, setOpen] = useState<"journal" | "chat" | "settings" | "map" | "feedback" | null>(null)
  // The hero whose level-up screen is open.
  const [levelling, setLevelling] = useState<string | null>(null)
  const [feedbackStart, setFeedbackStart] = useState<FeedbackStart>({ kind: "general" })
  const [endingSent, setEndingSent] = useState(false)
  const closePanel = useCallback(() => setOpen(null), [])
  // The Chat button counts the lines said since the chat was last open. Lines already there when it loads are read.
  const chat = props.chat ?? []
  const lastChat = chat[chat.length - 1]?.at ?? 0
  const [chatRead, setChatRead] = useState<number | null>(null)
  const chatLoaded = props.chat !== undefined
  useEffect(() => {
    if (chatLoaded && (chatRead === null || open === "chat")) setChatRead(lastChat)
  }, [chatLoaded, chatRead, open, lastChat])
  const unread = chatRead === null ? 0 : chat.filter((m) => (m.at ?? 0) > chatRead).length
  const [cardId, setCardId] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  // Read by the stage's hotkeys, which stay quiet under a panel or a screen.
  const openRef = useRef(open)
  openRef.current = open
  const overlay = useRef(false)
  overlay.current = props.overlay || Boolean(levelling)
  const [paragraph, setParagraph] = useState(0)
  const [auto, setAuto] = useState(false)
  const [sound, setSound] = useState(soundOn)
  const [reading, setReading] = useState(true)
  // The turn held by the player: the narrator stops where it is, and nothing moves on until it is played again.
  const [paused, setPaused] = useState(false)
  // The roll a hero has just made. It stays on the card, with how it came out, while the GM answers it, and the story
  // after it is read once the player continues. `tries` renews the card for a roll that was not taken.
  // `from` is how many beats the turn's story had when the roll was made: the engine's answer comes after them.
  const [held, setHeld] = useState<{ turn: string; actor: CardCharacter; roll: CardRoll; dice: number[]; at: number; from: number } | null>(null)
  const heldRef = useRef(held)
  heldRef.current = held
  const [tries, setTries] = useState(0)
  const previousText = useRef<{ turn?: string; paragraphs: string[] }>({ paragraphs: [] })
  const [, redraw] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const compact = useCompact()
  const latest = save?.turns.find((t) => t._id === save.adventure.currentTurnId)
  // The turn on screen. A round's end written while the round is still read, or while a roll's answer waits on the
  // card, waits to replace it until the round has been read.
  const [onScreen, setOnScreen] = useState<string | null>(null)
  const kept = latest && onScreen !== latest._id ? save?.turns.find((t) => t._id === onScreen) : undefined
  const live = kept && (reading || held?.turn === kept._id) ? kept : latest
  // A past round read again, reached by stepping back from a round's first paragraph or by the round arrows. It is only
  // read: nothing in it is played, and the game waits on the round in play until the reader returns to it.
  const [viewing, setViewing] = useState<string | null>(null)
  const past = viewing ? save?.turns.find((t) => t._id === viewing) : undefined
  const turn = past ?? live
  const turnRef = useRef(turn)
  turnRef.current = turn
  useEffect(() => {
    if (turn && !past) setOnScreen(turn._id)
  }, [turn?._id, past])
  useEffect(() => setViewing(null), [save?.adventure._id])
  // Where the reader lands in a round moved to: its first paragraph or its last, read. And where they were in the
  // round in play when they left it, to return to. `moved` places the cast for the round moved to, as `land` is read.
  const land = useRef<{ turn: string; paragraph: number; reading: boolean } | null>(null)
  const resume = useRef<{ turn: string; paragraph: number; reading: boolean } | null>(null)
  const moved = useRef<{ turn: string; where: "start" | "end" } | null>(null)
  // A round moved to whose paragraph frames nothing takes the set's opening view, not the last close shot of another.
  const reframe = useRef<string | null>(null)
  const cardCharacter = turn?.characters.find((c) => c.id === cardId)
  // A turn that opens a new encounter starts with the end of the last round, which closes the old one. Those
  // paragraphs are told on the old encounter's scene, with its people, and the new scene follows them.
  const before = turn && save?.turns.find((t) => t.order === (turn.order ?? 0) - 1 && t.encounterId !== turn.encounterId)
  const closing = useMemo(() => {
    if (!before || !turn) return 0
    const end = turn.story.findIndex((b) => b.by.step !== "round")
    return story({ story: end < 0 ? turn.story : turn.story.slice(0, end) }).length
  }, [before, turn])
  // A turn not yet read starts at its first paragraph. Until the reader is set there, the old scene stays, so the new
  // scene is not built and then thrown away for the closing paragraphs.
  const newTurn = turn !== undefined && previousText.current.turn !== turn._id
  // A round stepped back into lands at its end, past the closing paragraphs, so the old scene is not built for it.
  const landing = land.current?.turn === turn?._id ? land.current : null
  const closingNow = closing > 0 && (newTurn ? !(landing && landing.paragraph >= closing) : reading && paragraph < closing)
  const shown = closingNow ? before : turn
  // With no save, the stage shows the fallback encounter. Encounters without an authored scene play in story view.
  // In a game the scene holds the actual party, keyed by value so a reloaded save does not rebuild the stage. Each round
  // lists its characters by initiative, so the party is keyed in a fixed order: a new round neither rebuilds the stage
  // nor moves heroes between places in the line.
  const sceneId = shown?.encounterId ?? props.fallbackEncounter ?? "the-gates-of-kordavos"
  const authored = sceneFor(sceneId)
  // The scene's art and figures, downloaded before it shows (files.ts).
  const files = useSceneFiles(authored ? adventureOf(sceneId) : undefined, sceneId, Boolean(save))
  const painted = Object.fromEntries((save?.painted ?? []).flatMap((id) => (art[id] ? [[id, art[id]]] : [])))
  const partyKey = turn
    ? JSON.stringify([
        turn.characters
          .filter((c) => c.type === "pc")
          .map((c) => ({ id: c.id, name: c.name, race: c.race, archetype: c.archetype, gender: c.gender, type: c.type }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        save?.figures ?? {},
        painted,
      ])
    : ""
  const scene = useMemo(() => {
    if (!authored || !partyKey) return authored
    const [pcs, figures, paintedArt] = JSON.parse(partyKey)
    return partyScene(authored, pcs, figures, paintedArt)
  }, [authored, partyKey])
  const figures = save?.figures
  const portrait = (c: { id: string; name: string; type?: string; race?: string; gender?: string }) => portraitFor(scene, c, figures, painted)
  // A hero's rules sheet for the card. NPCs keep their numbers to themselves.
  const cardSheet = useSheetView(
    cardCharacter?.type === "pc" ? cardCharacter.sheet : undefined,
    cardCharacter?.hitPoints,
    cardCharacter?.spellSlots,
    cardCharacter?.spellEffects,
    cardCharacter?.featureUses,
    cardCharacter?.shape,
    cardCharacter?.heroicInspiration
  )
  // A hero this player plays shows their standing orders on the card, as the current turn keeps them.
  const cardOrders = latest?.characters.find((c) => c.id === cardCharacter?.id)?.standingOrders
  const ordersFor =
    props.onOrders && cardCharacter?.type === "pc" && cardCharacter.controlledBy !== "ai" && props.controls(cardCharacter) && cardSheet ? heroReactions(cardSheet.reactions, cardOrders) : undefined
  const card = cardCharacter ? characterInfo(cardCharacter, portrait(cardCharacter), cardSheet, standingOf(cardCharacter, cardSheet), ordersFor) : null
  // Every hero's sheet, for their hit points and Armor Class in the turn order and the party row.
  const sheets = useSheetViews(shown?.characters ?? [])
  const specs = useMemo(() => (scene && files.ready ? { set: scene.set, staging: scene.staging, tier: "balanced" as const, play: loadPlay } : null), [scene, files.ready])
  // The adventure the stage on screen was built for in a game. The title screen's scene belongs to none, so a game's
  // opening scene loads on black, not over the Gates of Kordavos. Within one adventure the last picture holds.
  const [builtFor, setBuiltFor] = useState<string | undefined>()
  const { stage, stageRef, status: loading, error: stageError } = useStage(containerRef, specs, Boolean(scene) && builtFor !== undefined && builtFor === adventureOf(sceneId))
  useEffect(() => {
    if (stage) setBuiltFor(save ? adventureOf(sceneId) : undefined)
  }, [stage])
  // The next scene still on its way: its files downloading, or its set being built. The story waits for it, so the
  // narration of a new place is never read over the last one.
  const sceneWaits = Boolean(scene && !stage && !stageError)
  // Silent under the home screen and its pages: the set's ambience starts in play.
  useStageSound(stage, !props.overlay)
  const actor = turn ? findCurrentActor(turn.characters) : undefined
  // Who the turn passed over to reach the actor, because they cannot act, and why.
  const passed = turn ? passedWords(passedOver(turn.characters, actor)) : ""
  // Read again only when the story itself changes, not on every save, such as positions after a walk.
  const told = turn ? JSON.stringify([turn._id, turn.story]) : ""
  const paragraphs = useMemo(() => story(turn), [told])
  const text = useMemo(() => paragraphs.map((p) => p.text), [paragraphs])
  // The rounds that can be read again, in order: each earlier one with a story, then the round in play.
  const rounds = useMemo(() => {
    if (!save || !live) return []
    const done = save.turns.filter((t) => t._id !== live._id && (t.order ?? 0) < (live.order ?? 0) && story(t).length > 0)
    return [...done.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), live]
  }, [save?.turns, live])
  const at = rounds.findIndex((t) => t._id === turn?._id)
  // Not while a roll waits on the card: its answer is read in the round in play.
  const roundBefore = at > 0 && !held ? rounds[at - 1] : undefined
  const roundAfter = at >= 0 && at < rounds.length - 1 ? rounds[at + 1] : undefined
  const goTo = (to: (typeof rounds)[number] | undefined, where: "start" | "end") => {
    if (!to || !live || held) return
    if (to._id !== live._id && !past) resume.current = { turn: live._id, paragraph, reading }
    if (to._id === live._id) resume.current = null
    land.current = { turn: to._id, paragraph: where === "start" ? 0 : Number.POSITIVE_INFINITY, reading: true }
    moved.current = { turn: to._id, where }
    reframe.current = to._id
    setViewing(to._id === live._id ? null : to._id)
  }
  // Back to the round in play, where the reader left it.
  const toNow = () => {
    if (!live) return
    const back = resume.current?.turn === live._id ? resume.current : { turn: live._id, paragraph: 0, reading: true }
    resume.current = null
    land.current = back
    moved.current = { turn: live._id, where: back.paragraph > 0 || !back.reading ? "end" : "start" }
    reframe.current = live._id
    setViewing(null)
  }
  // On from the paragraph on screen: the next one, or past the last, the next round read again or the round's end.
  const advance = () => (paragraph < text.length - 1 ? setParagraph((n) => n + 1) : past ? goTo(roundAfter, "start") : setReading(false))
  // The paragraph's dice roll, for the narration to show: the numbers from the roll, the names and how a dying hero
  // stands from the turn, the roller's portrait from the scene. Or the class feature it tells.
  const rolled = paragraphs[paragraph]?.roll
  const roller = rolled ? turn?.characters.find((c) => c.id === rolled.character) : undefined
  const rollerPortrait = roller ? portrait(roller) : undefined
  const roll = useMemo<RollView | undefined>(() => (rolled && turn ? rollView(rolled, turn.characters, rollerPortrait) : undefined), [rolled, turn?.characters, rollerPortrait])
  // The roll that opens an encounter plays in full, and the ones after it are quick.
  const paces = turn ? `${save?.adventure._id}:${turn.encounterId}` : ""
  const pace = roll && turn ? rollPace(paces, `${turn._id}:${paragraph}`) : "full"
  const rollTime = roll ? rollSeconds(roll, pace) + ROLL_REST[pace] : 0
  const used = paragraphs[paragraph]?.feature
  const feature = useMemo(() => (used && turn ? featureView(used, turn.characters) : undefined), [used, turn?.characters])
  // The narrator reads the words in the panel. A roll or a class feature shows its own card, so it is not read.
  const narratorVoice = useNarratorVoice()
  // The adventure's names, said as its setting lists them (stage/pronunciations.json).
  // A character's name that is not listed is said as it sounds alone, the same in every sentence.
  const plan = save?.adventure.planId
  const characterNames = (turn?.characters ?? []).map((c) => c.name).sort().join("|")
  useEffect(() => {
    if (plan) void loadPronunciations(plan).then((list) => setNarratorNames(withCharacters(list, characterNames.split("|"))))
  }, [plan, characterNames])
  const nextWords = paragraphs[paragraph + 1]?.roll || paragraphs[paragraph + 1]?.feature ? undefined : text[paragraph + 1]
  // Whoever is quoted in a paragraph, whose words a narrator of the other gender hands to a voice of theirs.
  const speakerOf = (at: number) => {
    const line = paragraphs[at]?.beats.find((b) => b.kind === "line")
    const c = line?.kind === "line" ? (turn?.characters.find((c) => c.id === line.speaker) ?? before?.characters.find((c) => c.id === line.speaker)) : undefined
    return c ? spokenGender(c) : undefined
  }
  const voiced = useNarrator({
    key: `${turn?._id}:${paragraph}`,
    text: rolled || used ? undefined : text[paragraph],
    next: nextWords,
    speaker: speakerOf(paragraph),
    nextSpeaker: speakerOf(paragraph + 1),
    on: reading && !hidden && !props.overlay && !sceneWaits,
    paused,
  })
  // A pause lasts until the turn is played again, or the reading ends.
  useEffect(() => {
    if (!reading) setPaused(false)
  }, [reading])
  useEffect(() => setPaused(false), [turn?._id])
  // What the stage shows keeps time with the narrator. A paragraph read aloud plays nothing until its first words are
  // heard, and a cue tied to a later sentence ("the cabin door opened") waits for that sentence. `heard` is the sentence
  // being heard in the paragraph on screen: -1 before the first, and all of them when nothing is read aloud.
  const speaking = voiced.status === "waiting" || voiced.status === "speaking"
  const heard = voiced.status === "waiting" ? -1 : voiced.status === "speaking" ? voiced.sentence : Number.POSITIVE_INFINITY
  const started = heard >= 0
  // Whether the reader has reached a cue at sentence `s` of paragraph `at`, or has still to.
  const reached = (at: number, s: number) => reading && paragraph === at && heard >= s
  const toCome = (at: number, s: number) => reading && at >= 0 && (paragraph < at || (paragraph === at && heard < s))
  // The turn order tells no more than the story has: while a turn is read, each character stands as the turn before
  // left them until the paragraph that hurts, heals, drops or marks them, so Thalbern is not shown dying while his
  // arrow is still in the air. A creature new to this turn comes in unhurt, with nothing on it yet, and a hero the last
  // turn did not have shows as the turn ends.
  const prior = turn && save?.turns.find((t) => t.order === (turn.order ?? 0) - 1)
  const fresh = (c: NonNullable<typeof turn>["characters"][number]): typeof c | undefined => {
    if (c.type !== "npc") return undefined
    const { dead: _dead, deathSaves: _saves, ...rest } = c
    return { ...rest, healthPercent: 100, hitPoints: Math.max(1, c.hitPoints),conditions: [], turnEffects: [], spellEffects: [], concentration: undefined }
  }
  const touchedAt = useMemo(() => {
    const at = new Map<string, number>()
    paragraphs.forEach((p, i) => {
      for (const b of p.beats) {
        const ids =
          b.kind === "roll"
            ? [b.attack?.target, ...(b.harm ?? []).map((h) => h.target), ...(b.conditions ?? []).map((c) => c.target), b.deathSave ? b.character : undefined]
            : b.kind === "feature"
              ? (b.harm ?? []).map((h) => h.target)
              : b.kind === "action" && b.effect
                ? [b.target]
                : []
        for (const id of ids) if (id) at.set(id, i)
      }
    })
    return at
  }, [paragraphs])
  const toldCharacters = (shown?.characters ?? []).map((c) => {
    const at = touchedAt.get(c.id)
    const then = closingNow || at === undefined || !toCome(at, 0) ? undefined : (prior?.characters.find((p) => p.id === c.id) ?? fresh(c))
    return then ?? c
  })
  const toldSheets = useSheetViews(toldCharacters)
  // The cast member who plays a character in the turn, by the character's id.
  const castOf = useCallback(
    (id: string | undefined) => {
      const c = id ? (turn?.characters.find((c) => c.id === id) ?? before?.characters.find((c) => c.id === id)) : undefined
      return stage && c ? castIdFor(stage.cast, c) : undefined
    },
    [stage, turn?.characters, before?.characters]
  )
  // The heroes' cast members, for views taken from behind them. Read when a shot is chosen, not a reason to choose one.
  const heroes = useRef<string[]>([])
  heroes.current = (turn?.characters ?? []).flatMap((c) => {
    const id = c.type === "pc" ? castOf(c.id) : undefined
    return id ? [id] : []
  })
  // The narration paragraph by paragraph, from its beats: who speaks in it and where the camera goes. A paragraph that
  // names no one and no place leaves the camera where it is.
  const beats = useMemo((): { view: View; speech: { id: string; text: string; s: number }[] }[] => {
    if (!stage) return []
    return paragraphs.map((p) => {
      // One bubble a speaker: lines said in a row join, or they would stack over the same head.
      const speech = p.beats.reduce<{ id: string; text: string; s: number }[]>((all, b) => {
        const id = b.kind === "line" ? castOf(b.speaker) : undefined
        if (!id || b.kind !== "line") return all
        const said = all.find((l) => l.id === id)
        if (said) said.text = `${said.text} ${b.text}`
        else all.push({ id, text: b.text, s: sentenceOf(p.text, b.text) })
        return all
      }, [])
      const act = p.beats.find((b) => b.kind === "action")
      const actor = act?.kind === "action" ? castOf(act.actor) : undefined
      const target = act?.kind === "action" ? castOf(act.target) : undefined
      const place = p.beats.find((b) => b.kind === "narration" && b.place)
      const roller = p.beats[0].kind === "roll" ? castOf(p.beats[0].character) : undefined
      const view: View =
        actor && target ? { pair: [actor, target] } : actor ? { subject: actor } : roller ? { subject: roller } : place?.kind === "narration" && place.place ? { place: place.place } : null
      return { view, speech }
    })
  }, [stage, paragraphs, castOf])
  // Whose turn the top of the screen names: while the story is read, whoever the paragraph's turn belongs to, and no one
  // for an intro or the end of a round. A hero's turn that is told while the next one is played is still theirs.
  const tellerId = reading ? paragraphs[paragraph]?.beats[0]?.by.character : undefined
  // The view the paragraph being read takes, for a walk that ends after the camera was set.
  const viewNow = useRef<View>(null)
  viewNow.current = reading ? (beats[paragraph]?.view ?? null) : null
  const spotlit = reading ? shown?.characters.find((c) => c.id === tellerId) : actor
  // Everyone who speaks in the paragraph gets a bubble once the narrator reaches their words.
  const speech = useMemo(
    () =>
      reading && stage
        ? (beats[paragraph]?.speech ?? []).flatMap((l) => {
            const cast = heard >= l.s && stage.cast.find((c) => c.id === l.id)
            return cast ? [{ cast, text: l.text }] : []
          })
        : [],
    [stage, beats, paragraph, reading, heard]
  )
  // In story view, whoever speaks first in the paragraph gets the portrait plate a scene would give them.
  const voice = useMemo(() => {
    if (scene || !reading) return null
    const beats = paragraphs[paragraph]?.beats ?? []
    const line = beats.find((b) => b.kind === "line")
    if (line?.kind !== "line") return null
    const c = shown?.characters.find((c) => c.id === line.speaker)
    if (!c) return null
    const text = beats.flatMap((b) => (b.kind === "line" && b.speaker === line.speaker ? [b.text] : [])).join(" ")
    return { name: c.name, role: c.type === "npc" ? c.archetype || c.race : `${c.race} ${c.archetype}`, portrait: portrait(c), text }
  }, [scene, reading, paragraphs, paragraph, shown])
  // The walks the engine made this turn, by character, each at the paragraph it is read in (story/beats `MoveBeat`).
  const trails = useMemo(() => {
    const out = new Map<string, { at: number; from: { x: number; y: number }; to: { x: number; y: number }; teleport: boolean }[]>()
    if (shown !== turn) return out
    paragraphs.forEach((p, at) => {
      for (const b of p.beats) {
        if (b.kind !== "move") continue
        out.set(b.character, [...(out.get(b.character) ?? []), { at, from: b.path[0], to: b.path[b.path.length - 1], teleport: !!b.teleport }])
      }
    })
    return out
  }, [shown, turn, paragraphs])
  // Where the engine has each character, in the stage's metres, by cast id, with the character it stands for, as far as
  // the story has been read: one the turn walks stands where they started until the paragraph of each walk, so the
  // Owlbear waits at the tree line while Thalbern shoots and closes on him on its own turn. `walked` marks one whose
  // spot the story's moves give, `teleport` one whose last move set them down there. Ambient extras, and anyone the
  // engine has not placed, stand where the staging puts them.
  const spots = useMemo(() => {
    const out = new Map<string, { character: string; at: [number, number]; walked?: true; teleport?: true }>()
    for (const c of shown?.characters ?? []) {
      const id = stage && c.position && castIdFor(stage.cast, c)
      if (!id || !c.position) continue
      const moves = trails.get(c.id) ?? []
      const done = moves.filter((m) => !toCome(m.at, 0))
      const last = done[done.length - 1]
      const at = done.length === moves.length ? c.position : (last?.to ?? moves[0].from)
      out.set(id, { character: c.id, at: [metres(at.x), metres(at.y)], ...(moves.length ? { walked: true as const } : {}), ...(last?.teleport ? { teleport: true as const } : {}) })
    }
    return out
  }, [stage, shown?.characters, trails, reading, paragraph, heard])
  // Entrances the scene ties to the narration: offstage until the paragraph that brings them on ("the cabin door
  // opened"), then they walk on from the door to where the engine has them. Narration without the phrase finds them
  // in place. An action that brings someone on from a place does the same, at its own paragraph.
  // A hero is in the scene from its start, so one the story brings out of a place, as Poppen creeping out of the bushes
  // at the treeline, waits there in plain view and is not taken off the stage until then.
  const cues = useMemo(() => {
    const entrances = stage?.staging?.entrances ?? []
    const authored = entrances.flatMap((e) =>
      e.when && e.from !== undefined ? [{ ...e, from: e.from, speed: 0.9, sneak: false, here: false, ...when(text, e.when) }] : []
    )
    const told = paragraphs.flatMap((p, at) =>
      p.beats.flatMap((b) => {
        const cast = b.kind === "action" && b.enters && stage?.set.marks[b.enters.from] ? castOf(b.actor) : undefined
        const here = b.kind === "action" && turn?.characters.find((c) => c.id === b.actor)?.type === "pc"
        return cast && b.kind === "action" && b.enters
          ? [{ cast, from: b.enters.from as string | [number, number], when: "", shot: entrances.find((e) => e.cast === cast)?.shot, speed: PACE[b.enters.pace ?? "walk"], sneak: b.enters.pace === "sneak", here, at, s: sentenceOf(p.text, b.text) }]
          : []
      })
    )
    return [...authored.filter((e) => !told.some((t) => t.cast === e.cast)), ...told]
  }, [stage, text, paragraphs, castOf, turn?.characters])
  const arriving = cues.find((e) => reached(e.at, e.s))
  // The entrances played on this stage, by cast and paragraph. A stage built at a scene change can be ready only once
  // the reader is on the entrance's paragraph, with everyone standing in place: the entrance is still walked.
  const entered = useRef(new Set<string>())
  const enteredOn = useRef(stage)
  useEffect(() => {
    if (!stage) return
    if (enteredOn.current !== stage) entered.current.clear()
    enteredOn.current = stage
    for (const e of cues) {
      const home = stage.staging?.cast.find((c) => c.id === e.cast)
      // A place is read as a mark: a mark can share its name with the one who stands there, as the Owlbear's does.
      const spot = (at: string | number[] | undefined) => (typeof at === "string" ? stage.set.marks[at]?.at : at) as [number, number] | undefined
      const to = spots.get(e.cast)?.at ?? spot(home?.at)
      const from = spot(e.from)
      if (!home || !to || !from) continue
      const key = `${e.cast}:${e.at}`
      if (toCome(e.at, e.s)) {
        entered.current.delete(key)
        stage.placeCast(e.cast, from, e.here ? home.facing : undefined)
        stage.setOnStage(e.cast, e.here)
      } else if (reached(e.at, e.s) && !entered.current.has(key)) {
        entered.current.add(key)
        stage.placeCast(e.cast, from, to)
        stage.setOnStage(e.cast, true)
        // An entrance with a shot of its own is a reveal: the camera holds on the way in a moment before they come out.
        // A rerun of this effect does not call it off. Stepping back, or a new stage, does.
        const walk = () => {
          if (enteredOn.current === stage && entered.current.has(key)) void stage.moveCast(e.cast, to, { speed: e.speed, pace: e.sneak ? "sneak" : undefined }).then(() => stage.faceCast(e.cast, home.facing))
        }
        if (e.shot) setTimeout(walk, REVEAL_BEAT)
        else walk()
      } else if (!stage.isOnStage(e.cast)) {
        stage.setOnStage(e.cast, true)
        stage.placeCast(e.cast, to, home.facing)
      }
    }
  }, [stage, cues, spots, reading, paragraph, heard])
  // Who the game has taken out of this encounter, by cast id: the dead and those who fled. A round is built without
  // them, so each character's last appearance in the encounter says how they left.
  // While the end of the last round is told on the old scene, that is the encounter, and the turn that closes it can
  // say who left in it.
  const gone = useMemo(() => {
    const out = new Map<string, "dead" | "fled">()
    if (!stage || !save || !turn || !shown) return out
    // Up to the round on screen: someone who falls in a later round is still here in a round read again.
    const rounds = save.turns.filter((t) => t.encounterId === shown.encounterId && (t.order ?? 0) <= (turn.order ?? 0)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    for (const t of rounds)
      for (const c of t.characters) {
        const id = castIdFor(stage.cast, c)
        if (!id) continue
        // A hero who is dying or Stable stays on the stage, down.
        if (isDead(c)) out.set(id, "dead")
        else if (hasFled(c)) out.set(id, "fled")
        else out.delete(id)
      }
    if (shown !== turn)
      for (const c of turn.characters) {
        const id = castIdFor(stage.cast, c)
        if (id && isDead(c)) out.set(id, "dead")
        else if (id && hasFled(c)) out.set(id, "fled")
      }
    return out
  }, [stage, save, turn, shown])
  // Someone who goes while the turn is being told leaves at the paragraph that came with the news: the first new one
  // that names them. Anyone already gone when the turn was opened is simply not there.
  const [leftAt, setLeftAt] = useState<Record<string, number>>({})
  const leaving = useRef<{ turn?: string; paragraphs: number; out: Set<string> }>({ paragraphs: 0, out: new Set() })
  // The turn, and the scene it is told on: the end of the last round on the old one, then its own.
  const leavingKey = `${turn?._id}:${shown?.encounterId}`
  useEffect(() => {
    const old = leaving.current
    const now = leavingKey
    const sameTurn = old.turn === now
    const fresh = sameTurn ? [...gone.keys()].filter((id) => !old.out.has(id)) : []
    // A turn that opens on the end of the last round tells there how someone still on the old scene left it.
    const closingOut = !sameTurn && shown !== turn && closing > 0 && stage ? [...gone.keys()].filter((id) => stage.isOnStage(id)) : []
    setLeftAt((was) => {
      if (sameTurn && !fresh.length) return was
      const next = sameTurn ? { ...was } : {}
      // The first new paragraph with a beat by them or aimed at them.
      const involves = (id: string) => (b: StoryBeat) => (b.kind === "action" ? [b.actor, b.target] : b.kind === "line" ? [b.speaker, b.to] : []).some((who) => castOf(who) === id)
      for (const id of fresh) {
        const named = paragraphs.findIndex((p, i) => i >= old.paragraphs && p.beats.some(involves(id)))
        next[id] = named >= 0 ? named : Math.min(old.paragraphs, Math.max(0, text.length - 1))
      }
      for (const id of closingOut) {
        const named = paragraphs.findIndex((p, i) => i < closing && p.beats.some(involves(id)))
        if (named >= 0) next[id] = named
      }
      return next
    })
    leaving.current = { turn: now, paragraphs: text.length, out: new Set(gone.keys()) }
  }, [gone, text, leavingKey, shown, turn, stage, closing])
  // Exits, the mirror of entrances: a fall or a run the staging ties to the narration, and anyone the game has taken
  // out. They stay until their paragraph. Then a runner makes for their way out and is gone, and the rest lie down.
  const exits = useMemo(() => {
    const authored = stage?.staging?.exits ?? []
    type Exit = { run: boolean; to?: string | [number, number]; via?: (string | [number, number])[]; lands?: string | [number, number]; shot?: string; speed: number; sneak?: boolean; at: number; s: number }
    const out = new Map<string, Exit>()
    for (const e of authored)
      if (e.when)
        out.set(e.cast, {
          run: Boolean(e.to),
          to: e.to,
          via: e.via,
          lands: e.lands,
          shot: e.shot,
          speed: PACE[e.pace ?? "hurry"],
          sneak: e.pace === "sneak",
          ...when(text, e.when),
        })
    // Someone just gone, whose paragraph the effect above has still to find, waits for it: taken now, they would be
    // gone before the paragraph that tells it.
    const settled = leaving.current
    for (const [id, how] of gone) {
      if (!(id in leftAt) && !(settled.turn === leavingKey && settled.out.has(id))) continue
      const way = authored.find((e) => e.cast === id)
      if (!out.has(id)) out.set(id, { run: how === "fled", to: way?.to, via: way?.via, lands: way?.lands, shot: way?.shot, speed: PACE[way?.pace ?? "hurry"], sneak: way?.pace === "sneak", at: leftAt[id] ?? -1, s: 0 })
    }
    // An encounter that ends with someone still in it, who has a way off, sends them along it while its end is told:
    // the Owlbear that never found Thalbern walks back into the trees. They go at the first closing paragraph that
    // names them, or the first.
    if (closingNow)
      for (const e of authored) {
        if (e.when || !e.to || out.has(e.cast)) continue
        const name = e.cast.replace(/-/g, " ")
        const named = text.findIndex((p, i) => i < closing && p.toLowerCase().includes(name))
        out.set(e.cast, { run: true, to: e.to, via: e.via, shot: e.shot, speed: PACE[e.pace ?? "hurry"], sneak: e.pace === "sneak", at: Math.max(0, named), s: named >= 0 ? sentenceOf(text[named], name) : 0 })
      }
    return out
  }, [stage, text, gone, leftAt, leavingKey, closingNow, closing])
  // The exit this paragraph shows, when its staging says where to watch it from.
  const departing = [...exits.values()].find((e) => reached(e.at, e.s) && e.shot)
  // The exits the reader has reached in the paragraph on screen. Their effect answers this, not each sentence heard,
  // which would call off a fall waiting to be seen.
  const exitsHeard = [...exits].flatMap(([id, e]) => (reached(e.at, e.s) ? [id] : [])).join()
  const ran = useRef(new Set<string>())
  const ranOn = useRef(stage)
  useEffect(() => {
    if (!stage) return
    if (ranOn.current !== stage) ran.current.clear()
    ranOn.current = stage
    const falls: ReturnType<typeof setTimeout>[] = []
    for (const [id, e] of exits) {
      const home = stage.staging?.cast.find((c) => c.id === id)
      if (toCome(e.at, e.s)) {
        // Not yet: back on their feet in their place, as when the reader steps back.
        const at = spots.get(id)?.at ?? home?.at
        if ((ran.current.delete(id) || stage.isDown(id)) && at) stage.placeCast(id, at, home?.facing)
        stage.setOnStage(id, true)
        stage.setDown(id, false)
      } else if (!e.run) {
        // On their paragraph they stand a moment longer, so the camera is there to see them go down. Reading on
        // before that finds them already down.
        if (!reached(e.at, e.s)) stage.setDown(id, true, true, e.lands)
        else if (!stage.isDown(id)) falls.push(setTimeout(() => stage.setDown(id, true, false, e.lands), FALL_DELAY))
      } else if (stage.isOnStage(id) && !ran.current.has(id)) {
        ran.current.add(id)
        // Someone who leaves with no way of their own walks off away from the heroes, rather than vanish on the spot.
        const to = e.to ?? (reached(e.at, e.s) ? wayOff(stage, id, heroes.current) : null)
        if (!(reached(e.at, e.s) && to)) stage.setOnStage(id, false)
        else {
          const legs = [...(e.via ?? []), to].map((leg) => stage.point(leg))
          // Reading on does not cut the run short. Stepping back, or a new scene, does.
          const running = () => ranOn.current === stage && ran.current.has(id)
          void (async () => {
            stage.setLow(id, false)
            for (const leg of legs) for (const p of stage.route(id, leg, 40)) if (running()) await stage.moveCast(id, [p.x, p.z], { speed: e.speed, pace: e.sneak ? "sneak" : undefined })
            if (running()) stage.setOnStage(id, false)
          })()
        }
      }
    }
    return () => falls.forEach(clearTimeout)
  }, [stage, exits, spots, reading, paragraph, started, exitsHeard])
  // A hero dying or Stable lies where they fell, and stays on the stage. One dropped in this turn stands until the last
  // paragraph that hurt them, and falls once its words begin, as Thalbern under the Owlbear's claws. One already down
  // when the turn opens is down from the start, and one back on their feet stands.
  useEffect(() => {
    if (!stage || !shown) return
    const falls: ReturnType<typeof setTimeout>[] = []
    for (const c of shown.characters) {
      const id = c.type === "pc" ? castIdFor(stage.cast, c) : undefined
      if (!id || exits.has(id) || !stage.isOnStage(id)) continue
      if (!isDown(c) || isDead(c)) {
        if (stage.isDown(id)) stage.setDown(id, false)
        continue
      }
      const at = paragraphs.findLastIndex((p) =>
        p.beats.some((b) => (b.kind === "roll" && (b.attack?.target === c.id || b.harm?.some((h) => h.target === c.id && h.kind === "damage"))) || (b.kind === "feature" && b.harm?.some((h) => h.target === c.id && h.kind === "damage")))
      )
      if (at >= 0 && toCome(at, 0)) {
        if (stage.isDown(id)) stage.setDown(id, false)
      } else if (!stage.isDown(id)) {
        if (at >= 0 && reached(at, 0)) falls.push(setTimeout(() => stage.setDown(id, true), FALL_DELAY))
        else stage.setDown(id, true, true)
      }
    }
    return () => falls.forEach(clearTimeout)
  }, [stage, shown, exits, paragraphs, reading, paragraph, started])
  // A weapon kept in hand, as Thalbern's arrow nocked in the thicket: the last one the story readied for each cast member
  // in this encounter, in its earlier turns and in this one as far as it has been read. One put away leaves the hand
  // empty, and so does a new encounter.
  const readied = (() => {
    if (!shown) return ""
    const out = new Map<string, Ready>()
    const take = (b: StoryBeat) => {
      const id = b.kind === "action" && b.ready ? castOf(b.actor) : undefined
      if (id && b.kind === "action" && b.ready) out.set(id, b.ready)
    }
    const earlier = (save?.turns ?? []).filter((t) => t.encounterId === shown.encounterId && (t.order ?? 0) < (shown.order ?? 0))
    for (const t of earlier.sort((a, b) => (a.order ?? 0) - (b.order ?? 0))) for (const b of t.story) take(b)
    if (closingNow) for (const b of shown.story) take(b)
    else paragraphs.forEach((p, at) => p.beats.forEach((b) => b.kind === "action" && !toCome(at, sentenceOf(p.text, b.text)) && take(b)))
    return JSON.stringify([...out])
  })()
  useEffect(() => {
    if (!stage) return
    const kept = new Map<string, Ready>(readied ? JSON.parse(readied) : [])
    for (const c of stage.cast) {
      const what = kept.get(c.id)
      stage.readyWeapon(c.id, what === "bow" || what === "blade" ? what : null)
    }
  }, [stage, readied])
  // Walks the scene ties to the narration for someone already on stage, such as Thalbern on his way through the woods as
  // the story opens. They stand where the walk starts until its paragraph, then walk to where the engine has them. This
  // comes before the opening view, which frames them where the walk starts.
  // A move of the engine's takes over a walk under way.
  const walks = useMemo(
    () =>
      (stage?.staging?.walks ?? [])
        .map((w) => ({ ...w, speed: w.pace === "stroll" ? STROLL : PACE[w.pace ?? "walk"], sneak: w.pace === "sneak", ...when(text, w.when) }))
        .filter((w) => w.at >= 0),
    [stage, text]
  )
  const strolls = useRef<{ stage: Stage | null; on: Map<string, number>; next: number }>({ stage: null, on: new Map(), next: 0 })
  useEffect(() => {
    if (!stage || !reading) return
    if (strolls.current.stage !== stage) strolls.current = { stage, on: new Map(), next: 0 }
    const s = strolls.current
    for (const w of walks) {
      const home = stage.staging?.cast.find((c) => c.id === w.cast)
      const spot = spots.get(w.cast)?.at ?? home?.at
      if (!spot || !stage.isOnStage(w.cast)) continue
      const legs = [...(w.via ?? []), spot].map((leg) => stage.point(leg))
      if (toCome(w.at, w.s)) {
        s.on.delete(w.cast)
        stage.placeCast(w.cast, w.from, [legs[0].x, legs[0].z])
      } else if (reached(w.at, w.s) && !s.on.has(w.cast)) {
        const token = ++s.next
        s.on.set(w.cast, token)
        stage.placeCast(w.cast, w.from, [legs[0].x, legs[0].z])
        const live = () => strolls.current === s && s.on.get(w.cast) === token
        void (async () => {
          for (const leg of legs) for (const p of stage.route(w.cast, leg, 60)) if (live()) await stage.moveCast(w.cast, [p.x, p.z], { speed: w.speed, pace: w.sneak ? "sneak" : undefined })
        })()
      } else if (!s.on.has(w.cast)) {
        s.on.set(w.cast, 0)
        stage.placeCast(w.cast, spot)
      }
    }
  }, [stage, walks, spots, reading, paragraph, heard])
  // A new stage: loops held and its opening view, before the camera frames anyone.
  useEffect(() => {
    if (!stage) return
    for (const loop of stage.loops.values()) loop.paused = true
    logShot(turn?._id, -1, `new stage, opening ${stage.staging?.shot ?? "none"}`, true)
    if (stage.staging?.shot) stage.shot(stage.staging.shot, { instant: true })
    const timer = setInterval(() => redraw((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [stage])
  // Everyone where the engine has them. A new stage, or a new encounter on it, places them at once. After that, someone
  // the engine moves walks there from where they are drawn, when the reader reaches the paragraphs of their latest
  // step, or at once when the story is not being read. A newer move takes over a walk under way. Someone waiting for
  // an entrance, offstage or a hero in plain view at the place they come out of, is left to it.
  const drawn = useRef<{ stage: Stage; encounter: string; at: Map<string, string>; walks: Map<string, number> } | null>(null)
  useEffect(() => {
    // A stage being replaced for the next encounter must not take the new encounter's positions.
    if (!stage || !shown || stageRef.current !== stage) return
    const encounter = `${shown.adventureId}:${shown.encounterId}`
    const fresh = drawn.current?.stage !== stage || drawn.current.encounter !== encounter
    if (fresh) drawn.current = { stage, encounter, at: new Map(), walks: new Map() }
    const d = drawn.current!
    // A round moved to places everyone at once, walks under way called off: read from its start, where the round
    // before left them, to walk on at their paragraphs, and read from its end, where it leaves them.
    const jump = moved.current?.turn === turn?._id && shown === turn ? moved.current : null
    if (jump) moved.current = null
    for (const [id, { character, at: to, walked, teleport }] of spots) {
      if (jump) {
        const was = jump.where === "start" ? prior?.characters.find((c) => c.id === character)?.position : undefined
        const from: [number, number] = was ? [metres(was.x), metres(was.y)] : to
        d.walks.set(id, (d.walks.get(id) ?? 0) + 1)
        d.at.set(id, from.join())
        const cued = cues.some((e) => e.cast === id && e.here && (toCome(e.at, e.s) || reached(e.at, e.s)))
        if (!cued && stage.isOnStage(id)) stage.placeCast(id, from)
        continue
      }
      const key = to.join()
      if (d.at.get(id) === key) continue
      const cued = cues.some((e) => e.cast === id && e.here && (toCome(e.at, e.s) || reached(e.at, e.s)))
      if (fresh || !stage.isOnStage(id) || cued) {
        d.at.set(id, key)
        if (cued) continue
        // Someone on a walk the narration cues is left to it.
        if (stage.isOnStage(id) && !(reading && walks.some((w) => w.cast === id))) stage.placeCast(id, to)
        continue
      }
      // One the story walks already waited for the paragraph of the walk. Anyone else waits for the first paragraph of
      // their latest step in the story on screen.
      let from = walked ? -1 : paragraphs.findLastIndex((p) => p.beats[0]?.by.character === character)
      while (from > 0 && paragraphs[from - 1].beats[0]?.by.character === character && paragraphs[from - 1].beats[0]?.by.step === paragraphs[from].beats[0]?.by.step) from--
      if (toCome(from, 0)) continue
      d.at.set(id, key)
      // A teleport walks nothing: they are there.
      if (teleport) {
        d.walks.set(id, (d.walks.get(id) ?? 0) + 1)
        stage.placeCast(id, to)
        continue
      }
      strolls.current.on.set(id, 0)
      const walk = (d.walks.get(id) ?? 0) + 1
      d.walks.set(id, walk)
      const live = () => stageRef.current === stage && drawn.current === d && d.walks.get(id) === walk
      void (async () => {
        for (const p of stage.route(id, { x: to[0], z: to[1] }, Number.POSITIVE_INFINITY)) {
          if (!live()) return
          const now = stage.castAt(id)
          if (Math.hypot(p.x - now.x, p.z - now.z) > 0.05) stage.faceCast(id, [p.x, p.z])
          await stage.moveCast(id, [p.x, p.z])
        }
        // The set can stop a walk short of the engine's spot, which is the truth.
        const now = stage.castAt(id)
        if (live() && Math.hypot(to[0] - now.x, to[1] - now.z) > 0.05) stage.placeCast(id, to)
        // The paragraph's view was framed on where they stood: it follows them to where they stopped, to see what they
        // do there, such as sink down into cover.
        const view = viewNow.current
        if (live() && view && (("subject" in view && view.subject === id) || ("pair" in view && view.pair.includes(id)))) {
          const shot = shotFor(stage, view, heroes.current)
          if (shot) stage.shot(shot, { follow: "pair" in view ? view.pair : [] })
        }
      })().catch((error) => onError(`Could not draw the move: ${String(error)}`))
    }
    // Someone hidden, or rolling to hide, is kept low, once the walk to where the engine has them has set off: the stage
    // sinks a figure only when it stops walking. Hidden when the scene opens, they are low from the start.
    for (const c of shown.characters) {
      const id = castIdFor(stage.cast, c)
      if (!id) continue
      const spot = spots.get(id)
      const low = keptLow(c) && (!spot || d.at.get(id) === spot.at.join())
      if (low !== stage.isLow(id)) stage.setLow(id, low, fresh)
    }
  }, [stage, stageRef, shown, spots, paragraphs, reading, paragraph, started, walks, cues, onError])
  // What labelled paragraphs do on stage: effects and objects, each played once when its paragraph is first read.
  // An attack in a hero's reply waits for the roll that decides it, and plays after the roll as a hit or a miss, unless
  // the roll's outcome shows the attack itself. After a roll in the same step, an effect misses when its actor failed
  // the roll or its target made it. No one walks by a beat: where everyone stands is the engine's.
  const staged = useMemo(() => {
    type Entry = { key: string; beat: Extract<StoryBeat, { kind: "action" }>; effect: boolean; miss: boolean; outcome?: "crit" | "fumble" }
    const out = new Map<number, (Entry & { s: number })[]>()
    const all = paragraphs.flatMap((p, i) => p.beats.map((beat) => ({ beat, at: i })))
    const same = (a: StoryBeat, b: StoryBeat) => a.by.step === b.by.step && a.by.character === b.by.character
    // At the sentence that tells it, in its own paragraph. One played after a roll plays as that paragraph opens.
    const add = (at: number, own: number, entry: Entry) =>
      out.set(at, [...(out.get(at) ?? []), { ...entry, s: at === own ? sentenceOf(paragraphs[at].text, entry.beat.text) : 0 }])
    // A crit or a fumble on the actor's own roll shows in the blow.
    const outcomeOf = (roll: RollBeat) => (roll.success && roll.attack?.critical ? "crit" : !roll.success && roll.natural === 1 ? "fumble" : undefined)
    // Where a beat's effect plays, and whether it misses: undefined when it does not play yet, or not at all.
    const effectAt = (beat: Extract<StoryBeat, { kind: "action" }>, at: number, i: number): Pick<Entry, "miss" | "outcome"> & { at: number } | undefined => {
      let j = i - 1
      while (j >= 0 && same(all[j].beat, beat) && all[j].beat.kind !== "roll") j--
      const before = j >= 0 && same(all[j].beat, beat) ? all[j].beat : undefined
      if (before?.kind === "roll")
        return before.character === beat.actor ? { at, miss: !before.success, outcome: outcomeOf(before) } : { at, miss: before.character === beat.target && before.success }
      if (beat.by.step !== "reply") return { at, miss: false }
      let k = i + 1
      while (k < all.length && same(all[k].beat, beat)) k++
      const roll = all[k]?.beat
      if (roll?.kind === "roll" && roll.character === beat.actor) {
        // The outcome shows the attack itself.
        for (let m = k + 1; m < all.length && same(all[m].beat, roll); m++) {
          const o = all[m].beat
          if (o.kind === "action" && o.actor === beat.actor && o.effect) return undefined
        }
        return { at: all[k + 1]?.at ?? all[k].at, miss: !roll.success, outcome: outcomeOf(roll) }
      }
      // A roll the player has still to make decides it later.
      if (k >= all.length && turn?.characters.find((c) => c.id === beat.actor)?.rollRequired) return undefined
      return { at, miss: false }
    }
    for (const [i, { beat, at }] of all.entries()) {
      if (beat.kind !== "action") continue
      const key = `${turn?._id}:${i}`
      if (beat.object) add(at, at, { key: `${key}:own`, beat, effect: false, miss: false })
      const fx = beat.effect ? effectAt(beat, at, i) : undefined
      if (fx) add(fx.at, at, { key: `${key}:fx`, beat, effect: true, miss: fx.miss, outcome: fx.outcome })
    }
    return out
  }, [paragraphs, turn?._id, turn?.characters])
  // Sounds the story names (a door, a lid, a splash), each heard once at the sentence that tells it, from where its
  // actor stands when it is theirs.
  const sounded = useMemo(() => {
    const out = new Map<number, { key: string; cue: SoundCue; actor?: string; s: number }[]>()
    for (const [at, p] of paragraphs.entries())
      for (const [j, beat] of p.beats.entries()) {
        if ((beat.kind !== "action" && beat.kind !== "narration") || !beat.sound) continue
        const entry = { key: `${turn?._id}:${at}:${j}:sound`, cue: beat.sound, actor: beat.kind === "action" ? beat.actor : undefined, s: sentenceOf(p.text, beat.text) }
        out.set(at, [...(out.get(at) ?? []), entry])
      }
    return out
  }, [paragraphs, turn?._id])
  // Each paragraph as a moment for the stage's director (packages/stage/src/director.ts): a crit, a death, a threat, a
  // quiet word, a monster coming on. The director plans the turn's takes as one sequence, so every player sees the same.
  const plans = useMemo(() => {
    if (!stage || !turn) return []
    const spot = (at: string | number[] | undefined) => (typeof at === "string" ? stage.set.marks[at]?.at : at) as [number, number] | undefined
    // Heroes the turn leaves dying: dropped in the last paragraph that hurt them.
    const dropped = new Map<number, string[]>()
    for (const c of turn.characters) {
      const id = c.type === "pc" && c.hitPoints === 0 && !isDead(c) ? castOf(c.id) : undefined
      if (!id) continue
      const at = paragraphs.findLastIndex((p) => p.beats.some((b) => b.kind === "roll" && (b.attack?.target === c.id || b.harm?.some((h) => h.target === c.id && h.kind === "damage"))))
      if (at >= 0) dropped.set(at, [...(dropped.get(at) ?? []), id])
    }
    const moments = storyMoments(paragraphs, {
      castOf,
      big: (id) => {
        const c = stage.cast.find((m) => m.id === id)
        return !!c && (c.height >= 2.3 || c.voice === "beast")
      },
      killed: (i) => [...exits].flatMap(([id, e]) => (!e.run && e.at === i ? [id] : [])),
      dropped: (i) => dropped.get(i) ?? [],
      arriving: (i) => {
        const e = cues.find((c) => c.at === i)
        const from = spot(e?.from)
        const home = spot(e && (spots.get(e.cast)?.at ?? stage.staging?.cast.find((c) => c.id === e.cast)?.at))
        return e && from && home ? { cast: e.cast, from, home } : undefined
      },
      effects: (i) =>
        (staged.get(i) ?? []).flatMap(({ beat, effect, miss }) => {
          const actor = castOf(beat.actor)
          return effect && beat.effect && actor ? [{ actor, target: castOf(beat.target), kind: beat.effect.kind, miss }] : []
        }),
      party: heroes.current.filter((id) => stage.isOnStage(id)),
    })
    return planTakes(moments, turn._id)
  }, [stage, turn, paragraphs, castOf, exits, cues, spots, staged])
  // The camera answers a change in the paragraph's plan, not each save that rebuilds it, which would restart the take.
  const plansRef = useRef(plans)
  plansRef.current = plans
  const planKey = JSON.stringify(plans[paragraph] ?? null)
  // Each paragraph moves the camera to fit it, as the director shoots its moment. An author's shot for an entrance or
  // an exit is kept, with the take's move. A paragraph the director has no take for frames its first speaker or the
  // place it describes. The first view on a new stage is a cut, not a glide from its opening view.
  const framed = useRef<Stage | null>(null)
  // A speaker framed only where the director has no take, so a bubble that comes up mid-paragraph does not restart one.
  const lead = plans[paragraph] ? undefined : speech[0]?.cast.id
  useEffect(() => {
    if (!stage || !reading || !started) return
    const cut = framed.current !== stage
    framed.current = stage
    const plan = plansRef.current[paragraph]
    const cast = stage.cast.filter((c) => stage.isOnStage(c.id))
    const arrived = reframe.current === turn?._id
    if (arrived) reframe.current = null
    // A spot is clear when nothing solid stands between it and the one it is taken from, however far off it is.
    const take = plan ? compose(plan, { cast, clear: (from, at) => !stage.reach(from.id, at, Math.hypot(at.x - from.x, at.z - from.z) + 0.1).blocked }) : null
    const go = (which: Parameters<Stage["shot"]>[0], t: Take | null, follow: string[] = t?.follow ?? []) => (
      logShot(turn?._id, paragraph, typeof which === "string" ? which : (t?.label ?? "view"), cut || !!t?.cut),
      traceShot(stage, paragraph, which, t, cast),
      stage.shot(t ? which : alive(which, paragraph), {
        instant: cut || !!t?.cut,
        follow,
        duration: t?.duration ?? 2600,
        ease: t?.ease,
        move: t ? t.move : SETTLE,
        impact: t?.impact,
        take: t?.label,
      }))
    if (departing?.shot) return void go(departing.shot, take)
    if (arriving?.shot) return void go(arriving.shot, take)
    if (take) return void go(take.shot, take)
    if (lead) {
      const shot = { distance: 5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 }
      const leader = stage.cast.find((c) => c.id === lead)
      return void go(leader ? speakerShot(leader, shot) : { subject: lead, ...shot }, null)
    }
    const view = beats[paragraph]?.view
    if (!view) return void (arrived && stage.staging?.shot && go(stage.staging.shot, null))
    const shot = shotFor(stage, view, heroes.current)
    // A walk under way in this paragraph is followed: two facing off keep both in the picture.
    if (shot) go(shot, null, "pair" in view ? view.pair : [])
  }, [stage, lead, departing, arriving, beats, planKey, paragraph, reading, started])
  const played = useRef(new Set<string>())
  // The paragraph on screen, so an effect waiting on the camera is dropped once the reader moves on.
  const showing = useRef("")
  useEffect(() => {
    const here = reading && turn ? `${turn._id}:${paragraph}` : ""
    showing.current = here
    if (!stage || !here || !turn || stageRef.current !== stage) return
    for (const { key, beat: b, effect, miss, outcome, s } of staged.get(paragraph) ?? []) {
      if (played.current.has(key) || heard < s) continue
      const actor = castOf(b.actor)
      if (!actor || !stage.isOnStage(actor)) continue
      played.current.add(key)
      const target = castOf(b.target)
      // Once the camera has arrived, so the effect is seen from where the paragraph frames it.
      void Promise.race([stage.shotSettled(), new Promise((r) => setTimeout(r, 2600))]).then(() => {
        if (showing.current !== here) return
        if (effect && b.effect) void stage.effect(b.effect.kind, actor, target, b.effect.element, { miss, outcome })
        else if (b.object) void stage.prop(b.object.kind, actor, castOf(b.object.to))
      })
    }
    for (const { key, cue, actor, s } of sounded.get(paragraph) ?? []) {
      if (played.current.has(key) || heard < s) continue
      played.current.add(key)
      stage.sound(cue, castOf(actor))
    }
  }, [stage, stageRef, reading, paragraph, heard, staged, sounded, turn, castOf])
  useEffect(() => {
    if (!auto || !reading || busy || sceneWaits || !text.length || speaking || paused) return
    // A roll stays up until the die has landed and the verdict has had a moment. A paragraph read aloud moves on once
    // the narrator has finished.
    const seconds = voiced.status === "done" ? AFTER_VOICE_MS / 1000 : rollTime || readingSeconds(text[paragraph] ?? "")
    const timer = setTimeout(advance, seconds * 1000)
    return () => clearTimeout(timer)
  }, [auto, reading, busy, sceneWaits, text, rollTime, paragraph, speaking, voiced.status, paused])
  // Stepping through, Continue presses itself once the paragraph has had time to be read, or the narrator has read it.
  // Read aloud, it fills as the words are heard. A roll waits as it does in auto.
  const continueMs = busy || !text.length || speaking ? undefined : voiced.status === "done" ? AFTER_VOICE_MS : Math.round((rollTime || readingSeconds(text[paragraph] ?? "", CONTINUE_WPM)) * 1000)
  const focused = useRef<string | null>(null)
  useEffect(() => {
    onStage?.({ waiting: Boolean(scene && !stage && !stageError), error: stageError ?? null })
  }, [onStage, scene, stage, stageError])

  const readingRef = useRef(reading)
  readingRef.current = reading
  useEffect(() => {
    const old = previousText.current
    const sameTurn = old.turn === turn?._id
    const firstChanged = sameTurn ? text.findIndex((p, i) => p !== old.paragraphs[i]) : 0
    // The same paragraphs again: nothing new to read.
    if (sameTurn && firstChanged < 0 && text.length === old.paragraphs.length) return
    previousText.current = { turn: turn?._id, paragraphs: text }
    // The answer to a roll on the card waits for Continue, and starts after the roll the card has shown.
    const hold = heldRef.current
    if (hold) {
      const at = paragraphs.findLastIndex((p) => p.roll?.character === hold.actor.id)
      return void setParagraph(at >= 0 ? at + 1 : Math.max(0, firstChanged))
    }
    // A round moved to, or the round in play returned to.
    const to = land.current
    if (to && to.turn === turn?._id) {
      land.current = null
      setParagraph(Math.max(0, Math.min(to.paragraph, text.length - 1)))
      return void setReading(to.reading && text.length > 0)
    }
    // Narration that arrives while an earlier paragraph is still being read waits its turn.
    setParagraph((p) => (sameTurn && readingRef.current && firstChanged > p ? p : Math.max(0, firstChanged)))
    // A turn with nothing told yet, such as the hero's own turn opening a round, has nothing to read: its card shows.
    setReading(text.length > 0)
  }, [text, paragraphs, turn?._id])
  // A reply being written is kept while a past round is read.
  const liveActor = live ? findCurrentActor(live.characters)?.id : undefined
  useEffect(() => {
    setDraft("")
  }, [live?._id, liveActor])
  const focus = useCallback(
    (id: string) => {
      const characters = turnRef.current?.characters
      const character = characters?.find((c) => c.id === id) ?? characters?.find((c) => stage && castIdFor(stage.cast, c) === id)
      if (!character) return
      const sid = stage && castIdFor(stage.cast, character)
      if (stage && sid && focused.current !== id) {
        const member = stage.cast.find((c) => c.id === sid)
        const shot = { distance: 4, angle: 18, height: 1.6, lookHeight: 1.1, fov: 40 }
        stage.shot(member ? speakerShot(member, shot) : { subject: sid, ...shot })
        focused.current = id
        return
      }
      setCardId(character.id)
    },
    [stage]
  )
  useEffect(() => {
    const el = containerRef.current
    if (!stage || !el) return
    let down = [0, 0]
    const pd = (e: PointerEvent) => {
      down = [e.clientX, e.clientY]
    }
    const pu = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
      const r = el.getBoundingClientRect(),
        id = stage.pick(e.clientX - r.left, e.clientY - r.top)
      if (id) focus(id)
    }
    el.addEventListener("pointerdown", pd)
    el.addEventListener("pointerup", pu)
    return () => {
      el.removeEventListener("pointerdown", pd)
      el.removeEventListener("pointerup", pu)
    }
  }, [stage, focus])
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.matches?.("input,textarea,select,[contenteditable]")) return
      // Over the stage, a screen or dialog keeps the keys to itself.
      if (overlay.current || target.closest?.('[role="dialog"],[role="alertdialog"]') || document.querySelector('[aria-modal="true"]')) return
      if (e.key.toLowerCase() === "h" && !openRef.current) setHidden((h) => !h)
      // A popup that took Escape prevents its default, so the page stays put.
      if (e.key === "Escape" && !e.defaultPrevented) {
        setOpen(null)
        setCardId(null)
        onEscape?.()
      }
      if (openRef.current) return
      const view = Object.keys(stage?.shots ?? {})[Number(e.key) - 1]
      if (view) stage?.shot(view)
    }
    addEventListener("keydown", fn)
    return () => removeEventListener("keydown", fn)
  }, [stage, onEscape])
  const holding = Boolean(held)
  useEffect(() => {
    // The camera stays on whoever acts, a hero whose roll is on the card too. The card leaves only the top of the
    // screen to frame them in, so the camera comes in close enough that they fill it, a dwarf closer than a tall elf.
    const sid = stage && actor && !holding && castIdFor(stage.cast, actor)
    if (!stage || !sid || reading) return
    const h = stage.cast.find((c) => c.id === sid)?.height ?? 1.7
    stage.shot({ subject: sid, distance: Math.min(3.6, Math.max(2.4, h * 1.9)), angle: 18, height: h * 0.9 + 0.15, lookHeight: h * 0.62, fov: 45, orbit: 1.5, sweep: 8 }, { move: { push: 0.04, seconds: 10 } })
  }, [stage, actor?.id, reading, holding])
  // Where the card leaves room to frame a shot. A tall card, a hero's reply, leaves the column beside it, and the
  // stage frames its subject there, standing full height. A short card leaves the top of the screen.
  const onTop = useCallback(
    (px: number, rect?: DOMRect) => {
      if (px > innerHeight * 0.45 && rect && rect.left > innerWidth * 0.22) stage?.setInsets({ right: innerWidth - rect.left + 12, bottom: 0 })
      else stage?.setInsets({ bottom: px > 0 ? px + 12 : 0 })
    },
    [stage]
  )
  const party: CardCharacter[] = (turn?.characters ?? [])
    .filter((c) => c.type === "pc")
    .map((c) => {
      const standing = standingOf(c, sheets[c.id])
      return { id: c.id, name: c.name, role: `${c.race} ${c.archetype}${c.controlledBy === "ai" ? " · AI" : ""}`, portrait: portrait(c), ...(standing ? { standing } : {}) }
    })
  // A hero the player plays down to a quarter of their hit points, or down, reddens the picture's edges.
  const danger = (turn?.characters ?? []).some((c) => c.type === "pc" && c.controlledBy !== "ai" && props.controls(c) && !isDead(c) && (isDown(c) || (c.healthPercent ?? 100) <= 25))
  // Heroes the AI plays take their turns like NPCs, through Continue.
  const aiActor = actor?.type === "pc" && actor.controlledBy === "ai"
  const cardActor = aiActor || !actor || past || !props.controls(actor) ? null : (party.find((c) => c.id === actor.id) ?? null)
  const rr = actor?.rollRequired
  // A finished adventure ends on its final narration. Its last turn has characters but takes no more actions.
  const finished = save?.adventure.status === "completed"
  const ended = finished && turn === latest
  // A ring on the ground about whoever's turn it is, as the turn order marks them.
  const ringed = ended || past ? undefined : castOf(actor?.id)
  useEffect(() => {
    stage?.setTurn(ringed ?? null)
  }, [stage, ringed])
  // The levels owed to each hero this player plays.
  const owed = props.onLevel && latest ? latest.characters.filter((c) => c.type === "pc" && c.controlledBy !== "ai" && props.controls(c) && levelOwed(c)) : []
  const levelHero = owed.find((c) => c.id === levelling)
  // Suggested replies are asked for once per hero's turn, as soon as it comes up with the game on screen, so they are
  // often there once the narration has been read. A request that fails twice offers none.
  const suggestRef = useRef(props.onSuggest)
  suggestRef.current = props.onSuggest
  const asked = useRef(new Map<string, Promise<CardSuggestion[]>>())
  const [offered, setOffered] = useState<{ key: string; list: CardSuggestion[] } | null>(null)
  const holdTurn = turn?._id
  const holdActor = cardActor?.id
  const holdKey = props.onSuggest && holdTurn && holdActor && !rr && !ended && !props.overlay ? `${holdTurn}:${holdActor}` : null
  useEffect(() => {
    if (!holdKey || !holdTurn || !holdActor) return
    let live = true
    const ask = () => (suggestRef.current?.(holdTurn, holdActor) ?? Promise.resolve([])).catch(() => [] as CardSuggestion[])
    let request = asked.current.get(holdKey)
    if (!request) {
      // One that comes back empty is asked once more.
      request = ask().then((list) => (list.length > 0 ? list : ask()))
      asked.current.set(holdKey, request)
    }
    void request.then((list) => live && setOffered({ key: holdKey, list }))
    return () => {
      live = false
    }
  }, [holdKey, holdTurn, holdActor])
  // The hero's spells with no one here to work on (Speak with Animals before an Owlbear), so a reply that names one asks
  // first. The rules are loaded only when a hero's turn comes up.
  const [unworkable, setUnworkable] = useState<{ key: string; list: UnworkableSpell[] } | null>(null)
  const holdCharacters = turn?.characters
  useEffect(() => {
    const hero = holdCharacters?.find((c) => c.id === holdActor)
    if (!holdTurn || !hero?.sheet || !holdCharacters) return
    let live = true
    const key = `${holdTurn}:${hero.id}`
    void import("@d20/gm-core/sheet/creature-gated-spells").then(({ spellsWithNoOneToWorkOn }) => {
      if (live) setUnworkable({ key, list: spellsWithNoOneToWorkOn(hero, holdCharacters.filter((c) => !c.dead && !c.fled)) })
    })
    return () => {
      live = false
    }
  }, [holdTurn, holdActor, holdCharacters])
  // The engine's answer to the roll on the card, once it is in: the roll beat after the story the roll was made on.
  const heldTurn = held ? save?.turns.find((t) => t._id === held.turn) : undefined
  const answer = held && heldTurn?.story.slice(held.from).find((b): b is RollBeat => b.kind === "roll" && b.character === held.actor.id)
  const result = useMemo(() => (answer && heldTurn ? rollView(answer, heldTurn.characters) : undefined), [answer, heldTurn?.characters])
  let mode: CardMode | null = null
  // The pace of the roll on the card, which is a roll of its own beside the story's.
  const cardRoller = (held?.actor ?? cardActor)?.id
  const cardPace = turn && cardRoller ? rollPace(paces, `${held?.turn ?? turn._id}:card:${cardRoller}`) : "full"
  if (held) mode = { kind: "roll", roll: held.roll, made: held.dice, resolving: props.busy, ...(result ? { result } : {}) }
  else if (past) mode = null
  else if (busy) mode = playing(turn?._id, actor, aiActor, portrait)
  else if (props.writing) mode = reading ? null : playing(turn?._id, actor, aiActor, portrait)
  // An action waits for the next scene to be on screen.
  else if (scene && !stage && !stageError) mode = { kind: "thinking", note: loading }
  else if (ended) mode = null
  else if (cardActor && rr)
    mode = {
      kind: "roll",
      roll: {
        kind: "attack" in rr || "cast" in rr ? "attack" : "deathSave" in rr ? "death" : "check",
        skill: rr.rollType,
        dc: rr.difficulty,
        modifier: rr.modifier,
        ...(rr.mode === "advantage" || rr.mode === "disadvantage" ? { mode: rr.mode, reasons: rr.reasons } : {}),
        ...("attack" in rr ? { target: nameOf(storyNames(turn?.characters ?? []), rr.attack.target) } : {}),
        // A spell with a spell attack is thrown at its first target, against that target's Armor Class.
        ...("cast" in rr ? { target: nameOf(storyNames(turn?.characters ?? []), rr.cast.targets[0] ?? ""), spell: rr.rollType } : {}),
        ...("deathSave" in rr ? { deathSaves: { successes: actor?.deathSaves?.successes ?? 0, failures: actor?.deathSaves?.failures ?? 0 } } : {}),
      },
    }
  else if (cardActor) mode = { kind: "hold", prompt: `What does ${cardActor.name.split(" ")[0]} do?`, suggestions: holdKey ? (offered?.key === holdKey ? offered.list : "loading") : undefined }
  // What Continue would run: an NPC's or AI hero's turn, or the end of the round, in the turn the game is on, which
  // may be a round ahead of the screen. Each is tried once on its own. Played on its own, the next one is written while
  // the story before it is read, or while a roll's answer waits on the card. The end of a round is written ahead only
  // for the round on screen, so the game is never more than a round ahead of the reader. Narration that has just
  // arrived is unread, though `reading` only says so after the effect above has run.
  // A reaction offered to a hero holds the round: nothing runs on while it waits, an answer plays the turn on itself,
  // and one that runs out unanswered is played on once, by the hero's standing order.
  const { autoContinue, onContinue } = props
  const reaction = latest?.reaction
  const offerExpired = useExpired(reaction?.expiresAt)
  const offerWaits = Boolean(reaction && reaction.answer === undefined && !offerExpired)
  const offerHolds = Boolean(reaction && (reaction.answer !== undefined || !offerExpired))
  const next = latest ? findCurrentActor(latest.characters) : undefined
  const nextAi = next?.type === "pc" && next.controlledBy === "ai"
  const unseen = reading || previousText.current.paragraphs !== text
  const ahead = Boolean(autoContinue && !props.writing && (!mode || (held && !props.busy)) && (next || latest === turn))
  const continueKey =
    !past && !finished && !busy && !offerHolds && (ahead || (!unseen && !mode)) && !props.overlay && latest && !(next?.type === "pc" && !nextAi)
      ? `${latest._id}:${next?.id ?? "round"}${reaction ? `:${reaction.expiresAt}` : ""}`
      : null
  const [continued, setContinued] = useState<string | null>(null)
  useEffect(() => {
    if (!autoContinue || !continueKey || continued === continueKey) return
    setContinued(continueKey)
    onContinue(continueKey.split(":")[0])
  }, [autoContinue, continueKey, continued, onContinue])
  // The offer shows once the story before it has been read to its last paragraph, so it never cuts into one.
  const offerHero = reaction && latest?.characters.find((c) => c.id === reaction.offer.to)
  const offerShown = Boolean(reaction && !offerExpired && !busy && !held && turn === latest && (!reading || paragraph >= text.length - 1))
  const offerMine = Boolean(offerHero && offerHero.type === "pc" && offerHero.controlledBy !== "ai" && props.controls(offerHero) && props.onReact)
  const react = (take: boolean) => {
    if (latest && reaction) void props.onReact?.(latest._id, reaction.offer.to, take)
  }
  const reply = async (value: string) => {
    if (!turn || !actor) return
    if (await props.onReply(turn._id, actor.id, value)) setDraft("")
  }
  const skip = async () => {
    if (turn && actor && (await props.onSkip?.(turn._id, actor.id))) setDraft("")
  }
  const makeRoll = async (dice: number[]) => {
    if (!turn || !actor || !cardActor || mode?.kind !== "roll") return
    setHeld({ turn: turn._id, actor: cardActor, roll: mode.roll, dice, at: Date.now(), from: turn.story.length })
    if (await props.onRoll(turn._id, actor.id, dice[0], dice[1])) return
    setHeld(null)
    setTries((n) => n + 1)
  }
  // From the roll on the card to the story after it.
  const leaveRoll = () => {
    setHeld(null)
    setTries((n) => n + 1)
    if (paragraph < text.length) setReading(true)
  }
  // A roll from a game no longer on screen.
  useEffect(() => {
    if (held && !save?.turns.some((t) => t._id === held.turn)) setHeld(null)
  }, [held, save])
  const leaveRef = useRef(leaveRoll)
  leaveRef.current = leaveRoll
  useAutopilot({
    mode,
    reading,
    working: Boolean(props.busy || props.writing),
    held: held?.at ?? null,
    ended: Boolean(ended && !props.busy),
    turn: turn?._id,
    actor: actor ? { id: actor.id, name: actor.name } : undefined,
    story: text,
    step: turn?.story.length,
    encounter: turn?.encounterId,
    paragraph: reading ? `${turn?._id}:${paragraph}:${voiced.status}` : null,
    advance,
    setAuto,
    setDraft,
    reply,
    roll: makeRoll,
  })
  // Played on its own, the card moves on once the verdict has had a moment and the GM has answered.
  useEffect(() => {
    if (!auto || !held || props.busy) return
    const seconds = rollSeconds(result ?? { kind: held.roll.kind, success: false }, cardPace) + ROLL_REST[cardPace]
    const timer = setTimeout(() => leaveRef.current(), Math.max(1500, held.at + seconds * 1000 - Date.now()))
    return () => clearTimeout(timer)
  }, [auto, held, props.busy, result, cardPace])
  // Where the party has been on the city map, up to the turn on screen.
  const encountersSoFar = (save?.turns ?? [])
    .filter((t) => (t.order ?? 0) <= (shown?.order ?? 0))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((t) => t.encounterId)
  const city = useMemo(() => (save ? cityMapTrail(save.adventure.planId, encountersSoFar) : null), [save?.adventure.planId, encountersSoFar.join()])
  const journal: JournalTurn[] = (save?.turns ?? []).map((t) => ({
    number: t.order,
    title: t.title,
    paragraphs: story(t, true).map((p) => (p.roll ? { roll: rollView(p.roll, t.characters) } : p.feature ? { feature: featureView(p.feature, t.characters) } : p.text)),
  }))
  // The play interface is up. Each part of it comes and goes on its own, so hiding it lets every part leave.
  const on = !hidden && !props.overlay
  // Where the narration sits over a scene, and the button that brings it back.
  const nook = compact ? "bottom-[118px] left-8 w-[min(460px,45vw)]" : "bottom-[84px] left-8 w-[min(460px,35vw)]"
  return (
    <StageHud
      containerRef={containerRef}
      backdrop={!scene && save && shown ? <StoryArt src={served(`/stage/art/${save.adventure.planId}/${shown.encounterId}.webp`)} /> : undefined}
      title={{ eyebrow: (save?.adventure.title ?? "").toUpperCase(), text: shown?.title ?? "" }}
      location={{ name: scene?.location ?? "Story View", status: props.status }}
      views={stage ? Object.entries(stage.shots).map(([id, s]) => ({ id, label: s.label ?? id })) : []}
      activeView={stage?.activeShot ?? null}
      onView={(id) => stage?.shot(id)}
      hidden={hidden || !save || props.overlay}
      map={city && <CityMapInset className="h-[112px] w-[200px]" map={city.map} trail={city.trail} onOpen={() => setOpen("map")} />}
      compact={compact}
      danger={danger}
      actions={
        <>
          {props.actions}
          {city && <Pill onClick={() => setOpen(open === "map" ? null : "map")}>Map</Pill>}
          <Pill onClick={() => setOpen(open === "journal" ? null : "journal")}>Journal</Pill>
          {props.onChat && (
            <Pill variant={unread > 0 ? "primary" : "outline"} onClick={() => setOpen(open === "chat" ? null : "chat")}>
              Chat{unread > 0 ? ` · ${unread}` : ""}
            </Pill>
          )}
          <IconButton label="Scene Settings" active={open === "settings"} onClick={() => setOpen(open === "settings" ? null : "settings")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true">
              <path d="M5 3v18M12 3v18M19 3v18" />
              <path d="M2 8h6M9 16h6M16 9h6" strokeWidth="3" />
            </svg>
          </IconButton>
          {props.onFeedback && (
            <FeedbackButton
              active={open === "feedback"}
              visible={Boolean(save) && !hidden && !props.overlay}
              compact={compact}
              onClick={() => {
                setFeedbackStart({ kind: "general" })
                setOpen(open === "feedback" ? null : "feedback")
              }}
            />
          )}
          {props.trailingActions}
        </>
      }
    >
      {scene && !files.ready && <SceneLoading progress={files.progress} />}
      {save && (
        <>
          {on && stage && speech.length > 0 && (
            <Bubbles
              compact={compact}
              moving={() => stage.cameraMoving}
              backdrop={() => stage.thumbnail()}
              bubbles={speech.map((l, i) => ({ key: paragraph * 100 + i, anchor: () => stage.project(l.cast.id), text: l.text, named: true }))}
            />
          )}
          <Presence show={on && !scene && Boolean(voice)} motion="fade" asChild>
            {voice && <Plate compact={compact} line={{ key: paragraph, side: "right", ...voice }} />}
          </Presence>
          <Presence show={on} motion="drop" asChild>
            <TurnOrder
              order={toldCharacters.map((c) => {
                const standing = standingOf(c, toldSheets[c.id])
                const conditions = conditionLabel(c)
                return { id: c.id, name: c.name, portrait: portrait(c), npc: c.type === "npc", ...(standing ? { standing } : {}), ...(conditions ? { conditions } : {}) }
              })}
              activeId={ended ? null : (spotlit?.id ?? null)}
              turnId={ended ? null : (actor?.id ?? null)}
              label={ended ? undefined : spotlit?.name}
              passed={ended || spotlit !== actor ? undefined : passed || undefined}
              compact={compact}
              onPick={focus}
            />
          </Presence>
          {/* The narration and the button that brings it back each have the place to themselves, so one leaves as the other comes. */}
          <div className={`pointer-events-none absolute z-20 ${scene ? nook : "left-1/2 top-1/2 w-[min(680px,75vw)] -translate-x-1/2 -translate-y-1/2"}`}>
            <Presence show={on && reading} motion="rise" asChild>
              <Narration
                heading={`Round ${shown?.order} · ${shown?.title}`}
                text={text[paragraph]}
                roll={roll}
                rollPace={pace}
                feature={feature}
                index={paragraph}
                count={text.length}
                compact={compact}
                step={!auto}
                autoMs={continueMs}
                progress={voiced.status === "off" || busy ? undefined : voiced.progress}
                paused={paused}
                onPause={setPaused}
                onReplay={() => {
                  setParagraph(0)
                  setReading(true)
                }}
                onBack={() => (paragraph > 0 ? setParagraph((n) => n - 1) : goTo(roundBefore, "end"))}
                onNext={() => (paragraph < text.length - 1 ? setParagraph((n) => n + 1) : goTo(roundAfter, "start"))}
                onSkip={() => (past ? toNow() : setReading(false))}
                onContinue={advance}
                canBack={Boolean(roundBefore)}
                rounds={rounds.length > 1 ? { onPrev: roundBefore && (() => goTo(roundBefore, "start")), onNext: roundAfter && (() => goTo(roundAfter, "start")) } : undefined}
                onNow={past ? toNow : undefined}
              />
            </Presence>
          </div>
          <div className={`pointer-events-none absolute z-20 ${nook}`}>
            <Presence show={on && !reading && !held && !past} motion="rise" asChild>
              <Pill
                className="pointer-events-auto"
                onClick={() => {
                  setParagraph(0)
                  setReading(true)
                }}
              >
                Read turn
              </Pill>
            </Presence>
          </div>
          <Presence show={on && Boolean(mode && (!reading || busy || held))} motion="rise" asChild>
            {mode && (
              <PromptCard
                key={`${turn?._id}:${(held?.actor ?? actor)?.id}:${mode.kind}:${tries}`}
                mode={mode}
                actor={held?.actor ?? cardActor}
                party={party}
                compact={compact}
                onReply={reply}
                onSkip={props.onSkip ? skip : undefined}
                onRoll={(dice) => void makeRoll(dice)}
                onPick={focus}
                onContinue={held && !props.busy ? leaveRoll : undefined}
                onTop={onTop}
                draft={draft}
                onDraft={setDraft}
                forcedRoll={turn && actor ? save.rolls?.[`${turn._id}:${actor.id}`] : undefined}
                rollPace={cardPace}
                unworkable={unworkable?.key === `${turn?._id}:${cardActor?.id}` ? unworkable.list : undefined}
              />
            )}
          </Presence>
          <Presence show={on && Boolean(ended && !busy && !reading)} motion="rise" asChild>
            <div className={`${panel} absolute bottom-28 left-1/2 z-raised -translate-x-1/2 p-6 text-center`}>
              <div className="text-4xs tracking-label text-accent">THE END</div>
              <p className="mt-2 mb-4 font-display text-2xl">{save.adventure.title}</p>
              {owed.length > 0 && (
                <div className="mb-3 flex flex-wrap justify-center gap-2">
                  {owed.map((c) => (
                    <Pill key={c.id} variant="primary" onClick={() => setLevelling(c.id)}>
                      Level Up {c.name}
                    </Pill>
                  ))}
                </div>
              )}
              {props.endActions}
              <Pill className="ml-2" onClick={() => setOpen("journal")}>
                Journal
              </Pill>
              {props.onFeedback && (
                <EndingRating
                  sent={endingSent}
                  onRate={(rating) => {
                    setFeedbackStart({ kind: "ending", rating })
                    setOpen("feedback")
                  }}
                />
              )}
            </div>
          </Presence>
          <Presence show={on && !ended && owed.length > 0 && !levelHero} motion="drop" asChild>
            <div className="absolute top-24 left-1/2 z-raised flex -translate-x-1/2 flex-wrap justify-center gap-2">
              {owed.map((c) => (
                <Pill key={c.id} variant="primary" onClick={() => setLevelling(c.id)}>
                  Level Up {c.name}
                </Pill>
              ))}
            </div>
          </Presence>
          <Presence show={on && Boolean(levelHero?.sheet && latest)} motion="fade" asChild>
            {levelHero?.sheet && latest && (
              <div className="absolute inset-0 z-panel flex items-center justify-center bg-black/60 p-3">
                <LevelUp
                  hero={levelHero.name}
                  portrait={portrait(levelHero)}
                  sheet={levelHero.sheet}
                  compact={compact}
                  className={compact ? "max-h-full w-[min(480px,100%)]" : "max-h-[88%] w-[min(600px,100%)]"}
                  onClose={() => setLevelling(null)}
                  onTake={async (choices) => {
                    const refused = await props.onLevel?.(latest._id, levelHero.id, choices)
                    if (!refused) setLevelling(null)
                    return refused
                  }}
                />
              </div>
            )}
          </Presence>
          <Presence show={on && Boolean(reaction && offerShown)} motion="rise" asChild>
            {reaction && (
              <ReactionCard
                key={`${reaction.npc}:${reaction.expiresAt}`}
                reaction={reaction.offer.id}
                hero={offerHero?.name ?? "A hero"}
                portrait={offerHero ? portrait(offerHero) : undefined}
                expiresAt={reaction.expiresAt}
                text={reaction.text}
                mine={offerMine}
                answered={reaction.answer !== undefined}
                compact={compact}
                className={`absolute left-1/2 z-raised -translate-x-1/2 ${compact ? "bottom-[50px] w-[min(430px,calc(100%-24px))]" : "bottom-[118px] w-[min(520px,calc(100%-40px))]"}`}
                onTake={() => react(true)}
                onPass={() => react(false)}
              />
            )}
          </Presence>
          <Presence show={on && Boolean(!past && !ended && !busy && !reading && !mode && turn && !offerWaits && !(autoContinue && continueKey && continued !== continueKey))} motion="rise" asChild>
            {turn && (
              <div className={`${panel} absolute bottom-28 left-1/2 z-raised -translate-x-1/2 p-6 text-center`}>
                <p className={`${passed ? "mb-1" : "mb-3"} font-serif text-xl`}>{actor ? `${actor.name}’s Turn` : "The Round Is Complete"}</p>
                {passed && <p className="mb-3 font-serif text-sm text-roll-failure">Passed Over · {passed}</p>}
                {/* Another player's hero acts from their own screen. */}
                {actor?.type === "pc" && !aiActor ? (
                  <p className="text-sm text-muted-foreground">Waiting for {actor.name.split(" ")[0]}</p>
                ) : (
                  <Button variant="epic" size="xs" className="py-1.5 text-sm" onClick={() => props.onContinue(turn._id)}>
                    {!actor ? "Continue adventure" : aiActor ? `Continue ${actor.name.split(" ")[0]}'s turn` : "Continue NPC turn"}
                  </Button>
                )}
              </div>
            )}
          </Presence>
          <Presence show={on && (open === "journal" || open === "chat")} motion="right" asChild>
            <Journal
              turns={journal}
              chat={chat}
              compact={compact}
              onClose={() => setOpen(null)}
              tab={open === "chat" ? "chat" : "story"}
              onTab={(tab) => setOpen(tab === "chat" ? "chat" : "journal")}
              onChat={props.onChat}
            />
          </Presence>
          <Presence show={on && open === "map" && Boolean(city)} motion="pop" asChild>
            {city && <CityMapPanel map={city.map} trail={city.trail} compact={compact} onClose={() => setOpen(null)} />}
          </Presence>
          <Presence show={on && Boolean(card)} motion="right" asChild>
            {card && (
              <CharacterCard
                info={card}
                compact={compact}
                onClose={() => setCardId(null)}
                onOrders={(changed) => {
                  if (latest && cardCharacter) void props.onOrders?.(latest._id, cardCharacter.id, { ...cardOrders, ...changed })
                }}
              />
            )}
          </Presence>
          <Presence show={on && open === "feedback" && Boolean(props.onFeedback)} motion="right" asChild>
            {props.onFeedback && (
              <FeedbackPanel
                // A star on the closing panel reopens it as the ending's form.
                key={`${feedbackStart.kind}:${feedbackStart.rating ?? 0}`}
                start={feedbackStart}
                context={{
                  adventure: save.adventure.title,
                  plan: save.adventure.planId,
                  adventureId: String(save.adventure._id ?? ""),
                  encounter: shown?.encounterId ?? "",
                  turn: shown?._id ?? "",
                  turnOrder: String(shown?.order ?? ""),
                  gm: [save.provider, save.model].filter(Boolean).join(" "),
                }}
                compact={compact}
                gate={props.feedbackGate}
                onSend={props.onFeedback}
                onSent={(kind) => kind === "ending" && setEndingSent(true)}
                onClose={closePanel}
              />
            )}
          </Presence>
          <Presence show={on && open === "settings"} motion="drop" asChild>
            <section className={`${panel} absolute right-10 top-24 z-panel w-72 p-6`}>
              <Heading variant="h2" className="mb-4">Scene Settings</Heading>
              <div className="mb-4 flex gap-2">
                <Pill active={!auto} onClick={() => setAuto(false)}>
                  Step through
                </Pill>
                <Pill active={auto} onClick={() => setAuto(true)}>
                  Auto
                </Pill>
              </div>
              <div className="flex gap-2">
                {(["balanced", "high", "ultra"] as const).map((t) => (
                  <Pill
                    key={t}
                    disabled={!stage}
                    active={stage?.tier === t}
                    onClick={() => {
                      stage?.setTier(t)
                      redraw((n) => n + 1)
                    }}
                  >
                    {t}
                  </Pill>
                ))}
              </div>
              <Pill
                className="mt-4"
                disabled={!stage}
                onClick={() => {
                  if (stage) {
                    stage.motion = !stage.motion
                    redraw((n) => n + 1)
                  }
                }}
              >
                Motion {stage?.motion ? "on" : "off"}
              </Pill>
              <Pill
                className="ml-2"
                onClick={() => {
                  setSoundOn(!sound)
                  setSound(!sound)
                }}
              >
                Sound {sound ? "on" : "off"}
              </Pill>
              {narratorAvailable() && (
                <>
                  <Heading variant="h6" as="h3" className="mb-2 mt-5 text-muted-foreground">Narrator</Heading>
                  <div className="flex flex-wrap gap-2">
                    <Pill active={!narratorVoice} onClick={() => setNarratorVoice(null)}>
                      Off
                    </Pill>
                    {NARRATOR_VOICES.map((v) => (
                      <Pill key={v.id} active={narratorVoice === v.id} onClick={() => setNarratorVoice(v.id)}>
                        {v.label}
                      </Pill>
                    ))}
                  </div>
                </>
              )}
              <Pill className="mt-2" onClick={() => setHidden(true)}>
                Hide UI
              </Pill>
            </section>
          </Presence>
        </>
      )}
      <Presence show={hidden} motion="rise" asChild>
        <Pill className="absolute bottom-4 right-4 z-overlay" onClick={() => setHidden(false)}>
          Show interface · H
        </Pill>
      </Presence>
      {props.children}
    </StageHud>
  )
}

// Development only, with VITE_D20_TRACE: each shot, where the cast stands for it, and where the camera has got to once
// it settles, with the nearest of them, so a lens inside someone shows in the log.
function traceShot(stage: Stage, paragraph: number, which: unknown, take: Take | null, cast: readonly { id: string; x: number; z: number; height: number }[]) {
  if (!import.meta.env.DEV || !import.meta.env.VITE_D20_TRACE) return
  const r = (n: number) => Math.round(n * 100) / 100
  const who = cast.map((c) => `${c.id}@${r(c.x)},${r(c.z)} h${r(c.height)}${stage.isDown(c.id) ? " down" : ""}`).join("; ")
  traceLine(`shot p${paragraph} ${take?.label ?? (typeof which === "string" ? which : "view")} ${JSON.stringify(take?.shot ?? which)} | ${who}`)
  setTimeout(() => {
    const p = stage.camera.position
    const near = cast.map((c) => ({ id: c.id, d: Math.hypot(c.x - p.x, c.z - p.z) })).sort((a, b) => a.d - b.d)[0]
    traceLine(`camera p${paragraph} at ${r(p.x)},${r(p.y)},${r(p.z)} nearest ${near?.id} ${near ? r(near.d) : "-"}m`)
  }, 2500)
}

// While a scene's files download: a quiet pulse, and a bar once the wait looks longer than a few seconds.
function SceneLoading({ progress }: { progress: number | null }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <div className="font-display text-sm tracking-[0.2em] text-[#f3d6a6] uppercase animate-pulse">Loading</div>
      {progress !== null && (
        <div className="h-[3px] w-48 overflow-hidden bg-black/50 shadow-[0_0_0_1px_#0008]" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
          <div className="h-full bg-[#f3d6a6] transition-[width] duration-500 ease-out" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      )}
    </div>
  )
}
