import { pcmDurationSec, silencePcm } from "@/lib/audio/wav"

// @ai-sdk/google has no speech support, so we call the Gemini API directly.
// Response audio is raw PCM: 24kHz, 16-bit, mono (see lib/audio/wav.ts).
const DEFAULT_TTS_MODEL = "gemini-3.1-flash-tts-preview"

export interface TtsUsage {
  inputTokens: number
  outputTokens: number
}

export interface TtsResult {
  pcm: Buffer
  usage: TtsUsage
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildPrompt(text: string, styleInstruction?: string): string {
  if (styleInstruction) return `${styleInstruction}\n\n${text}`
  return text
}

interface GeminiTtsResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }>
    }
  }>
  usageMetadata?: {
    promptTokenCount?: number
    candidatesTokenCount?: number
  }
  error?: { message?: string }
}

async function callGeminiTts(text: string, voice: string, styleInstruction?: string): Promise<TtsResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not configured")
  const model = process.env.GEMINI_TTS_MODEL || DEFAULT_TTS_MODEL

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildPrompt(text, styleInstruction) }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } },
        },
      },
    }),
  })

  const json = (await response.json().catch(() => null)) as GeminiTtsResponse | null
  if (!response.ok) {
    throw new Error(`Gemini TTS request failed (${response.status}): ${json?.error?.message ?? "unknown error"}`)
  }

  const base64 = json?.candidates?.[0]?.content?.parts?.find((part) => part.inlineData?.data)?.inlineData?.data
  if (!base64) {
    throw new Error("Gemini TTS response contained no audio data")
  }

  return {
    pcm: Buffer.from(base64, "base64"),
    usage: {
      inputTokens: json?.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: json?.usageMetadata?.candidatesTokenCount ?? 0,
    },
  }
}

export async function synthesizeSegment(opts: { text: string; voice: string; styleInstruction?: string }): Promise<TtsResult> {
  if (process.env.USE_PLACEHOLDER_TTS === "true") {
    return { pcm: silencePcm(1.5), usage: { inputTokens: 0, outputTokens: 0 } }
  }

  try {
    return await callGeminiTts(opts.text, opts.voice, opts.styleInstruction)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const isQuotaError = message.includes("quota") || message.includes("rate") || message.includes("429") || message.includes("exceeded")
    await sleep(isQuotaError ? 10000 : 2000)
    return await callGeminiTts(opts.text, opts.voice, opts.styleInstruction)
  }
}

export { pcmDurationSec }
