"use server"

import { generateObject as baseGenerateObject, streamObject as baseStreamObject, generateText as baseGenerateText } from "ai";
import type { Schema as AISchema } from "ai";
import { openaiModel } from "./llm";
import { auth } from "@clerk/nextjs/server"
import { z } from "zod";
import { decrementUserTokensAction } from "@/app/_actions/tokens";

// Helper function to wait for a specified number of milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

type GenerateObjectReturn<T extends z.ZodTypeAny> = {
  object: z.infer<T>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  [key: string]: unknown;
}

// Wrapper: uses openaiModel by default, but allows override
export async function generateObject<T extends z.ZodTypeAny>({prompt, schema}: { prompt: string; schema: T; }): Promise<GenerateObjectReturn<T>> {
  let result: GenerateObjectReturn<T>;
  try {
    const { userId } = await auth()

    if (!userId) {
      throw new Error("User not authenticated");
    }

    result = (await baseGenerateObject({
      prompt,
      schema: schema as unknown as AISchema,
      model: openaiModel,
    })) as unknown as GenerateObjectReturn<T>;

    const totalTokens = result.usage?.totalTokens ?? 0;
    if (totalTokens > 0) {
      const tokenDecrementResult = await decrementUserTokensAction({
        tokensUsed: totalTokens,
        transactionType: "usage_generate_object",
        modelId: openaiModel.modelId,
      });

      if (!tokenDecrementResult.success) {
        console.error("Token decrementation failed for generateObject:", tokenDecrementResult.error, tokenDecrementResult.details);
        let errorMessage = '';
        if (tokenDecrementResult.details instanceof Error) {
          errorMessage = tokenDecrementResult.details.message;
        }
        if (errorMessage.includes("Insufficient tokens")) {
          throw new Error(`Insufficient tokens for generateObject operation. Usage: ${totalTokens}.`);
        }
        throw new Error("Failed to update token balance after generateObject operation.");
      }
    }

    return result;
  } catch (error) {
    console.warn('generateObject failed. Error details:', error);
    
    // Check if it's a quota/rate limit error
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isQuotaError = errorMessage.includes('quota') || 
                        errorMessage.includes('rate') || 
                        errorMessage.includes('exceeded');
    
    // Add longer delay for quota errors, shorter for others
    const retryDelay = isQuotaError ? 10000 : 2000; // 10 seconds for quota errors, 2 seconds for others
    console.warn(`Retrying generateObject in ${retryDelay/1000} seconds...`);
    await sleep(retryDelay);
    
    // Retry once
    try {
      result = (await baseGenerateObject({
        prompt,
        schema: schema as unknown as AISchema,
        model: openaiModel,
      })) as unknown as GenerateObjectReturn<T>;

      console.log('generateObject (retry) raw result:', result);

      const retryTotalTokens = result.usage?.totalTokens ?? 0;
      if (retryTotalTokens > 0) {
        const inputTokens = result.usage?.inputTokens ?? 0;
        const outputTokens = result.usage?.outputTokens ?? 0;
        const tokensInputOutputRatio = outputTokens > 0 ? inputTokens / outputTokens : 0;
        console.log('Token Usage (generateObject retry):', {
          tokensInputOutputRatio,
          totalTokens: retryTotalTokens,
          model: openaiModel.modelId
        });
        const tokenDecrementResultRetry = await decrementUserTokensAction({
          tokensUsed: retryTotalTokens,
          transactionType: "usage_generate_object",
          modelId: openaiModel.modelId,
        });

        if (!tokenDecrementResultRetry.success) {
          console.error("Token decrementation failed for generateObject (retry):", tokenDecrementResultRetry.error, tokenDecrementResultRetry.details);
          let errorMessage = '';
          if (tokenDecrementResultRetry.details instanceof Error) {
            errorMessage = tokenDecrementResultRetry.details.message;
          }
          if (errorMessage.includes("Insufficient tokens")) {
            throw new Error(`Insufficient tokens for generateObject operation (retry). Usage: ${retryTotalTokens}.`);
          }
          throw new Error("Failed to update token balance after generateObject operation (retry).");
        }
      }
      
      return result;
    } catch (retryError) {
      console.error('generateObject retry also failed. Error details:', retryError);
      throw retryError; // Re-throw the error from the retry attempt
    }
  }
}

