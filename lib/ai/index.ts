"use server"

import { decrementUserTokensAction } from "@/app/_actions/tokens"
import { auth } from "@clerk/nextjs/server"
import { generateObject as baseGenerateObject, generateText as baseGenerateText, streamObject as baseStreamObject } from "ai"
import type { Schema as AISchema } from "ai"
import type { z } from "zod"
import { currentModel } from "./llm"

// Helper function to wait for a specified number of milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Helper function to clean JSON responses that might be wrapped in markdown
function cleanJsonResponse(text: string): string {
  // Remove markdown code blocks if present
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }
  return text.trim()
}

type GenerateObjectReturn<T extends z.ZodTypeAny> = {
  object: z.infer<T>
  usage?: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
  }
  [key: string]: unknown
}

// Wrapper: uses currentModel by default, but allows override
export async function generateObject<T extends z.ZodTypeAny>({ prompt, schema }: { prompt: string; schema: T }): Promise<GenerateObjectReturn<T>> {
  let result: GenerateObjectReturn<T>
  try {
    const { userId } = await auth()

    if (!userId) {
      throw new Error("User not authenticated")
    }

    result = (await baseGenerateObject({
      prompt,
      schema: schema as unknown as AISchema,
      model: currentModel,
    })) as unknown as GenerateObjectReturn<T>

    const totalTokens = result.usage?.totalTokens ?? 0
    if (totalTokens > 0) {
      const tokenDecrementResult = await decrementUserTokensAction({
        tokensUsed: totalTokens,
        transactionType: "usage_generate_object",
      })

      if (!tokenDecrementResult.success) {
        console.error("Token decrementation failed for generateObject:", tokenDecrementResult.error, tokenDecrementResult.details)
        let errorMessage = ""
        if (tokenDecrementResult.details instanceof Error) {
          errorMessage = tokenDecrementResult.details.message
        }
        if (errorMessage.includes("Insufficient tokens")) {
          throw new Error(`Insufficient tokens for generateObject operation. Usage: ${totalTokens}.`)
        }
        throw new Error("Failed to update token balance after generateObject operation.")
      }
    }

    return result
  } catch (error) {
    console.warn("generateObject failed. Error details:", error)

    // Check if it's a JSON parsing error with markdown-wrapped content
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isJsonParseError = errorMessage.includes("JSON parsing failed") || errorMessage.includes("could not parse the response")

    if (isJsonParseError && error && typeof error === "object" && "text" in error) {
      console.warn("Attempting to clean markdown-wrapped JSON response...")
      try {
        const errorWithText = error as { text: string; usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number } }
        const rawText = errorWithText.text
        const cleanedText = cleanJsonResponse(rawText)
        console.log("Original text:", rawText)
        console.log("Cleaned text:", cleanedText)

        // Try to parse the cleaned JSON manually
        const parsedObject = JSON.parse(cleanedText)

        // Return the result in the expected format
        result = {
          object: parsedObject,
          usage: errorWithText.usage || {},
        } as GenerateObjectReturn<T>

        console.log("Successfully parsed cleaned JSON response")

        // Handle token decrementation for successful parse
        const totalTokens = result.usage?.totalTokens ?? 0
        if (totalTokens > 0) {
          const tokenDecrementResult = await decrementUserTokensAction({
            tokensUsed: totalTokens,
            transactionType: "usage_generate_object",
            modelId: currentModel.modelId,
          })

          if (!tokenDecrementResult.success) {
            console.error("Token decrementation failed for generateObject (cleaned):", tokenDecrementResult.error)
            // Don't throw here since we successfully parsed the response
          }
        }

        return result
      } catch (cleaningError) {
        console.warn("Failed to clean and parse JSON response:", cleaningError)
        // Fall through to normal retry logic
      }
    }

    // Check if it's a quota/rate limit error
    const isQuotaError = errorMessage.includes("quota") || errorMessage.includes("rate") || errorMessage.includes("exceeded")

    // Add longer delay for quota errors, shorter for others
    const retryDelay = isQuotaError ? 10000 : 2000 // 10 seconds for quota errors, 2 seconds for others
    console.warn(`Retrying generateObject in ${retryDelay / 1000} seconds...`)
    await sleep(retryDelay)

    // Retry once
    try {
      result = (await baseGenerateObject({
        prompt,
        schema: schema as unknown as AISchema,
        model: currentModel,
      })) as unknown as GenerateObjectReturn<T>

      console.log("generateObject (retry) raw result:", result)

      const retryTotalTokens = result.usage?.totalTokens ?? 0
      if (retryTotalTokens > 0) {
        const inputTokens = result.usage?.inputTokens ?? 0
        const outputTokens = result.usage?.outputTokens ?? 0
        const tokensInputOutputRatio = outputTokens > 0 ? inputTokens / outputTokens : 0
        console.log("Token Usage (generateObject retry):", {
          tokensInputOutputRatio,
          totalTokens: retryTotalTokens,
          model: currentModel.modelId,
        })
        const tokenDecrementResultRetry = await decrementUserTokensAction({
        tokensUsed: retryTotalTokens,
        transactionType: "usage_generate_object",
      })

        if (!tokenDecrementResultRetry.success) {
          console.error("Token decrementation failed for generateObject (retry):", tokenDecrementResultRetry.error, tokenDecrementResultRetry.details)
          let errorMessage = ""
          if (tokenDecrementResultRetry.details instanceof Error) {
            errorMessage = tokenDecrementResultRetry.details.message
          }
          if (errorMessage.includes("Insufficient tokens")) {
            throw new Error(`Insufficient tokens for generateObject operation (retry). Usage: ${retryTotalTokens}.`)
          }
          throw new Error("Failed to update token balance after generateObject operation (retry).")
        }
      }

      return result
    } catch (retryError) {
      console.error("generateObject retry also failed. Error details:", retryError)

      // Try the same JSON cleaning logic on retry error
      const retryErrorMessage = retryError instanceof Error ? retryError.message : String(retryError)
      const isRetryJsonParseError = retryErrorMessage.includes("JSON parsing failed") || retryErrorMessage.includes("could not parse the response")

      if (isRetryJsonParseError && retryError && typeof retryError === "object" && "text" in retryError) {
        console.warn("Attempting to clean markdown-wrapped JSON response on retry...")
        try {
          const retryErrorWithText = retryError as { text: string; usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number } }
          const rawText = retryErrorWithText.text
          const cleanedText = cleanJsonResponse(rawText)
          console.log("Retry - Original text:", rawText)
          console.log("Retry - Cleaned text:", cleanedText)

          // Try to parse the cleaned JSON manually
          const parsedObject = JSON.parse(cleanedText)

          // Return the result in the expected format
          result = {
            object: parsedObject,
            usage: retryErrorWithText.usage || {},
          } as GenerateObjectReturn<T>

          console.log("Successfully parsed cleaned JSON response on retry")

          // Handle token decrementation for successful parse
          const totalTokens = result.usage?.totalTokens ?? 0
          if (totalTokens > 0) {
            const tokenDecrementResult = await decrementUserTokensAction({
              tokensUsed: totalTokens,
              transactionType: "usage_generate_object",
              modelId: currentModel.modelId,
            })

            if (!tokenDecrementResult.success) {
              console.error("Token decrementation failed for generateObject (retry cleaned):", tokenDecrementResult.error)
              // Don't throw here since we successfully parsed the response
            }
          }

          return result
        } catch (retryCleaningError) {
          console.warn("Failed to clean and parse JSON response on retry:", retryCleaningError)
          // Fall through to throw the original retry error
        }
      }

      throw retryError // Re-throw the error from the retry attempt
    }
  }
}

