"use client"

import {
  fetchAdventurePlanChatBefore,
  fetchRecentAdventurePlanChat,
  recordAdventurePlanChatEvent,
  sendAdventurePlanChatMessage,
  type AdventurePlanChatMessage,
  type AdventurePlanChatScope,
} from "@/app/_actions/adventure-plan-chat"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { parseStructureProposal, summarizeStructureProposal, type StructureProposal } from "@/lib/adventure-plan-structure"
import type { AdventurePlan, AdventureSection } from "@/types/adventure-plan"
import type { Id } from "@/convex/_generated/dataModel"
import { Bot, History, MessageSquareText, Send, X } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

const CHAT_PAGE_SIZE = 50

export type ChatTarget =
  | "teaser"
  | "overview"
  | "section.review"
  | "section.summary"
  | "scene.summary"
  | "encounter.intro"
  | "encounter.instructions"
  | "plan.structure"

type AdminChatTargetOption = {
  target: ChatTarget
  label: string
}

type AdventurePlanAdminChatProps = {
  adventurePlan: AdventurePlan
  teaser: string
  overview: string
  sections: AdventureSection[]
  sectionIndex: number
  sceneIndex: number
  activeEncounterId: string | null
  onApplySuggestion: (target: ChatTarget, suggestedText: string) => Promise<boolean>
  onApplyStructureProposal: (proposal: StructureProposal) => Promise<boolean>
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp))
}

function mergeMessages(current: AdventurePlanChatMessage[], incoming: AdventurePlanChatMessage[], mode: "append" | "prepend" | "replace") {
  if (mode === "replace") return incoming

  const seen = new Set(current.map((message) => message._id))
  const uniqueIncoming = incoming.filter((message) => !seen.has(message._id))
  return mode === "prepend" ? [...uniqueIncoming, ...current] : [...current, ...uniqueIncoming]
}

