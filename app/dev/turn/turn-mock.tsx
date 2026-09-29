"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RotatePrompt, requestLandscape, usePhonePortrait } from "@/components/stage/rotate-gate"
import { PortraitPlate, SpeechBubble, type SpokenLine } from "@/components/stage/stage-dialogue"
import { StageTurnLayout, useCompact } from "@/components/stage/stage-turn-layout"
import { type ChatLine, type PanelCharacter, type PanelTurn, TurnPanel, type TurnPhase } from "@/components/stage/turn-panel"
import { useStage } from "@/components/stage/use-stage"
import { Button } from "@/components/ui/button"
import { BeatPlayer } from "@/lib/stage/beats"
import { PARTY, START, TURNS } from "./gates-mock"

type RollOutcome = { total: number; success: boolean } | null
const CHAT: ChatLine[] = [
  { from: "Cassia", text: "I'm getting my folio out, obviously." },
  { from: "Yeva", text: "nobody tell Garlan about the purse" },
  { from: "Milos", text: "I have the marks, let's not start a riot on day one" },
]

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
  const { stage, status, error } = useStage(containerRef, specs)
  const portrait = usePhonePortrait()
  const compact = useCompact()

  const [phase, setPhase] = useState<TurnPhase>("start")
  const [turnIndex, setTurnIndex] = useState(0)
  const [narrated, setNarrated] = useState(0)
  const [line, setLine] = useState<SpokenLine | null>(null)
  const [open, setOpen] = useState(true)
  const [history, setHistory] = useState<PanelTurn[]>([])
  const [current, setCurrent] = useState<PanelTurn>({ number: 1, title: TURNS[0].title, paragraphs: [] })
  const player = useRef<BeatPlayer | null>(null)
  const lineKey = useRef(0)
  const lineTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingReply = useRef<string | null>(null)
  const lastRun = useRef<{ index: number; reply: string | null; roll: RollOutcome; cast: { id: string; x: number; z: number; ry: number }[] } | null>(null)

  const party: PanelCharacter[] = useMemo(
    () => (stage ? stage.cast.map((c) => ({ id: c.id, name: c.name, role: c.role, portrait: c.art.portrait, type: c.id === "garlan" ? "npc" : "pc", healthPercent: 100 })) : []),
    [stage]
  )
  const nameOf = useCallback((id: string) => stage?.cast.find((c) => c.id === id)?.name ?? id, [stage])

  // Stage set-up: the party one step back in the line, the sergeant watching its head, the gate behind the title card.
  useEffect(() => {
    if (!stage) return
    for (const id of PARTY) stage.placeCast(id, START[id], "garlan")
    stage.faceCast("garlan", "queueHead")
    stage.shot("gate", { instant: true })
    player.current = new BeatPlayer(stage, {
      onNarrate: setNarrated,
      onLine: (castId, text, seconds) => {
        const c = stage.cast.find((m) => m.id === castId)
        if (lineTimer.current) clearTimeout(lineTimer.current)
        setLine({ key: ++lineKey.current, castId, name: c?.name ?? castId, role: c?.role, portrait: c?.art.portrait, text })
        lineTimer.current = setTimeout(() => setLine(null), seconds * 1000)
      },
    })
  }, [stage])
  useEffect(() => {
    if (!stage) return
    if (portrait) stage.pause()
    else stage.resume()
  }, [stage, portrait])

  const runTurn = useCallback(
    async (index: number, reply: string | null, roll: RollOutcome, replyFrom: string | null, rollInfo: PanelTurn["roll"]) => {
      if (!stage || !player.current) return
      const t = TURNS[index]
      lastRun.current = { index, reply, roll, cast: stage.cast.map((c) => ({ id: c.id, x: c.x, z: c.z, ry: c.ry })) }
      setTurnIndex(index)
      setCurrent({ number: index + 1, title: t.title, paragraphs: t.narrative(reply, roll), reply: reply && replyFrom ? { name: replyFrom, text: reply } : undefined, roll: rollInfo })
      setNarrated(0)
      setPhase("beats")
      await player.current.play(t.beats(reply, roll))
      setLine(null)
      if (t.hold) {
        stage.shot(t.hold.shot)
        setPhase("hold")
      } else setPhase("done")
    },
    [stage]
  )

  const start = () => {
    requestLandscape()
    runTurn(0, null, null, null, undefined)
  }
  const skip = () => {
    player.current?.skip()
    setNarrated(current.paragraphs.length - 1)
    setLine(null)
  }
  const replay = () => {
    const r = lastRun.current
    if (!stage || !r) return
    for (const c of r.cast) {
      stage.placeCast(c.id, [c.x, c.z])
      const m = stage.cast.find((x) => x.id === c.id)
      if (m) m.ry = c.ry
    }
    runTurn(r.index, r.reply, r.roll, current.reply?.name ?? null, current.roll)
  }
  const advance = (reply: string, roll: RollOutcome, rollInfo: PanelTurn["roll"]) => {
    const from = TURNS[turnIndex].hold?.actor
    setHistory((h) => [...h, current])
    setPhase("thinking")
    setTimeout(() => runTurn(turnIndex + 1, reply, roll, from ? nameOf(from) : null, rollInfo), 1600)
  }
  const onReply = (text: string) => {
    const hold = TURNS[turnIndex].hold
    if (!hold) return
    if (hold.roll) {
      pendingReply.current = text
      setCurrent((c) => ({ ...c, reply: undefined }))
      setPhase("roll")
      return
    }
    advance(text, null, undefined)
  }
  const onRoll = (base: number) => {
    const hold = TURNS[turnIndex].hold
    if (!hold?.roll) return
    const total = base + hold.roll.modifier
    const success = total >= hold.roll.dc
    // Let the die settle on screen before the GM answers.
    setTimeout(() => advance(pendingReply.current ?? "", { total, success }, { name: nameOf(hold.actor), skill: hold.roll!.skill, dc: hold.roll!.dc, base, total, success }), 1400)
  }
  const onLook = (id: string) => {
    const c = stage?.cast.find((m) => m.id === id)
    if (!stage || !c) return
    stage.shot({ subject: id, distance: 3.2, angle: 15, height: Math.min(1.75, c.height * 0.95), lookHeight: c.height * 0.72, fov: 40 })
  }

  const hold = TURNS[turnIndex].hold
  const panel = (
    <TurnPanel
      adventure="The March of Davos"
      encounter="The Gates of Kordavos"
      turn={current}
      history={history}
      party={party}
      actorId={phase === "hold" || phase === "roll" ? (hold?.actor ?? null) : null}
      phase={phase}
      narrated={narrated}
      prompt={hold?.prompt ?? null}
      suggestion={hold?.suggestion ?? null}
      roll={hold?.roll ?? null}
      chat={CHAT}
      onLook={onLook}
      onReply={onReply}
      onRoll={onRoll}
      onReplay={replay}
      compact={compact}
    />
  )

  const stageOverlay = (
    <>
      {line && (
        <div className="absolute bottom-4 left-4 flex">
          <PortraitPlate line={line} compact={compact} />
        </div>
      )}
      {phase === "beats" && (
        <div className="pointer-events-auto absolute right-14 bottom-4">
          <Button variant="outline" className="rounded-full px-4 py-1 font-display text-xs tracking-wider" onClick={skip}>
            Skip ▸▸
          </Button>
        </div>
      )}
    </>
  )

  const overlay = (
    <>
      {stage && line && <SpeechBubble stage={stage} line={line} compact={compact} />}
      {(!stage || phase === "start") && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/35 px-6 text-center">
          <div className="font-display text-xs uppercase tracking-[0.3em] text-primary-200" style={{ textShadow: "0 0 8px #000" }}>
            The March of Davos
          </div>
          <h1 className="font-display text-3xl font-bold text-amber-300 sm:text-5xl" style={{ textShadow: "0 0 12px #000, 0 0 32px #000" }}>
            The Gates of Kordavos
          </h1>
          {stage ? (
            <Button variant="epic" className="mt-2" onClick={start}>
              Play
            </Button>
          ) : (
            <div className="font-serif text-sm text-primary-200">{error ?? status}</div>
          )}
        </div>
      )}
      {portrait && <RotatePrompt />}
    </>
  )

  return <StageTurnLayout containerRef={containerRef} stage={stage} panel={panel} overlay={overlay} stageOverlay={stageOverlay} open={open && phase !== "start"} onOpenChange={setOpen} />
}
