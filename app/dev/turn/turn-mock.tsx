"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { inferStageMovement } from "@/app/_actions/stage-movement"
import { type CardInfo, CharacterCard } from "@/components/stage/character-card"
import { IconButton, Pill, panel, StageHud, useCompact } from "@/components/stage/hud"
import { type ChatLine, Journal, type JournalTurn } from "@/components/stage/journal"
import { Narration } from "@/components/stage/narration"
import { type CardCharacter, type CardMode, PromptCard } from "@/components/stage/prompt-card"
import { RotatePrompt, requestLandscape, usePhonePortrait } from "@/components/stage/rotate-gate"
import { type Bubble, Bubbles, Plate, type PlateLine } from "@/components/stage/stage-dialogue"
import { type OrderEntry, TurnOrder } from "@/components/stage/turn-order"
import { useStage } from "@/components/stage/use-stage"
import type { TierName } from "@/lib/stage"
import { BeatPlayer, lineSeconds, readingSeconds } from "@/lib/stage/beats"
import { bearing } from "@/lib/stage/movement"
import { cn } from "@/lib/utils"
import { ABOUT, FORCED_ROLL, type MockHold, type MockRoll, PARTY, type Story, TURNS } from "./gates-mock"

type Phase = "title" | "beats" | "hold" | "roll" | "thinking" | "done"
type RollOutcome = { total: number; success: boolean } | null
type SpokenBubble = Bubble & { speaker: string }
const CHAT: ChatLine[] = [
  { from: "Cassia", text: "I'm getting my folio out, obviously." },
  { from: "Yeva", text: "nobody tell Garlan about the purse" },
  { from: "Milos", text: "I have the marks, let's not start a riot on day one" },
]
const TIERS: TierName[] = ["balanced", "high", "ultra"]
// Narration pace: how long paragraphs and spoken lines stay up, relative to their reading time.
const PACES = { slow: 1.35, normal: 1, fast: 0.75 } as const
type Pace = keyof typeof PACES
// Walking speed per turn in metres (D&D: 25 ft for the dwarf and the halfling, 30 ft otherwise); the written action's
// movement is clamped to it.
const SPEED: Record<string, number> = { branka: 7.5, cassia: 9, yeva: 7.5, milos: 9 }

