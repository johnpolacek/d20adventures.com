import { useState } from "react"
import { ZodSchema } from "zod"

export function useGenerateObject<T>(api: string, schema: ZodSchema<T>) {
  const [object, setObject] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string>("")

  const generate = async (prompt: string) => {
    setIsLoading(true)
    setError("")
    try {
      const res = await fetch(api, {
        method: "POST",
        body: JSON.stringify({ prompt }),
        headers: { "Content-Type": "application/json" },
      })
      const data = await res.json()
      // Validate with Zod schema
      setObject(schema.parse(data.result))
    } catch (err) {
      setError("Failed to generate structured data")
      setObject(null)
    } finally {
      setIsLoading(false)
    }
  }

  return {
    object,
    isLoading,
    error,
    generate,
  }
} 