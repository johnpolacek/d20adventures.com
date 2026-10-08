import { findCurrentActor } from "@d20/gm-core/utils/turn-actors"
import { readingSeconds } from "@d20/stage/beats"
import { readNarration } from "@d20/stage/narration"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CharacterCard } from "@/components/stage/character-card"
import { setSoundOn, soundOn } from "@/components/stage/dice-sound"
import { Pill, panel, StageHud, useCompact } from "@/components/stage/hud"
import { Journal, type JournalTurn } from "@/components/stage/journal"
import { Narration } from "@/components/stage/narration"
import { type CardCharacter, type CardMode, PromptCard } from "@/components/stage/prompt-card"
import { ROLL_SECONDS, type RollResultData } from "@/components/stage/roll-result"
import { Bubbles, Plate } from "@/components/stage/stage-dialogue"
import { TurnOrder } from "@/components/stage/turn-order"
import { useStage } from "@/components/stage/use-stage"
import { Button } from "@/components/ui/button"
import { type NarrativePart, parseNarrative } from "@/lib/utils/parse-narrative"
import type { AdventureInfo, GameCommand } from "../runtime/game"
import type { Hero, HeroCommand, PartyChoice } from "../runtime/heroes"
import type { Save } from "../runtime/store"
import { Account } from "./account"
import { send } from "./bridge"
import { characterInfo } from "./character-info"
import type { FigureArt } from "./figures"
import { HeroCreator, type HeroIdea } from "./hero-creator"
import { applyMovement, context, positions as stagePositions } from "./movement"
import { NewGame } from "./new-game"
import { castIdFor, partyScene, portraitFor, sceneFor } from "./scenes"

type Roll = Extract<NarrativePart, { type: "diceroll" }>
// A turn's narrative as paragraphs. A dice roll keeps its sentence, which the camera and screen readers read, and its
// numbers, which the narration shows as the roll itself.
const story = (text: string, originals = false): { text: string; roll?: Roll }[] =>
  parseNarrative(text).flatMap((part) => {
    if (part.type === "original-reply") return originals ? [{ text: `Player action: ${part.value}` }] : []
    if (part.type === "diceroll")
      return [
        {
          text: `${part.character} · ${part.rollType}: ${part.baseRoll ?? part.result}${part.modifier !== undefined ? ` + ${part.modifier} = ${part.result}` : ""}, DC ${part.difficulty}. ${part.success ? "Success" : "Failure"}.`,
          roll: part,
        },
      ]
    return [{ text: part.value }]
  })
const prose = (text: string, originals = false) => story(text, originals).map((p) => p.text)

