import { useUser } from "@clerk/nextjs"
import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import { TurnStreamController, type TurnStreamState } from "@/lib/context/turn-stream"
import { mapConvexTurnToTurn } from "@/lib/utils"
import type { Turn } from "@/types/adventure"

type TurnContextType = {
  currentTurn: Turn | null
  disableSSE: boolean
  isConnected: boolean
  streamState: TurnStreamState
}

const TurnContext = createContext<TurnContextType | undefined>(undefined)

export const TurnProvider = ({ adventureId, initialTurn, disableSSE = false, children }: { adventureId: string; initialTurn: Turn | null; disableSSE?: boolean; children: React.ReactNode }) => {
  const { isSignedIn, isLoaded } = useUser()
  const [currentTurn, setCurrentTurn] = useState<Turn | null>(initialTurn)
  const [streamState, setStreamState] = useState<TurnStreamState>(() => (disableSSE ? { kind: "historical" } : { kind: "idle" }))

  // Sync currentTurn with initialTurn when viewing a historical turn (SSE disabled).
  useEffect(() => {
    if (!disableSSE) return
    setCurrentTurn((prev) => (prev?.id === initialTurn?.id && Boolean(prev) === Boolean(initialTurn) ? prev : initialTurn))
  }, [initialTurn, disableSSE])

  // Manage the live SSE connection without depending on `initialTurn` (which changes on every server refresh).
  useEffect(() => {
    if (disableSSE) {
      setStreamState({ kind: "historical" })
      return
    }
    if (!isLoaded || !isSignedIn || !adventureId || adventureId === "demo-adventure") {
      setStreamState({ kind: "idle" })
      return
    }

    const controller = new TurnStreamController({
      createEventSource: () => new EventSource(`/api/adventure/stream/${adventureId}`),
      onStateChange: setStreamState,
      onMessage: (raw) => {
        let parsed: unknown = null
        try {
          parsed = JSON.parse(raw)
        } catch (e) {
          console.error("[TurnProvider SSE OnMessage] JSON.parse error. Data will be treated as null.", "Error:", e, "Raw event.data:", raw)
        }
        const newTurn = mapConvexTurnToTurn(parsed)
        if (newTurn !== null) setCurrentTurn(newTurn)
      },
    })

    controller.connect(0)

    const handleVisibilityChange = () => {
      if (!document.hidden) controller.onVisible()
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      controller.dispose()
    }
  }, [adventureId, disableSSE, isLoaded, isSignedIn])

  const isConnected = streamState.kind === "open"
  return <TurnContext.Provider value={{ currentTurn, disableSSE, isConnected, streamState }}>{children}</TurnContext.Provider>
}

export const useTurn = () => {
  const context = useContext(TurnContext)
  if (!context) {
    throw new Error("useTurn must be used within a TurnProvider")
  }
  return context.currentTurn
}

export const useTurnContext = () => {
  const context = useContext(TurnContext)
  if (!context) {
    throw new Error("useTurnContext must be used within a TurnProvider")
  }
  return context
}
