"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { inferStageMovement } from "@/app/_actions/stage-movement"
import { type CardInfo, CharacterCard } from "@/components/stage/character-card"
import { IconButton, Pill, panel, StageHud, useCompact } from "@/components/stage/hud"
import { type ChatLine, Journal, type JournalTurn } from "@/components/stage/journal"
import { MovementOverlay } from "@/components/stage/movement-overlay"
import { type CardCharacter, type CardMode, PromptCard } from "@/components/stage/prompt-card"
import { RotatePrompt, requestLandscape, usePhonePortrait } from "@/components/stage/rotate-gate"
import { type Bubble, Bubbles, Plate, type PlateLine } from "@/components/stage/stage-dialogue"
import { type OrderEntry, TurnOrder } from "@/components/stage/turn-order"
import { useStage } from "@/components/stage/use-stage"
import type { TierName } from "@/lib/stage"
import { BeatPlayer } from "@/lib/stage/beats"
import { bearing } from "@/lib/stage/movement"
import { ABOUT, TURNS } from "./gates-mock"

type Phase = "title" | "beats" | "hold" | "roll" | "thinking" | "done"
type RollOutcome = { total: number; success: boolean } | null
type SpokenBubble = Bubble & { speaker: string }
const CHAT: ChatLine[] = [
  { from: "Cassia", text: "I'm getting my folio out, obviously." },
  { from: "Yeva", text: "nobody tell Garlan about the purse" },
  { from: "Milos", text: "I have the marks, let's not start a riot on day one" },
]
const TIERS: TierName[] = ["balanced", "high", "ultra"]
// Walking speed per turn in metres (D&D: 25 ft for the dwarf and the halfling, 30 ft otherwise).
const SPEED: Record<string, number> = { branka: 7.5, cassia: 9, yeva: 7.5, milos: 9 }

