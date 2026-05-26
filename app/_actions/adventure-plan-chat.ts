"use server"

import { generateText } from "@/lib/ai"
import { currentModel } from "@/lib/ai/llm"
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
  contextReport?: AdventurePlanChatContextReport
  createdAt: number
}

export type AdventurePlanChatContextReport = {
  modelId: string
  contextWindowTokens: number
  estimatedPromptTokens: number
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
  percentUsed: number
  includedMessages: number
  omittedMessages: number
  status: "ok" | "warning" | "critical" | "unknown"
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

const ADMIN_CHAT_CONTEXT_WINDOW_TOKENS = 1_000_000
const ADMIN_CHAT_RESERVED_OUTPUT_TOKENS = 16_000
const ADMIN_CHAT_CONTEXT_SAFETY_TOKENS = 8_000
const ADMIN_CHAT_WARNING_PERCENT = 75
const ADMIN_CHAT_CRITICAL_PERCENT = 90

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

function estimateTokens(text: string) {
  return Math.ceil(text.length / 4)
}

function isReviewRequest(content: string) {
  return /\b(evaluate|review|audit|analy[sz]e|assess|check|detailed enough|ready|sufficient|transition)\b/i.test(content)
}

function wantsReplacement(content: string) {
  return /\b(rewrite|replace|revise|update|draft|write|polish|improve|expand)\b/i.test(content)
}

function formatChatMessageForPrompt(message: AdventurePlanChatMessage) {
  const scope = message.scope?.label ? ` | scope: ${message.scope.label}` : ""
  const proposal = message.proposal?.suggestedText
    ? `\nProposal status: ${message.proposal.status}\nProposal target: ${message.proposal.target}\nSuggested text:\n${message.proposal.suggestedText}`
    : ""

  return `[${message.role.toUpperCase()} | ${message.displayName} | ${new Date(message.createdAt).toISOString()}${scope}]
${message.content}${proposal}`
}

function buildThreadContext(messages: AdventurePlanChatMessage[]) {
  if (messages.length === 0) return "No previous thread messages."
  return messages.map(formatChatMessageForPrompt).join("\n\n---\n\n")
}

function getContextStatus(percentUsed: number, omittedMessages: number): AdventurePlanChatContextReport["status"] {
  if (percentUsed >= ADMIN_CHAT_CRITICAL_PERCENT) return "critical"
  if (percentUsed >= ADMIN_CHAT_WARNING_PERCENT || omittedMessages > 0) return "warning"
  return "ok"
}

function buildAssistantPrompt(
  input: SendMessageInput,
  adventurePlan: AdventurePlan,
  mode: "review" | "rewrite" | "general",
  threadContext: string,
  omittedMessages: number
) {
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

Thread discussion so far:
${threadContext}

Thread context note:
${omittedMessages > 0 ? `${omittedMessages} oldest thread message(s) were omitted because the prompt was approaching the model context limit.` : "All stored thread messages are included."}

Admin request:
${input.content}`
}

function buildPromptWithThreadContext(input: SendMessageInput, adventurePlan: AdventurePlan, mode: "review" | "rewrite" | "general", threadMessages: AdventurePlanChatMessage[]) {
  const promptBudget = ADMIN_CHAT_CONTEXT_WINDOW_TOKENS - ADMIN_CHAT_RESERVED_OUTPUT_TOKENS - ADMIN_CHAT_CONTEXT_SAFETY_TOKENS
  const includedMessages = [...threadMessages]
  let omittedMessages = 0
  let prompt = buildAssistantPrompt(input, adventurePlan, mode, buildThreadContext(includedMessages), omittedMessages)
  let estimatedPromptTokens = estimateTokens(prompt)

  while (estimatedPromptTokens > promptBudget && includedMessages.length > 0) {
    includedMessages.shift()
    omittedMessages += 1
    prompt = buildAssistantPrompt(input, adventurePlan, mode, buildThreadContext(includedMessages), omittedMessages)
    estimatedPromptTokens = estimateTokens(prompt)
  }

  const percentUsed = Math.min(100, Math.round((estimatedPromptTokens / ADMIN_CHAT_CONTEXT_WINDOW_TOKENS) * 100))

  return {
    prompt,
    includedMessages: includedMessages.length,
    omittedMessages,
    estimatedPromptTokens,
    percentUsed,
  }
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

  const threadMessages = (await convex.query(api.adventurePlanChat.getAllForPlan, {
    settingId: input.settingId,
    adventurePlanId: input.adventurePlanId,
  })) as AdventurePlanChatMessage[]
  const promptContext = buildPromptWithThreadContext(input, adventurePlan, mode, threadMessages)
  const { text, usage } = await generateText({ prompt: promptContext.prompt })
  const parsed = extractSuggestion(text)
  const inputTokens = usage?.inputTokens
  const outputTokens = usage?.outputTokens
  const totalTokens = usage?.totalTokens
  const tokensForPercent = inputTokens ?? promptContext.estimatedPromptTokens
  const percentUsed = Math.min(100, Math.round((tokensForPercent / ADMIN_CHAT_CONTEXT_WINDOW_TOKENS) * 100))
  const contextReport: AdventurePlanChatContextReport = {
    modelId: currentModel.modelId,
    contextWindowTokens: ADMIN_CHAT_CONTEXT_WINDOW_TOKENS,
    estimatedPromptTokens: promptContext.estimatedPromptTokens,
    percentUsed,
    includedMessages: promptContext.includedMessages,
    omittedMessages: promptContext.omittedMessages,
    status: getContextStatus(percentUsed, promptContext.omittedMessages),
  }
  if (inputTokens !== undefined) contextReport.inputTokens = inputTokens
  if (outputTokens !== undefined) contextReport.outputTokens = outputTokens
  if (totalTokens !== undefined) contextReport.totalTokens = totalTokens

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
    contextReport,
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