// Wrapper for streamObject: uses openaiModel by default, but allows override
export async function streamObject<T extends z.ZodTypeAny>({prompt, schema}: { prompt: string; schema: T; }) {

  const { userId } = await auth()

  if (!userId) {
    throw new Error("User not authenticated");
  }

  return baseStreamObject({
    prompt,
    schema: schema as unknown as AISchema,
    model: openaiModel,
  });
}

// Wrapper for generateText: uses openaiModel by default, but allows override
export async function generateText({prompt}: { prompt: string; }) {
  let result;
  try {
    console.log('Entering generateText...');

    const { userId } = await auth()

    if (!userId) {
      throw new Error("User not authenticated");
    }

    result = await baseGenerateText({
      prompt,
      model: openaiModel,
    });

    console.log('generateText result:', result.text);

    const totalTokens = result.usage?.totalTokens ?? 0;
    if (totalTokens > 0) {
      const inputTokens = result.usage?.inputTokens ?? 0;
      const outputTokens = result.usage?.outputTokens ?? 0;
      const tokensInputOutputRatio = outputTokens > 0 ? inputTokens / outputTokens : 0;
      console.log('Token Usage (generateText):', {
        tokensInputOutputRatio,
        totalTokens,
        model: openaiModel.modelId
      });
      const tokenDecrementResult = await decrementUserTokensAction({
        tokensUsed: totalTokens,
        transactionType: "usage_generate_text",
        modelId: openaiModel.modelId,
      });

      if (!tokenDecrementResult.success) {
        console.error("Token decrementation failed for generateText:", tokenDecrementResult.error, tokenDecrementResult.details);
        let errorMessage = '';
        if (tokenDecrementResult.details instanceof Error) {
          errorMessage = tokenDecrementResult.details.message;
        }
        if (errorMessage.includes("Insufficient tokens")) {
          throw new Error(`Insufficient tokens for generateText operation. Usage: ${totalTokens}.`);
        }
        throw new Error("Failed to update token balance after generateText operation.");
      }
    }

    return result;
  } catch (error) {
    console.warn('generateText failed. Error details:', error);
    
    // Check if it's a quota/rate limit error
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isQuotaError = errorMessage.includes('quota') || 
                        errorMessage.includes('rate') || 
                        errorMessage.includes('exceeded');
    
    // Add longer delay for quota errors, shorter for others
    const retryDelay = isQuotaError ? 10000 : 2000; // 10 seconds for quota errors, 2 seconds for others
    console.warn(`Retrying generateText in ${retryDelay/1000} seconds...`);
    await sleep(retryDelay);
    
    // Retry once
    try {
      result = await baseGenerateText({
        prompt,
        model: openaiModel,
      });

      console.log('generateText (retry) raw result:', result);

      const retryTotalTokens = result.usage?.totalTokens ?? 0;
      if (retryTotalTokens > 0) {
        const inputTokens = result.usage?.inputTokens ?? 0;
        const outputTokens = result.usage?.outputTokens ?? 0;
        const tokensInputOutputRatio = outputTokens > 0 ? inputTokens / outputTokens : 0;
        console.log('Token Usage (generateText retry):', {
          tokensInputOutputRatio,
          totalTokens: retryTotalTokens,
          model: openaiModel.modelId
        });
        const tokenDecrementResultRetry = await decrementUserTokensAction({
          tokensUsed: retryTotalTokens,
          transactionType: "usage_generate_text",
          modelId: openaiModel.modelId,
        });

        if (!tokenDecrementResultRetry.success) {
          console.error("Token decrementation failed for generateText (retry):", tokenDecrementResultRetry.error, tokenDecrementResultRetry.details);
          let errorMessage = '';
          if (tokenDecrementResultRetry.details instanceof Error) {
            errorMessage = tokenDecrementResultRetry.details.message;
          }
          if (errorMessage.includes("Insufficient tokens")) {
            throw new Error(`Insufficient tokens for generateText operation (retry). Usage: ${retryTotalTokens}.`);
          }
          throw new Error("Failed to update token balance after generateText operation (retry).");
        }
      }

      return result;
    } catch (retryError) {
      console.error('generateText retry also failed. Error details:', retryError);
      throw retryError; // Re-throw the error from the retry attempt
    }
  }
}