export function DesktopGame() {
  const [save, setSave] = useState<Save | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [providers, setProviders] = useState<string[]>([])
  const [provider, setProvider] = useState("claude")
  const [adventures, setAdventures] = useState<AdventureInfo[]>([])
  const [adventure, setAdventure] = useState("march-of-davos")
  const [heroes, setHeroes] = useState<Hero[]>([])
  const [options, setOptions] = useState<{ races: string[]; archetypes: string[] }>({ races: [], archetypes: [] })
  // The hero creator, over the new game screen. A hero it saves joins the party there.
  const [creator, setCreator] = useState<{ editing?: Hero } | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  // Painted hero art, kept as blob URLs, which the stage and the app's content policy accept.
  const [art, setArt] = useState<Record<string, FigureArt>>({})
  const [painting, setPainting] = useState<string | null>(null)
  const askedArt = useRef(new Set<string>())
  const keepArt = useCallback((incoming: Record<string, FigureArt>) => {
    setArt((current) => {
      const next = { ...current }
      for (const [id, urls] of Object.entries(incoming)) {
        for (const url of Object.values(current[id] ?? {})) URL.revokeObjectURL(url)
        next[id] = { front: blobUrl(urls.front), back: blobUrl(urls.back), portrait: blobUrl(urls.portrait) }
      }
      return next
    })
  }, [])
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [open, setOpen] = useState<"journal" | "settings" | null>(null)
  const [cardId, setCardId] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [paragraph, setParagraph] = useState(0)
  const [auto, setAuto] = useState(false)
  const [sound, setSound] = useState(soundOn)
  const [reading, setReading] = useState(true)
  // The title screen: shown on launch and from the Menu button. With a save it offers Continue and New game.
  const [menu, setMenu] = useState(true)
  const [confirmNew, setConfirmNew] = useState(false)
  const previousText = useRef<{ turn?: string; paragraphs: string[] }>({ paragraphs: [] })
  const [, redraw] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const compact = useCompact()
  const turn = save?.turns.find((t) => t._id === save.adventure.currentTurnId)
  const cardCharacter = turn?.characters.find((c) => c.id === cardId)
  const chosen = adventures.find((a) => a.id === adventure)
  // The title screen shows the chosen adventure's opening scene. Encounters without an authored scene play in story view.
  // In a game the scene holds the actual party, keyed by value so a reloaded save does not rebuild the stage.
  const authored = sceneFor(turn?.encounterId ?? chosen?.start ?? "the-gates-of-kordavos")
  const painted = Object.fromEntries((save?.painted ?? []).flatMap((id) => (art[id] ? [[id, art[id]]] : [])))
  const partyKey = turn
    ? JSON.stringify([
        turn.characters.filter((c) => c.type === "pc").map((c) => ({ id: c.id, name: c.name, race: c.race, archetype: c.archetype, gender: c.gender, type: c.type })),
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
  const paragraphs = useMemo(() => story(turn?.narrative ?? ""), [turn?.narrative])
  const text = useMemo(() => paragraphs.map((p) => p.text), [paragraphs])
  // The paragraph's dice roll, for the narration to show: the numbers from the roll, the roller's portrait from the scene.
  const rolled = paragraphs[paragraph]?.roll
  const roller = rolled ? turn?.characters.find((c) => c.name === rolled.character) : undefined
  const rollerPortrait = roller ? portrait(roller) : undefined
  const roll = useMemo<RollResultData | undefined>(
    () =>
      rolled && {
        character: rolled.character,
        check: rolled.rollType,
        natural: rolled.baseRoll ?? rolled.result,
        modifier: rolled.modifier,
        total: rolled.result,
        dc: rolled.difficulty,
        success: rolled.success,
        portrait: rollerPortrait,
      },
    [rolled, rollerPortrait]
  )
  // The narration read paragraph by paragraph: who each one is about (by name and pronoun, so genders come from the
  // turn's characters) and who speaks in it (by the speech tag beside each quote: "asked the elf" finds the elf by race).
  const beats = useMemo(() => {
    if (!stage) return []
    const people: Record<string, { gender?: "f" | "m"; words: string[] }> = {}
    for (const c of turn?.characters ?? []) {
      const id = castIdFor(stage.cast, c)
      if (!id) continue
      const g = c.gender?.toLowerCase()
      people[id] = {
        gender: g?.startsWith("f") ? "f" : g?.startsWith("m") ? "m" : undefined,
        words: [c.race, c.archetype].flatMap((w) => (w ? w.toLowerCase().split(/\s+/) : [])),
      }
    }
    return readNarration(text, stage, people)
  }, [stage, text, turn?.characters])
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
  const cues = useMemo(() => (stage?.staging?.entrances ?? []).map((e) => ({ ...e, at: text.findIndex((p) => p.toLowerCase().includes(e.when.toLowerCase())) })), [stage, text])
  const arriving = reading ? cues.find((e) => e.at === paragraph) : undefined
  useEffect(() => {
    if (!stage) return
    for (const e of cues) {
      const home = stage.staging?.cast.find((c) => c.id === e.cast)
      if (!home) continue
      if (reading && e.at >= 0 && paragraph < e.at) {
        stage.placeCast(e.cast, e.from)
        stage.setOnStage(e.cast, false)
      } else if (!stage.isOnStage(e.cast)) {
        stage.setOnStage(e.cast, true)
        if (reading && paragraph === e.at) void stage.moveCast(e.cast, home.at, { speed: 0.9 }).then(() => stage.faceCast(e.cast, home.facing))
        else stage.placeCast(e.cast, home.at, home.facing)
      }
    }
  }, [stage, cues, reading, paragraph])
  // Each paragraph moves the camera to fit it: its first speaker, someone making an entrance, whoever it is about, or
  // the place it describes.
  useEffect(() => {
    if (!stage || !reading) return
    if (speech.length) return void stage.shot({ subject: speech[0].cast.id, distance: 5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 })
    if (arriving) {
      if (arriving.shot) return void stage.shot(arriving.shot)
      // Facing the way they come: from beyond their place, looking back at where they enter.
      const home = stage.staging?.cast.find((c) => c.id === arriving.cast)?.at
      if (Array.isArray(home) && Array.isArray(arriving.from)) {
        const [fx, fz] = arriving.from
        const [hx, hz] = home
        const d = Math.hypot(hx - fx, hz - fz) || 1
        const k = 3.6 / d
        return void stage.shot({ position: [hx + (hx - fx) * k, 1.75, hz + (hz - fz) * k], target: [(fx + hx) / 2, 1.3, (fz + hz) / 2], fov: 50 })
      }
      return void stage.shot({ subject: arriving.cast, distance: 5.5, angle: 12, height: 1.8, lookHeight: 1.2, fov: 48 })
    }
    const view = beats[paragraph]?.view
    if (view) stage.shot(typeof view === "string" ? view : { subject: view.subject, distance: 4.5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 })
  }, [stage, speech, arriving, beats, paragraph, reading])
  useEffect(() => {
    if (!auto || !reading || busy || !text.length) return
    // A roll stays up until the die has landed and the verdict has had a moment.
    const seconds = paragraphs[paragraph]?.roll ? ROLL_SECONDS + 1.5 : readingSeconds(text[paragraph] ?? "")
    const timer = setTimeout(() => (paragraph < text.length - 1 ? setParagraph((n) => n + 1) : setReading(false)), seconds * 1000)
    return () => clearTimeout(timer)
  }, [auto, reading, busy, text, paragraphs, paragraph])
  const saveRef = useRef(save)
  saveRef.current = save
  const focused = useRef<string | null>(null)
  const moved = useRef(new Set<string>())
  const invoke = useCallback(
    async (command: GameCommand | HeroCommand) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
      setError(null)
      try {
        const res = await send(command)
        setSave(res.state)
        if (res.adventures) setAdventures(res.adventures)
        if (res.heroes) setHeroes(res.heroes)
        if (res.art && Object.keys(res.art).length) keepArt(res.art)
        if (res.options) setOptions(res.options)
        if (res.providers) {
          setProviders(res.providers)
          setProvider((p) => (res.providers!.includes(p) ? p : (res.providers![0] ?? "claude")))
        }
        if (res.error) setError(res.error)
        if (!res.error && command.kind === "reply") setDraft("")
        return res
      } catch (e) {
        setError(String(e))
        return null
      } finally {
        busyRef.current = false
        setBusy(false)
        setLoaded(true)
      }
    },
    [keepArt]
  )
  useEffect(() => {
    void invoke({ kind: "load" })
  }, [invoke])
  // Fetch painted art once for roster heroes and for the saved party.
  useEffect(() => {
    if (busy || !loaded) return
    const ids = [...new Set([...heroes.filter((h) => h.painted).map((h) => h.id), ...(save?.painted ?? [])])].filter((id) => !askedArt.current.has(id))
    if (!ids.length) return
    for (const id of ids) askedArt.current.add(id)
    void invoke({ kind: "art", ids: ids.slice(0, 24) })
  }, [busy, loaded, heroes, save?.painted, invoke])
  useEffect(() => {
    const old = previousText.current
    const firstChanged = old.turn === turn?._id ? text.findIndex((p, i) => p !== old.paragraphs[i]) : 0
    setParagraph(Math.max(0, firstChanged))
    setReading(true)
    previousText.current = { turn: turn?._id, paragraphs: text }
  }, [text, turn?._id])
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
      busyRef.current = true
      setBusy(true)
      try {
        const positions = check && c.rollResult! < check.dc ? stagePositions(stage) : await applyMovement(stage, c, movement.intent)
        busyRef.current = false
        // A walk cut off by a scene change belongs to a renderer that no longer exists.
        if (stageRef.current !== stage) return
        await invoke({ kind: "positions", turnId: turn._id, positions, appliedMovement: key })
      } catch (error) {
        setError(`Could not save the movement: ${String(error)}`)
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    })()
  }, [stage, stageRef, save, turn, busy, invoke])
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
        setConfirmNew(false)
        if (saveRef.current) setMenu(false)
      }
      const view = Object.keys(stage?.shots ?? {})[Number(e.key) - 1]
      if (view) stage?.shot(view)
    }
    addEventListener("keydown", fn)
    return () => removeEventListener("keydown", fn)
  }, [stage])
  useEffect(() => {
    const sid = stage && actor && castIdFor(stage.cast, actor)
    if (stage && sid && !reading) stage.shot({ subject: sid, distance: 5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 })
  }, [stage, actor?.id, reading])
  const onTop = useCallback((px: number) => stage?.setInsets({ bottom: px > 0 ? px + 12 : 0 }), [stage])
  const party: CardCharacter[] = (turn?.characters ?? [])
    .filter((c) => c.type === "pc")
    .map((c) => ({ id: c.id, name: c.name, role: `${c.race} ${c.archetype}${c.controlledBy === "ai" ? " · AI" : ""}`, portrait: portrait(c) }))
  // Heroes the AI plays take their turns like NPCs, through Continue.
  const aiActor = actor?.type === "pc" && actor.controlledBy === "ai"
  const cardActor = aiActor ? null : (party.find((c) => c.id === actor?.id) ?? null)
  const rr = actor?.rollRequired
  // A finished adventure ends on its final narration. Its last turn has characters but takes no more actions.
  const ended = save?.adventure.status === "completed"
  let mode: CardMode | null = null
  if (busy) mode = { kind: "thinking", note: "The GM is resolving the action…" }
  // Movement is read against the scene on screen, so wait for the next scene before taking an action.
  else if (scene && !stage && !stageError) mode = { kind: "thinking", note: loading }
  else if (ended) mode = null
  else if (cardActor && rr) mode = { kind: "roll", roll: { skill: rr.rollType, ability: "", dc: rr.difficulty, modifier: rr.modifier ?? 0 } }
  else if (cardActor) mode = { kind: "hold", prompt: `What does ${cardActor.name.split(" ")[0]} do?` }
  // Starting over archives the saved adventure. The menu stays open if the start fails.
  const start = async (chosenParty: PartyChoice[]) => {
    const next = (await invoke({ kind: "start", provider: provider as "claude", adventure, party: chosenParty, replace: Boolean(save) }))?.state
    if (!next || next.adventure._id === save?.adventure._id) return
    setCreated(null)
    setMenu(false)
    setConfirmNew(false)
    setCardId(null)
    setOpen(null)
  }
  // Painting uses the Game Master's CLI when it can paint, else Grok, then Codex.
  const painters: string[] = providers.filter((p) => p === "grok" || p === "codex")
  const painter = (painters.includes(provider) ? provider : painters[0]) as "grok" | "codex" | undefined
  const paintHero = async (hero: Hero) => {
    if (!painter) return
    setPainting(hero.id)
    await invoke({ kind: "paintHero", provider: painter, id: hero.id })
    setPainting(null)
  }
  const draftHero = async (idea: HeroIdea) => (await invoke({ kind: "heroDraft", provider: provider as "claude", adventure, ...idea }))?.draft
  const saveHero = async (hero: Omit<Hero, "id"> & { id?: string }) => {
    const before = new Set(heroes.map((h) => h.id))
    const res = await invoke({ kind: "saveHero", hero })
    if (!res || res.error) return false
    setCreator(null)
    setCreated(res.heroes?.find((h) => !before.has(h.id))?.id ?? null)
    return true
  }
  const reply = async (value: string) => {
    if (!turn || !actor) return
    const movement = stage ? context(stage, actor, value) : undefined
    await invoke({ kind: "reply", turnId: turn._id, characterId: actor.id, text: value, movement })
  }
  const journal: JournalTurn[] = (save?.turns ?? []).map((t) => ({
    number: t.order,
    title: t.title,
    paragraphs: prose(t.narrative, true),
  }))
  return (
    <StageHud
      containerRef={containerRef}
      title={{ eyebrow: (save?.adventure.title ?? chosen?.title ?? "").toUpperCase(), text: turn?.title ?? "" }}
      location={{
        eyebrow: scene?.location ?? "Story view",
        title: ended ? "Adventure complete" : actor ? `${actor.name.split(" ")[0]}'s turn` : `Round ${turn?.order ?? 1}`,
        status: save ? `Saved locally · ${save.provider}` : "",
      }}
      views={stage ? Object.entries(stage.shots).map(([id, s]) => ({ id, label: s.label ?? id })) : []}
      activeView={stage?.activeShot ?? null}
      onView={(id) => stage?.shot(id)}
      hidden={hidden || !save || menu}
      compact={compact}
      actions={
        <>
          <Pill onClick={() => setMenu(true)}>Menu</Pill>
          <Pill onClick={() => setOpen(open === "journal" ? null : "journal")}>Journal</Pill>
          <Pill onClick={() => setOpen(open === "settings" ? null : "settings")}>Scene settings</Pill>
        </>
      }
    >
      {save && !hidden && !menu && (
        <>
          {stage && speech.length > 0 && (
            <>
              <Bubbles compact={compact} bubbles={speech.map((l, i) => ({ key: paragraph * 100 + i, anchor: () => stage.project(l.cast.id), text: l.text, named: true }))} />
              <Plate compact={compact} line={{ key: paragraph, side: "right", name: speech[0].cast.name, role: speech[0].cast.role, portrait: speech[0].cast.art.portrait, text: speech[0].text }} />
            </>
          )}
          <TurnOrder
            order={(turn?.characters ?? []).map((c) => ({ id: c.id, name: c.name, portrait: portrait(c), npc: c.type === "npc" }))}
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
                heading={`Round ${turn?.order} · ${turn?.title}`}
                text={text[paragraph]}
                roll={roll}
                index={paragraph}
                count={text.length}
                compact={compact}
                step={!auto}
                waiting={!auto}
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
            {!reading && (
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
          {mode && (!reading || busy) && (
            <PromptCard
              key={`${turn?._id}:${actor?.id}:${mode.kind}`}
              mode={mode}
              actor={cardActor}
              party={party}
              compact={compact}
              onReply={reply}
              onRoll={(result) => {
                if (turn && actor) void invoke({ kind: "roll", turnId: turn._id, characterId: actor.id, result })
              }}
              onPick={focus}
              onTop={onTop}
              draft={draft}
              onDraft={setDraft}
              forcedRoll={turn && actor ? save.rolls[`${turn._id}:${actor.id}`] : undefined}
            />
          )}
          {ended && !busy && !reading && (
            <div className={`${panel} absolute bottom-28 left-1/2 z-30 -translate-x-1/2 p-6 text-center`}>
              <div className="text-[10px] tracking-[.3em] text-stage-gold">THE END</div>
              <p className="mt-2 mb-4 font-display text-2xl">{save.adventure.title}</p>
              <Pill
                onClick={() => {
                  setConfirmNew(true)
                  setMenu(true)
                }}
              >
                New game
              </Pill>
              <Pill className="ml-2" onClick={() => setOpen("journal")}>
                Journal
              </Pill>
            </div>
          )}
          {!ended && !busy && !reading && !mode && turn && (
            <div className={`${panel} absolute bottom-28 left-1/2 z-30 -translate-x-1/2 p-6 text-center`}>
              <p className="mb-3 font-serif text-xl">{actor ? `${actor.name}'s turn` : "The round is complete"}</p>
              <Pill onClick={() => void invoke({ kind: "continue", turnId: turn._id })}>
                {!actor ? "Continue adventure" : aiActor ? `Continue ${actor.name.split(" ")[0]}'s turn` : "Continue NPC turn"}
              </Pill>
            </div>
          )}
          {open === "journal" && <Journal turns={journal} chat={[]} compact={compact} onClose={() => setOpen(null)} />}
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
      {(!save || menu) && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-stage-ink/55 text-center">
          <Account onPacks={() => void invoke({ kind: "load" })} />
          <div className="text-[10px] tracking-[.3em] text-stage-gold">D20 ADVENTURES</div>
          {save && !confirmNew ? (
            <>
              <h1 className="font-display text-5xl">{save.adventure.title}</h1>
              <div className="text-sm text-stage-cream">Realm of Myr</div>
              {turn && <div className="mt-4 text-sm text-stage-cream">{save.adventure.status === "completed" ? "Adventure complete" : `Round ${turn.order} · ${turn.title}`}</div>}
              <Button variant="epic" className="mt-2 text-xl" disabled={busy} onClick={() => setMenu(false)}>
                Continue
              </Button>
              <Pill disabled={busy} onClick={() => setConfirmNew(true)}>
                New game
              </Pill>
            </>
          ) : (
            <>
              {save && <p className="text-sm">Start a new adventure? This one is kept in your save archive.</p>}
              {!loaded && <p>Loading your saved adventure…</p>}
              {loaded && !providers.length && <p>Install and sign in to Claude Code, Codex, Grok, or Gemini CLI.</p>}
              {loaded && adventures.length > 0 && (
                <NewGame
                  key={adventure}
                  adventures={adventures}
                  adventure={adventure}
                  onAdventure={(id) => {
                    setAdventure(id)
                    setCreated(null)
                  }}
                  heroes={heroes}
                  providers={providers}
                  provider={provider}
                  onProvider={setProvider}
                  busy={busy}
                  waiting={Boolean(scene && !stage && !stageError)}
                  replacing={Boolean(save)}
                  created={created}
                  onStart={(chosenParty) => void start(chosenParty)}
                  onCreate={() => setCreator({})}
                  onEdit={(hero) => setCreator({ editing: hero })}
                  art={art}
                  painting={painting}
                  onPaint={painter ? (hero) => void paintHero(hero) : undefined}
                  onDelete={(hero) => void invoke({ kind: "deleteHero", id: hero.id })}
                  onCancel={save ? () => setConfirmNew(false) : undefined}
                />
              )}
            </>
          )}
        </div>
      )}
      {creator && (
        <HeroCreator
          options={creator.editing ? options : (chosen?.options ?? options)}
          editing={creator.editing}
          painted={creator.editing ? art[creator.editing.id] : undefined}
          busy={busy}
          onDraft={draftHero}
          onSave={saveHero}
          onClose={() => setCreator(null)}
        />
      )}
      {(error || stageError) && (
        <div role="alert" className={`${panel} absolute left-1/2 top-28 z-[60] w-[min(600px,90vw)] -translate-x-1/2 p-4 text-sm`}>
          <p>{error ?? stageError}</p>
          <Pill className="mt-3" disabled={busy} onClick={() => void invoke({ kind: "load" })}>
            Reload saved state
          </Pill>
          <Pill className="ml-3" onClick={() => setError(null)}>
            Dismiss
          </Pill>
        </div>
      )}
    </StageHud>
  )
}

function blobUrl(dataUrl: string) {
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (c) => c.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: "image/png" }))
}