// `demo`: the public demo (/demo/kordavos) makes no model calls, so replies are never turned into movement.
export function TurnMock({ demo = false }: { demo?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [specs, setSpecs] = useState<{ set: unknown; staging: unknown } | null>(null)
  useEffect(() => {
    import("@/lib/stage/sets").then(async ({ SETS, STAGINGS }) => {
      const staging = await STAGINGS["march-of-davos/the-gates-of-kordavos"]()
      const set = await SETS["realm-of-myr/kordavos-south-gate"]()
      setSpecs({ set, staging })
    })
  }, [])
  const { stage, status: loading, error } = useStage(containerRef, specs)
  const portrait = usePhonePortrait()
  const compact = useCompact()

  const [phase, setPhase] = useState<Phase>("title")
  const phaseRef = useRef<Phase>("title")
  phaseRef.current = phase
  const [turnIndex, setTurnIndex] = useState(0)
  const [narrated, setNarrated] = useState(0)
  const [paragraphs, setParagraphs] = useState<string[]>([])
  const paragraphsRef = useRef<string[]>([])
  const [pace, setPace] = useState<Pace>("normal")
  const paceRef = useRef<Pace>("normal")
  paceRef.current = pace
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  // Step through (each paragraph and line waits for Continue) or play on its own at reading pace.
  const [stepMode, setStepMode] = useState(true)
  const [waiting, setWaiting] = useState(false)
  // What earlier rolls decided, for the scripted branches.
  const storyRef = useRef<Story>({})
  const [journal, setJournal] = useState<JournalTurn[]>([])
  const [bubbles, setBubbles] = useState<SpokenBubble[]>([])
  const [plates, setPlates] = useState<{ left: PlateLine | null; right: PlateLine | null }>({ left: null, right: null })
  const [open, setOpen] = useState<"journal" | "settings" | "card" | null>(null)
  const [card, setCard] = useState<CardInfo | null>(null)
  const [hideUi, setHideUi] = useState(false)
  const [, setTick] = useState(0)
  const player = useRef<BeatPlayer | null>(null)
  const key = useRef(0)
  const pendingReply = useRef<string | null>(null)
  // The roll on the card: the one the GM asks for after a reply, or a contest partway through the turn's beats.
  const [rolling, setRolling] = useState<{ actor: string; roll: MockRoll; prompt?: string } | null>(null)
  const contestRoll = useRef<((base: number) => void) | null>(null)
  const usedRef = useRef(0)
  const focused = useRef<string | null>(null)
  const movedTo = useRef<string | undefined>(undefined)
  const [note, setNote] = useState<string | undefined>(undefined)

  const party: CardCharacter[] = useMemo(
    () => (stage ? stage.cast.filter((c) => (PARTY as readonly string[]).includes(c.id)).map((c) => ({ id: c.id, name: c.name, role: c.role, portrait: c.art.portrait })) : []),
    [stage]
  )
  const nameOf = useCallback((id: string) => stage?.cast.find((c) => c.id === id)?.name ?? id, [stage])

  // Stage set-up: the line waits behind the title card; lines spoken on stage become bubbles and, for named characters, plates.
  useEffect(() => {
    if (!stage) return
    const loop = stage.loops.get("gate-line")
    if (loop) loop.paused = true
    stage.shot("gate", { instant: true })
    player.current = new BeatPlayer(stage, {
      onNarrate: setNarrated,
      onWaiting: setWaiting,
      narrationSeconds: (n) => readingSeconds(paragraphsRef.current[n] ?? "") * PACES[paceRef.current],
      lineSeconds: (_, text) => lineSeconds(text) * PACES[paceRef.current],
    })
    const off = stage.on("line", (l) => {
      const k = ++key.current
      const c = l.castId ? stage.cast.find((m) => m.id === l.castId) : null
      const point = l.point
      const anchor = c ? () => stage.project(c.id) : point ? () => stage.projectPoint(point()) : null
      if (!anchor) return
      const speaker = c?.id ?? `crowd-${k}`
      setBubbles((bs) => [...bs.filter((b) => b.speaker !== speaker), { key: k, anchor, text: l.text, named: !!c, speaker }])
      setTimeout(() => setBubbles((bs) => bs.filter((b) => b.key !== k)), (l.seconds + 0.3) * 1000)
      if (c) {
        const side = c.id === "garlan" ? "right" : "left"
        setPlates((p) => ({ ...p, [side]: { key: k, side, name: c.name, role: c.role, portrait: c.art.portrait, text: l.text } }))
        setTimeout(() => setPlates((p) => (p[side]?.key === k ? { ...p, [side]: null } : p)), (l.seconds + 0.35) * 1000)
      }
    })
    const poll = setInterval(() => setTick((t) => t + 1), 500)
    return () => {
      off()
      clearInterval(poll)
    }
  }, [stage])
  useEffect(() => {
    if (!stage) return
    if (portrait) stage.pause()
    else stage.resume()
  }, [stage, portrait])
  // The player is created with the stage, so it takes the mode once it exists too.
  useEffect(() => {
    if (player.current) player.current.mode = stepMode ? "step" : "auto"
  }, [stepMode, stage])
  const holdOf = (index: number): MockHold | null => {
    const h = TURNS[index].hold
    return typeof h === "function" ? h(storyRef.current) : h
  }

  const runTurn = useCallback(
    async (index: number, reply: string | null, roll: RollOutcome, replyFrom: string | null, rollInfo: JournalTurn["roll"]) => {
      if (!stage || !player.current) return
      const t = TURNS[index]
      const ps = t.narrative(reply, roll, storyRef.current)
      setTurnIndex(index)
      paragraphsRef.current = ps
      setParagraphs(ps)
      setNarrated(0)
      setJournal((j) => [
        ...j,
        {
          number: index,
          title: t.title,
          paragraphs: ps,
          reply: reply && replyFrom ? { name: replyFrom, text: reply, moved: usedRef.current || undefined, movedTo: movedTo.current } : undefined,
          roll: rollInfo,
        },
      ])
      setPhase("beats")
      focused.current = null
      usedRef.current = 0
      movedTo.current = undefined
      setNote(undefined)
      await player.current.play(t.beats(reply, roll, storyRef.current))
      const c = t.contest
      if (c) {
        // The beats stop for the contest; the rest of the turn plays out with its result.
        const base = await new Promise<number>((resolve) => {
          contestRoll.current = resolve
          setRolling({ actor: c.actor, roll: c.roll, prompt: c.prompt })
          setPhase("roll")
        })
        const versus = c.roll.versus
        const total = base + c.roll.modifier
        const success = total >= c.roll.dc
        const outcome = { total, success }
        await new Promise((r) => setTimeout(r, 1600))
        const more = c.narrative(reply, outcome)
        const all = [...ps, ...more]
        paragraphsRef.current = all
        setParagraphs(all)
        setJournal((j) =>
          j.map((e) =>
            e.number === index
              ? {
                  ...e,
                  paragraphs: all,
                  rollAt: ps.length,
                  roll: { name: nameOf(c.actor), skill: c.roll.skill, dc: c.roll.dc, base, total, success, versus: versus ? `${versus.name}'s ${versus.natural + versus.modifier}` : undefined },
                }
              : e
          )
        )
        setRolling(null)
        setPhase("beats")
        const offset = ps.length
        await player.current.play(
          c.beats(reply, outcome).map((b) => ("narrate" in b ? { narrate: b.narrate + offset } : b)),
          { append: true }
        )
      }
      afterBeats(index)
    },
    [stage, nameOf]
  )
  // When the beats end, the GM asks the next character (framed on them) or the encounter is over.
  const afterBeats = (index: number) => {
    const hold = holdOf(index)
    if (hold) {
      stage?.shot(hold.shot)
      setPhase("hold")
    } else setPhase("done")
  }

  const start = () => {
    requestLandscape()
    const loop = stage?.loops.get("gate-line")
    if (loop) loop.paused = false
    runTurn(0, null, null, null, undefined)
  }
  const clearDialogue = () => {
    setBubbles([])
    setPlates({ left: null, right: null })
  }
  const clearDialogueRef = useRef(clearDialogue)
  clearDialogueRef.current = clearDialogue
  const skip = () => {
    player.current?.skip()
    setNarrated(paragraphs.length - 1)
    clearDialogue()
  }
  const back = () => {
    clearDialogue()
    player.current?.back()
  }
  const next = () => {
    clearDialogue()
    player.current?.next()
  }
  // Continue: past the paragraph or line being read (step), or on to the next paragraph (auto).
  const advanceStep = () => {
    clearDialogue()
    player.current?.continue()
  }
  const advanceRef = useRef(advanceStep)
  advanceRef.current = advanceStep
  // Replay the turn: from the narration it jumps back to the first paragraph; from the GM's question it plays the turn
  // again and returns to the question (the reply being written is kept).
  const replay = async () => {
    const p = player.current
    if (!p) return
    clearDialogue()
    if (p.playing) {
      p.replay()
      return
    }
    setOpen(null)
    focused.current = null
    setPhase("beats")
    await p.replay()
    afterBeats(turnIndex)
  }
  // While the GM card is up, shots compose in the space above it (the character being asked stays in view).
  const onCardTop = useCallback((px: number) => stage?.setInsets({ bottom: px > 0 ? px + 12 : 0 }), [stage])
  const advance = (reply: string, roll: RollOutcome, rollInfo: JournalTurn["roll"], wait = 1600) => {
    const from = holdOf(turnIndex)?.actor
    setPhase("thinking")
    setTimeout(() => runTurn(turnIndex + 1, reply, roll, from ? nameOf(from) : null, rollInfo), wait)
  }
  // The written action decides where the character walks: the model picks a labelled place, a character or a step, and
  // the stage clamps it to their speed and to what is walkable.
  const walkFromText = async (actorId: string, text: string) => {
    if (!stage) return
    const me = stage.castAt(actorId)
    const speed = SPEED[actorId] ?? 9
    const places = Object.entries(stage.set.marks)
      .filter(([, m]) => m.label)
      .map(([id, m]) => ({ id, label: m.label as string, distance: Math.hypot(m.at[0] - me.x, m.at[1] - me.z), direction: bearing(me, { x: m.at[0], z: m.at[1] }) }))
    const characters = stage.cast.filter((c) => c.id !== actorId).map((c) => ({ id: c.id, name: c.name, distance: Math.hypot(c.x - me.x, c.z - me.z), direction: bearing(me, c) }))
    const res = await inferStageMovement({ actor: { id: actorId, name: nameOf(actorId), speed }, action: text, places, characters })
    if ("error" in res) {
      console.warn("[stage] movement inference failed", res.error)
      return
    }
    const it = res.intent
    let target: { x: number; z: number } | null = null
    if (it.move === "place" && it.place) target = stage.point(it.place)
    else if (it.move === "character" && it.character) {
      const t = stage.point(it.character)
      const d = Math.hypot(t.x - me.x, t.z - me.z)
      const k = Math.max(0, d - 1.1) / Math.max(d, 1e-6)
      target = { x: me.x + (t.x - me.x) * k, z: me.z + (t.z - me.z) * k }
    } else if (it.move === "relative" && it.direction) {
      const m = it.meters ?? 0.7
      const f = { x: Math.sin(me.ry), z: Math.cos(me.ry) }
      const l = { x: Math.cos(me.ry), z: -Math.sin(me.ry) }
      const v = it.direction === "forward" ? f : it.direction === "back" ? { x: -f.x, z: -f.z } : it.direction === "left" ? l : { x: -l.x, z: -l.z }
      target = { x: me.x + v.x * m, z: me.z + v.z * m }
    }
    if (!target) {
      setNote(`${nameOf(actorId).split(" ")[0]} stays put.`)
      return
    }
    const r = stage.reach(actorId, target, speed)
    if (r.distance < 0.2) return
    usedRef.current = r.distance
    movedTo.current = it.summary
    setNote(`${nameOf(actorId).split(" ")[0]} moves ${it.summary} (${r.distance.toFixed(1)} m${r.short ? ", as far as they can" : ""}).`)
    const pace = it.pace === "hurry" ? 2.6 : it.pace === "sneak" ? 0.8 : 1.3
    const hold = holdOf(turnIndex)
    const arrived = stage.moveCast(actorId, [r.x, r.z], { speed: pace })
    if (hold) stage.shot(hold.shot)
    await arrived
    // Frame them where they stopped.
    if (hold) stage.shot(hold.shot)
    if (it.face) {
      try {
        stage.faceCast(actorId, it.face)
      } catch {
        // an unknown id: keep the walking direction
      }
    }
  }
  const onReply = async (text: string) => {
    const hold = holdOf(turnIndex)
    if (!hold) return
    setPhase("thinking")
    if (!hold.stay && !demo) await walkFromText(hold.actor, text)
    if (hold.roll) {
      pendingReply.current = text
      setRolling({ actor: hold.actor, roll: hold.roll, prompt: hold.rollPrompt })
      setPhase("roll")
    } else advance(text, null, undefined, 700)
  }
  const onRoll = (base: number) => {
    if (contestRoll.current) {
      const resolve = contestRoll.current
      contestRoll.current = null
      resolve(base)
      return
    }
    const hold = holdOf(turnIndex)
    const roll = hold?.roll
    if (!hold || !roll) return
    const total = base + roll.modifier
    const success = total >= roll.dc
    if (roll.key) storyRef.current = { ...storyRef.current, [roll.key]: success }
    const versus = roll.versus ? `${roll.versus.name}'s ${roll.versus.natural + roll.versus.modifier}` : undefined
    setTimeout(() => advance(pendingReply.current ?? "", { total, success }, { name: nameOf(hold.actor), skill: roll.skill, dc: roll.dc, base, total, success, versus }), 1500)
  }
  // Clicking a character takes the camera to them; clicking them again opens their card.
  const focus = useCallback(
    (id: string) => {
      const c = stage?.cast.find((m) => m.id === id)
      if (!stage || !c) return
      if (focused.current === id) {
        setCard({ id, name: c.name, role: c.role, portrait: c.art.portrait, ...ABOUT[id] })
        setOpen("card")
        return
      }
      focused.current = id
      setOpen((o) => (o === "card" ? null : o))
      stage.shot({ subject: id, distance: 2.6 + c.height * 0.8, angle: 18, height: Math.min(1.8, c.height * 0.95), lookHeight: c.height * 0.7, fov: 40 })
    },
    [stage]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches?.("input,textarea,select")) return
      if (e.key === "h" || e.key === "H") setHideUi((h) => !h)
      if (e.key === "Escape") setOpen(null)
      if (phaseRef.current === "beats" && e.key === "ArrowLeft") {
        clearDialogueRef.current()
        player.current?.back()
      }
      if (phaseRef.current === "beats" && (e.key === "ArrowRight" || e.key === " " || e.key === "Enter")) {
        e.preventDefault()
        advanceRef.current()
      }
      const views = stage ? Object.keys(stage.shots) : []
      const i = Number(e.key) - 1
      if (i >= 0 && i < views.length) stage?.shot(views[i])
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [stage])

  // Clicking a character focuses them (and opens their card on a second click); a drag orbits the camera instead.
  useEffect(() => {
    const el = containerRef.current
    if (!el || !stage) return
    let down: [number, number] | null = null
    const local = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      return [e.clientX - r.left, e.clientY - r.top] as const
    }
    const pd = (e: PointerEvent) => {
      down = [e.clientX, e.clientY]
    }
    const pm = (e: PointerEvent) => {
      if (e.buttons) return
      const [x, y] = local(e)
      el.style.cursor = stage.pick(x, y) ? "pointer" : ""
    }
    const pu = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
      const [x, y] = local(e)
      const id = stage.pick(x, y)
      if (id) focus(id)
      // A click on the scene while the story is playing moves it on, like Continue.
      else if (phaseRef.current === "beats") advanceRef.current()
    }
    el.addEventListener("pointerdown", pd)
    el.addEventListener("pointermove", pm)
    el.addEventListener("pointerup", pu)
    return () => {
      el.removeEventListener("pointerdown", pd)
      el.removeEventListener("pointermove", pm)
      el.removeEventListener("pointerup", pu)
    }
  }, [stage, focus])

  const hold = holdOf(turnIndex)
  const actorId = phase === "roll" ? (rolling?.actor ?? null) : phase === "hold" ? (hold?.actor ?? null) : null
  const actor = party.find((c) => c.id === actorId) ?? null
  let mode: CardMode | null = null
  if (phase === "hold" && hold) mode = { kind: "hold", prompt: hold.prompt, suggestion: hold.suggestion }
  else if (phase === "roll" && rolling) mode = { kind: "roll", roll: rolling.roll, prompt: rolling.prompt }
  else if (phase === "thinking") mode = { kind: "thinking", note }
  else if (phase === "done") mode = { kind: "done", next: "Next: The Harvest Festival" }
  const place = stage?.loops.get("gate-line")?.partyPosition ?? -1
  const status = phase === "done" || place < 0 ? "Your party: inside the city" : place === 0 ? "Your party: at the checkpoint" : `Your party: ${place} group${place > 1 ? "s" : ""} from the front`
  const order: OrderEntry[] = [
    ...party.map((c) => ({ id: c.id, name: c.name, portrait: c.portrait })),
    ...(stage ? stage.cast.filter((c) => c.id === "garlan").map((c) => ({ id: c.id, name: c.name, portrait: c.art.portrait, npc: true })) : []),
  ]
  const activeId = actorId ?? (phase === "beats" ? (TURNS[turnIndex].npc ?? null) : null)
  const orderLabel = actor ? `${actor.name.split(" ")[0]}'s turn` : activeId === "garlan" ? "Garlan" : undefined
  const views = stage ? Object.entries(stage.shots).map(([id, s]) => ({ id, label: s.label ?? id })) : []

  return (
    <StageHud
      containerRef={containerRef}
      title={{ eyebrow: "The March of Davos  ·  Arrival", text: "The Gates of Kordavos" }}
      location={{
        eyebrow: "Arrival at Kordavos",
        title: actor ? `${actor.name.split(" ")[0]}'s turn` : TURNS[turnIndex].intro ? "Intro" : `Round ${TURNS[turnIndex].round}`,
        status,
        hidden: !!plates.right,
      }}
      views={views}
      activeView={stage?.activeShot ?? null}
      onView={(id) => {
        focused.current = null
        stage?.shot(id)
      }}
      hidden={hideUi || phase === "title"}
      compact={compact}
      actions={
        <>
          <IconButton label="Journal" active={open === "journal"} onClick={() => setOpen(open === "journal" ? null : "journal")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true">
              <path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
              <path d="M5 17a3 3 0 0 1 3-3h10M9 8h6" />
            </svg>
          </IconButton>
          <IconButton label="Scene settings" active={open === "settings"} onClick={() => setOpen(open === "settings" ? null : "settings")}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true">
              <path d="M5 3v18M12 3v18M19 3v18" />
              <path d="M2 8h6M9 16h6M16 9h6" strokeWidth="3" />
            </svg>
          </IconButton>
          <IconButton
            label="Fullscreen"
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen()
              else document.documentElement.requestFullscreen?.().catch(() => {})
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.35" aria-hidden="true">
              <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />
            </svg>
          </IconButton>
        </>
      }
    >
      {stage && !hideUi && phase !== "title" && <TurnOrder order={order} activeId={activeId} label={orderLabel} compact={compact} onPick={focus} />}
      {stage && !hideUi && <Bubbles bubbles={bubbles} compact={compact} />}
      {!hideUi && phase !== "title" && (
        <div className={cn("pointer-events-none absolute z-20 flex flex-col gap-3", compact ? "bottom-[52px] left-4 w-[min(380px,48vw)]" : "bottom-[118px] left-10 w-[min(440px,34vw)]")}>
          {/* On phones the bubble carries the line; a plate over the narration would cover half the screen. */}
          {plates.left && !compact && <Plate line={plates.left} compact={compact} docked />}
          <Narration
            heading={`${TURNS[turnIndex].intro ? "Intro" : `Round ${TURNS[turnIndex].round}`}  ·  ${TURNS[turnIndex].title}`}
            text={paragraphs[narrated]}
            index={narrated}
            count={paragraphs.length}
            hidden={phase !== "beats"}
            compact={compact}
            onReplay={replay}
            onBack={back}
            onNext={next}
            onSkip={skip}
            step={stepMode}
            waiting={waiting}
            onContinue={advanceStep}
          />
        </div>
      )}
      {!hideUi && phase === "hold" && (
        <div className={cn("absolute z-20", compact ? "bottom-[52px] left-4" : "bottom-[118px] left-10")}>
          <Pill className="fade-in flex items-center gap-2 rounded-full px-4" onClick={replay}>
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true" className="h-3 w-3">
              <path d="M2.2 6a3.8 3.8 0 1 0 1.2-2.8" />
              <path d="M2 1.4v2.4h2.4" />
            </svg>
            Replay turn
          </Pill>
        </div>
      )}
      {!hideUi && plates.right && <Plate line={plates.right} compact={compact} />}
      {!hideUi && mode && (
        <PromptCard
          mode={mode}
          actor={actor}
          party={party}
          compact={compact}
          onReply={onReply}
          onRoll={onRoll}
          onPick={focus}
          onTop={mode.kind === "hold" || mode.kind === "roll" ? onCardTop : undefined}
          forcedRoll={FORCED_ROLL ?? undefined}
          demo
          draft={drafts[turnIndex] ?? ""}
          onDraft={(text) => setDrafts((d) => ({ ...d, [turnIndex]: text }))}
        />
      )}
      {!hideUi && open === "journal" && <Journal turns={journal} chat={CHAT} compact={compact} onClose={() => setOpen(null)} />}
      {!hideUi && open === "card" && card && <CharacterCard info={card} compact={compact} onClose={() => setOpen(null)} />}
      {!hideUi && open === "settings" && stage && (
        <section className={`${panel} fade-in absolute top-[86px] right-10 z-40 w-[292px] p-6`}>
          <h2 className="mb-2 font-serif text-[25px] font-normal">Set the scene</h2>
          <div className="mt-5 border-t border-stage-line/25 pt-4">
            <div className="mb-3 text-[10px] tracking-wide">Render quality</div>
            <div className="flex gap-2">
              {TIERS.map((t) => (
                <Pill
                  key={t}
                  className="flex-1 capitalize"
                  active={stage.tier === t}
                  onClick={() => {
                    stage.setTier(t)
                    setTick((x) => x + 1)
                  }}
                >
                  {t}
                </Pill>
              ))}
            </div>
          </div>
          <div className="mt-5 border-t border-stage-line/25 pt-4">
            <div className="mb-3 text-[10px] tracking-wide">Story</div>
            <div className="flex gap-2">
              <Pill className="flex-1" active={stepMode} onClick={() => setStepMode(true)}>
                Step through
              </Pill>
              <Pill className="flex-1" active={!stepMode} onClick={() => setStepMode(false)}>
                Auto
              </Pill>
            </div>
          </div>
          <div className={cn("mt-5 border-t border-stage-line/25 pt-4", stepMode && "hidden")}>
            <div className="mb-3 text-[10px] tracking-wide">Narration pace</div>
            <div className="flex gap-2">
              {(Object.keys(PACES) as Pace[]).map((p) => (
                <Pill key={p} className="flex-1 capitalize" active={pace === p} onClick={() => setPace(p)}>
                  {p}
                </Pill>
              ))}
            </div>
          </div>
          <div className="mt-5 flex gap-2 border-t border-stage-line/25 pt-4">
            <Pill
              className="flex-1"
              active={stage.motion}
              onClick={() => {
                stage.motion = !stage.motion
                setTick((x) => x + 1)
              }}
            >
              {stage.motion ? "Motion on" : "Motion off"}
            </Pill>
            <Pill className="flex-1" onClick={() => setHideUi(true)}>
              Hide interface
            </Pill>
          </div>
        </section>
      )}
      {hideUi && phase !== "title" && (
        <button type="button" onClick={() => setHideUi(false)} className="absolute right-4 bottom-4 z-40 rounded border border-white/25 bg-stage-panel/50 px-3 py-2 text-[10px] text-stage-cream">
          Show interface · H
        </button>
      )}
      {phase === "title" && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-stage-ink/45 text-center">
          <svg viewBox="0 0 60 72" aria-hidden="true" className="h-[70px] w-14 fill-none stroke-stage-gold" strokeWidth="1">
            <path d="m30 2 25 15v37L30 70 5 54V17Z" />
            <path d="M15 50V25h9v25m12 0V25h9v25M24 50V34l6-8 6 8v16M11 25h17m4 0h17M20 20v-6m20 6v-6M30 9v9M25 13h10M11 55h38" />
          </svg>
          <div className="font-display text-[clamp(28px,3.6vw,46px)] [text-shadow:0_2px_25px_#000]">Arrival at Kordavos</div>
          <div className="text-[9px] tracking-[0.3em] text-stage-sage">THE MARCH OF DAVOS</div>
          {stage ? (
            <button type="button" onClick={start} className="stage-brass mt-3 rounded-full border px-11 py-3 font-display text-[15px] font-bold tracking-[0.3em] transition-[filter]">
              Play
            </button>
          ) : (
            <>
              <div className="h-px w-44 overflow-hidden bg-stage-brass/30">
                <div className="h-full w-3/5 animate-pulse bg-stage-gold" />
              </div>
              <div className="text-[10px] tracking-[0.2em] text-stage-muted">{(error ?? loading).toUpperCase()}</div>
            </>
          )}
        </div>
      )}
      {portrait && <RotatePrompt />}
    </StageHud>
  )
}
