import { metres } from "@d20/gm-core/sheet/space"
import type { FeatureBeat, RollBeat, StoryBeat } from "@d20/gm-core/story/beats"
import { nameOf, rollSentence, storyNames, storyParagraphs } from "@d20/gm-core/story/render"
import { conditionLabel } from "@d20/gm-core/utils/condition-label"
import { findCurrentActor, hasFled, isDead } from "@d20/gm-core/utils/turn-actors"
import type { Stage } from "@d20/stage"
import { readingSeconds } from "@d20/stage/beats"
import type { StagingShot } from "@d20/stage/spec/staging"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useSheetView, useSheetViews } from "@/components/adventure/use-sheet-view"
import { CharacterCard } from "@/components/stage/character-card"
import { CityMapInset, CityMapPanel } from "@/components/stage/city-map"
import { setSoundOn, soundOn } from "@/components/stage/dice-sound"
import { EndingRating, FeedbackButton, FeedbackPanel, type FeedbackStart } from "@/components/stage/feedback"
import { IconButton, Pill, panel, StageHud, useCompact } from "@/components/stage/hud"
import { type ChatLine, Journal, type JournalTurn } from "@/components/stage/journal"
import { Narration } from "@/components/stage/narration"
import { type CardCharacter, type CardMode, type CardRoll, type CardSuggestion, PromptCard } from "@/components/stage/prompt-card"
import { ReactionCard, useExpired } from "@/components/stage/reaction-card"
import { heroReactions, type StandingOrders } from "@/components/stage/reaction-view"
import { ROLL_SECONDS } from "@/components/stage/roll-result"
import { featureView, type RollView, rollView } from "@/components/stage/roll-view"
import { Bubbles, Plate } from "@/components/stage/stage-dialogue"
import { passedOver, passedWords, standingOf } from "@/components/stage/standing"
import { TurnOrder } from "@/components/stage/turn-order"
import { useStage } from "@/components/stage/use-stage"
import { Button } from "@/components/ui/button"
import { cityMapTrail } from "@/lib/citymap"
import type { FeedbackDraft } from "@/lib/feedback/shared"
import type { Save } from "../runtime/store"
import { characterInfo } from "./character-info"
import type { FigureArt } from "./figures"
import { castIdFor, partyScene, portraitFor, sceneFor } from "./scenes"

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
// How fast someone comes on, in metres a second, by the pace the story gives their entrance.
const PACE = { walk: 1.2, hurry: 2.4, sneak: 0.8 } as const
// The shot for an aim, framed on where everyone stands now.
function shotFor(stage: Stage, aim: Aim, heroes: string[]): StagingShot | string | null {
  if ("subject" in aim) return { subject: aim.subject, distance: 4.5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 }
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
    return { subject: target, distance: 6, angle: 25, height: 1.8, lookHeight: 1.2, fov: 48 }
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
// GM resolving a player's action.
function playing(turnId: string | undefined, actor: Character | undefined, ai: boolean, portrait: (c: Character) => string | undefined): CardMode {
  if (!actor || (actor.type !== "npc" && !ai)) return { kind: "thinking", note: "The GM is resolving the action…" }
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
function Painting({ src, shown, onLoad, onError }: { src: string; shown: boolean; onLoad: () => void; onError: () => void }) {
  const img = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const el = img.current
    if (!el || !shown || matchMedia("(prefers-reduced-motion: reduce)").matches) return
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
  const [paragraph, setParagraph] = useState(0)
  const [auto, setAuto] = useState(false)
  const [sound, setSound] = useState(soundOn)
  const [reading, setReading] = useState(true)
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
  const turn = kept && (reading || held?.turn === kept._id) ? kept : latest
  const turnRef = useRef(turn)
  turnRef.current = turn
  useEffect(() => {
    if (turn) setOnScreen(turn._id)
  }, [turn?._id])
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
  const closingNow = closing > 0 && (newTurn || (reading && paragraph < closing))
  const shown = closingNow ? before : turn
  // With no save, the stage shows the fallback encounter. Encounters without an authored scene play in story view.
  // In a game the scene holds the actual party, keyed by value so a reloaded save does not rebuild the stage. Each round
  // lists its characters by initiative, so the party is keyed in a fixed order: a new round neither rebuilds the stage
  // nor moves heroes between places in the line.
  const authored = sceneFor(shown?.encounterId ?? props.fallbackEncounter ?? "the-gates-of-kordavos")
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
  const cardSheet = useSheetView(cardCharacter?.type === "pc" ? cardCharacter.sheet : undefined, cardCharacter?.hitPoints, cardCharacter?.spellSlots, cardCharacter?.spellEffects)
  // A hero this player plays shows their standing orders on the card, as the current turn keeps them.
  const cardOrders = latest?.characters.find((c) => c.id === cardCharacter?.id)?.standingOrders
  const ordersFor =
    props.onOrders && cardCharacter?.type === "pc" && cardCharacter.controlledBy !== "ai" && props.controls(cardCharacter) && cardSheet
      ? heroReactions(cardSheet.spellcasting?.prepared, cardOrders)
      : undefined
  const card = cardCharacter ? characterInfo(cardCharacter, portrait(cardCharacter), cardSheet, standingOf(cardCharacter, cardSheet), ordersFor) : null
  // Every hero's sheet, for their hit points and Armor Class in the turn order and the party row.
  const sheets = useSheetViews(shown?.characters ?? [])
  const specs = useMemo(() => (scene ? { set: scene.set, staging: scene.staging, tier: "balanced" as const } : null), [scene])
  const { stage, stageRef, status: loading, error: stageError } = useStage(containerRef, specs)
  const actor = turn ? findCurrentActor(turn.characters) : undefined
  // Who the turn passed over to reach the actor, because they cannot act, and why.
  const passed = turn ? passedWords(passedOver(turn.characters, actor)) : ""
  // Read again only when the story itself changes, not on every save, such as positions after a walk.
  const told = turn ? JSON.stringify([turn._id, turn.story]) : ""
  const paragraphs = useMemo(() => story(turn), [told])
  const text = useMemo(() => paragraphs.map((p) => p.text), [paragraphs])
  // The paragraph's dice roll, for the narration to show: the numbers from the roll, the names and how a dying hero
  // stands from the turn, the roller's portrait from the scene. Or the class feature it tells.
  const rolled = paragraphs[paragraph]?.roll
  const roller = rolled ? turn?.characters.find((c) => c.id === rolled.character) : undefined
  const rollerPortrait = roller ? portrait(roller) : undefined
  const roll = useMemo<RollView | undefined>(() => (rolled && turn ? rollView(rolled, turn.characters, rollerPortrait) : undefined), [rolled, turn?.characters, rollerPortrait])
  const used = paragraphs[paragraph]?.feature
  const feature = useMemo(() => (used && turn ? featureView(used, turn.characters) : undefined), [used, turn?.characters])
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
  const beats = useMemo((): { view: View; speech: { id: string; text: string }[] }[] => {
    if (!stage) return []
    return paragraphs.map((p) => {
      // One bubble a speaker: lines said in a row join, or they would stack over the same head.
      const speech = p.beats.reduce<{ id: string; text: string }[]>((all, b) => {
        const id = b.kind === "line" ? castOf(b.speaker) : undefined
        if (!id || b.kind !== "line") return all
        const said = all.find((l) => l.id === id)
        if (said) said.text = `${said.text} ${b.text}`
        else all.push({ id, text: b.text })
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
  const spotlit = reading ? shown?.characters.find((c) => c.id === tellerId) : actor
  // Everyone who speaks in the paragraph gets a bubble, and the first speaker a portrait plate.
  const speech = useMemo(
    () =>
      reading && stage
        ? (beats[paragraph]?.speech ?? []).flatMap((l) => {
            const cast = stage.cast.find((c) => c.id === l.id)
            return cast ? [{ cast, text: l.text }] : []
          })
        : [],
    [stage, beats, paragraph, reading]
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
  // Where the engine has each character, in the stage's metres, by cast id, with the character it stands for. Ambient
  // extras, and anyone the engine has not placed, stand where the staging puts them.
  const spots = useMemo(() => {
    const out = new Map<string, { character: string; at: [number, number] }>()
    for (const c of shown?.characters ?? []) {
      const id = stage && c.position && castIdFor(stage.cast, c)
      if (id && c.position) out.set(id, { character: c.id, at: [metres(c.position.x), metres(c.position.y)] })
    }
    return out
  }, [stage, shown?.characters])
  // Entrances the scene ties to the narration: offstage until the paragraph that brings them on ("the cabin door
  // opened"), then they walk on from the door to where the engine has them. Narration without the phrase finds them
  // in place. An action that brings someone on from a place does the same, at its own paragraph.
  const cues = useMemo(() => {
    const authored = (stage?.staging?.entrances ?? []).map((e) => ({ ...e, speed: 0.9, at: text.findIndex((p) => p.toLowerCase().includes(e.when.toLowerCase())) }))
    const told = paragraphs.flatMap((p, at) =>
      p.beats.flatMap((b) => {
        const cast = b.kind === "action" && b.enters && stage?.set.marks[b.enters.from] ? castOf(b.actor) : undefined
        return cast && b.kind === "action" && b.enters
          ? [{ cast, from: b.enters.from as string | [number, number], when: "", shot: undefined as string | undefined, speed: PACE[b.enters.pace ?? "walk"], at }]
          : []
      })
    )
    return [...authored.filter((e) => !told.some((t) => t.cast === e.cast)), ...told]
  }, [stage, text, paragraphs, castOf])
  const arriving = reading ? cues.find((e) => e.at === paragraph) : undefined
  useEffect(() => {
    if (!stage) return
    for (const e of cues) {
      const home = stage.staging?.cast.find((c) => c.id === e.cast)
      // A place is read as a mark: a mark can share its name with the one who stands there, as the Owlbear's does.
      const spot = (at: string | number[] | undefined) => (typeof at === "string" ? stage.set.marks[at]?.at : at) as [number, number] | undefined
      const to = spots.get(e.cast)?.at ?? spot(home?.at)
      const from = spot(e.from)
      if (!home || !to || !from) continue
      if (reading && e.at >= 0 && paragraph < e.at) {
        stage.placeCast(e.cast, from)
        stage.setOnStage(e.cast, false)
      } else if (!stage.isOnStage(e.cast)) {
        stage.setOnStage(e.cast, true)
        if (reading && paragraph === e.at) void stage.moveCast(e.cast, to, { speed: e.speed }).then(() => stage.faceCast(e.cast, home.facing))
        else stage.placeCast(e.cast, to, home.facing)
      }
    }
  }, [stage, cues, spots, reading, paragraph])
  // Who the game has taken out of this encounter, by cast id: the dead and those who fled. A round is built without
  // them, so each character's last appearance in the encounter says how they left.
  const gone = useMemo(() => {
    const out = new Map<string, "dead" | "fled">()
    if (!stage || !save || !turn) return out
    const rounds = save.turns.filter((t) => t.encounterId === turn.encounterId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    for (const t of rounds)
      for (const c of t.characters) {
        const id = castIdFor(stage.cast, c)
        if (!id) continue
        // A hero who is dying or Stable stays on the stage, down.
        if (isDead(c)) out.set(id, "dead")
        else if (hasFled(c)) out.set(id, "fled")
        else out.delete(id)
      }
    return out
  }, [stage, save, turn])
  // Someone who goes while the turn is being told leaves at the paragraph that came with the news: the first new one
  // that names them. Anyone already gone when the turn was opened is simply not there.
  const [leftAt, setLeftAt] = useState<Record<string, number>>({})
  const leaving = useRef<{ turn?: string; paragraphs: number; out: Set<string> }>({ paragraphs: 0, out: new Set() })
  useEffect(() => {
    const old = leaving.current
    const sameTurn = old.turn === turn?._id
    const fresh = sameTurn ? [...gone.keys()].filter((id) => !old.out.has(id)) : []
    setLeftAt((was) => {
      if (sameTurn && !fresh.length) return was
      const next = sameTurn ? { ...was } : {}
      // The first new paragraph with a beat by them or aimed at them.
      const involves = (id: string) => (b: StoryBeat) => (b.kind === "action" ? [b.actor, b.target] : b.kind === "line" ? [b.speaker, b.to] : []).some((who) => castOf(who) === id)
      for (const id of fresh) {
        const named = paragraphs.findIndex((p, i) => i >= old.paragraphs && p.beats.some(involves(id)))
        next[id] = named >= 0 ? named : Math.min(old.paragraphs, Math.max(0, text.length - 1))
      }
      return next
    })
    leaving.current = { turn: turn?._id, paragraphs: text.length, out: new Set(gone.keys()) }
  }, [gone, text, turn?._id, stage])
  // Exits, the mirror of entrances: a fall or a run the staging ties to the narration, and anyone the game has taken
  // out. They stay until their paragraph. Then a runner makes for their way out and is gone, and the rest lie down.
  const exits = useMemo(() => {
    const authored = stage?.staging?.exits ?? []
    const out = new Map<string, { run: boolean; to?: string | [number, number]; via?: (string | [number, number])[]; lands?: string | [number, number]; shot?: string; at: number }>()
    for (const e of authored)
      if (e.when) out.set(e.cast, { run: Boolean(e.to), to: e.to, via: e.via, lands: e.lands, shot: e.shot, at: text.findIndex((p) => p.toLowerCase().includes(e.when!.toLowerCase())) })
    for (const [id, how] of gone) {
      const way = authored.find((e) => e.cast === id)
      if (!out.has(id)) out.set(id, { run: how === "fled", to: way?.to, via: way?.via, lands: way?.lands, shot: way?.shot, at: leftAt[id] ?? -1 })
    }
    return out
  }, [stage, text, gone, leftAt])
  // The exit this paragraph shows, when its staging says where to watch it from.
  const departing = reading ? [...exits.values()].find((e) => e.at === paragraph && e.shot) : undefined
  const ran = useRef(new Set<string>())
  const ranOn = useRef(stage)
  useEffect(() => {
    if (!stage) return
    if (ranOn.current !== stage) ran.current.clear()
    ranOn.current = stage
    const falls: ReturnType<typeof setTimeout>[] = []
    for (const [id, e] of exits) {
      const home = stage.staging?.cast.find((c) => c.id === id)
      if (reading && e.at >= 0 && paragraph < e.at) {
        // Not yet: back on their feet in their place, as when the reader steps back.
        const at = spots.get(id)?.at ?? home?.at
        if ((ran.current.delete(id) || stage.isDown(id)) && at) stage.placeCast(id, at, home?.facing)
        stage.setOnStage(id, true)
        stage.setDown(id, false)
      } else if (!e.run) {
        // On their paragraph they stand a moment longer, so the camera is there to see them go down. Reading on
        // before that finds them already down.
        if (!(reading && paragraph === e.at)) stage.setDown(id, true, true, e.lands)
        else if (!stage.isDown(id)) falls.push(setTimeout(() => stage.setDown(id, true, false, e.lands), FALL_DELAY))
      } else if (stage.isOnStage(id) && !ran.current.has(id)) {
        ran.current.add(id)
        if (!(reading && paragraph === e.at && e.to)) stage.setOnStage(id, false)
        else {
          const legs = [...(e.via ?? []), e.to].map((leg) => stage.point(leg))
          // Reading on does not cut the run short. Stepping back, or a new scene, does.
          const running = () => ranOn.current === stage && ran.current.has(id)
          void (async () => {
            for (const leg of legs) for (const p of stage.route(id, leg, 40)) if (running()) await stage.moveCast(id, [p.x, p.z], { speed: 2.4 })
            if (running()) stage.setOnStage(id, false)
          })()
        }
      }
    }
    return () => falls.forEach(clearTimeout)
  }, [stage, exits, spots, reading, paragraph])
  // A new stage: loops held and its opening view, before the camera frames anyone.
  useEffect(() => {
    if (!stage) return
    for (const loop of stage.loops.values()) loop.paused = true
    if (stage.staging?.shot) stage.shot(stage.staging.shot, { instant: true })
    const timer = setInterval(() => redraw((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [stage])
  // Everyone where the engine has them. A new stage, or a new encounter on it, places them at once. After that, someone
  // the engine moves walks there from where they are drawn, when the reader reaches the paragraphs of their latest
  // step, or at once when the story is not being read. A newer move takes over a walk under way. Someone offstage
  // waiting for an entrance is left to it.
  const drawn = useRef<{ stage: Stage; encounter: string; at: Map<string, string>; walks: Map<string, number> } | null>(null)
  useEffect(() => {
    // A stage being replaced for the next encounter must not take the new encounter's positions.
    if (!stage || !shown || stageRef.current !== stage) return
    const encounter = `${shown.adventureId}:${shown.encounterId}`
    const fresh = drawn.current?.stage !== stage || drawn.current.encounter !== encounter
    if (fresh) drawn.current = { stage, encounter, at: new Map(), walks: new Map() }
    const d = drawn.current!
    for (const [id, { character, at: to }] of spots) {
      const key = to.join()
      if (d.at.get(id) === key) continue
      if (fresh || !stage.isOnStage(id)) {
        d.at.set(id, key)
        if (stage.isOnStage(id)) stage.placeCast(id, to)
        continue
      }
      // The first paragraph of the character's latest step in the story on screen.
      let from = paragraphs.findLastIndex((p) => p.beats[0]?.by.character === character)
      while (from > 0 && paragraphs[from - 1].beats[0]?.by.character === character && paragraphs[from - 1].beats[0]?.by.step === paragraphs[from].beats[0]?.by.step) from--
      if (reading && paragraph < from) continue
      d.at.set(id, key)
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
      })().catch((error) => onError(`Could not draw the move: ${String(error)}`))
    }
  }, [stage, stageRef, shown, spots, paragraphs, reading, paragraph, onError])
  // Each paragraph moves the camera to fit it: its first speaker, someone making an entrance, whoever it is about, or
  // the place it describes. The first view on a new stage is a cut, not a glide from its opening view.
  const framed = useRef<Stage | null>(null)
  useEffect(() => {
    if (!stage || !reading) return
    const cut = framed.current !== stage
    framed.current = stage
    const go = (which: Parameters<Stage["shot"]>[0]) => stage.shot(which, { instant: cut })
    if (speech.length) return void go({ subject: speech[0].cast.id, distance: 5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 })
    if (departing?.shot) return void go(departing.shot)
    if (arriving) {
      if (arriving.shot) return void go(arriving.shot)
      // Facing the way they come: from beyond their place, looking back at where they enter.
      const mark = (at: string | number[] | undefined) => (typeof at === "string" ? stage.set.marks[at]?.at : at)
      const home = mark(stage.staging?.cast.find((c) => c.id === arriving.cast)?.at)
      const from = mark(arriving.from)
      if (home && from) {
        const [fx, fz] = from
        const [hx, hz] = home
        const d = Math.hypot(hx - fx, hz - fz) || 1
        const k = 3.6 / d
        return void go({ position: [hx + (hx - fx) * k, 1.75, hz + (hz - fz) * k], target: [(fx + hx) / 2, 1.3, (fz + hz) / 2], fov: 50 })
      }
      return void go({ subject: arriving.cast, distance: 5.5, angle: 12, height: 1.8, lookHeight: 1.2, fov: 48 })
    }
    const view = beats[paragraph]?.view
    if (!view) return
    const shot = shotFor(stage, view, heroes.current)
    if (shot) go(shot)
  }, [stage, speech, departing, arriving, beats, paragraph, reading])
  // What labelled paragraphs do on stage: effects and objects, each played once when its paragraph is first read.
  // An attack in a hero's reply waits for the roll that decides it, and plays after the roll as a hit or a miss, unless
  // the roll's outcome shows the attack itself. After a roll in the same step, an effect misses when its actor failed
  // the roll or its target made it. No one walks by a beat: where everyone stands is the engine's.
  const staged = useMemo(() => {
    const out = new Map<number, { key: string; beat: Extract<StoryBeat, { kind: "action" }>; effect: boolean; miss: boolean }[]>()
    const all = paragraphs.flatMap((p, i) => p.beats.map((beat) => ({ beat, at: i })))
    const same = (a: StoryBeat, b: StoryBeat) => a.by.step === b.by.step && a.by.character === b.by.character
    const add = (at: number, entry: { key: string; beat: Extract<StoryBeat, { kind: "action" }>; effect: boolean; miss: boolean }) => out.set(at, [...(out.get(at) ?? []), entry])
    // Where a beat's effect plays, and whether it misses: undefined when it does not play yet, or not at all.
    const effectAt = (beat: Extract<StoryBeat, { kind: "action" }>, at: number, i: number): { at: number; miss: boolean } | undefined => {
      let j = i - 1
      while (j >= 0 && same(all[j].beat, beat) && all[j].beat.kind !== "roll") j--
      const before = j >= 0 && same(all[j].beat, beat) ? all[j].beat : undefined
      if (before?.kind === "roll") return { at, miss: before.character === beat.actor ? !before.success : before.character === beat.target && before.success }
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
        return { at: all[k + 1]?.at ?? all[k].at, miss: !roll.success }
      }
      // A roll the player has still to make decides it later.
      if (k >= all.length && turn?.characters.find((c) => c.id === beat.actor)?.rollRequired) return undefined
      return { at, miss: false }
    }
    for (const [i, { beat, at }] of all.entries()) {
      if (beat.kind !== "action") continue
      const key = `${turn?._id}:${i}`
      if (beat.object) add(at, { key: `${key}:own`, beat, effect: false, miss: false })
      const fx = beat.effect ? effectAt(beat, at, i) : undefined
      if (fx) add(fx.at, { key: `${key}:fx`, beat, effect: true, miss: fx.miss })
    }
    return out
  }, [paragraphs, turn?._id, turn?.characters])
  const played = useRef(new Set<string>())
  // The paragraph on screen, so an effect waiting on the camera is dropped once the reader moves on.
  const showing = useRef("")
  useEffect(() => {
    const here = reading && turn ? `${turn._id}:${paragraph}` : ""
    showing.current = here
    if (!stage || !here || !turn || stageRef.current !== stage) return
    for (const { key, beat: b, effect, miss } of staged.get(paragraph) ?? []) {
      if (played.current.has(key)) continue
      const actor = castOf(b.actor)
      if (!actor || !stage.isOnStage(actor)) continue
      played.current.add(key)
      const target = castOf(b.target)
      // Once the camera has arrived, so the effect is seen from where the paragraph frames it.
      void Promise.race([stage.shotSettled(), new Promise((r) => setTimeout(r, 2600))]).then(() => {
        if (showing.current !== here) return
        if (effect && b.effect) void stage.effect(b.effect.kind, actor, target, b.effect.element, { miss })
        else if (b.object) void stage.prop(b.object.kind, actor, castOf(b.object.to))
      })
    }
  }, [stage, stageRef, reading, paragraph, staged, turn, castOf])
  useEffect(() => {
    if (!auto || !reading || busy || !text.length) return
    // A roll stays up until the die has landed and the verdict has had a moment.
    const seconds = paragraphs[paragraph]?.roll ? ROLL_SECONDS + 1.5 : readingSeconds(text[paragraph] ?? "")
    const timer = setTimeout(() => (paragraph < text.length - 1 ? setParagraph((n) => n + 1) : setReading(false)), seconds * 1000)
    return () => clearTimeout(timer)
  }, [auto, reading, busy, text, paragraphs, paragraph])
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
    // Narration that arrives while an earlier paragraph is still being read waits its turn.
    setParagraph((p) => (sameTurn && readingRef.current && firstChanged > p ? p : Math.max(0, firstChanged)))
    setReading(true)
  }, [text, paragraphs, turn?._id])
  useEffect(() => {
    setDraft("")
  }, [turn?._id, actor?.id])
  const focus = useCallback(
    (id: string) => {
      const characters = turnRef.current?.characters
      const character = characters?.find((c) => c.id === id) ?? characters?.find((c) => stage && castIdFor(stage.cast, c) === id)
      if (!character) return
      const sid = stage && castIdFor(stage.cast, character)
      if (stage && sid && focused.current !== id) {
        stage.shot({ subject: sid, distance: 4, angle: 18, height: 1.6, lookHeight: 1.1, fov: 40 })
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
      if ((e.target as HTMLElement).matches?.("input,textarea,select")) return
      if (e.key.toLowerCase() === "h") setHidden((h) => !h)
      if (e.key === "Escape") {
        setOpen(null)
        setCardId(null)
        onEscape?.()
      }
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
    stage.shot({ subject: sid, distance: Math.min(3.6, Math.max(2.4, h * 1.9)), angle: 18, height: h * 0.9 + 0.15, lookHeight: h * 0.62, fov: 45 })
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
  // Heroes the AI plays take their turns like NPCs, through Continue.
  const aiActor = actor?.type === "pc" && actor.controlledBy === "ai"
  const cardActor = aiActor || !actor || !props.controls(actor) ? null : (party.find((c) => c.id === actor.id) ?? null)
  const rr = actor?.rollRequired
  // A finished adventure ends on its final narration. Its last turn has characters but takes no more actions.
  const finished = save?.adventure.status === "completed"
  const ended = finished && turn === latest
  // Suggested replies are asked for once per hero's turn, as soon as it comes up with the game on screen, so they are
  // often there once the narration has been read. A request that fails offers none.
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
    let request = asked.current.get(holdKey)
    if (!request) {
      request = (suggestRef.current?.(holdTurn, holdActor) ?? Promise.resolve([])).catch(() => [])
      asked.current.set(holdKey, request)
    }
    void request.then((list) => live && setOffered({ key: holdKey, list }))
    return () => {
      live = false
    }
  }, [holdKey, holdTurn, holdActor])
  // The engine's answer to the roll on the card, once it is in: the roll beat after the story the roll was made on.
  const heldTurn = held ? save?.turns.find((t) => t._id === held.turn) : undefined
  const answer = held && heldTurn?.story.slice(held.from).find((b): b is RollBeat => b.kind === "roll" && b.character === held.actor.id)
  const result = useMemo(() => (answer && heldTurn ? rollView(answer, heldTurn.characters) : undefined), [answer, heldTurn?.characters])
  let mode: CardMode | null = null
  if (held) mode = { kind: "roll", roll: held.roll, made: held.dice, resolving: props.busy, ...(result ? { result } : {}) }
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
    !finished && !busy && !offerHolds && (ahead || (!unseen && !mode)) && !props.overlay && latest && !(next?.type === "pc" && !nextAi)
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
  // Played on its own, the card moves on once the verdict has had a moment and the GM has answered.
  useEffect(() => {
    if (!auto || !held || props.busy) return
    const timer = setTimeout(() => leaveRef.current(), Math.max(1500, held.at + (ROLL_SECONDS + 1.5) * 1000 - Date.now()))
    return () => clearTimeout(timer)
  }, [auto, held, props.busy])
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
  return (
    <StageHud
      containerRef={containerRef}
      backdrop={!scene && save && shown ? <StoryArt src={`/stage/art/${save.adventure.planId}/${shown.encounterId}.webp`} /> : undefined}
      title={{ eyebrow: (save?.adventure.title ?? "").toUpperCase(), text: shown?.title ?? "" }}
      location={{ name: scene?.location ?? "Story View", status: props.status }}
      views={stage ? Object.entries(stage.shots).map(([id, s]) => ({ id, label: s.label ?? id })) : []}
      activeView={stage?.activeShot ?? null}
      onView={(id) => stage?.shot(id)}
      hidden={hidden || !save || props.overlay}
      map={city && <CityMapInset className="h-[112px] w-[200px]" map={city.map} trail={city.trail} onOpen={() => setOpen("map")} />}
      compact={compact}
      actions={
        <>
          {props.actions}
          {city && <Pill onClick={() => setOpen(open === "map" ? null : "map")}>Map</Pill>}
          <Pill onClick={() => setOpen(open === "journal" ? null : "journal")}>Journal</Pill>
          {props.onChat && (
            <Pill active={unread > 0} onClick={() => setOpen(open === "chat" ? null : "chat")}>
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
      {save && !hidden && !props.overlay && (
        <>
          {stage && speech.length > 0 && (
            <Bubbles
              compact={compact}
              moving={() => stage.cameraMoving}
              bubbles={speech.map((l, i) => ({ key: paragraph * 100 + i, anchor: () => stage.project(l.cast.id), text: l.text, named: true }))}
            />
          )}
          {!scene && voice && <Plate compact={compact} line={{ key: paragraph, side: "right", ...voice }} />}
          <TurnOrder
            order={(shown?.characters ?? []).map((c) => {
              const standing = standingOf(c, sheets[c.id])
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
          <div
            className={`pointer-events-none absolute z-20 ${!scene && reading ? "left-1/2 top-1/2 w-[min(680px,75vw)] -translate-x-1/2 -translate-y-1/2" : compact ? "bottom-[118px] left-8 w-[min(460px,45vw)]" : "bottom-[84px] left-8 w-[min(460px,35vw)]"}`}
          >
            {reading && (
              <Narration
                heading={`Round ${shown?.order} · ${shown?.title}`}
                text={text[paragraph]}
                roll={roll}
                feature={feature}
                index={paragraph}
                count={text.length}
                compact={compact}
                step={!auto}
                onReplay={() => {
                  setParagraph(0)
                  setReading(true)
                }}
                onBack={() => setParagraph((n) => Math.max(0, n - 1))}
                onNext={() => setParagraph((n) => Math.min(text.length - 1, n + 1))}
                onSkip={() => setReading(false)}
                onContinue={() => (paragraph < text.length - 1 ? setParagraph((n) => n + 1) : setReading(false))}
              />
            )}
            {!reading && !held && (
              <Pill
                className="pointer-events-auto"
                onClick={() => {
                  setParagraph(0)
                  setReading(true)
                }}
              >
                Read turn
              </Pill>
            )}
          </div>
          {mode && (!reading || busy || held) && (
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
            />
          )}
          {ended && !busy && !reading && (
            <div className={`${panel} absolute bottom-28 left-1/2 z-30 -translate-x-1/2 p-6 text-center`}>
              <div className="text-[10px] tracking-[.3em] text-stage-gold">THE END</div>
              <p className="mt-2 mb-4 font-display text-2xl">{save.adventure.title}</p>
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
          )}
          {reaction && offerShown && (
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
              className={`absolute left-1/2 z-30 -translate-x-1/2 ${compact ? "bottom-[50px] w-[min(430px,calc(100%-24px))]" : "bottom-[118px] w-[min(520px,calc(100%-40px))]"}`}
              onTake={() => react(true)}
              onPass={() => react(false)}
            />
          )}
          {!ended && !busy && !reading && !mode && turn && !offerWaits && !(autoContinue && continueKey && continued !== continueKey) && (
            <div className={`${panel} absolute bottom-28 left-1/2 z-30 -translate-x-1/2 p-6 text-center`}>
              <p className={`${passed ? "mb-1" : "mb-3"} font-serif text-xl`}>{actor ? `${actor.name}’s Turn` : "The Round Is Complete"}</p>
              {passed && <p className="mb-3 font-serif text-sm text-[#e39a7c]">Passed Over · {passed}</p>}
              {/* Another player's hero acts from their own screen. */}
              {actor?.type === "pc" && !aiActor ? (
                <p className="text-sm text-stage-muted">Waiting for {actor.name.split(" ")[0]}</p>
              ) : (
                <Button variant="epic" size="xs" className="py-1.5 text-sm" onClick={() => props.onContinue(turn._id)}>
                  {!actor ? "Continue adventure" : aiActor ? `Continue ${actor.name.split(" ")[0]}'s turn` : "Continue NPC turn"}
                </Button>
              )}
            </div>
          )}
          {(open === "journal" || open === "chat") && (
            <Journal
              turns={journal}
              chat={chat}
              compact={compact}
              onClose={() => setOpen(null)}
              tab={open === "chat" ? "chat" : "story"}
              onTab={(tab) => setOpen(tab === "chat" ? "chat" : "journal")}
              onChat={props.onChat}
            />
          )}
          {open === "map" && city && <CityMapPanel map={city.map} trail={city.trail} compact={compact} onClose={() => setOpen(null)} />}
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
          {open === "feedback" && props.onFeedback && (
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
              onSend={props.onFeedback}
              onSent={(kind) => kind === "ending" && setEndingSent(true)}
              onClose={closePanel}
            />
          )}
          {open === "settings" && (
            <section className={`${panel} absolute right-10 top-24 z-40 w-72 p-6`}>
              <h2 className="mb-4 font-serif text-2xl">Scene Settings</h2>
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
              <Pill className="mt-2" onClick={() => setHidden(true)}>
                Hide UI
              </Pill>
            </section>
          )}
        </>
      )}
      {hidden && (
        <Pill className="absolute bottom-4 right-4 z-50" onClick={() => setHidden(false)}>
          Show interface · H
        </Pill>
      )}
      {props.children}
    </StageHud>
  )
}
