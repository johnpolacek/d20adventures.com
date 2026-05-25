"use server"

import { generateText } from "@/lib/ai"
import { api, convex } from "@/lib/convex/server"
import { canManageResource } from "@/lib/content-permissions"
import { readJsonFromS3 } from "@/lib/s3-utils"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { Setting } from "@/types/setting"
import { auth, clerkClient } from "@clerk/nextjs/server"
import type { Id } from "@/convex/_generated/dataModel"

export type AdventurePlanChatScope = {
  label: string
  target: string
  sectionIndex?: number
  sceneIndex?: number
  encounterId?: string
}

export type AdventurePlanChatMessage = {
  _id: Id<"adventure_plan_chat_messages">
  settingId: string
  adventurePlanId: string
  role: "user" | "assistant" | "event"
  userId: string
  displayName: string
  content: string
  scope?: AdventurePlanChatScope
  proposal?: {
    status: "proposed" | "used" | "dismissed"
    target: string
    suggestedText: string
    sourceMessageId?: Id<"adventure_plan_chat_messages">
  }
  createdAt: number
}

type SendMessageInput = {
  settingId: string
  adventurePlanId: string
  content: string
  scope: AdventurePlanChatScope
  planContext: {
    title: string
    teaser?: string
    overview?: string
    sectionTitle?: string
    sectionSummary?: string
    sceneTitle?: string
    sceneSummary?: string
    encounterTitle?: string
    encounterIntro?: string
    encounterInstructions?: string
  }
  planOutline?: string
  sectionContext?: string
}

async function assertCanManageAdventurePlan(settingId: string, adventurePlanId: string) {
  const { userId } = await auth()
  if (!userId) throw new Error("Unauthorized")

  const [adventurePlan, setting] = await Promise.all([
    readJsonFromS3(`settings/${settingId}/${adventurePlanId}.json`) as Promise<AdventurePlan>,
    readJsonFromS3(`settings/${settingId}/setting-data.json`).catch(() => null) as Promise<Setting | null>,
  ])

  if (!canManageResource(userId, adventurePlan) && !(setting && canManageResource(userId, setting))) {
    throw new Error("Forbidden")
  }

  return { userId, adventurePlan, setting }
}

async function getDisplayName(userId: string) {
  try {
    const client = await clerkClient()
    const user = await client.users.getUser(userId)
    return user.username || user.fullName || user.primaryEmailAddress?.emailAddress?.split("@")[0] || "Admin"
  } catch {
    return "Admin"
  }
}

