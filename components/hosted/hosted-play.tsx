"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { queueHostedAction } from "@/app/_actions/hosted"
import { hostedSave, hostedWork } from "@/apps/desktop/src/hosted"
import { StagePlay } from "@/apps/desktop/src/stage-play"
import { eyebrow, Pill, panel } from "@/components/stage/hud"
import type { Id } from "@/convex/_generated/dataModel"
import { cn } from "@/lib/utils"

type State = Parameters<typeof hostedSave>[0] & { hostOnline: boolean; userId: string }

// A guest's view of a hosted game, polled from the website. Actions queue for the host's app, which runs the GM.
export function HostedPlay({ adventureId }: { adventureId: string }) {
  const [state, setState] = useState<State | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const shownFailure = useRef<string | null>(null)
  useEffect(() => {
    let live = true
    const tick = async () => {
      const res = await fetch(`/api/hosted/${adventureId}`, { cache: "no-store" }).catch(() => null)
      if (!live || !res) return
      const body = await res.json().catch(() => null)
      if (!res.ok) return setError(body?.error ?? "Could not load the game.")
      setState(body)
    }
    void tick()
    const timer = setInterval(tick, 1500)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [adventureId])
  const work = state ? hostedWork(state) : null
  useEffect(() => {
    if (work?.failed && shownFailure.current !== work.failed.id) {
      shownFailure.current = work.failed.id
      setError(work.failed.error)
    }
  }, [work?.failed])
  const act = async (action: Parameters<typeof queueHostedAction>[0]) => {
    setSending(true)
    setError(null)
    try {
      await queueHostedAction(action)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action was not sent.")
      return false
    } finally {
      setSending(false)
    }
  }
  const onError = useCallback((message: string) => setError(message), [])
  const save = state ? hostedSave(state) : null
  return (
    <StagePlay
      save={save}
      busy={sending || Boolean(work?.busy)}
      art={{}}
      controls={(c) => (c as { userId?: string }).userId === state?.userId}
      status={state ? (state.hostOnline ? "Hosted · GM online" : "Hosted · GM offline") : ""}
      overlay={!save}
      actions={
        <a href="/">
          <Pill>Leave</Pill>
        </a>
      }
      onReply={(turnId, characterId, text, movement) => act({ turnId: turnId as Id<"turns">, kind: "reply", characterId, text, movement })}
      onRoll={(turnId, characterId, result) => void act({ turnId: turnId as Id<"turns">, kind: "roll", characterId, result })}
      onContinue={(turnId) => void act({ turnId: turnId as Id<"turns">, kind: "continue" })}
      onError={onError}
    >
      {state && !save && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-stage-ink/70">
          <section className={cn(panel, "w-[min(480px,92vw)] p-8 text-center")}>
            <div className={eyebrow}>{state.hostOnline ? "Waiting for the host to start" : "The host is offline"}</div>
            <h1 className="mt-3 font-display text-4xl">{state.adventure.title}</h1>
          </section>
        </div>
      )}
      {state && save && !state.hostOnline && (
        <div className={cn(panel, "absolute left-1/2 top-28 z-[60] -translate-x-1/2 px-5 py-3 text-sm")}>The host's app is offline. Actions wait until it returns.</div>
      )}
      {error && (
        <div role="alert" className={cn(panel, "absolute left-1/2 top-28 z-[60] w-[min(600px,90vw)] -translate-x-1/2 p-4 text-sm")}>
          <p>{error}</p>
          <Pill className="mt-3" onClick={() => setError(null)}>
            Dismiss
          </Pill>
        </div>
      )}
    </StagePlay>
  )
}
