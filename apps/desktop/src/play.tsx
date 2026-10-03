import { findCurrentActor } from "@d20/gm-core/utils/turn-actors"
import { readingSeconds } from "@d20/stage/beats"
import gateSet from "@d20/stage/sets/realm-of-myr/kordavos-south-gate.json"
import gateStaging from "@d20/stage/stagings/march-of-davos/the-gates-of-kordavos.json"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { CharacterCard } from "@/components/stage/character-card"
import { Pill, panel, StageHud, useCompact } from "@/components/stage/hud"
import { Journal, type JournalTurn } from "@/components/stage/journal"
import { Narration } from "@/components/stage/narration"
import { type CardCharacter, type CardMode, PromptCard } from "@/components/stage/prompt-card"
import { Bubbles, Plate } from "@/components/stage/stage-dialogue"
import { TurnOrder } from "@/components/stage/turn-order"
import { useStage } from "@/components/stage/use-stage"
import { parseNarrative } from "@/lib/utils/parse-narrative"
import type { GameCommand } from "../runtime/game"
import type { Save } from "../runtime/store"
import { send } from "./bridge"
import { characterInfo } from "./character-info"
import { applyMovement, context, stageId, positions as stagePositions } from "./movement"

const prose = (text: string, originals = false) =>
  parseNarrative(text).flatMap((part) => {
    if (part.type === "original-reply") return originals ? [`Player action: ${part.value}`] : []
    if (part.type === "diceroll")
      return [
        `${part.character} · ${part.rollType}: ${part.baseRoll ?? part.result}${part.modifier !== undefined ? ` + ${part.modifier} = ${part.result}` : ""}, DC ${part.difficulty}. ${part.success ? "Success" : "Failure"}.`,
      ]
    return [part.value]
  })
// The real intro starts at the checkpoint. The ambient queue must not move the party independently of game state.
const staging = structuredClone(gateStaging)
staging.loops["gate-line"].party.position = 0
const portrait = (name: string) => gateStaging.cast.find((c) => c.id === stageId(name))?.art.portrait

