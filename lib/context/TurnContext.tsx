import React, { createContext, useContext, useEffect, useState, useRef } from "react"
import { useUser } from "@clerk/nextjs"
import type { Turn } from "@/types/adventure" // Adjust as needed
import { mapConvexTurnToTurn } from "@/lib/utils"

type TurnContextType = {
  currentTurn: Turn | null
  disableSSE: boolean
  isConnected: boolean
}

const TurnContext = createContext<TurnContextType | undefined>(undefined)

export const TurnProvider = ({ adventureId, initialTurn, disableSSE = false, children }: { adventureId: string; initialTurn: Turn | null; disableSSE?: boolean; children: React.ReactNode }) => {
  const { isSignedIn, isLoaded } = useUser()
  const [currentTurn, setCurrentTurn] = useState<Turn | null>(initialTurn)
  const [isConnected, setIsConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5

  const createConnection = () => {
    // Don't create connection if user is not authenticated
    if (!isLoaded || !isSignedIn) {
      console.warn("[TurnProvider] Not creating SSE connection: user not authenticated")
      setIsConnected(false)
      return
    }

    if (!adventureId || adventureId === "demo-adventure") {
      console.warn("[TurnProvider] Not creating SSE connection: adventureId is", adventureId)
      return
    }

    if (disableSSE) {
      console.warn("[TurnProvider] SSE disabled for historical turn viewing")
      return
    }

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    console.log("[TurnProvider] Creating SSE connection for adventureId:", adventureId, "attempt:", reconnectAttempts.current + 1)

    const es = new EventSource(`/api/adventure/stream/${adventureId}`)
    eventSourceRef.current = es

    es.onopen = () => {
      console.log("[TurnProvider] SSE connection opened")
      setIsConnected(true)
      reconnectAttempts.current = 0 // Reset on successful connection
    }

    es.onmessage = (event) => {
      console.log("[TurnProvider] SSE data received:", event.data)
      const raw = event.data ? JSON.parse(event.data) : null
      setCurrentTurn(mapConvexTurnToTurn(raw))
    }

    es.onerror = (err) => {
      console.error("[TurnProvider] SSE error:", JSON.stringify(err, null, 2))
      setIsConnected(false)

      // Only attempt reconnection if we haven't exceeded max attempts and user is still authenticated
      if (reconnectAttempts.current < maxReconnectAttempts && isSignedIn) {
        const backoffDelay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000) // Max 30 seconds
        console.log(`[TurnProvider] Attempting reconnection in ${backoffDelay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`)

        reconnectAttempts.current++
        reconnectTimeoutRef.current = setTimeout(() => {
          createConnection()
        }, backoffDelay)
      } else {
        console.error("[TurnProvider] Max reconnection attempts reached or user not authenticated, giving up")
      }
    }
  }

  useEffect(() => {
    createConnection()

    // Handle visibility change to reconnect when tab becomes active
    const handleVisibilityChange = () => {
      if (!document.hidden && isSignedIn && (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED)) {
        console.log("[TurnProvider] Tab became visible, checking connection...")
        // Reset attempts when user returns to tab
        reconnectAttempts.current = 0
        createConnection()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      console.log("[TurnProvider] Cleaning up SSE connection")
      document.removeEventListener("visibilitychange", handleVisibilityChange)

      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [adventureId, disableSSE, isLoaded, isSignedIn])

  return <TurnContext.Provider value={{ currentTurn, disableSSE, isConnected }}>{children}</TurnContext.Provider>
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
