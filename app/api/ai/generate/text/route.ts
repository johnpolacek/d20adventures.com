import { streamText, generateText } from "ai";
import { geminiModel } from "@/lib/ai/llm";
import { NextRequest } from "next/server";
import { requireAuthMiddleware } from "../../_auth";

export async function POST(request: NextRequest) {
  // Check authentication
  const authError = await requireAuthMiddleware();
  if (authError) return authError;

  const body = await request.json();
  const { input, stream = true } = body;

  // If stream is false, use non-streaming generateText
  if (!stream) {
    const result = await generateText({
      model: geminiModel,
      prompt: input,
    });
    return Response.json({ result: result.text });
  }

  // Stream the text response using the ai SDK
  const result = await streamText({
    model: geminiModel,
    prompt: input,
  });

  return result.toTextStreamResponse();
}
