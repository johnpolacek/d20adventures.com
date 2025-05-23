import { generateText } from "@/lib/ai/"
import { NextRequest } from "next/server"
import { requireAuthMiddleware } from "../../_auth"

type Message = { content: string }

export async function POST(request: NextRequest) {
  // Check authentication
  const authError = await requireAuthMiddleware()
  if (authError) return authError

  const body = await request.json()

  const { input, messages, system } = body

  let prompt = input
  if (messages) {
    // If you want to support chat-style messages, concatenate them
    prompt = (messages as Message[]).map((m) => m.content).join("\n")
  }
  if (system) {
    prompt = `${system}\n${prompt}`
  }

  const result = await generateText({
    prompt,
  })

  // Return as JSON for backend use
  return Response.json({ result: result.text })
}
