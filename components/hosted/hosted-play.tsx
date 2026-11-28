"use client"

import { Heading } from "@d20/ui/typography/heading"
import { useCallback, useEffect, useRef, useState } from "react"
import { queueHostedAction, sendHostedChat } from "@/app/_actions/hosted"
import { hostedArt, hostedSave, hostedWork, useHostedSuggest } from "@/apps/desktop/src/hosted"
import { useScenes } from "@/apps/desktop/src/stage-data"
import { StagePlay } from "@/apps/desktop/src/stage-play"
import { Presence } from "@d20/ui/presence"
import { eyebrow, Pill, panel } from "@d20/ui/stage/hud"
import type { ChatLine } from "@d20/ui/stage/journal"
import { RotatePrompt, requestLandscape, usePhonePortrait } from "@d20/ui/stage/rotate-gate"
import type { Id } from "@/convex/_generated/dataModel"
import { sendFeedback } from "@/lib/feedback/client"
import { cn } from "@/lib/utils"

type State = Parameters<typeof hostedSave>[0] & { hostOnline: boolean; userId: string; chat: ChatLine[] }
type HostedMutation = { kind: "idle" } | { kind: "acting" } | { kind: "chatting" }

// A guest's view of a hosted game, polled sequentially from the website. Actions queue for the host's app, which runs the GM.
export function HostedPlay({ adventureId }: { adventureId: string }) {
  const [state, setState] = useState<State | null>(null)
  const [mutation, setMutation] = useState<HostedMutation>({ kind: "idle" })
  const [error, setError] = useState<string | null>(null)
  const shownFailure = useRef<string | null>(null)
  const mutationSeqRef = useRef(0)
  const portrait = usePhonePortrait()
  // The scenes come from the repo's stage, loaded before the stage shows.
  const scenes = useScenes("repo")
  // Phones play in landscape. Android locks it from the player's first tap, iOS keeps the rotate prompt.
  useEffect(() => {
    const lock = () => void requestLandscape()
    window.addEventListener("pointerdown", lock, { once: true })
    return () => window.removeEventListener("pointerdown", lock)
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      const seqAtStart = mutationSeqRef.current
      try {
        const res = await fetch(`/api/hosted/${adventureId}`, { cache: "no-store", signal: controller.signal }).catch(() => null)
        if (controller.signal.aborted || !res) return
        const body = await res.json().catch(() => null)
        if (controller.signal.aborted) return
        if (!res.ok) {
          setError(body?.error ?? "Could not load the game.")
          return
        }
        // Drop poll responses that started before an optimistic local mutation (e.g. sent chat).
        if (seqAtStart === mutationSeqRef.current) setState(body)
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(tick, 1500)
      }
    }
    void tick()
    return () => {
      controller.abort()
      if (timer !== null) clearTimeout(timer)
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
    mutationSeqRef.current++
    setMutation({ kind: "acting" })
    setError(null)
    try {
      await queueHostedAction(action)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action was not sent.")
      return false
    } finally {
      setMutation({ kind: "idle" })
    }
  }
  // A line in the table chat. The answer is the chat with the line in it, shown without waiting for the next poll.
  const say = async (text: string) => {
    mutationSeqRef.current++
    setMutation({ kind: "chatting" })
    try {
      const chat = await sendHostedChat({ adventureId, text })
      mutationSeqRef.current++
      setState((s) => s && { ...s, chat })
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : "The message was not sent.")
      return false
    } finally {
      setMutation({ kind: "idle" })
    }
  }
  const suggest = useHostedSuggest(state, (turnId, characterId) => queueHostedAction({ turnId, kind: "suggest", characterId }))
  const onError = useCallback((message: string) => setError(message), [])
  const save = state ? hostedSave(state) : null
  if (!scenes) return null
  return (
    <StagePlay
      save={save}
      busy={mutation.kind === "acting" || Boolean(work?.busy)}
      art={state ? hostedArt(state) : {}}
      controls={(c) => (c as { userId?: string }).userId === state?.userId && (c as { controlledBy?: string }).controlledBy !== "ai"}
      status={state ? (state.hostOnline ? "Hosted · GM online" : "Hosted · GM offline") : ""}
      overlay={!save}
      actions={
        <a href="/">
          <Pill>Leave</Pill>
        </a>
      }
      onReply={(turnId, characterId, text) => act({ turnId: turnId as Id<"turns">, kind: "reply", characterId, text })}
      onSkip={(turnId, characterId) => act({ turnId: turnId as Id<"turns">, kind: "skip", characterId })}
      onSuggest={suggest}
      onRoll={(turnId, characterId, result, second) => act({ turnId: turnId as Id<"turns">, kind: "roll", characterId, result, second })}
      onContinue={(turnId) => void act({ turnId: turnId as Id<"turns">, kind: "continue" })}
      onReact={(turnId, characterId, take) => act({ turnId: turnId as Id<"turns">, kind: "react", characterId, take })}
      chat={state?.chat}
      onChat={say}
      onFeedback={(draft) => sendFeedback({ ...draft, context: { ...draft.context, hosted: "guest", host: state?.adventure.ownerId ?? "" } })}
      onError={onError}
    >
      <Presence show={Boolean(state && !save)} motion="fade" asChild>
        {state && !save && (
          <div className="absolute inset-0 z-panel grid place-items-center bg-background/70">
            <section className={cn(panel, "enter-pop w-[min(480px,92vw)] p-8 text-center")}>
              <div className={eyebrow}>{state.hostOnline ? "Waiting for the host to start" : "The host is offline"}</div>
              <Heading variant="h1" className="mt-3">{state.adventure.title}</Heading>
            </section>
          </div>
        )}
      </Presence>
      <Presence show={Boolean(state && save && !state.hostOnline)} motion="drop" asChild>
        <div className={cn(panel, "absolute left-1/2 top-28 z-alert -translate-x-1/2 px-5 py-3 text-sm")}>The host's app is offline. Actions wait until it returns.</div>
      </Presence>
      <Presence show={Boolean(error)} motion="drop" asChild>
        <div role="alert" className={cn(panel, "absolute left-1/2 top-28 z-alert w-[min(600px,90vw)] -translate-x-1/2 p-4 text-sm")}>
          <p>{error}</p>
          <Pill className="mt-3" onClick={() => setError(null)}>
            Dismiss
          </Pill>
        </div>
      </Presence>
      {portrait && <RotatePrompt />}
    </StagePlay>
  )
}
