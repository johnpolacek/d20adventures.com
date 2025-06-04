"use server"

import { generateObject as baseGenerateObject, streamObject as baseStreamObject, generateText as baseGenerateText } from "ai";
import { geminiModel } from "./llm";
import { auth } from "@clerk/nextjs/server"
import { z } from "zod";
import { decrementUserTokensAction } from "@/app/_actions/tokens";

// Helper function to wait for a specified number of milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Wrapper: uses geminiModel by default, but allows override
export async function generateObject<T extends z.ZodTypeAny>({prompt, schema}: { prompt: string; schema: T; }) {
  let result;
  try {
    const { userId } = await auth()

    if (!userId) {
      throw new Error("User not authenticated");
    }

    result = await baseGenerateObject({
      prompt,
      schema,
      model: geminiModel,
    });

    console.log('generateObject:', result.object);

    if (result.usage && result.usage.totalTokens > 0) {
      console.log('Token Usage (generateObject):', {
        tokensInputOutputRatio: result.usage.promptTokens/result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        model: geminiModel.modelId,
      });
      const tokenDecrementResult = await decrementUserTokensAction({
        tokensUsed: result.usage.totalTokens,
        transactionType: "usage_generate_object",
        modelId: geminiModel.modelId,
      });

      if (!tokenDecrementResult.success) {
        console.error("Token decrementation failed for generateObject:", tokenDecrementResult.error, tokenDecrementResult.details);
        let errorMessage = '';
        if (tokenDecrementResult.details instanceof Error) {
          errorMessage = tokenDecrementResult.details.message;
        }
        if (errorMessage.includes("Insufficient tokens")) {
          throw new Error(`Insufficient tokens for generateObject operation. Usage: ${result.usage.totalTokens}.`);
        }
        throw new Error("Failed to update token balance after generateObject operation.");
      }
    }

    return result;
  } catch (error) {
    console.warn('generateObject failed. Error details:', error);
    console.warn('Retrying generateObject in 2 seconds...');
    await sleep(2000);
    
    // Retry once
    try {
      result = await baseGenerateObject({
        prompt,
        schema,
        model: geminiModel,
      });

      console.log('generateObject (retry) raw result:', result);

      if (result.usage && result.usage.totalTokens > 0) {
        console.log('Token Usage (generateObject retry):', {
          tokensInputOutputRatio: result.usage.promptTokens/result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          model: geminiModel.modelId
        });
        const tokenDecrementResultRetry = await decrementUserTokensAction({
          tokensUsed: result.usage.totalTokens,
          transactionType: "usage_generate_object",
          modelId: geminiModel.modelId,
        });

        if (!tokenDecrementResultRetry.success) {
          console.error("Token decrementation failed for generateObject (retry):", tokenDecrementResultRetry.error, tokenDecrementResultRetry.details);
          let errorMessage = '';
          if (tokenDecrementResultRetry.details instanceof Error) {
            errorMessage = tokenDecrementResultRetry.details.message;
          }
          if (errorMessage.includes("Insufficient tokens")) {
            throw new Error(`Insufficient tokens for generateObject operation (retry). Usage: ${result.usage.totalTokens}.`);
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

// Wrapper for streamObject: uses geminiModel by default, but allows override
export async function streamObject<T extends z.ZodTypeAny>({prompt, schema}: { prompt: string; schema: T; }) {

  const { userId } = await auth()

  if (!userId) {
    throw new Error("User not authenticated");
  }

  return baseStreamObject({
    prompt,
    schema,
    model: geminiModel,
  });
}

// Wrapper for generateText: uses geminiModel by default, but allows override
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
      model: geminiModel,
    });

    console.log('generateText result:', result.text);

    if (result.usage && result.usage.totalTokens > 0) {
      console.log('Token Usage (generateText):', {
        tokensInputOutputRatio: result.usage.promptTokens/result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        model: geminiModel.modelId
      });
      const tokenDecrementResult = await decrementUserTokensAction({
        tokensUsed: result.usage.totalTokens,
        transactionType: "usage_generate_text",
        modelId: geminiModel.modelId,
      });

      if (!tokenDecrementResult.success) {
        console.error("Token decrementation failed for generateText:", tokenDecrementResult.error, tokenDecrementResult.details);
        let errorMessage = '';
        if (tokenDecrementResult.details instanceof Error) {
          errorMessage = tokenDecrementResult.details.message;
        }
        if (errorMessage.includes("Insufficient tokens")) {
          throw new Error(`Insufficient tokens for generateText operation. Usage: ${result.usage.totalTokens}.`);
        }
        throw new Error("Failed to update token balance after generateText operation.");
      }
    }

    return result;
  } catch (error) {
    console.warn('generateText failed. Error details:', error);
    console.warn('Retrying generateText in 2 seconds...');
    await sleep(2000);
    
    // Retry once
    try {
      result = await baseGenerateText({
        prompt,
        model: geminiModel,
      });

      console.log('generateText (retry) raw result:', result);

      if (result.usage && result.usage.totalTokens > 0) {
        console.log('Token Usage (generateText retry):', {
          tokensInputOutputRatio: result.usage.promptTokens/result.usage.completionTokens,
          totalTokens: result.usage.totalTokens,
          model: geminiModel.modelId
        });
        const tokenDecrementResultRetry = await decrementUserTokensAction({
          tokensUsed: result.usage.totalTokens,
          transactionType: "usage_generate_text",
          modelId: geminiModel.modelId,
        });

        if (!tokenDecrementResultRetry.success) {
          console.error("Token decrementation failed for generateText (retry):", tokenDecrementResultRetry.error, tokenDecrementResultRetry.details);
          let errorMessage = '';
          if (tokenDecrementResultRetry.details instanceof Error) {
            errorMessage = tokenDecrementResultRetry.details.message;
          }
          if (errorMessage.includes("Insufficient tokens")) {
            throw new Error(`Insufficient tokens for generateText operation (retry). Usage: ${result.usage.totalTokens}.`);
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