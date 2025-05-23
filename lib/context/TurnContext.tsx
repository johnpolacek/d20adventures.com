import React, { createContext, useContext, useEffect, useState } from "react"
import type { Turn } from "@/types/adventure" // Adjust as needed
import { mapConvexTurnToTurn } from "@/lib/utils"

type TurnContextType = {
  currentTurn: Turn | null
}

const TurnContext = createContext<TurnContextType | undefined>(undefined)

export const TurnProvider = ({ adventureId, initialTurn, children }: { adventureId: string; initialTurn: Turn | null; children: React.ReactNode }) => {
  const [currentTurn, setCurrentTurn] = useState<Turn | null>(initialTurn)

  useEffect(() => {
    if (!adventureId || adventureId === "demo-adventure") {
      console.warn("[TurnProvider] Not subscribing to SSE: adventureId is", adventureId)
      return
    }
    console.log("[TurnProvider] Subscribing to SSE for adventureId:", adventureId)
    const es = new EventSource(`/api/adventure/stream/${adventureId}`)
    es.onmessage = (event) => {
      console.log("[TurnProvider] SSE data received:", event.data)
      const raw = event.data ? JSON.parse(event.data) : null
      setCurrentTurn(mapConvexTurnToTurn(raw))
    }
    es.onerror = (err) => {
      console.error("[TurnProvider] SSE error:", JSON.stringify(err, null, 2))
    }
    return () => {
      console.log("[TurnProvider] Closing SSE for adventureId:", adventureId)
      es.close()
    }
  }, [adventureId])

  return <TurnContext.Provider value={{ currentTurn }}>{children}</TurnContext.Provider>
}

export const useTurn = () => {
  const context = useContext(TurnContext)
  if (!context) {
    throw new Error("useTurn must be used within a TurnProvider")
  }
  return context.currentTurn
}