export function TurnMock() {
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
  const [used, setUsed] = useState(0)
  const usedRef = useRef(0)
  const hover = useRef<{ x: number; z: number } | null>(null)
  const focused = useRef<string | null>(null)
  const movedTo = useRef<string | undefined>(undefined)
  const [note, setNote] = useState<string | undefined>(undefined)

  const party: CardCharacter[] = useMemo(() => (stage ? stage.cast.filter((c) => c.id !== "garlan").map((c) => ({ id: c.id, name: c.name, role: c.role, portrait: c.art.portrait })) : []), [stage])
  const nameOf = useCallback((id: string) => stage?.cast.find((c) => c.id === id)?.name ?? id, [stage])

  // Stage set-up: the line waits behind the title card; lines spoken on stage become bubbles and, for named characters, plates.
  useEffect(() => {
    if (!stage) return
    const loop = stage.loops.get("gate-line")
    if (loop) loop.paused = true
    stage.shot("gate", { instant: true })
    player.current = new BeatPlayer(stage, { onNarrate: setNarrated })
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

  const runTurn = useCallback(
    async (index: number, reply: string | null, roll: RollOutcome, replyFrom: string | null, rollInfo: JournalTurn["roll"]) => {
      if (!stage || !player.current) return
      const t = TURNS[index]
      const ps = t.narrative(reply, roll)
      setTurnIndex(index)
      setParagraphs(ps)
      setNarrated(0)
      setJournal((j) => [
        ...j,
        {
          number: index + 1,
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
      setUsed(0)
      await player.current.play(t.beats(reply, roll))
      if (t.hold) {
        stage.shot(t.hold.shot)
        setPhase("hold")
      } else setPhase("done")
    },
    [stage]
  )

  const start = () => {
    requestLandscape()
    const loop = stage?.loops.get("gate-line")
    if (loop) loop.paused = false
    runTurn(0, null, null, null, undefined)
  }
  const skip = () => {
    player.current?.skip()
    setNarrated(paragraphs.length - 1)
    setBubbles([])
    setPlates({ left: null, right: null })
  }
  // While the GM card is up, shots compose in the space above it (the character being asked stays in view).
  const onCardTop = useCallback((px: number) => stage?.setInsets({ bottom: px > 0 ? px + 12 : 0 }), [stage])
  const advance = (reply: string, roll: RollOutcome, rollInfo: JournalTurn["roll"], wait = 1600) => {
    const from = TURNS[turnIndex].hold?.actor
    setPhase("thinking")
    setTimeout(() => runTurn(turnIndex + 1, reply, roll, from ? nameOf(from) : null, rollInfo), wait)
  }
  // The written action decides where the character walks: the model picks a labelled place, a character or a step, and
  // the stage clamps it to their speed and to what is walkable. Skipped when the player already moved by clicking.
  const walkFromText = async (actorId: string, text: string) => {
    if (!stage || usedRef.current >= 0.2) return
    const me = stage.castAt(actorId)
    const speed = (SPEED[actorId] ?? 9) - usedRef.current
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
    usedRef.current += r.distance
    setUsed(usedRef.current)
    movedTo.current = it.summary
    setNote(`${nameOf(actorId).split(" ")[0]} moves ${it.summary} (${r.distance.toFixed(1)} m${r.short ? ", as far as they can" : ""}).`)
    const pace = it.pace === "hurry" ? 2.6 : it.pace === "sneak" ? 0.8 : 1.3
    const hold = TURNS[turnIndex].hold
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
    const hold = TURNS[turnIndex].hold
    if (!hold) return
    setPhase("thinking")
    await walkFromText(hold.actor, text)
    if (hold.roll) {
      pendingReply.current = text
      setPhase("roll")
    } else advance(text, null, undefined, 700)
  }
  const onRoll = (base: number) => {
    const hold = TURNS[turnIndex].hold
    const roll = hold?.roll
    if (!hold || !roll) return
    const total = base + roll.modifier
    const success = total >= roll.dc
    setTimeout(() => advance(pendingReply.current ?? "", { total, success }, { name: nameOf(hold.actor), skill: roll.skill, dc: roll.dc, base, total, success }), 1500)
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
      const views = stage ? Object.keys(stage.shots) : []
      const i = Number(e.key) - 1
      if (i >= 0 && i < views.length) stage?.shot(views[i])
    }
    addEventListener("keydown", onKey)
    return () => removeEventListener("keydown", onKey)
  }, [stage])

  // On your turn the ground is walkable, BG3 style: hover to see the path, click to walk there (within your movement).
  const moverId = phase === "hold" ? (TURNS[turnIndex].hold?.actor ?? null) : null
  const remaining = moverId ? Math.max(0, (SPEED[moverId] ?? 9) - used) : 0
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
      const onChar = stage.pick(x, y)
      hover.current = moverId && remaining > 0.3 && !onChar ? stage.groundAt(x, y) : null
      el.style.cursor = onChar ? "pointer" : hover.current ? "crosshair" : ""
    }
    const pu = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return
      const [x, y] = local(e)
      const id = stage.pick(x, y)
      if (id) {
        focus(id)
        return
      }
      if (!moverId || remaining <= 0.3) return
      const g = stage.groundAt(x, y)
      if (!g) return
      const r = stage.reach(moverId, g, remaining)
      if (r.distance < 0.2) return
      usedRef.current += r.distance
      setUsed(usedRef.current)
      const hold = TURNS[turnIndex].hold
      stage.moveCast(moverId, [r.x, r.z], { speed: 1.4 }).then(() => {
        if (hold && phaseRef.current === "hold") stage.shot(hold.shot)
      })
    }
    const leave = () => {
      hover.current = null
    }
    el.addEventListener("pointerdown", pd)
    el.addEventListener("pointermove", pm)
    el.addEventListener("pointerup", pu)
    el.addEventListener("pointerleave", leave)
    return () => {
      el.removeEventListener("pointerdown", pd)
      el.removeEventListener("pointermove", pm)
      el.removeEventListener("pointerup", pu)
      el.removeEventListener("pointerleave", leave)
    }
  }, [stage, focus, moverId, remaining, turnIndex])

  const hold = TURNS[turnIndex].hold
  const actorId = phase === "hold" || phase === "roll" ? (hold?.actor ?? null) : null
  const actor = party.find((c) => c.id === actorId) ?? null
  let mode: CardMode | null = null
  if (phase === "hold" && hold) mode = { kind: "hold", prompt: hold.prompt, suggestion: hold.suggestion, movement: { total: SPEED[hold.actor] ?? 9, used } }
  else if (phase === "roll" && hold?.roll) mode = { kind: "roll", roll: hold.roll }
  else if (phase === "thinking") mode = { kind: "thinking", note }
  else if (phase === "done") mode = { kind: "done", next: "Next: The Harvest Festival" }
  const place = stage?.loops.get("gate-line")?.partyPosition ?? -1
  const status = phase === "done" || place < 0 ? "Your party: inside the city" : place === 0 ? "Your party: at the checkpoint" : `Your party: ${place} group${place > 1 ? "s" : ""} from the front`
  const order: OrderEntry[] = [
    ...party.map((c) => ({ id: c.id, name: c.name, portrait: c.portrait })),
    ...(stage ? stage.cast.filter((c) => c.id === "garlan").map((c) => ({ id: c.id, name: c.name, portrait: c.art.portrait, npc: true })) : []),
  ]
  const activeId = actorId ?? (phase === "beats" && turnIndex > 0 ? "garlan" : null)
  const orderLabel = actor ? `${actor.name.split(" ")[0]}'s turn` : activeId === "garlan" ? "Garlan" : undefined
  const views = stage ? Object.entries(stage.shots).map(([id, s]) => ({ id, label: s.label ?? id })) : []

  return (
    <StageHud
      containerRef={containerRef}
      brand={{ name: "KORDAVOS", eyebrow: "THE MARCH OF DAVOS" }}
      caption={{
        chapter: "March of Davos  /  Arrival",
        title: phase === "title" ? "The Gates of Kordavos" : TURNS[turnIndex].title,
        text: phase === "beats" ? paragraphs[narrated] : undefined,
        hidden: !!plates.left || (compact && !!mode),
      }}
      location={{ eyebrow: "Arrival at Kordavos", title: actor ? `${actor.name.split(" ")[0]}'s turn` : `Turn ${turnIndex + 1}`, status, hidden: !!plates.right }}
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
      {stage && !hideUi && moverId && <MovementOverlay stage={stage} actorId={moverId} remaining={remaining} hover={hover} />}
      {stage && !hideUi && phase !== "title" && <TurnOrder order={order} activeId={activeId} label={orderLabel} compact={compact} onPick={focus} />}
      {stage && !hideUi && <Bubbles bubbles={bubbles} compact={compact} />}
      {!hideUi && plates.left && <Plate line={plates.left} compact={compact} />}
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
        />
      )}
      {!hideUi && phase === "beats" && (
        <div className={`absolute z-30 ${compact ? "right-4 bottom-[52px]" : "bottom-[122px] left-1/2 -translate-x-1/2"}`}>
          <Pill className="rounded-full px-5" onClick={skip}>
            Skip ▸▸
          </Pill>
        </div>
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
