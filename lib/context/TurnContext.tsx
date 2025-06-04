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

  // Effect to ensure currentTurn reflects initialTurn when SSE is disabled
  useEffect(() => {
    if (disableSSE) {
      // Only update if they are actually different to prevent unnecessary re-renders
      if (currentTurn?.id !== initialTurn?.id || (currentTurn === null && initialTurn !== null) || (currentTurn !== null && initialTurn === null)) {
        console.log(
          "[TurnProvider SyncEffect] SSE is disabled. Syncing currentTurn with initialTurn. initialTurn ID:",
          initialTurn?.id,
          "initialTurn Title:",
          initialTurn?.title,
          "Previous currentTurn ID:",
          currentTurn?.id
        )
        setCurrentTurn(initialTurn)
      }
    }
    // If !disableSSE, currentTurn is managed by its own state + SSE updates.
  }, [initialTurn, disableSSE, currentTurn])

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

    const es = new EventSource(`/api/adventure/stream/${adventureId}`)
    eventSourceRef.current = es

    es.onopen = () => {
      setIsConnected(true)
      reconnectAttempts.current = 0 // Reset on successful connection
    }

    es.onmessage = (event) => {
      let rawData = null // Default to null
      if (event.data) {
        // Check if event.data is not null, undefined, empty string, 0, false
        try {
          rawData = JSON.parse(event.data)
        } catch (e) {
          console.error("[TurnProvider SSE OnMessage] JSON.parse error. Data will be treated as null.", "Error:", e, "Raw event.data:", event.data)
          // rawData remains null if parsing fails
        }
      } else {
        // event.data is falsy (null, undefined, empty string, 0, false), so treat rawData as null.
        console.log("[TurnProvider SSE OnMessage] event.data is falsy. Data treated as null. Raw event.data:", event.data)
      }

      // console.log("[TurnProvider SSE OnMessage] Parsed rawData:", rawData)
      const newTurn = mapConvexTurnToTurn(rawData)

      // Only update currentTurn if newTurn is not null.
      // This prevents a null message from SSE from wiping out a valid initialTurn or a previously valid SSE turn.
      if (newTurn !== null) {
        setCurrentTurn(newTurn)
      } else {
        console.log("[TurnProvider SSE OnMessage] SSE resulted in a null turn. currentTurn will NOT be updated to null to preserve existing state. Current currentTurn ID:", currentTurn?.id)
      }
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
    console.log(
      "[TurnProvider MainEffect] Running. adventureId:",
      adventureId,
      "disableSSE:",
      disableSSE,
      "isLoaded:",
      isLoaded,
      "isSignedIn:",
      isSignedIn,
      "initialTurn ID:",
      initialTurn?.id,
      "initialTurn Title:",
      initialTurn?.title
    )
    createConnection()

    // Handle visibility change to reconnect when tab becomes active
    const handleVisibilityChange = () => {
      if (!document.hidden && isSignedIn && (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED)) {
        console.log("[TurnProvider VisChange] Tab visible, checking connection. adventureId:", adventureId, "initialTurn ID:", initialTurn?.id, "disableSSE:", disableSSE)
        // Reset attempts when user returns to tab
        reconnectAttempts.current = 0
        createConnection()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)

      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [adventureId, disableSSE, isLoaded, isSignedIn, initialTurn]) // Added initialTurn

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
