import type { RollBeat, StoryBeat } from "@d20/gm-core/story/beats"
import { rollSentence, storyParagraphs } from "@d20/gm-core/story/render"
import { findCurrentActor } from "@d20/gm-core/utils/turn-actors"
import type { Stage } from "@d20/stage"
import { readingSeconds } from "@d20/stage/beats"
import type { StagingShot } from "@d20/stage/spec/staging"
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CharacterCard } from "@/components/stage/character-card"
import { setSoundOn, soundOn } from "@/components/stage/dice-sound"
import { Pill, panel, StageHud, useCompact } from "@/components/stage/hud"
import { type ChatLine, Journal, type JournalRoll, type JournalTurn } from "@/components/stage/journal"
import { Narration } from "@/components/stage/narration"
import { type CardCharacter, type CardMode, type CardRoll, type CardSuggestion, PromptCard } from "@/components/stage/prompt-card"
import { ROLL_SECONDS, type RollResultData } from "@/components/stage/roll-result"
import { Bubbles, Plate } from "@/components/stage/stage-dialogue"
import { TurnOrder } from "@/components/stage/turn-order"
import { useStage } from "@/components/stage/use-stage"
import { Button } from "@/components/ui/button"
import type { Save } from "../runtime/store"
import { characterInfo } from "./character-info"
import type { FigureArt } from "./figures"
import { applyMovement, context, positions as stagePositions } from "./movement"
import { castIdFor, partyScene, portraitFor, sceneFor } from "./scenes"

type Paragraph = { text: string; roll?: RollBeat; beats: StoryBeat[] }
// A turn's story as paragraphs to read. A dice roll keeps its sentence, which the camera and screen readers read, and
// its numbers, which the narration shows as the roll itself.
const story = (turn: { story: StoryBeat[] } | undefined, originals = false): Paragraph[] =>
  (turn ? storyParagraphs(turn.story) : []).flatMap((p) => {
    const first = p.beats[0]
    if (first.kind === "reply") return originals ? [{ text: `Player action: ${first.text}`, beats: p.beats }] : []
    if (first.kind === "roll") return [{ text: rollSentence(first), roll: first, beats: p.beats }]
    return [{ text: p.text, beats: p.beats }]
  })
// Where a labelled paragraph puts the camera: on someone, on two people facing off, or on a place on the set.
type Aim = { pair: [string, string] } | { place: string } | { subject: string }
type View = Aim | null
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
    if (d > 0.3 && d < 14 && a.height <= 2.2 && !stage.reach(actor, cam, 4).short) return { position: [cam.x, 1.9, cam.z], target: [a.x + dx * d * 0.6, 1.2, a.z + dz * d * 0.6], fov: 48 }
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
  const cam = { x: px + ((px - mx) / d) * 3, z: pz + ((pz - mz) / d) * 3 }
  const hero = party[0]
  if (!hero || !stage.reach(hero.id, cam, 6).short) return { position: [cam.x, 2, cam.z], target: [mx, 1, mz], fov: 50 }
  // Something solid behind the heroes: the scene's own view that looks nearest the place.
  const near = Object.entries(stage.shots).sort(([, p], [, q]) => Math.hypot(p.target[0] - mx, p.target[2] - mz) - Math.hypot(q.target[0] - mx, q.target[2] - mz))[0]
  return near?.[0] ?? null
}
const journalRoll = (r: RollBeat): JournalRoll => ({ name: r.name, skill: r.check, dc: r.dc, base: r.natural, total: r.total, success: r.success })

type Character = Save["turns"][number]["characters"][number]
type Positions = Record<string, { x: number; z: number; ry: number }>
// How long someone stays on their feet after the paragraph that fells them begins, in milliseconds: about the time the
// camera takes to reach them.
const FALL_DELAY = 1500

// What the card says while the GM plays an NPC's or AI hero's turn, when the sheet has no line of its own.
const MULLING = ["considers the moment…", "weighs the options…", "sizes up the scene…", "makes a choice…", "takes a breath…"]

