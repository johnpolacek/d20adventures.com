"use client"

import { sendChatMessage } from "@/app/_actions/chat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Id } from "@/convex/_generated/dataModel"
import { useTurnContext } from "@/lib/context/TurnContext"
import { getLastSeenTimestamp, setLastSeenTimestamp } from "@/lib/utils/chat-storage"
import { useUser } from "@clerk/nextjs"
import { MessageSquare } from "lucide-react"
import { useParams } from "next/navigation"
import { useState } from "react"
import { useEffect, useMemo, useRef } from "react"

type GameChatProps = {
  adventureId?: string
  characterName?: string
}

export default function GameChat({ adventureId, characterName }: GameChatProps) {
  const [open, setOpen] = useState(false)
  const params = useParams<{ adventureId?: string }>()
  const routeAdventureId = params?.adventureId
  const effectiveAdventureId = adventureId ?? routeAdventureId
  const { user } = useUser()
  const { currentTurn } = useTurnContext()

  type ChatMessage = {
    _id: string
    adventureId: string
    username: string
    characterName?: string
    content: string
    createdAt: number
  }

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState("")
  const [unseenCount, setUnseenCount] = useState(0)
  const ids = useRef<Set<string>>(new Set())
  const unseenIds = useRef<Set<string>>(new Set())
  const listEndRef = useRef<HTMLDivElement | null>(null)

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

  // Main SSE effect for when chat is open
  useEffect(() => {
    if (!open || !effectiveAdventureId) return
    setMessages([])
    ids.current = new Set()

    const es = new EventSource(`/api/adventure/chat/${effectiveAdventureId}`)
    es.onmessage = (evt) => {
      try {
        const batch: ChatMessage[] = JSON.parse(evt.data)
        if (Array.isArray(batch) && batch.length) {
          setMessages((prev) => {
            const next = [...prev]
            let hasNewMessages = false

            for (const m of batch) {
              if (!ids.current.has(m._id)) {
                ids.current.add(m._id)
                next.push(m)
                hasNewMessages = true
              }
            }

            // If modal is open and we got new messages, mark them as seen immediately
            if (hasNewMessages && open) {
              const newestTimestamp = Math.max(...batch.map((m) => m.createdAt))
              setLastSeenTimestamp(effectiveAdventureId, newestTimestamp)
            }

            return next
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
  }, [open, effectiveAdventureId])

  // Separate SSE effect for tracking unseen messages when chat is closed
  useEffect(() => {
    if (open || !effectiveAdventureId) return

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
  }, [open, effectiveAdventureId])

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, open])

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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <div className="relative">
          <Button size="sm" className="bg-primary-700 ring-4 ring-primary-600 hover:bg-primary-700 hover:scale-105 transition-all duration-300">
            <MessageSquare className="mr-1 h-4 w-4" />
            Game Chat
          </Button>
          {unseenCount > 0 && (
            <Badge className="bg-purple-600 ring-2 ring-purple-700 absolute -top-2.5 -right-2.5 h-5 w-5 p-0 flex items-center justify-center text-xs font-mono font-bold rounded-full animate-in fade-in duration-200">
              {unseenCount > 99 ? "99+" : unseenCount}
            </Badge>
          )}
        </div>
      </DialogTrigger>
      <DialogContent className="w-full max-w-4xl bg-primary-800 text-white border-4 border-primary-600">
        <DialogHeader>
          <DialogTitle className="font-display text-amber-300">Game Chat</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <ScrollArea className="h-80 rounded-md p-3 bg-black/30">
            <div className="space-y-3">
              {messages.map((m) => {
                const currentUsername = user?.username || user?.primaryEmailAddress?.emailAddress?.split("@")[0]
                const isMine = currentUsername && m.username === currentUsername
                return (
                  <div key={m._id} className={`text-sm flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div className="w-[90%]">
                      <div className={`whitespace-pre-wrap text-sm md:text-lg text-white px-3 py-2 rounded-lg w-[] ${isMine ? "bg-primary-700" : "bg-black/70"}`}>{m.content}</div>
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
          </ScrollArea>
          <div className="flex gap-2 items-center">
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
            <Button variant="outline" onClick={handleSend} disabled={!input.trim() || !effectiveAdventureId}>
              Send
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
