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

class TokenChargeError extends Error {
  constructor(
    message: string,
    public readonly code: "INSUFFICIENT_TOKENS" | "CHARGE_FAILED"
  ) {
    super(message)
    this.name = "TokenChargeError"
  }
}

function isTokenChargeError(error: unknown): error is TokenChargeError {
  return error instanceof TokenChargeError
}

async function chargeForUsageOrThrow(totalTokens: number, transactionType: "usage_generate_object" | "usage_generate_text", context: string): Promise<void> {
  if (totalTokens <= 0) return

  const tokenDecrementResult = await decrementUserTokensAction({
    tokensUsed: totalTokens,
    transactionType,
  })

  if (tokenDecrementResult.success) return

  console.error(`Token decrementation failed for ${context}:`, tokenDecrementResult.error, tokenDecrementResult.details)

  if (tokenDecrementResult.errorCode === "INSUFFICIENT_TOKENS") {
    throw new TokenChargeError(`Insufficient tokens for ${context}. Usage: ${totalTokens}.`, "INSUFFICIENT_TOKENS")
  }

  throw new TokenChargeError(`Failed to update token balance after ${context}.`, "CHARGE_FAILED")
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
    await chargeForUsageOrThrow(totalTokens, "usage_generate_object", "generateObject operation")

    return result
  } catch (error) {
    console.warn("generateObject failed. Error details:", error)

    if (isTokenChargeError(error)) {
      throw error
    }

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
        await chargeForUsageOrThrow(totalTokens, "usage_generate_object", "generateObject operation (cleaned parse)")

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
      }
      await chargeForUsageOrThrow(retryTotalTokens, "usage_generate_object", "generateObject operation (retry)")

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
          await chargeForUsageOrThrow(totalTokens, "usage_generate_object", "generateObject operation (retry cleaned parse)")

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

    result = await baseGenerateText({
      prompt,
      model: currentModel,
    })


    const totalTokens = result.usage?.totalTokens ?? 0
    await chargeForUsageOrThrow(totalTokens, "usage_generate_text", "generateText operation")

    return {
      text: result.text ?? "",
      usage: result.usage,
    }
  } catch (error) {
    console.warn("generateText failed. Error details:", error)

    if (isTokenChargeError(error)) {
      throw error
    }

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
      }
      await chargeForUsageOrThrow(retryTotalTokens, "usage_generate_text", "generateText operation (retry)")

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