export function DesktopGame() {
  const [save, setSave] = useState<Save | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [providers, setProviders] = useState<string[]>([])
  const [provider, setProvider] = useState("claude")
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [open, setOpen] = useState<"journal" | "settings" | null>(null)
  const [cardId, setCardId] = useState<string | null>(null)
  const [hidden, setHidden] = useState(false)
  const [paragraph, setParagraph] = useState(0)
  const [auto, setAuto] = useState(false)
  const [reading, setReading] = useState(true)
  const previousText = useRef<{ turn?: string; paragraphs: string[] }>({ paragraphs: [] })
  const [, redraw] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const compact = useCompact()
  const turn = save?.turns.find((t) => t._id === save.adventure.currentTurnId)
  const cardCharacter = turn?.characters.find((c) => c.id === cardId)
  const card = cardCharacter ? characterInfo(cardCharacter, portrait(cardCharacter.name)) : null
  const atGate = !turn || turn.encounterId === "the-gates-of-kordavos"
  const specs = useMemo(() => (atGate ? { set: gateSet, staging, tier: "balanced" as const } : null), [atGate])
  const { stage, status: loading, error: stageError } = useStage(containerRef, specs)
  const actor = turn ? findCurrentActor(turn.characters) : undefined
  const text = useMemo(() => prose(turn?.narrative ?? ""), [turn?.narrative])
  const speech = useMemo(() => {
    const paragraphText = text[paragraph] ?? ""
    const quote = paragraphText.match(/[“"]([^”"]{1,240})[”"]/)?.[1]
    const named = stage?.cast.filter((c) => paragraphText.includes(c.name.split(" ")[0])) ?? []
    return quote && named.length === 1 && reading ? { cast: named[0], text: quote } : null
  }, [stage, text, paragraph, reading])
  useEffect(() => {
    if (stage && speech) stage.shot({ subject: speech.cast.id, distance: 5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 })
  }, [stage, speech])
  useEffect(() => {
    if (!auto || !reading || busy || !text.length) return
    const timer = setTimeout(() => (paragraph < text.length - 1 ? setParagraph((n) => n + 1) : setReading(false)), readingSeconds(text[paragraph] ?? "") * 1000)
    return () => clearTimeout(timer)
  }, [auto, reading, busy, text, paragraph])
  const saveRef = useRef(save)
  saveRef.current = save
  const focused = useRef<string | null>(null)
  const moved = useRef(new Set<string>())
  const invoke = useCallback(async (command: GameCommand) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      const res = await send(command)
      setSave(res.state)
      if (res.providers) {
        setProviders(res.providers)
        setProvider((p) => (res.providers!.includes(p) ? p : (res.providers![0] ?? "claude")))
      }
      if (res.error) setError(res.error)
      if (!res.error && command.kind === "reply") setDraft("")
      return res.state
    } catch (e) {
      setError(String(e))
      return null
    } finally {
      busyRef.current = false
      setBusy(false)
      setLoaded(true)
    }
  }, [])
  useEffect(() => {
    void invoke({ kind: "load" })
  }, [invoke])
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
    const loop = stage.loops.get("gate-line")
    if (loop) loop.paused = true
    stage.shot("gate", { instant: true })
    const timer = setInterval(() => redraw((n) => n + 1), 1000)
    return () => clearInterval(timer)
  }, [stage])
  useEffect(() => {
    if (!stage || !turn) return
    for (const [id, p] of Object.entries(saveRef.current?.positions ?? {})) {
      if (stage.cast.some((c) => c.id === id)) stage.placeCast(id, [p.x, p.z], (p.ry * 180) / Math.PI)
    }
  }, [stage, turn?._id])
  useEffect(() => {
    if (!stage || !save || !turn || busy) return
    const pending = Object.entries(save.movement).find(([key]) => key.startsWith(`${turn._id}:`) && !save.appliedMovement?.includes(key) && !moved.current.has(key))
    if (!pending) return
    const [key, movement] = pending
    const c = turn.characters.find((c) => c.id === movement.actorId)
    if (!c || !c.isComplete || !stage.cast.some((s) => s.id === stageId(c.name))) return
    const check = save.rollChecks?.[key]
    if (check && c.rollResult === undefined) return
    moved.current.add(key)
    void (async () => {
      busyRef.current = true
      setBusy(true)
      try {
        const positions = check && c.rollResult! < check.dc ? stagePositions(stage) : await applyMovement(stage, c.name, movement.intent)
        busyRef.current = false
        await invoke({ kind: "positions", turnId: turn._id, positions, appliedMovement: key })
      } catch (error) {
        setError(`Could not save the movement: ${String(error)}`)
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    })()
  }, [stage, save, turn, busy, invoke])
  const focus = useCallback(
    (id: string) => {
      const character = saveRef.current?.turns.find((t) => t._id === saveRef.current?.adventure.currentTurnId)?.characters.find((c) => c.id === id || stageId(c.name) === id)
      if (!character) return
      const sid = stageId(character.name)
      if (stage?.cast.some((c) => c.id === sid) && focused.current !== id) {
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
      }
      const view = Object.keys(stage?.shots ?? {})[Number(e.key) - 1]
      if (view) stage?.shot(view)
    }
    addEventListener("keydown", fn)
    return () => removeEventListener("keydown", fn)
  }, [stage])
  useEffect(() => {
    if (stage && actor && !reading && stage.cast.some((c) => c.id === stageId(actor.name))) stage.shot({ subject: stageId(actor.name), distance: 5, angle: 18, height: 1.7, lookHeight: 1.1, fov: 45 })
  }, [stage, actor?.id, reading])
  const onTop = useCallback((px: number) => stage?.setInsets({ bottom: px > 0 ? px + 12 : 0 }), [stage])
  const party: CardCharacter[] = (turn?.characters ?? []).filter((c) => c.type === "pc").map((c) => ({ id: c.id, name: c.name, role: `${c.race} ${c.archetype}`, portrait: portrait(c.name) }))
  const cardActor = party.find((c) => c.id === actor?.id) ?? null
  const rr = actor?.rollRequired
  let mode: CardMode | null = null
  if (busy) mode = { kind: "thinking", note: "The GM is resolving the action…" }
  else if (save?.adventure.status === "completed") mode = { kind: "done", next: "Adventure complete" }
  else if (cardActor && rr) mode = { kind: "roll", roll: { skill: rr.rollType, ability: "", dc: rr.difficulty, modifier: rr.modifier ?? 0 } }
  else if (cardActor) mode = { kind: "hold", prompt: `What does ${cardActor.name.split(" ")[0]} do?` }
  const reply = async (value: string) => {
    if (!turn || !actor) return
    const movement = stage ? context(stage, actor.name, value) : undefined
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
      title={{ eyebrow: "MARCH OF DAVOS", text: turn?.title ?? "Arrival at Kordavos" }}
      location={{
        eyebrow: atGate ? "Kordavos checkpoint" : "Story view",
        title: actor ? `${actor.name.split(" ")[0]}'s turn` : `Round ${turn?.order ?? 1}`,
        status: save ? `Saved locally · ${save.provider}` : "",
      }}
      views={stage ? Object.entries(stage.shots).map(([id, s]) => ({ id, label: s.label ?? id })) : []}
      activeView={stage?.activeShot ?? null}
      onView={(id) => stage?.shot(id)}
      hidden={hidden || !save}
      compact={compact}
      actions={
        <>
          <Pill onClick={() => setOpen(open === "journal" ? null : "journal")}>Journal</Pill>
          <Pill onClick={() => setOpen(open === "settings" ? null : "settings")}>Scene settings</Pill>
        </>
      }
    >
      {save && !hidden && (
        <>
          {stage && speech && (
            <>
              <Bubbles compact={compact} bubbles={[{ key: paragraph, anchor: () => stage.project(speech.cast.id), text: speech.text, named: true }]} />
              <Plate compact={compact} line={{ key: paragraph, side: "right", name: speech.cast.name, role: speech.cast.role, portrait: speech.cast.art.portrait, text: speech.text }} />
            </>
          )}
          <TurnOrder
            order={(turn?.characters ?? []).map((c) => ({ id: c.id, name: c.name, portrait: portrait(c.name), npc: c.type === "npc" }))}
            activeId={actor?.id ?? null}
            label={actor?.name}
            compact={compact}
            onPick={focus}
          />
          <div
            className={`pointer-events-none absolute z-20 ${!atGate && reading ? "left-1/2 top-1/2 w-[min(680px,75vw)] -translate-x-1/2 -translate-y-1/2" : "bottom-[118px] left-8 w-[min(460px,35vw)]"}`}
          >
            {reading && (
              <Narration
                heading={`Round ${turn?.order} · ${turn?.title}`}
                text={text[paragraph]}
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
          {!busy && !reading && !mode && turn && (
            <div className={`${panel} absolute bottom-28 left-1/2 z-30 -translate-x-1/2 p-6 text-center`}>
              <p className="mb-3 font-serif text-xl">{actor ? `${actor.name}'s turn` : "The round is complete"}</p>
              <Pill onClick={() => void invoke({ kind: "continue", turnId: turn._id })}>{actor ? "Continue NPC turn" : "Continue adventure"}</Pill>
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
              <Pill className="ml-2" onClick={() => setHidden(true)}>
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
      {!save && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-stage-ink/55 text-center">
          <div className="text-[10px] tracking-[.3em] text-stage-gold">D20 ADVENTURES</div>
          <h1 className="font-display text-5xl">Arrival at Kordavos</h1>
          <div className="text-sm text-stage-cream">March of Davos</div>
          <label className="mt-4 text-sm">
            Game Master{" "}
            <select aria-label="Game Master" value={provider} onChange={(e) => setProvider(e.target.value)} className="ml-3 rounded border border-stage-brass bg-stage-panel px-3 py-2">
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <Pill disabled={!loaded || busy || !providers.length || (!stage && !stageError)} onClick={() => void invoke({ kind: "start", provider: provider as "claude" })}>
            {busy ? "Starting…" : "Play"}
          </Pill>
          {!loaded && <p>Loading your saved adventure…</p>}
          {loaded && !providers.length && <p>Install and sign in to Claude Code, Codex, Grok, or Gemini CLI.</p>}
          {!stage && !stageError && <p>{loading}</p>}
        </div>
      )}
      {(error || stageError) && (
        <div role="alert" className={`${panel} absolute left-1/2 top-28 z-50 w-[min(600px,90vw)] -translate-x-1/2 p-4 text-sm`}>
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
