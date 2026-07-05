"use client"

import { useUser } from "@clerk/nextjs"
import { Maximize2, MessageSquare } from "lucide-react"
import { useParams } from "next/navigation"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { fetchMessagesBefore, fetchRecentMessages, sendChatMessage } from "@/app/_actions/chat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import type { Id } from "@/convex/_generated/dataModel"
import { useTurnContext } from "@/lib/context/TurnContext"
import { cn } from "@/lib/utils"
import { getLastSeenTimestamp, setLastSeenTimestamp } from "@/lib/utils/chat-storage"

type GameChatProps = {
  adventureId?: string
  characterName?: string
  // "floating" is the dialog-behind-a-button used on mobile and in the lobby;
  // "rail" docks the chat inline (turn page right rail) with an expand affordance.
  variant?: "floating" | "rail"
  className?: string
}

type ChatMessage = {
  _id: string
  adventureId: string
  username: string
  characterName?: string
  content: string
  createdAt: number
}

const CHAT_PAGE_SIZE = 50

function ChatMessageList({
  messages,
  currentUsername,
  hasOlderMessages,
  isLoadingOlder,
  isLoadingHistory,
  historyError,
  onLoadOlder,
  compact = false,
  hideLoadOlder = false,
  className,
}: {
  messages: ChatMessage[]
  currentUsername?: string
  hasOlderMessages: boolean
  isLoadingOlder: boolean
  isLoadingHistory: boolean
  historyError: string | null
  onLoadOlder: () => Promise<number>
  compact?: boolean
  hideLoadOlder?: boolean
  className?: string
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const listEndRef = useRef<HTMLDivElement | null>(null)
  const skipNextAutoScroll = useRef(false)

  useEffect(() => {
    if (skipNextAutoScroll.current) {
      skipNextAutoScroll.current = false
      return
    }
    listEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length])

  const handleLoadOlder = async () => {
    const viewport = viewportRef.current
    const previousScrollHeight = viewport?.scrollHeight ?? 0
    const previousScrollTop = viewport?.scrollTop ?? 0
    skipNextAutoScroll.current = true
    const addedCount = await onLoadOlder()
    if (addedCount > 0 && viewport) {
      requestAnimationFrame(() => {
        viewport.scrollTop = viewport.scrollHeight - previousScrollHeight + previousScrollTop
      })
    }
  }

  return (
    <div ref={viewportRef} className={cn("overflow-y-auto rounded-md p-3 bg-black/30", className)}>
      <div className="space-y-3">
        {hasOlderMessages && !hideLoadOlder && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={handleLoadOlder} disabled={isLoadingOlder || isLoadingHistory}>
              {isLoadingOlder ? "Loading..." : "Load older"}
            </Button>
          </div>
        )}
        {historyError && <div className="text-sm text-red-300 bg-red-950/50 border border-red-900 rounded-md px-3 py-2">{historyError}</div>}
        {isLoadingHistory && messages.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">Loading chat history...</div>}
        {!isLoadingHistory && messages.length === 0 && <div className="text-sm text-muted-foreground text-center py-8">No messages yet.</div>}
        {messages.map((m) => {
          const isMine = currentUsername && m.username === currentUsername
          return (
            <div key={m._id} className={`text-sm flex ${isMine ? "justify-end" : "justify-start"}`}>
              <div className="w-[90%]">
                <div className={cn("whitespace-pre-wrap text-white px-3 py-2 rounded-lg", compact ? "text-sm" : "text-sm md:text-lg", isMine ? "bg-primary-700" : "bg-black/70")}>{m.content}</div>
                <div className={`mt-1 text-xs text-muted-foreground ${isMine ? "text-right" : "text-left"}`}>
                  <span className="text-primary-300">{m.username}</span>
                  {m.characterName && <span className="ml-2 italic opacity-80">{m.characterName}</span>}
                  <span className="ml-2 opacity-80 text-xs font-mono tracking-tightest">{new Date(m.createdAt).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={listEndRef} />
      </div>
    </div>
  )
}

export default function GameChat({ adventureId, characterName, variant = "floating", className }: GameChatProps) {
  const [open, setOpen] = useState(false)
  const params = useParams<{ adventureId?: string }>()
  const routeAdventureId = params?.adventureId
  const effectiveAdventureId = adventureId ?? routeAdventureId
  const { user } = useUser()
  const { currentTurn } = useTurnContext()

  const isRail = variant === "rail"
  // The rail chat is always visible, so it loads history and streams continuously;
  // the floating chat only does so while its dialog is open.
  const isActive = isRail || open

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [isLoadingHistory, setIsLoadingHistory] = useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = useState(false)
  const [hasOlderMessages, setHasOlderMessages] = useState(false)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [unseenCount, setUnseenCount] = useState(0)
  const ids = useRef<Set<string>>(new Set())
  const unseenIds = useRef<Set<string>>(new Set())

  // Determine default character name for this user from latest messages as fallback
  type Character = { type?: string; userId?: string; name?: string }
  const currentPlayerCharacterName = useMemo(() => {
    const list: Character[] = (currentTurn?.characters as Character[]) || []
    const mine = list.find((c) => c?.type === "pc" && c?.userId === user?.id)
    return mine?.name
  }, [currentTurn?.characters, user?.id])

  const defaultCharacterName = useMemo(() => {
    if (characterName) return characterName
    if (currentPlayerCharacterName) return currentPlayerCharacterName
    const lastMine = [...messages].reverse().find((m) => m.characterName)
    return lastMine?.characterName
  }, [characterName, currentPlayerCharacterName, messages])

  const mergeMessages = useCallback((incoming: ChatMessage[], mode: "append" | "prepend" | "replace") => {
    if (mode === "replace") {
      let added = 0
      setMessages((prev) => {
        const byId = new Map(prev.map((message) => [message._id, message]))
        for (const message of incoming) {
          if (!byId.has(message._id)) added += 1
          byId.set(message._id, message)
        }
        const next = Array.from(byId.values()).sort((a, b) => a.createdAt - b.createdAt || a._id.localeCompare(b._id))
        ids.current = new Set(next.map((message) => message._id))
        return next
      })
      return added
    }

    const newMessages = incoming.filter((message) => !ids.current.has(message._id))
    if (newMessages.length === 0) return 0

    for (const message of newMessages) {
      ids.current.add(message._id)
    }
    setMessages((prev) => {
      return mode === "prepend" ? [...newMessages, ...prev] : [...prev, ...newMessages]
    })
    return newMessages.length
  }, [])

  const loadLatestHistory = useCallback(async () => {
    if (!effectiveAdventureId) return
    setIsLoadingHistory(true)
    setHistoryError(null)

    try {
      const latest = await fetchRecentMessages(effectiveAdventureId as Id<"adventures">, CHAT_PAGE_SIZE)
      mergeMessages(latest as ChatMessage[], "replace")
      setHasOlderMessages(latest.length === CHAT_PAGE_SIZE)

      if (latest.length > 0) {
        setLastSeenTimestamp(effectiveAdventureId, latest[latest.length - 1].createdAt)
      }
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Unable to load chat history")
    } finally {
      setIsLoadingHistory(false)
    }
  }, [effectiveAdventureId, mergeMessages])

  const loadOlderMessages = useCallback(async (): Promise<number> => {
    if (!effectiveAdventureId || messages.length === 0 || isLoadingOlder) return 0

    const oldestMessage = messages[0]
    setIsLoadingOlder(true)
    setHistoryError(null)

    try {
      const older = await fetchMessagesBefore(effectiveAdventureId as Id<"adventures">, oldestMessage.createdAt, CHAT_PAGE_SIZE)
      const addedCount = mergeMessages(older as ChatMessage[], "prepend")
      setHasOlderMessages(older.length === CHAT_PAGE_SIZE)
      return addedCount
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : "Unable to load older chat messages")
      return 0
    } finally {
      setIsLoadingOlder(false)
    }
  }, [effectiveAdventureId, isLoadingOlder, mergeMessages, messages])

  useEffect(() => {
    if (!isActive) return
    void loadLatestHistory()
  }, [loadLatestHistory, isActive])

  // Main SSE effect while the chat is visible (rail always, floating while open)
  useEffect(() => {
    if (!isActive || !effectiveAdventureId) return

    const es = new EventSource(`/api/adventure/chat/${effectiveAdventureId}`)
    es.onmessage = (evt) => {
      try {
        const batch: ChatMessage[] = JSON.parse(evt.data)
        if (Array.isArray(batch) && batch.length) {
          const addedCount = mergeMessages(batch, "append")

          if (addedCount > 0) {
            const newestTimestamp = Math.max(...batch.map((m) => m.createdAt))
            setLastSeenTimestamp(effectiveAdventureId, newestTimestamp)
          }
        }
      } catch {}
    }
    es.onerror = () => {
      // Keep the stream alive; browser will retry
    }
    return () => {
      es.close()
    }
  }, [effectiveAdventureId, mergeMessages, isActive])

  // Separate SSE effect for tracking unseen messages when the floating chat is closed
  useEffect(() => {
    if (isActive || !effectiveAdventureId) return

    const lastSeen = getLastSeenTimestamp(effectiveAdventureId)
    unseenIds.current = new Set()
    setUnseenCount(0)

    const es = new EventSource(`/api/adventure/chat/${effectiveAdventureId}`)
    es.onmessage = (evt) => {
      try {
        const batch: ChatMessage[] = JSON.parse(evt.data)
        if (Array.isArray(batch) && batch.length) {
          batch.forEach((m) => {
            if (m.createdAt > lastSeen && !unseenIds.current.has(m._id)) {
              unseenIds.current.add(m._id)
              setUnseenCount((prev) => prev + 1)
            }
          })
        }
      } catch {}
    }
    es.onerror = () => {
      // Keep the stream alive; browser will retry
    }
    return () => {
      es.close()
    }
  }, [isActive, effectiveAdventureId])

  // Handle dialog state changes
  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen)

    if (newOpen && effectiveAdventureId) {
      // Mark all messages as seen when opening
      setUnseenCount(0)
      setLastSeenTimestamp(effectiveAdventureId, Date.now())
    }
  }

  async function handleSend() {
    const content = input.trim()
    if (!content || !effectiveAdventureId) return
    setInput("")
    await sendChatMessage({ adventureId: effectiveAdventureId as Id<"adventures">, content, characterName: defaultCharacterName })
    // SSE will deliver the message back; no optimistic append needed
  }

  const currentUsername = user?.username || user?.primaryEmailAddress?.emailAddress?.split("@")[0] || undefined

  const chatInput = (compact: boolean) => (
    <div className={cn("flex gap-2 items-center", compact && "p-2")}>
      <Input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Send a message…"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            handleSend()
          }
        }}
      />
      <Button variant="outline" size={compact ? "sm" : "default"} onClick={handleSend} disabled={!input.trim() || !effectiveAdventureId}>
        Send
      </Button>
    </div>
  )

  const expandedDialogContent = (
    <DialogContent className="w-full max-w-4xl bg-primary-800 text-white border-4 border-primary-600">
      <DialogHeader>
        <DialogTitle className="font-display text-amber-300">Game Chat</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <ChatMessageList
          messages={messages}
          currentUsername={currentUsername}
          hasOlderMessages={hasOlderMessages}
          isLoadingOlder={isLoadingOlder}
          isLoadingHistory={isLoadingHistory}
          historyError={historyError}
          onLoadOlder={loadOlderMessages}
          className="h-80"
        />
        {chatInput(false)}
      </div>
    </DialogContent>
  )

  if (isRail) {
    return (
      <>
        <div className={cn("flex flex-col overflow-hidden rounded-xl bg-primary-800/60 ring ring-primary-700", className)}>
          {/* The whole preview (header + messages) opens the large view; the input row
              below stays interactive. Load-older is hidden here so this region has no
              nested controls — expand to page through history. */}
          <button type="button" onClick={() => handleOpenChange(true)} className="group flex min-h-0 flex-1 cursor-pointer flex-col text-left" aria-label="Expand chat">
            <div className="flex flex-none items-center justify-between gap-2 px-3 py-2">
              <h3 className="font-display text-sm font-bold text-amber-300">Game Chat</h3>
              <Maximize2 className="h-4 w-4 text-stone-300 transition-colors group-hover:text-amber-200" aria-hidden />
            </div>
            <ChatMessageList
              messages={messages}
              currentUsername={currentUsername}
              hasOlderMessages={hasOlderMessages}
              isLoadingOlder={isLoadingOlder}
              isLoadingHistory={isLoadingHistory}
              historyError={historyError}
              onLoadOlder={loadOlderMessages}
              compact
              hideLoadOlder
              className="mx-2 min-h-0 flex-1"
            />
          </button>
          {chatInput(true)}
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          {expandedDialogContent}
        </Dialog>
      </>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <div className="relative">
          <Button size="sm" className="bg-primary-700 ring-4 ring-primary-600 hover:bg-primary-700 hover:scale-105 transition-all duration-300">
            <MessageSquare className="mr-1 h-4 w-4" />
            Chat
          </Button>
          {unseenCount > 0 && (
            <Badge className="bg-purple-600 ring-2 ring-purple-700 absolute -top-2.5 -right-2.5 h-5 w-5 p-0 flex items-center justify-center text-xs font-mono font-bold rounded-full animate-in fade-in duration-200">
              {unseenCount > 99 ? "99+" : unseenCount}
            </Badge>
          )}
        </div>
      </DialogTrigger>
      {expandedDialogContent}
    </Dialog>
  )
}