function compact(value: string | undefined, max = 1800) {
  if (!value) return "None"
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function isReviewRequest(content: string) {
  return /\b(evaluate|review|audit|analy[sz]e|assess|check|detailed enough|ready|sufficient|transition)\b/i.test(content)
}

function wantsReplacement(content: string) {
  return /\b(rewrite|replace|revise|update|draft|write|polish|improve|expand)\b/i.test(content)
}

function preview(value: string, max = 2500) {
  return value.length > max ? `${value.slice(0, max)}...` : value
}

function debugAdminChat(requestId: string, label: string, data: Record<string, unknown>) {
  if (process.env.ADMIN_CHAT_DEBUG !== "true") return
  console.log(`[admin-chat:${requestId}] ${label}`, JSON.stringify(data, null, 2))
}

function buildAssistantPrompt(input: SendMessageInput, adventurePlan: AdventurePlan, mode: "review" | "rewrite" | "general") {
  return `You are an admin authoring assistant for D20 Adventures.

Help an adventure designer revise a JSON-backed Adventure Plan. Be concise and practical.

Rules:
- This editor is backed by JSON Adventure Plan data, not markdown source files.
- You cannot edit files or write source objects directly.
- Never invent source paths, markdown filenames, filesystem refusals, or messages like "refusing to edit source outside this adventure."
- If the admin asks to evaluate, review, audit, analyze, assess, or check readiness, answer as an advisor using the provided JSON context.
- Do not claim that you changed the adventure plan directly.
- Only include a fenced code block labeled suggestion when the admin explicitly asks you to rewrite, replace, revise, update, draft, polish, improve, or expand the selected target.
- Keep any suggested replacement text ready to paste into the selected field.
- If the request is not about replacing the selected field, answer normally and do not include a suggestion block.
- Avoid semicolons and em dashes in user-visible prose.
- Current request mode: ${mode}

Selected target:
- Label: ${input.scope.label}
- Target: ${input.scope.target}
- Section index: ${input.scope.sectionIndex ?? "none"}
- Scene index: ${input.scope.sceneIndex ?? "none"}
- Encounter id: ${input.scope.encounterId ?? "none"}

Adventure context:
- Title: ${adventurePlan.title}
- Author: ${adventurePlan.author}
- Version: ${adventurePlan.version}
- Current title: ${input.planContext.title}
- Teaser: ${compact(input.planContext.teaser)}
- Overview: ${compact(input.planContext.overview)}
- Section title: ${input.planContext.sectionTitle || "None"}
- Section summary: ${compact(input.planContext.sectionSummary)}
- Scene title: ${input.planContext.sceneTitle || "None"}
- Scene summary: ${compact(input.planContext.sceneSummary)}
- Encounter title: ${input.planContext.encounterTitle || "None"}
- Encounter intro: ${compact(input.planContext.encounterIntro)}
- Encounter instructions: ${compact(input.planContext.encounterInstructions)}

Plan outline from current editor state:
${compact(input.planOutline, 6000)}

Active section context from current editor state:
${compact(input.sectionContext, 9000)}

Admin request:
${input.content}`
}

function extractSuggestion(text: string): { cleaned: string; suggestedText?: string } {
  const match = text.match(/```suggestion\s*([\s\S]*?)```/i)
  if (!match) return { cleaned: text.trim() }

  const suggestedText = match[1].trim()
  const cleaned = text.replace(match[0], "").trim()
  return {
    cleaned: cleaned || "I drafted a replacement for the selected field.",
    suggestedText,
  }
}

export async function fetchRecentAdventurePlanChat(input: { settingId: string; adventurePlanId: string; limit?: number }) {
  await assertCanManageAdventurePlan(input.settingId, input.adventurePlanId)
  return (await convex.query(api.adventurePlanChat.getRecent, input)) as AdventurePlanChatMessage[]
}

export async function fetchAdventurePlanChatBefore(input: { settingId: string; adventurePlanId: string; before: number; limit?: number }) {
  await assertCanManageAdventurePlan(input.settingId, input.adventurePlanId)
  return (await convex.query(api.adventurePlanChat.getBefore, input)) as AdventurePlanChatMessage[]
}

export async function sendAdventurePlanChatMessage(input: SendMessageInput) {
  const content = input.content.trim()
  if (!content) throw new Error("Message is required")

  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const mode = wantsReplacement(content) ? "rewrite" : isReviewRequest(content) ? "review" : "general"
  const { userId, adventurePlan } = await assertCanManageAdventurePlan(input.settingId, input.adventurePlanId)
  const displayName = await getDisplayName(userId)

  const userMessageId = await convex.mutation(api.adventurePlanChat.appendMessage, {
    settingId: input.settingId,
    adventurePlanId: input.adventurePlanId,
    role: "user",
    userId,
    displayName,
    content,
    scope: input.scope,
  })

  const prompt = buildAssistantPrompt(input, adventurePlan, mode)
  debugAdminChat(requestId, "request", {
    settingId: input.settingId,
    adventurePlanId: input.adventurePlanId,
    scope: input.scope,
    mode,
    promptPreview: preview(prompt),
  })

  const { text } = await generateText({ prompt })
  debugAdminChat(requestId, "response", {
    responsePreview: preview(text),
  })
  const parsed = extractSuggestion(text)

  const assistantMessageId = await convex.mutation(api.adventurePlanChat.appendMessage, {
    settingId: input.settingId,
    adventurePlanId: input.adventurePlanId,
    role: "assistant",
    userId,
    displayName: "D20 Assistant",
    content: parsed.cleaned,
    scope: input.scope,
    proposal: parsed.suggestedText
      ? {
          status: "proposed" as const,
          target: input.scope.target,
          suggestedText: parsed.suggestedText,
          sourceMessageId: userMessageId,
        }
      : undefined,
  })

  const messages = await convex.query(api.adventurePlanChat.getRecent, {
    settingId: input.settingId,
    adventurePlanId: input.adventurePlanId,
    limit: 2,
  })

  return {
    userMessageId,
    assistantMessageId,
    messages: messages as AdventurePlanChatMessage[],
  }
}

export async function recordAdventurePlanChatEvent(input: {
  settingId: string
  adventurePlanId: string
  sourceMessageId: Id<"adventure_plan_chat_messages">
  eventType: "used" | "dismissed"
  scope: AdventurePlanChatScope
}) {
  const { userId } = await assertCanManageAdventurePlan(input.settingId, input.adventurePlanId)
  const displayName = await getDisplayName(userId)
  await convex.mutation(api.adventurePlanChat.updateProposalStatus, {
    messageId: input.sourceMessageId,
    status: input.eventType,
  })

  return convex.mutation(api.adventurePlanChat.appendMessage, {
    settingId: input.settingId,
    adventurePlanId: input.adventurePlanId,
    role: "event",
    userId,
    displayName,
    content: input.eventType === "used" ? `Used suggestion for ${input.scope.label}.` : `Dismissed suggestion for ${input.scope.label}.`,
    scope: input.scope,
    proposal: {
      status: input.eventType,
      target: input.scope.target,
      suggestedText: "",
      sourceMessageId: input.sourceMessageId,
    },
  })
}
