"use client"

export function useGenerateText() {
  const streamText = async (prompt: string, onUpdate: (output: string) => void) => {
    const response = await fetch("/api/ai/generate/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: `${prompt} - Use smart quotes and avoid using backslashes` }),
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
    let done = false
    let accumulatedResponse = ""

    while (!done) {
      const { value, done: doneReading } = await reader.read()
      done = doneReading
      const chunkValue = decoder.decode(value)
      accumulatedResponse += chunkValue
      onUpdate(accumulatedResponse)
    }

    return accumulatedResponse
  }

  return {
    streamText,
  }
}