function compactText(value: string | undefined, max = 900) {
  if (!value) return "None"
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function formatContextReport(message: AdventurePlanChatMessage) {
  const report = message.contextReport
  if (!report || report.status === "ok") return null

  const usage = report.inputTokens ? `${report.percentUsed}% context used` : `${report.percentUsed}% estimated context used`
  const omitted = report.omittedMessages > 0 ? `, ${report.omittedMessages} older message${report.omittedMessages === 1 ? "" : "s"} omitted` : ""
  return `${usage}${omitted}`
}

function buildPlanOutline(sections: AdventureSection[]) {
  return sections
    .map((section, sectionIndex) => {
      const scenes = section.scenes
        .map((scene, sceneIndex) => {
          const encounters = scene.encounters
            .map((encounter) => {
              const transitions = encounter.transitions?.map((transition) => `${transition.condition} -> ${transition.encounter}`).join(" | ") || "No transitions"
              return `      Encounter: ${encounter.title || encounter.id} (${encounter.id})\n        Intro: ${compactText(encounter.intro, 260)}\n        GM instructions: ${compactText(encounter.instructions, 260)}\n        Transitions: ${transitions}`
            })
            .join("\n")
          return `  Scene ${sceneIndex + 1}: ${scene.title || "Untitled scene"}\n    Summary: ${compactText(scene.summary, 360)}\n${encounters || "    No encounters"}`
        })
        .join("\n")
      return `Section ${sectionIndex + 1}: ${section.title || "Untitled section"}\nSummary: ${compactText(section.summary, 500)}\n${scenes || "  No scenes"}`
    })
    .join("\n\n")
}

function buildSectionContext(section: AdventureSection | undefined, sectionIndex: number) {
  if (!section) return "No active section."
  const scenes = section.scenes
    .map((scene, sceneIndex) => {
      const encounters = scene.encounters
        .map((encounter) => {
          const transitions = encounter.transitions?.map((transition) => `- ${transition.condition} -> ${transition.encounter}`).join("\n") || "- No transitions"
          const npcs = encounter.npc?.map((npc) => `- ${npc.id}: ${npc.behavior}`).join("\n") || "- No NPC refs"
          return `Encounter: ${encounter.title || encounter.id}
ID: ${encounter.id}
Intro:
${compactText(encounter.intro, 1200)}
GM instructions:
${compactText(encounter.instructions, 1200)}
Transitions:
${transitions}
NPC refs:
${npcs}`
        })
        .join("\n\n")
      return `Scene ${sceneIndex + 1}: ${scene.title || "Untitled scene"}
Summary:
${compactText(scene.summary, 900)}

${encounters || "No encounters"}`
    })
    .join("\n\n")

  return `Section ${sectionIndex + 1}: ${section.title || "Untitled section"}
Summary:
${compactText(section.summary, 1200)}

Scenes:
${scenes || "No scenes"}`
}

export function AdventurePlanAdminChat({
  adventurePlan,
  teaser,
  overview,
  sections,
  sectionIndex,
  sceneIndex,
  activeEncounterId,
  onApplySuggestion,
  onApplyStructureProposal,
}: AdventurePlanAdminChatProps) {
  const [open, setOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<AdventurePlanChatMessage[]>([])
  const [input, setInput] = React.useState("")
  const [target, setTarget] = React.useState<ChatTarget>("encounter.instructions")
  const [isLoading, setIsLoading] = React.useState(false)
  const [isLoadingOlder, setIsLoadingOlder] = React.useState(false)
  const [isSending, setIsSending] = React.useState(false)
  const [hasOlderMessages, setHasOlderMessages] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const endRef = React.useRef<HTMLDivElement | null>(null)

  const section = sections[sectionIndex]
  const scene = section?.scenes[sceneIndex]
  const encounterIndex = scene?.encounters.findIndex((encounter) => encounter.id === activeEncounterId) ?? -1
  const encounter = encounterIndex >= 0 ? scene?.encounters[encounterIndex] : scene?.encounters[0]

  const targetOptions = React.useMemo<AdminChatTargetOption[]>(() => {
    const options: AdminChatTargetOption[] = [
      { target: "teaser", label: "Adventure Teaser" },
      { target: "overview", label: "Adventure Overview" },
      { target: "plan.structure", label: "Plan Structure" },
    ]

    if (section) {
      options.push({ target: "section.review", label: `Section Review: ${section.title || `Section ${sectionIndex + 1}`}` })
      options.push({ target: "section.summary", label: `Section Summary: ${section.title || `Section ${sectionIndex + 1}`}` })
    }

    if (scene) {
      options.push({ target: "scene.summary", label: `Scene Summary: ${scene.title || `Scene ${sceneIndex + 1}`}` })
    }

    if (encounter) {
      options.push({ target: "encounter.intro", label: `Encounter Intro: ${encounter.title || encounter.id}` })
      options.push({ target: "encounter.instructions", label: `GM Instructions: ${encounter.title || encounter.id}` })
    }

    return options
  }, [encounter, scene, sceneIndex, section, sectionIndex])

  React.useEffect(() => {
    if (targetOptions.some((option) => option.target === target)) return
    setTarget(targetOptions[0]?.target ?? "overview")
  }, [target, targetOptions])

  const selectedTarget = targetOptions.find((option) => option.target === target) ?? targetOptions[0]

  const scope = React.useMemo<AdventurePlanChatScope>(
    () => ({
      label: selectedTarget?.label ?? "Adventure Plan",
      target: selectedTarget?.target ?? "overview",
      sectionIndex: section ? sectionIndex : undefined,
      sceneIndex: scene ? sceneIndex : undefined,
      encounterId: encounter?.id,
    }),
    [encounter?.id, scene, sceneIndex, section, sectionIndex, selectedTarget]
  )

  const planContext = React.useMemo(
    () => ({
      title: adventurePlan.title,
      teaser,
      overview,
      sectionTitle: section?.title,
      sectionSummary: section?.summary,
      sceneTitle: scene?.title,
      sceneSummary: scene?.summary,
      encounterTitle: encounter?.title,
      encounterIntro: encounter?.intro,
      encounterInstructions: encounter?.instructions,
    }),
    [adventurePlan.title, encounter, overview, scene, section, teaser]
  )

  const planOutline = React.useMemo(() => buildPlanOutline(sections), [sections])
  const sectionContext = React.useMemo(() => buildSectionContext(section, sectionIndex), [section, sectionIndex])

  const loadLatest = React.useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const latest = await fetchRecentAdventurePlanChat({
        settingId: adventurePlan.settingId,
        adventurePlanId: adventurePlan.id,
        limit: CHAT_PAGE_SIZE,
      })
      setMessages(latest)
      setHasOlderMessages(latest.length === CHAT_PAGE_SIZE)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load admin chat history")
    } finally {
      setIsLoading(false)
    }
  }, [adventurePlan.id, adventurePlan.settingId])

  React.useEffect(() => {
    if (!open) return
    void loadLatest()
  }, [loadLatest, open])

  React.useEffect(() => {
    if (!open || isLoadingOlder) return
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages.length, open, isLoadingOlder])

  const loadOlder = async () => {
    if (messages.length === 0) return
    setIsLoadingOlder(true)
    setError(null)
    try {
      const older = await fetchAdventurePlanChatBefore({
        settingId: adventurePlan.settingId,
        adventurePlanId: adventurePlan.id,
        before: messages[0].createdAt,
        limit: CHAT_PAGE_SIZE,
      })
      setMessages((current) => mergeMessages(current, older, "prepend"))
      setHasOlderMessages(older.length === CHAT_PAGE_SIZE)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load older admin chat messages")
    } finally {
      setIsLoadingOlder(false)
    }
  }

  const handleProposal = async (message: AdventurePlanChatMessage, eventType: "used" | "dismissed") => {
    if (!message.proposal) return

    if (eventType === "used") {
      const applied =
        message.proposal.kind === "structure" && message.proposal.operationsJson
          ? await onApplyStructureProposal(parseStructureProposal(message.proposal.operationsJson))
          : onApplySuggestion(message.proposal.target as ChatTarget, message.proposal.suggestedText)
      if (!applied) {
        toast.error("This suggestion cannot be applied to the current selection.")
        return
      }
      toast.success(message.proposal.kind === "structure" ? "Structural change auto-applied." : "Suggestion auto-applied.")
    }

    try {
      await recordAdventurePlanChatEvent({
        settingId: adventurePlan.settingId,
        adventurePlanId: adventurePlan.id,
        sourceMessageId: message._id as Id<"adventure_plan_chat_messages">,
        eventType,
        scope: message.scope ?? scope,
      })
      setMessages((current) =>
        current.map((entry) =>
          entry._id === message._id && entry.proposal
            ? {
                ...entry,
                proposal: {
                  ...entry.proposal,
                  status: eventType,
                },
              }
            : entry
        )
      )
      void loadLatest()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record chat event")
    }
  }

  const sendMessage = async () => {
    const content = input.trim()
    if (!content || isSending || !selectedTarget) return

    setInput("")
    setIsSending(true)
    setError(null)
    try {
      const result = await sendAdventurePlanChatMessage({
        settingId: adventurePlan.settingId,
        adventurePlanId: adventurePlan.id,
        content,
        scope,
        planContext,
        planOutline,
        sectionContext,
      })
      setMessages((current) => mergeMessages(current, result.messages, "append"))

      for (const message of result.messages) {
        if (message.role === "assistant" && message.proposal?.status === "proposed") {
          await handleProposal(message, "used")
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Admin chat failed"
      setError(message)
      toast.error(message)
    } finally {
      setIsSending(false)
    }
  }

  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return
      event.preventDefault()
      void sendMessage()
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [open, sendMessage])

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="fixed right-8 bottom-8 z-40 gap-2 border-amber-300/40 bg-black/80 text-amber-100 shadow-2xl shadow-black/50">
          <MessageSquareText className="h-4 w-4" />
          Admin Chat
        </Button>
      </SheetTrigger>
      <SheetContent className="h-dvh w-[min(92vw,540px)] max-w-none gap-0 overflow-hidden border-l border-amber-300/20 bg-[#10130f] text-white sm:max-w-none">
        <SheetHeader className="border-b border-white/10 bg-black/20">
          <SheetTitle className="flex items-center gap-2 font-display text-xl text-amber-300">
            <Bot className="h-5 w-5" />
            Admin Chat
          </SheetTitle>
          <div className="text-xs text-primary-200/75">Shared authoring history for this adventure plan.</div>
        </SheetHeader>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden px-4 pb-4">
          <div className="shrink-0 rounded-md border border-white/10 bg-black/25 p-3">
            <label htmlFor="admin-chat-target" className="mb-1 block text-xs font-mono uppercase tracking-widest text-primary-200/80">
              Edit Target
            </label>
            <select
              id="admin-chat-target"
              value={target}
              onChange={(event) => setTarget(event.target.value as ChatTarget)}
              className="w-full rounded-md border border-white/15 bg-black/50 p-2 text-sm text-white"
            >
              {targetOptions.map((option) => (
                <option key={option.target} value={option.target} className="bg-neutral-950">
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="min-h-0 overflow-y-auto rounded-md border border-white/10 bg-black/30 p-3 [scrollbar-width:thin]">
            <div className="mb-3 flex justify-center">
              <Button variant="outline" size="sm" onClick={loadOlder} disabled={!hasOlderMessages || isLoadingOlder || isLoading}>
                <History className="mr-2 h-4 w-4" />
                {isLoadingOlder ? "Loading..." : hasOlderMessages ? "Load older" : "No older messages"}
              </Button>
            </div>
            {error && <div className="mb-3 rounded-md border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-200">{error}</div>}
            {isLoading && messages.length === 0 && <div className="py-12 text-center text-sm text-white/55">Loading admin chat history...</div>}
            {!isLoading && messages.length === 0 && <div className="py-12 text-center text-sm text-white/55">No admin chat history yet.</div>}

            <div className="space-y-3">
              {messages.map((message) => {
                const isAssistant = message.role === "assistant"
                const isEvent = message.role === "event"
                const contextReportText = isAssistant ? formatContextReport(message) : null
                const structurePreview =
                  message.proposal?.kind === "structure" && message.proposal.operationsJson
                    ? (() => {
                        try {
                          return summarizeStructureProposal(parseStructureProposal(message.proposal.operationsJson || ""))
                        } catch {
                          return null
                        }
                      })()
                    : null
                return (
                  <article key={message._id} className={`rounded-lg border p-3 ${isEvent ? "border-amber-300/15 bg-amber-900/10" : isAssistant ? "border-blue-300/20 bg-blue-950/20" : "border-white/10 bg-white/5"}`}>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-white/55">
                      <span className="font-mono uppercase tracking-widest text-primary-200/80">{message.displayName}</span>
                      <span>{formatTimestamp(message.createdAt)}</span>
                      {message.scope?.label && <Badge className="border border-amber-300/20 bg-amber-400/10 text-[10px] text-amber-100">{message.scope.label}</Badge>}
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-white/85">{message.content}</div>
                    {contextReportText && <div className="mt-2 text-xs text-amber-200/80">{contextReportText}</div>}
                    {message.proposal?.suggestedText && (
                      <div className="mt-3 rounded-md border border-amber-300/20 bg-black/30 p-3">
                        <div className="mb-2 text-xs font-mono uppercase tracking-widest text-amber-200">{message.proposal.kind === "structure" ? "Structural Proposal" : "Suggestion"}</div>
                        {structurePreview ? (
                          <div className="space-y-2 text-sm text-white/80">
                            <div>
                              Adds {structurePreview.sectionCount} section{structurePreview.sectionCount === 1 ? "" : "s"}, {structurePreview.sceneCount} scene
                              {structurePreview.sceneCount === 1 ? "" : "s"}, and {structurePreview.encounterCount} encounter{structurePreview.encounterCount === 1 ? "" : "s"}.
                            </div>
                            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded border border-white/10 bg-black/25 p-2 text-xs">
                              {structurePreview.lines.join("\n")}
                            </div>
                          </div>
                        ) : (
                          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap text-sm text-white/80">{message.proposal.suggestedText}</div>
                        )}
                        <div className="mt-3 flex gap-2">
                          <Button variant="ghost" size="sm" disabled={message.proposal.status !== "proposed"} onClick={() => handleProposal(message, "dismissed")}>
                            <X className="mr-1 h-4 w-4" />
                            Dismiss
                          </Button>
                          {message.proposal.status !== "proposed" && <span className="self-center text-xs uppercase tracking-widest text-white/45">{message.proposal.status}</span>}
                        </div>
                      </div>
                    )}
                  </article>
                )
              })}
              <div ref={endRef} />
            </div>
          </div>

          <form
            className="shrink-0 space-y-2 border-t border-white/10 bg-[#10130f] pt-3"
            onSubmit={(event) => {
              event.preventDefault()
              void sendMessage()
            }}
          >
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              disabled={isSending}
              rows={4}
              placeholder="Ask for a rewrite, expansion, continuity check, or GM-facing polish..."
              style={{ fieldSizing: "fixed" } as React.CSSProperties}
              className="block h-28 min-h-0 max-h-28 w-full resize-none overflow-y-auto rounded-md border border-white/15 bg-black/40 px-3 py-2 text-sm leading-5 text-white outline-none placeholder:text-white/35 focus-visible:border-amber-300/60 focus-visible:ring-2 focus-visible:ring-amber-300/25 disabled:cursor-not-allowed disabled:opacity-50"
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  event.currentTarget.form?.requestSubmit()
                }
              }}
            />
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-white/45">Press Cmd Enter to send.</div>
              <Button type="submit" variant="epic" size="sm" disabled={!input.trim() || isSending} className="px-4 py-2 text-xs">
                <Send className="mr-2 h-4 w-4" />
                {isSending ? "Sending..." : "Send"}
              </Button>
            </div>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  )
}
