import { generateText } from "ai"
import { google } from '@ai-sdk/google';
import { NextRequest } from "next/server"
import { requireAuthMiddleware } from "../../_auth"

export async function POST(request: NextRequest) {
  // Check authentication
  const authError = await requireAuthMiddleware()
  if (authError) return authError

  const { input, messages, system } = await request.json()

  let prompt = input
  if (messages) {
    // If you want to support chat-style messages, concatenate them
    prompt = messages.map((m: any) => m.content).join("\n")
  }
  if (system) {
    prompt = `${system}\n${prompt}`
  }

  const result = await generateText({
    model: google("gemini-2.0-flash-lite"),
    prompt,
  })

  // Return as JSON for backend use
  return Response.json({ result: result.text })
}
