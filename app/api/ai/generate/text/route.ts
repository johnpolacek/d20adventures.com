import { generateText, streamText } from "ai"
import type { NextRequest } from "next/server"
import { currentModel } from "@/lib/ai/llm"
import { composeSystemPrompt } from "@/lib/ai/style"
import { budgetOpen, costOf, paid, recordSpend } from "@/lib/gm-server/budget"
import { sanitizeUserVisibleProse } from "@/lib/utils/narrative-utils"
import { requireAuthMiddleware } from "../../_auth"

export async function POST(request: NextRequest) {
  // Check authentication
  const authError = await requireAuthMiddleware()
  if (authError) return authError

  // The site pays for this call, so it stops with the rest when the day's budget is spent.
  if (!(await budgetOpen())) return Response.json({ error: "The site's AI budget for today is spent." }, { status: 429 })

  const body = await request.json()
  const { input, stream = true } = body

  // If stream is false, use non-streaming generateText
  if (!stream) {
    const result = await paid(currentModel.modelId, () =>
      generateText({
        model: currentModel,
        system: composeSystemPrompt(),
        prompt: input,
      })
    )
    return Response.json({ result: sanitizeUserVisibleProse(result.text) })
  }

  // Stream the text response using the ai SDK
  const result = streamText({
    model: currentModel,
    system: composeSystemPrompt(),
    prompt: input,
    onFinish: ({ usage }) => recordSpend(costOf(currentModel.modelId, usage)),
  })

  return result.toTextStreamResponse()
}
