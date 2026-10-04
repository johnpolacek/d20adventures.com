"use server"
import type { Prompt } from "@d20/gm-core"
import type { z } from "zod"
import { createServerLlm } from "@/lib/gm-server/llm"

export async function generateObject<T extends z.ZodTypeAny>(args: Prompt & { schema: T }) {
  return createServerLlm().generateObject(args)
}

export async function generateText(args: Prompt) {
  return createServerLlm().generateText(args)
}

export async function streamObject<T extends z.ZodTypeAny>(args: Prompt & { schema: T }) {
  return createServerLlm().streamObject(args)
}