// The card while the GM works: the NPC or AI hero it is playing, with their own line or one picked by the turn, or the
// GM resolving a player's action.
function playing(turnId: string | undefined, actor: Character | undefined, ai: boolean, portrait: (c: Character) => string | undefined): CardMode {
  if (!actor || (actor.type !== "npc" && !ai)) return { kind: "thinking", note: "The GM is resolving the action…" }
  const name = actor.name.split(" ")[0]
  let pick = 0
  for (const ch of `${turnId}:${actor.id}`) pick = (pick * 31 + ch.charCodeAt(0)) >>> 0
  const note = actor.thinking ?? `${name} ${MULLING[pick % MULLING.length]}`
  return { kind: "thinking", note, who: { id: actor.id, name: actor.name, role: `${actor.race} ${actor.archetype}`, portrait: portrait(actor) } }
}

// Story view's painting: the encounter's art, drifting slowly, darkened at the edges and behind the text so the
// narration reads over it. Paintings are bundled under /stage/art (scripts/stage-encounter-art.ts). One that is
// missing leaves the plain dark ground, and a new one fades in over the last.
function StoryArt({ src }: { src: string }) {
  const [shown, setShown] = useState<string | null>(null)
  const img = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const el = img.current
    if (!el || shown !== src || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const drift = el.animate([{ transform: "scale(1.04) translate(-1.2%, 0.6%)" }, { transform: "scale(1.13) translate(1.2%, -0.8%)" }], {
      duration: 70_000,
      iterations: Number.POSITIVE_INFINITY,
      direction: "alternate",
      easing: "ease-in-out",
    })
    return () => drift.cancel()
  }, [shown, src])
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <img
        key={src}
        ref={img}
        src={src}
        alt=""
        onLoad={() => setShown(src)}
        onError={() => setShown(null)}
        className={`absolute inset-0 h-full w-full scale-[1.04] object-cover transition-opacity duration-[1600ms] [filter:saturate(.85)_brightness(.78)] ${shown === src ? "opacity-100" : "opacity-0"}`}
      />
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 45%, transparent 35%, rgba(12,8,5,.7) 100%)" }} />
      <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(12,8,5,.55), transparent 22%, transparent 62%, rgba(12,8,5,.75))" }} />
    </div>
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
  // A line under the location, such as where the game is saved.
  status: string
  // Something over the stage, such as the home screen, which hides the play interface.
  overlay: boolean
  // Header buttons before Journal and Scene settings, and after them.
  actions?: ReactNode
  trailingActions?: ReactNode
  // Each resolves to whether the action was accepted.
  onReply: (turnId: string, characterId: string, text: string, movement: ReturnType<typeof context> | undefined) => Promise<boolean>
  // Ends a hero's turn with no reply. Without it the card has no Skip button.
  onSkip?: (turnId: string, characterId: string) => Promise<boolean>
  onRoll: (turnId: string, characterId: string, result: number) => Promise<boolean>
  // Replies offered on a hero's turn, which fill the reply box. Without it none are offered.
  onSuggest?: (turnId: string, characterId: string) => Promise<CardSuggestion[]>
  onContinue: (turnId: string) => void
  // NPC turns, AI heroes' turns and the end of a round run on their own once the narration has been read. One that
  // fails leaves the Continue button, to retry. Without it Continue always waits for a click.
  autoContinue?: boolean
  // Where the cast stands after a walk. Without it, walks are not saved.
  onPositions?: (turnId: string, positions: Positions, appliedMovement: string) => Promise<void>
  // The table chat of a game with other players, and how a line is sent. Resolves to whether it was taken.
  chat?: ChatLine[]
  onChat?: (text: string) => Promise<boolean>
  // Buttons on the closing panel beside Journal.
  endActions?: ReactNode
  onEscape?: () => void
  onError: (message: string) => void
  // Reports whether the scene is still loading and any stage error, for setup screens and the error panel.
  onStage?: (state: { waiting: boolean; error: string | null }) => void
  children?: ReactNode
}) {
  const { save, art } = props
  const { onPositions, onError, onEscape, onStage } = props
  const saveRef = useRef(save)
  saveRef.current = save
  const [walking, setWalking] = useState(false)
  const busy = props.busy || walking

  const [draft, setDraft] = useState("")
  const [open, setOpen] = useState<"journal" | "chat" | "settings" | null>(null)
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
  const [held, setHeld] = useState<{ turn: string; actor: CardCharacter; roll: CardRoll; natural: number; at: number } | null>(null)
  const heldRef = useRef(held)
  heldRef.current = held
  const [tries, setTries] = useState(0)
  const previousText = useRef<{ turn?: string; paragraphs: string[] }>({ paragraphs: [] })
  const [, redraw] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const compact = useCompact()
  const turn = save?.turns.find((t) => t._id === save.adventure.currentTurnId)
  const cardCharacter = turn?.characters.find((c) => c.id === cardId)
  // A turn that opens a new encounter starts with the end of the last round, which closes the old one. Those
  // paragraphs are told on the old encounter's scene, with its people, and the new scene follows them.
  const before = turn && save?.turns.find((t) => t.order === (turn.order ?? 0) - 1 && t.encounterId !== turn.encounterId)
  const closing = useMemo(() => {
    if (!before || !turn) return 0
    const end = turn.story.findIndex((b) => b.by.step !== "round")
    return story({ story: end < 0 ? turn.story : turn.story.slice(0, end) }).length
  }, [before, turn])
  const closingNow = reading && paragraph < closing
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
  const card = cardCharacter ? characterInfo(cardCharacter, portrait(cardCharacter)) : null
  const specs = useMemo(() => (scene ? { set: scene.set, staging: scene.staging, tier: "balanced" as const } : null), [scene])
  const { stage, stageRef, status: loading, error: stageError } = useStage(containerRef, specs)
  const actor = turn ? findCurrentActor(turn.characters) : undefined
  // Read again only when the story itself changes, not on every save, such as positions after a walk.
  const told = turn ? JSON.stringify([turn._id, turn.story]) : ""
  const paragraphs = useMemo(() => story(turn), [told])
  const text = useMemo(() => paragraphs.map((p) => p.text), [paragraphs])
  // The paragraph's dice roll, for the narration to show: the numbers from the roll, the roller's portrait from the scene.
  const rolled = paragraphs[paragraph]?.roll
  const roller = rolled ? turn?.characters.find((c) => c.id === rolled.character) : undefined
  const rollerPortrait = roller ? portrait(roller) : undefined
  const roll = useMemo<RollResultData | undefined>(
    () =>
      rolled && {
        character: rolled.name,
        check: rolled.check,
        natural: rolled.natural,
        modifier: rolled.modifier,
        total: rolled.total,
        dc: rolled.dc,
        success: rolled.success,
        portrait: rollerPortrait,
      },
    [rolled, rollerPortrait]
  )
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
  // Entrances the scene ties to the narration: offstage until the paragraph that brings them on ("the cabin door
  // opened"), then they walk on from the door to their place. Narration without the phrase finds them in place.
  // An action that brings someone on from a place does the same, at its own paragraph.
  const cues = useMemo(() => {
    const authored = (stage?.staging?.entrances ?? []).map((e) => ({ ...e, speed: 0.9, at: text.findIndex((p) => p.toLowerCase().includes(e.when.toLowerCase())) }))
    const told = paragraphs.flatMap((p, at) =>
      p.beats.flatMap((b) => {
        const cast = b.kind === "action" && b.move?.from && stage?.set.marks[b.move.from] ? castOf(b.actor) : undefined
        return cast && b.kind === "action" && b.move?.from
          ? [{ cast, from: b.move.from as string | [number, number], when: "", shot: undefined as string | undefined, speed: PACE[b.move.pace ?? "walk"], at }]
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
      const to = spot(home?.at)
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
  }, [stage, cues, reading, paragraph])
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
        const status = c.status?.trim().toLowerCase()
        if (status === "dead" || c.healthPercent === 0) out.set(id, "dead")
        else if (status === "fled") out.set(id, "fled")
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
        if ((ran.current.delete(id) || stage.isDown(id)) && home) stage.placeCast(id, home.at, home.facing)
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
  }, [stage, exits, reading, paragraph])
  // Each paragraph moves the camera to fit it: its first speaker, someone making an entrance, whoever it is about, or
  // the place it describes.
  useEffect(() => {
    if (!stage || !reading) return
    if (speech.length) return void stage.shot({ subject: speech[0].cast.id, distance: 5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 })
    if (departing?.shot) return void stage.shot(departing.shot)
    if (arriving) {
      if (arriving.shot) return void stage.shot(arriving.shot)
      // Facing the way they come: from beyond their place, looking back at where they enter.
      const mark = (at: string | number[] | undefined) => (typeof at === "string" ? stage.set.marks[at]?.at : at)
      const home = mark(stage.staging?.cast.find((c) => c.id === arriving.cast)?.at)
      const from = mark(arriving.from)
      if (home && from) {
        const [fx, fz] = from
        const [hx, hz] = home
        const d = Math.hypot(hx - fx, hz - fz) || 1
        const k = 3.6 / d
        return void stage.shot({ position: [hx + (hx - fx) * k, 1.75, hz + (hz - fz) * k], target: [(fx + hx) / 2, 1.3, (fz + hz) / 2], fov: 50 })
      }
      return void stage.shot({ subject: arriving.cast, distance: 5.5, angle: 12, height: 1.8, lookHeight: 1.2, fov: 48 })
    }
    const view = beats[paragraph]?.view
    if (!view) return
    const shot = shotFor(stage, view, heroes.current)
    if (shot) stage.shot(shot)
  }, [stage, speech, departing, arriving, beats, paragraph, reading])
  // What labelled paragraphs do on stage: walks, effects and objects, each played once when its paragraph is first read.
  // An attack in a hero's reply waits for the roll that decides it, and plays after the roll as a hit or a miss, unless
  // the roll's outcome shows the attack itself. After a roll in the same step, an effect misses when its actor failed
  // the roll or its target made it. A hero whose reply the movement model reads walks by that, not by the beats.
  const staged = useMemo(() => {
    const out = new Map<number, { key: string; beat: Extract<StoryBeat, { kind: "action" }>; effect: boolean; miss: boolean }[]>()
    const all = paragraphs.flatMap((p, i) => p.beats.map((beat) => ({ beat, at: i })))
    const same = (a: StoryBeat, b: StoryBeat) => a.by.step === b.by.step && a.by.character === b.by.character
    const add = (at: number, entry: { key: string; beat: Extract<StoryBeat, { kind: "action" }>; effect: boolean; miss: boolean }) => out.set(at, [...(out.get(at) ?? []), entry])
    const walksByModel = (actor: string) => Boolean(turn && saveRef.current?.movement[`${turn._id}:${actor}`])
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
      const walks = Boolean(beat.move?.to) && !walksByModel(beat.actor)
      if (walks || beat.object) add(at, { key: `${key}:own`, beat: walks ? beat : { ...beat, move: undefined }, effect: false, miss: false })
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
      if (effect || b.object)
        void Promise.race([stage.shotSettled(), new Promise((r) => setTimeout(r, 2600))]).then(() => {
          if (showing.current !== here) return
          if (effect && b.effect) void stage.effect(b.effect.kind, actor, target, b.effect.element, { miss })
          else if (b.object) void stage.prop(b.object.kind, actor, castOf(b.object.to))
        })
      const to = effect ? undefined : b.move?.to
      const character = turn.characters.find((c) => c.id === b.actor)
      if (!to || !character) continue
      const onSet = Boolean(stage.set.marks[to])
      const toward = onSet ? undefined : castOf(to)
      if (!onSet && !toward) continue
      void (async () => {
        setWalking(true)
        try {
          const positions = await applyMovement(stage, character, {
            move: onSet ? "place" : "character",
            ...(onSet ? { place: to } : { character: toward }),
            ...(target ? { face: target } : {}),
            pace: b.move?.pace ?? "walk",
            summary: "",
          })
          if (stageRef.current === stage) await onPositions?.(turn._id, positions, "")
        } catch (error) {
          onError(`Could not save the movement: ${String(error)}`)
        } finally {
          setWalking(false)
        }
      })()
    }
  }, [stage, stageRef, reading, paragraph, staged, turn, castOf, onPositions, onError])
  useEffect(() => {
    if (!auto || !reading || busy || !text.length) return
    // A roll stays up until the die has landed and the verdict has had a moment.
    const seconds = paragraphs[paragraph]?.roll ? ROLL_SECONDS + 1.5 : readingSeconds(text[paragraph] ?? "")
    const timer = setTimeout(() => (paragraph < text.length - 1 ? setParagraph((n) => n + 1) : setReading(false)), seconds * 1000)
    return () => clearTimeout(timer)
  }, [auto, reading, busy, text, paragraphs, paragraph])
  const focused = useRef<string | null>(null)
  const moved = useRef(new Set<string>())
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
  useEffect(() => {
    if (!stage) return
    for (const loop of stage.loops.values()) loop.paused = true
    if (stage.staging?.shot) stage.shot(stage.staging.shot, { instant: true })
    const timer = setInterval(() => redraw((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [stage])
  useEffect(() => {
    // A stage being replaced for the next encounter must not take the new encounter's positions.
    if (!stage || !turn || stageRef.current !== stage) return
    for (const [id, p] of Object.entries(saveRef.current?.positions ?? {})) {
      if (stage.cast.some((c) => c.id === id)) stage.placeCast(id, [p.x, p.z], (p.ry * 180) / Math.PI)
    }
  }, [stage, stageRef, turn?._id])
  useEffect(() => {
    if (!stage || !save || !turn || busy || stageRef.current !== stage) return
    const pending = Object.entries(save.movement).find(([key]) => key.startsWith(`${turn._id}:`) && !save.appliedMovement?.includes(key) && !moved.current.has(key))
    if (!pending) return
    const [key, movement] = pending
    const c = turn.characters.find((c) => c.id === movement.actorId)
    if (!c || !c.isComplete || !castIdFor(stage.cast, c)) return
    const check = save.rollChecks?.[key]
    if (check && c.rollResult === undefined) return
    moved.current.add(key)
    void (async () => {
      setWalking(true)
      try {
        const positions = check && c.rollResult! < check.dc ? stagePositions(stage) : await applyMovement(stage, c, movement.intent)
        // A walk cut off by a scene change belongs to a renderer that no longer exists.
        if (stageRef.current !== stage) return
        await onPositions?.(turn._id, positions, key)
      } catch (error) {
        onError(`Could not save the movement: ${String(error)}`)
      } finally {
        setWalking(false)
      }
    })()
  }, [stage, stageRef, save, turn, busy, onPositions, onError])
  const focus = useCallback(
    (id: string) => {
      const characters = saveRef.current?.turns.find((t) => t._id === saveRef.current?.adventure.currentTurnId)?.characters
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
    .map((c) => ({ id: c.id, name: c.name, role: `${c.race} ${c.archetype}${c.controlledBy === "ai" ? " · AI" : ""}`, portrait: portrait(c) }))
  // Heroes the AI plays take their turns like NPCs, through Continue.
  const aiActor = actor?.type === "pc" && actor.controlledBy === "ai"
  const cardActor = aiActor || !actor || !props.controls(actor) ? null : (party.find((c) => c.id === actor.id) ?? null)
  const rr = actor?.rollRequired
  // A finished adventure ends on its final narration. Its last turn has characters but takes no more actions.
  const ended = save?.adventure.status === "completed"
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
  let mode: CardMode | null = null
  if (held) mode = { kind: "roll", roll: held.roll, made: held.natural, resolving: props.busy }
  // A walk holds the card back without a word about the GM.
  else if (busy) mode = props.busy ? playing(turn?._id, actor, aiActor, portrait) : null
  // Movement is read against the scene on screen, so wait for the next scene before taking an action.
  else if (scene && !stage && !stageError) mode = { kind: "thinking", note: loading }
  else if (ended) mode = null
  else if (cardActor && rr) mode = { kind: "roll", roll: { skill: rr.rollType, ability: "", dc: rr.difficulty, modifier: rr.modifier ?? 0 } }
  else if (cardActor) mode = { kind: "hold", prompt: `What does ${cardActor.name.split(" ")[0]} do?`, suggestions: holdKey ? (offered?.key === holdKey ? offered.list : "loading") : undefined }
  // What Continue would run: an NPC's or AI hero's turn, or the end of the round. Each is tried once on its own.
  // Narration that has just arrived is unread, though `reading` only says so after the effect above has run.
  const unseen = reading || previousText.current.paragraphs !== text
  const continueKey = !ended && !busy && !unseen && !mode && !props.overlay && turn && !(actor?.type === "pc" && !aiActor) ? `${turn._id}:${actor?.id ?? "round"}` : null
  const [continued, setContinued] = useState<string | null>(null)
  const { autoContinue, onContinue } = props
  useEffect(() => {
    if (!autoContinue || !continueKey || continued === continueKey) return
    setContinued(continueKey)
    onContinue(continueKey.split(":")[0])
  }, [autoContinue, continueKey, continued, onContinue])
  const reply = async (value: string) => {
    if (!turn || !actor) return
    const movement = stage ? context(stage, actor, value) : undefined
    if (await props.onReply(turn._id, actor.id, value, movement)) setDraft("")
  }
  const skip = async () => {
    if (turn && actor && (await props.onSkip?.(turn._id, actor.id))) setDraft("")
  }
  const makeRoll = async (natural: number) => {
    if (!turn || !actor || !cardActor || mode?.kind !== "roll") return
    setHeld({ turn: turn._id, actor: cardActor, roll: mode.roll, natural, at: Date.now() })
    if (await props.onRoll(turn._id, actor.id, natural)) return
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
  const journal: JournalTurn[] = (save?.turns ?? []).map((t) => ({
    number: t.order,
    title: t.title,
    paragraphs: story(t, true).map((p) => (p.roll ? journalRoll(p.roll) : p.text)),
  }))
  return (
    <StageHud
      containerRef={containerRef}
      backdrop={!scene && save && shown ? <StoryArt src={`/stage/art/${save.adventure.planId}/${shown.encounterId}.webp`} /> : undefined}
      title={{ eyebrow: (save?.adventure.title ?? "").toUpperCase(), text: shown?.title ?? "" }}
      location={{
        eyebrow: scene?.location ?? "Story view",
        title: ended ? "Adventure complete" : actor ? `${actor.name.split(" ")[0]}'s turn` : `Round ${turn?.order ?? 1}`,
        status: props.status,
      }}
      views={stage ? Object.entries(stage.shots).map(([id, s]) => ({ id, label: s.label ?? id })) : []}
      activeView={stage?.activeShot ?? null}
      onView={(id) => stage?.shot(id)}
      hidden={hidden || !save || props.overlay}
      compact={compact}
      actions={
        <>
          {props.actions}
          <Pill onClick={() => setOpen(open === "journal" ? null : "journal")}>Journal</Pill>
          {props.onChat && (
            <Pill active={unread > 0} onClick={() => setOpen(open === "chat" ? null : "chat")}>
              Chat{unread > 0 ? ` · ${unread}` : ""}
            </Pill>
          )}
          <Pill onClick={() => setOpen(open === "settings" ? null : "settings")}>Scene settings</Pill>
          {props.trailingActions}
        </>
      }
    >
      {save && !hidden && !props.overlay && (
        <>
          {stage && speech.length > 0 && (
            <>
              <Bubbles compact={compact} bubbles={speech.map((l, i) => ({ key: paragraph * 100 + i, anchor: () => stage.project(l.cast.id), text: l.text, named: true }))} />
              <Plate compact={compact} line={{ key: paragraph, side: "right", name: speech[0].cast.name, role: speech[0].cast.role, portrait: speech[0].cast.art.portrait, text: speech[0].text }} />
            </>
          )}
          <TurnOrder
            order={(turn?.characters ?? []).map((c) => ({ id: c.id, name: c.name, portrait: portrait(c), npc: c.type === "npc", health: c.healthPercent, status: c.status }))}
            activeId={actor?.id ?? null}
            label={actor?.name}
            compact={compact}
            onPick={focus}
          />
          <div
            className={`pointer-events-none absolute z-20 ${!scene && reading ? "left-1/2 top-1/2 w-[min(680px,75vw)] -translate-x-1/2 -translate-y-1/2" : "bottom-[118px] left-8 w-[min(460px,35vw)]"}`}
          >
            {reading && (
              <Narration
                heading={`Round ${shown?.order} · ${shown?.title}`}
                text={text[paragraph]}
                roll={roll}
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
              onRoll={(natural) => void makeRoll(natural)}
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
            </div>
          )}
          {!ended && !busy && !reading && !mode && turn && !(autoContinue && continueKey && continued !== continueKey) && (
            <div className={`${panel} absolute bottom-28 left-1/2 z-30 -translate-x-1/2 p-6 text-center`}>
              <p className="mb-3 font-serif text-xl">{actor ? `${actor.name}'s turn` : "The round is complete"}</p>
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
          {card && <CharacterCard info={card} compact={compact} onClose={() => setCardId(null)} />}
          {open === "settings" && (
            <section className={`${panel} absolute right-10 top-24 z-40 w-72 p-6`}>
              <h2 className="mb-4 font-serif text-2xl">Scene settings</h2>
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
