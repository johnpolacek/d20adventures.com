"use client"

// Page-level turn narrative: owns the singleton per-page effects (auto-navigate
// to newly created turns, NPC processing trigger, window auto-scroll) plus
// page-only chrome (Go To Reply bar, storyview/original-replies bar, practice
// reports). The shared render core lives in TurnNarrativeBody, also used by the
// encounter view's turn modal — keep effects here so they fire exactly once.

import { useUser } from "@clerk/nextjs"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import React, { useEffect } from "react"
import { generatePracticeReport, getPracticeReportsForAdventure } from "@/app/_actions/adventure-reports"
import { ensureNpcProcessed } from "@/app/_actions/ensure-npc-processed"
import StoryviewButton from "@/components/adventure/storyview/storyview-button"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import type { Id } from "@/convex/_generated/dataModel"
import { useAdventure } from "@/lib/context/AdventureContext"
import { useTurnContext } from "@/lib/context/TurnContext"
import { scrollToBottom } from "../ui/utils"
import TurnNarrativeBody from "./turn-narrative-body"
import { useTurnActor } from "./use-turn-actor"

export default function TurnNarrative({ nextAdventure }: { nextAdventure?: string }) {
  const params = useParams()
  const router = useRouter()
  const { currentTurn, disableSSE } = useTurnContext()
  const { settingId, adventurePlanId, adventure } = useAdventure()
  const { isSignedIn } = useUser()
  const { currentCharacter, isTurnComplete, isNpcProcessing, shouldShowReply } = useTurnActor()
  const [initialNarrative, setInitialNarrative] = React.useState("")
  const [showOriginalReplies, setShowOriginalReplies] = React.useState(false)
  const [isGeneratingPracticeReport, setIsGeneratingPracticeReport] = React.useState(false)
  const [practiceReportError, setPracticeReportError] = React.useState<string | null>(null)
  const [practiceReports, setPracticeReports] = React.useState<
    Array<{
      id: string
      createdAt: number
      status: "ready" | "failed"
      summary?: string
      findingsCount: number
      findings: Array<{
        title?: string
        type?: string
        priority?: string
        recommendation?: string
        target?: { encounterId?: string; planPath?: string; codeArea?: string }
      }>
      error?: string
    }>
  >([])

  const isPracticeRun = (adventure.runType ?? "campaign") === "practice"

  useEffect(() => {
    // scroll to bottom of page when currentTurn.narrative changes after the first render
    if (currentTurn?.narrative) {
      if (!initialNarrative) {
        setInitialNarrative(currentTurn.narrative)
      } else if (initialNarrative !== currentTurn.narrative && !disableSSE) {
        scrollToBottom()
      }
    }
  }, [currentTurn?.narrative, disableSSE, initialNarrative])

  const loadPracticeReports = React.useCallback(async () => {
    if (!isPracticeRun || !params.adventureId) return
    try {
      const reports = await getPracticeReportsForAdventure(params.adventureId as Id<"adventures">)
      setPracticeReports(
        reports.map((report) => ({
          id: String(report.id),
          createdAt: report.createdAt,
          status: report.status,
          summary: report.summary,
          findingsCount: report.findingsCount,
          findings: Array.isArray(report.findings)
            ? (report.findings as Array<{
                title?: string
                type?: string
                priority?: string
                recommendation?: string
                target?: {
                  encounterId?: string
                  planPath?: string
                  codeArea?: string
                }
              }>)
            : [],
          error: report.error,
        }))
      )
    } catch (error) {
      console.error("Failed to load practice reports:", error)
    }
  }, [isPracticeRun, params.adventureId])

  useEffect(() => {
    if (!isPracticeRun || !isSignedIn) return
    loadPracticeReports()
  }, [isPracticeRun, isSignedIn, loadPracticeReports])

  // Auto-navigate when turn is advanced by another player (only if on last turn)
  useEffect(() => {
    if (disableSSE || !currentTurn) return

    const urlTurnOrder = params.turnOrder ? Number.parseInt(params.turnOrder as string, 10) : null
    if (urlTurnOrder === null) return

    // Access order field (available at runtime from Convex)
    const currentTurnOrder = (currentTurn as { order?: number }).order
    if (!currentTurnOrder) return

    // Only navigate if user was on the last turn and a new turn was just added
    // If currentTurnOrder === urlTurnOrder + 1, that means:
    // - User was on turn N (the last turn)
    // - A new turn N+1 was just created
    // - We should navigate to N+1
    if (currentTurnOrder === urlTurnOrder + 1) {
      const basePath = `/settings/${settingId}/${adventurePlanId}/${params.adventureId}`
      router.replace(`${basePath}/${currentTurnOrder}`, { scroll: false })
    }
  }, [currentTurn, params.turnOrder, params.adventureId, settingId, adventurePlanId, disableSSE, router])

  // Log turn state for debugging
  React.useEffect(() => {
    if (currentTurn) {
      console.log("[TurnNarrative] Turn state:", {
        turnId: currentTurn.id,
        turnOrder: (currentTurn as { order?: number }).order,
        characterCount: currentTurn.characters.length,
        characters: currentTurn.characters.map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          initiative: c.initiative,
          hasReplied: c.hasReplied,
          isComplete: c.isComplete,
          healthPercent: c.healthPercent,
          status: c.status,
        })),
        currentCharacter: currentCharacter
          ? {
              id: currentCharacter.id,
              name: currentCharacter.name,
              type: currentCharacter.type,
              hasReplied: currentCharacter.hasReplied,
              isComplete: currentCharacter.isComplete,
            }
          : null,
        isTurnComplete,
        disableSSE,
      })
    }
  }, [currentTurn, currentCharacter, isTurnComplete, disableSSE])

  // Trigger NPC processing when an NPC turn is detected
  React.useEffect(() => {
    if (!disableSSE && currentTurn && isNpcProcessing && currentCharacter && !currentTurn.isFinalEncounter) {
      console.log("[TurnNarrative] Detected NPC turn, triggering ensureNpcProcessed:", {
        turnId: currentTurn.id,
        npcId: currentCharacter.id,
        npcName: currentCharacter.name,
        hasReplied: currentCharacter.hasReplied,
        isComplete: currentCharacter.isComplete,
      })
      ensureNpcProcessed(currentTurn.id as Id<"turns">)
        .then((result) => {
          console.log("[TurnNarrative] ensureNpcProcessed result:", result)
        })
        .catch((error) => {
          console.error("[TurnNarrative] Error calling ensureNpcProcessed:", error)
        })
    }
  }, [currentTurn, isNpcProcessing, currentCharacter, disableSSE])

  if (!currentTurn) {
    return null
  }

  const handleGeneratePracticeReport = async () => {
    if (!params.adventureId || isGeneratingPracticeReport) return

    setIsGeneratingPracticeReport(true)
    setPracticeReportError(null)
    try {
      await generatePracticeReport(params.adventureId as Id<"adventures">)
      await loadPracticeReports()
    } catch (error) {
      setPracticeReportError(error instanceof Error ? error.message : "Failed to generate practice report.")
    } finally {
      setIsGeneratingPracticeReport(false)
    }
  }

  return (
    <div className="w-full grow max-w-3xl mx-auto fade-in">
      {shouldShowReply && (
        <div className="hidden md:flex fade-in justify-between items-center gap-4 px-4 h-14 -mt-18 mb-4 bg-black/70 rounded-lg border border-white/20">
          <p className="italic text-sm pl-2 font-bold text-amber-300">It is your turn!</p>
          <Button variant="outline" size="sm" className="text-xs" onClick={() => scrollToBottom()}>
            Go To Reply
          </Button>
        </div>
      )}
      <TurnNarrativeBody variant="page" showOriginalReplies={showOriginalReplies} nextAdventure={nextAdventure} />
      <div className="absolute bottom-8 left-8 w-auto pr-16 z-50">
        <div className="flex justify-center md:justify-start items-center gap-3 md:bg-black/70 px-4 py-2 rounded-lg md:border border-white/20">
          {/* On xl+ the right-rail Storyview card is the entry point */}
          <span className="xl:hidden">
            <StoryviewButton />
          </span>
          <span className="text-xs text-muted-foreground">Show Original Replies</span>
          <div className="scale-75 pt-0.5">
            <Switch checked={showOriginalReplies} onCheckedChange={setShowOriginalReplies} id="show-original-replies-switch" />
          </div>
        </div>
      </div>
      {isPracticeRun && (
        <div className="mt-8 rounded-lg border border-amber-500/30 bg-amber-950/20 p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h4 className="text-amber-300 font-display text-lg">Practice Reports</h4>
              <p className="text-sm text-white/70">Generate a full diagnostic report for plan edits and code investigations.</p>
            </div>
            <Button variant="outline" size="sm" onClick={handleGeneratePracticeReport} disabled={isGeneratingPracticeReport}>
              {isGeneratingPracticeReport ? "Generating Report..." : "Generate Practice Report"}
            </Button>
          </div>
          {practiceReportError ? <p className="text-red-300 text-sm mt-3">{practiceReportError}</p> : null}
          {practiceReports.length > 0 ? (
            <div className="mt-4 space-y-3">
              {practiceReports.slice(0, 5).map((report) => (
                <div key={report.id} className="rounded border border-white/15 bg-black/30 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                    <span className="font-mono">{new Date(report.createdAt).toLocaleString()}</span>
                    <span className={`px-2 py-0.5 rounded ${report.status === "ready" ? "bg-green-700/50 text-green-200" : "bg-red-700/50 text-red-200"}`}>{report.status}</span>
                    <span>{report.findingsCount} findings</span>
                  </div>
                  {report.summary ? <p className="text-sm text-white/85 mt-2">{report.summary}</p> : null}
                  {report.error ? <p className="text-sm text-red-300 mt-2">{report.error}</p> : null}
                  {report.findings.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {report.findings.slice(0, 3).map((finding, findingIndex) => (
                        <div key={`${report.id}-${findingIndex}`} className="rounded border border-white/10 bg-black/40 p-2">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="text-white font-semibold">{finding.title || "Untitled finding"}</span>
                            {finding.type ? <span className="px-1.5 py-0.5 rounded bg-indigo-700/50 text-indigo-100 uppercase">{finding.type}</span> : null}
                            {finding.priority ? <span className="px-1.5 py-0.5 rounded bg-amber-700/50 text-amber-100 uppercase">{finding.priority}</span> : null}
                          </div>
                          {finding.recommendation ? <p className="text-sm text-white/80 mt-1">{finding.recommendation}</p> : null}
                          {finding.target?.planPath ? (
                            <div className="mt-2">
                              <Link href={`/admin/adventure-plans/${settingId}/${adventurePlanId}`} className="text-xs text-primary-200 hover:text-primary-100 underline">
                                Open plan editor: {finding.target.planPath}
                              </Link>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-white/60 mt-3">No reports generated yet.</p>
          )}
        </div>
      )}
    </div>
  )
}
