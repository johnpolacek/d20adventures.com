import { experimental_useObject as useObject } from "@ai-sdk/react"
import { z } from "zod"
import { useState } from "react"
import { zodToJsonSchema } from "zod-to-json-schema"

export function useGenerateObject<T extends z.ZodTypeAny>(schema: T) {
  const [error, setError] = useState<string>("")
  
  type InferredType = z.infer<T>
  
  const { object, isLoading, submit } = useObject<InferredType>({
    api: "/api/ai/generate/object",
    schema,
  })

  const generate = async (prompt: string) => {
    setError("")
    try {
      // Convert Zod schema to JSON schema
      const jsonSchema = zodToJsonSchema(schema)
      
      await submit({
        schema: jsonSchema,
        prompt,
      })
    } catch (err) {
      console.error("Error generating object:", err)
      setError("Failed to generate structured data")
    }
  }

  return {
    object,
    isLoading,
    error,
    generate,
  }
}

// Example usage:
// const { object, isLoading, error, generate } = useGenerateObject(personSchema)
