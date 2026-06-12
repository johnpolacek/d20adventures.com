"use server"

import { auth } from "@clerk/nextjs/server"
import { z } from "zod"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { assertAdventureAccess } from "@/lib/adventure-access"
import { generateObject } from "@/lib/ai"
import { convex } from "@/lib/convex/server"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"
import type { AdventurePlan } from "@/types/adventure-plan"

const reportSchema = z.object({
  summary: z.string(),
  findings: z.array(
    z.object({
      title: z.string(),
      type: z.union([z.literal("plan_edit"), z.literal("code_investigation")]),
      priority: z.union([z.literal("high"), z.literal("medium"), z.literal("low")]),
      evidence: z.string(),
      recommendation: z.string(),
      target: z
        .object({
          encounterId: z.string().optional(),
          planPath: z.string().optional(),
          codeArea: z.string().optional(),
        })
        .optional(),
    })
  ),
  pacing: z.object({
    highlights: z.array(z.string()),
    risks: z.array(z.string()),
  }),
})

type PracticeReport = z.infer<typeof reportSchema>

function buildPracticeReportPrompt(args: { plan: AdventurePlan; turnSnapshots: Array<{ order: number; encounterId: string; title: string; narrative: string }> }): string {
  const encounterCatalog = args.plan.sections
    .flatMap((section) => section.scenes)
    .flatMap((scene) => scene.encounters)
    .map((encounter) => ({
      id: encounter.id,
      title: encounter.title,
      transitions: encounter.transitions ?? [],
      hasInstructions: Boolean(encounter.instructions),
    }))

  return [
    "You are an expert adventure playtest analyst.",
    "Produce a full diagnostic report focused on iteration quality for both authored adventure-plan updates and game-system/code improvements.",
    "Prefer concrete, actionable findings over generic advice.",
    "",
    "Output requirements:",
    '- "summary" should be 3-6 sentences.',
    '- "findings" should include 8-20 items where possible.',
    '- Tag each finding as type "plan_edit" or "code_investigation".',
    "- Include specific evidence from turns in each finding.",
    "- For plan edits, include target.encounterId and target.planPath when possible.",
    "- For code investigations, include target.codeArea when possible.",
    "",
    "Adventure plan metadata:",
    JSON.stringify(
      {
        id: args.plan.id,
        title: args.plan.title,
        party: args.plan.party,
        overview: args.plan.overview,
        sectionCount: args.plan.sections.length,
        encounterCatalog,
      },
      null,
      2
    ),
    "",
    "Turn history snapshots (ordered):",
    JSON.stringify(args.turnSnapshots, null, 2),
  ].join("\n")
}

export async function generatePracticeReport(adventureId: Id<"adventures">) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const adventure = await assertAdventureAccess(userId, adventureId)
  if (adventure.ownerId !== userId) throw new Error("Only the run owner can generate practice reports")
  if ((adventure.runType ?? "campaign") !== "practice") throw new Error("Practice reports are only available for practice runs")

  const turns = await convex.query(api.adventure.getTurnsByAdventure, { adventureId })
  const plan = await loadAdventurePlanForRuntime(adventure.settingId, adventure.planId)
  if (!plan) throw new Error("Adventure plan not found")

  const turnSnapshots = turns.map((turn) => ({
    order: turn.order,
    encounterId: turn.encounterId,
    title: turn.title,
    narrative: (turn.narrative || "").slice(-4000),
  }))

  const prompt = buildPracticeReportPrompt({ plan, turnSnapshots })

  try {
    const result = await generateObject({
      prompt,
      schema: reportSchema,
    })

    const reportId = await convex.mutation(api.adventureReports.createAdventureReport, {
      adventureId,
      ownerId: userId,
      runType: "practice",
      trigger: "on_demand",
      status: "ready",
      report: result.object,
    })

    return {
      success: true,
      reportId,
      report: result.object as PracticeReport,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Report generation failed"
    await convex.mutation(api.adventureReports.createAdventureReport, {
      adventureId,
      ownerId: userId,
      runType: "practice",
      trigger: "on_demand",
      status: "failed",
      error: message,
    })
    throw error
  }
}

export async function getPracticeReportsForAdventure(adventureId: Id<"adventures">) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const adventure = await assertAdventureAccess(userId, adventureId)
  if (adventure.ownerId !== userId) throw new Error("Only the run owner can view practice reports")
  if ((adventure.runType ?? "campaign") !== "practice") return []

  const reports = await convex.query(api.adventureReports.getReportsByAdventure, { adventureId, limit: 20 })
  return reports.map((report) => ({
    id: report._id,
    createdAt: report.createdAt,
    status: report.status,
    trigger: report.trigger,
    summary: typeof report.report === "object" && report.report && "summary" in report.report ? (report.report as { summary?: string }).summary : undefined,
    findingsCount:
      typeof report.report === "object" && report.report && "findings" in report.report && Array.isArray((report.report as { findings?: unknown[] }).findings)
        ? (report.report as { findings: unknown[] }).findings.length
        : 0,
    findings:
      typeof report.report === "object" && report.report && "findings" in report.report && Array.isArray((report.report as { findings?: unknown[] }).findings)
        ? (report.report as { findings: unknown[] }).findings
        : [],
    report: report.report,
    error: report.error,
  }))
}

export async function getPracticeReportsForUser(limit = 30) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const reports = await convex.query(api.adventureReports.getReportsByOwner, { ownerId: userId, limit })
  const practiceReports = reports.filter((report) => report.runType === "practice")

  const adventureCache = new Map<string, { title: string; settingId: string; planId: string; runType?: "campaign" | "practice" }>()
  const enriched = []

  for (const report of practiceReports) {
    const adventureKey = report.adventureId.toString()
    if (!adventureCache.has(adventureKey)) {
      const adventure = await convex.query(api.adventure.getAdventureById, { adventureId: report.adventureId })
      if (adventure) {
        adventureCache.set(adventureKey, {
          title: adventure.title,
          settingId: adventure.settingId,
          planId: adventure.planId,
          runType: adventure.runType ?? "campaign",
        })
      }
    }

    const adventure = adventureCache.get(adventureKey)
    if (!adventure) continue

    enriched.push({
      id: report._id,
      createdAt: report.createdAt,
      status: report.status,
      summary: typeof report.report === "object" && report.report && "summary" in report.report ? (report.report as { summary?: string }).summary : undefined,
      findingsCount:
        typeof report.report === "object" && report.report && "findings" in report.report && Array.isArray((report.report as { findings?: unknown[] }).findings)
          ? (report.report as { findings: unknown[] }).findings.length
          : 0,
      adventureId: adventureKey,
      adventureTitle: adventure.title,
      settingId: adventure.settingId,
      planId: adventure.planId,
      runType: adventure.runType ?? "campaign",
    })
  }

  return enriched
}
