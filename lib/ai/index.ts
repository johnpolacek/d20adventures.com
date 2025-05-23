import { generateObject as baseGenerateObject, streamObject as baseStreamObject, generateText as baseGenerateText } from "ai";
import { geminiModel } from "./gemini";
import { z } from "zod";

// Helper function to wait for a specified number of milliseconds
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Wrapper: uses geminiModel by default, but allows override
export async function generateObject<T extends z.ZodTypeAny>({prompt, schema}: { prompt: string; schema: T; }) {
  try {
    return await baseGenerateObject({
      prompt,
      schema,
      model: geminiModel,
    });
  } catch (error) {
    console.warn('generateObject failed, retrying in 2 seconds...', error);
    await sleep(2000);
    
    // Retry once
    return await baseGenerateObject({
      prompt,
      schema,
      model: geminiModel,
    });
  }
}

// Wrapper for streamObject: uses geminiModel by default, but allows override
export function streamObject<T extends z.ZodTypeAny>({prompt, schema}: { prompt: string; schema: T; }) {
  return baseStreamObject({
    prompt,
    schema,
    model: geminiModel,
  });
}

// Wrapper for generateText: uses geminiModel by default, but allows override
export async function generateText({prompt}: { prompt: string; }) {
  return await baseGenerateText({
    prompt,
    model: geminiModel,
  });
}

export { geminiModel }; 