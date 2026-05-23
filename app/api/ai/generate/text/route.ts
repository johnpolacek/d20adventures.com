import { currentModel } from "@/lib/ai/llm"
import { composeSystemPrompt } from "@/lib/ai/style"
import { sanitizeUserVisibleProse } from "@/lib/utils/narrative-utils"
import { generateText, streamText } from "ai"
import type { NextRequest } from "next/server"
import { requireAuthMiddleware } from "../../_auth"

export async function POST(request: NextRequest) {
  // Check authentication
  const authError = await requireAuthMiddleware()
  if (authError) return authError

  const body = await request.json()
  const { input, stream = true } = body

  // If stream is false, use non-streaming generateText
  if (!stream) {
    const result = await generateText({
      model: currentModel,
      system: composeSystemPrompt(),
      prompt: input,
    })
    return Response.json({ result: sanitizeUserVisibleProse(result.text) })
  }

  // Stream the text response using the ai SDK
  const result = streamText({
    model: currentModel,
    system: composeSystemPrompt(),
    prompt: input,
  })

  return result.toTextStreamResponse()
}
