"use client"

import { sanitizeUserVisibleProse } from "@/lib/utils/narrative-utils"

export function useGenerateText() {
  const streamText = async (prompt: string, onUpdate: (output: string) => void, signal?: AbortSignal) => {
    const response = await fetch("/api/ai/generate/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: `${prompt} - Use smart quotes and avoid using backslashes` }),
      signal,
    })

    if (!response.ok) {
      throw new Error(response.statusText)
    }

    const data = response.body
    if (!data) {
      return
    }

    const reader = data.getReader()
    const decoder = new TextDecoder()
    const onAbort = () => {
      void reader.cancel().catch(() => {})
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    let done = false
    let accumulatedResponse = ""

    try {
      while (!done) {
        if (signal?.aborted) break
        const { value, done: doneReading } = await reader.read()
        if (signal?.aborted) break
        done = doneReading
        if (value) {
          const chunkValue = decoder.decode(value, { stream: !done })
          accumulatedResponse += chunkValue
          onUpdate(sanitizeUserVisibleProse(accumulatedResponse))
        }
      }
    } finally {
      signal?.removeEventListener("abort", onAbort)
    }

    return accumulatedResponse
  }

  return {
    streamText,
  }
}