// Wrapper for streamObject: uses currentModel by default, but allows override
export async function streamObject<T extends z.ZodTypeAny>({ prompt, schema }: { prompt: string; schema: T }) {
  const { userId } = await auth()

  if (!userId) {
    throw new Error("User not authenticated")
  }

  return baseStreamObject({
    prompt,
    schema: schema as unknown as AISchema,
    model: currentModel,
  })
}

// Wrapper for generateText: uses currentModel by default, but allows override
export async function generateText({ prompt }: { prompt: string }): Promise<{ text: string; usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } }> {
  let result
  try {
    const { userId } = await auth()

    if (!userId) {
      throw new Error("User not authenticated")
    }

    console.log("[LLM] generateText prompt:", {
      promptLength: prompt.length,
      model: currentModel.modelId,
    })

    result = await baseGenerateText({
      prompt,
      model: currentModel,
    })

    console.log("[LLM] generateText response:", {
      textLength: result.text?.length || 0,
      quality: result.text && result.text.length > 0 ? "complete" : "empty",
    })

    const totalTokens = result.usage?.totalTokens ?? 0
    if (totalTokens > 0) {
      const inputTokens = result.usage?.inputTokens ?? 0
      const outputTokens = result.usage?.outputTokens ?? 0
      const tokensInputOutputRatio = outputTokens > 0 ? inputTokens / outputTokens : 0
      console.log("[LLM] Token usage:", {
        total: totalTokens,
        efficiency: tokensInputOutputRatio.toFixed(2),
        model: currentModel.modelId,
      })
      const tokenDecrementResult = await decrementUserTokensAction({
        tokensUsed: totalTokens,
        transactionType: "usage_generate_text",
      })

      if (!tokenDecrementResult.success) {
        console.error("Token decrementation failed for generateText:", tokenDecrementResult.error, tokenDecrementResult.details)
        let errorMessage = ""
        if (tokenDecrementResult.details instanceof Error) {
          errorMessage = tokenDecrementResult.details.message
        }
        if (errorMessage.includes("Insufficient tokens")) {
          throw new Error(`Insufficient tokens for generateText operation. Usage: ${totalTokens}.`)
        }
        throw new Error("Failed to update token balance after generateText operation.")
      }
    }

    return {
      text: result.text ?? "",
      usage: result.usage,
    }
  } catch (error) {
    console.warn("generateText failed. Error details:", error)

    // Check if it's a quota/rate limit error
    const errorMessage = error instanceof Error ? error.message : String(error)
    const isQuotaError = errorMessage.includes("quota") || errorMessage.includes("rate") || errorMessage.includes("exceeded")

    // Add longer delay for quota errors, shorter for others
    const retryDelay = isQuotaError ? 10000 : 2000 // 10 seconds for quota errors, 2 seconds for others
    console.warn(`Retrying generateText in ${retryDelay / 1000} seconds...`)
    await sleep(retryDelay)

    // Retry once
    try {
      result = await baseGenerateText({
        prompt,
        model: currentModel,
      })

      console.log("generateText (retry) raw result:", result)

      const retryTotalTokens = result.usage?.totalTokens ?? 0
      if (retryTotalTokens > 0) {
        const inputTokens = result.usage?.inputTokens ?? 0
        const outputTokens = result.usage?.outputTokens ?? 0
        const tokensInputOutputRatio = outputTokens > 0 ? inputTokens / outputTokens : 0
        console.log("Token Usage (generateText retry):", {
          tokensInputOutputRatio,
          totalTokens: retryTotalTokens,
          model: currentModel.modelId,
        })
        const tokenDecrementResultRetry = await decrementUserTokensAction({
        tokensUsed: retryTotalTokens,
        transactionType: "usage_generate_text",
      })

        if (!tokenDecrementResultRetry.success) {
          console.error("Token decrementation failed for generateText (retry):", tokenDecrementResultRetry.error, tokenDecrementResultRetry.details)
          let errorMessage = ""
          if (tokenDecrementResultRetry.details instanceof Error) {
            errorMessage = tokenDecrementResultRetry.details.message
          }
          if (errorMessage.includes("Insufficient tokens")) {
            throw new Error(`Insufficient tokens for generateText operation (retry). Usage: ${retryTotalTokens}.`)
          }
          throw new Error("Failed to update token balance after generateText operation (retry).")
        }
      }

      return {
        text: result.text ?? "",
        usage: result.usage,
      }
    } catch (retryError) {
      console.error("generateText retry also failed. Error details:", retryError)
      throw retryError // Re-throw the error from the retry attempt
    }
  }
}
