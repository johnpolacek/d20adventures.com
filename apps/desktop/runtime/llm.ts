import type { Llm } from "@d20/gm-core"
import { z } from "zod"
import { createSession } from "../../desktop-spike/harness/sessions.mjs"
import { desktopPatchSchema } from "./characters"

export function localLlm(provider: string, cwd: string, validatePatch?: (patch: { characterUpdates?: unknown }) => void) {
  let session: ReturnType<typeof createSession> | undefined
  const ask = async (prompt: string) => {
    session ??= createSession(
      provider,
      cwd,
      "You are the Game Master for D20 Adventures. Use only supplied fictional context. Do not use tools or host operations. Follow the requested output format exactly."
    )
    let result
    try {
      result = await session.ask(prompt)
    } catch {
      throw new Error(`${provider} could not finish this request. Check its sign-in or usage limit, then retry.`)
    }
    if (result.failed || !result.text.trim()) throw new Error(`${provider} could not finish this request. Check its sign-in or usage limit, then retry.`)
    return result.text.trim()
  }
  return { llm: schemaLlm(ask, validatePatch), close: () => session?.close() }
}

export function schemaLlm(ask: (prompt: string) => Promise<string>, validatePatch?: (patch: { characterUpdates?: unknown }) => void): Llm {
  return {
    async generateText({ prompt, system }) {
      return { text: await ask(`${system ?? ""}\n${prompt}\nReturn only the requested prose.`) }
    },
    async generateObject({ schema, prompt, system }) {
      // Require the spike's strict world-state contract before core validation.
      const advancement = schema instanceof z.ZodObject && "adventurePatch" in schema.shape
      const effective = advancement ? schema.extend({ adventurePatch: desktopPatchSchema.required({ characterUpdates: true }) }) : schema
      const jsonSchema = z.toJSONSchema(effective, { unrepresentable: "any" })
      let correction = ""
      for (let attempt = 0; attempt < 2; attempt++) {
        const text = await ask(`${system ?? ""}\n${prompt}\nReturn only a JSON value matching this schema:\n${JSON.stringify(jsonSchema)}${correction}`)
        try {
          const value = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""))
          const parsed = effective.parse(value)
          if (advancement) validatePatch?.(desktopPatchSchema.parse((parsed as { adventurePatch?: unknown }).adventurePatch ?? {}))
          return { object: schema.parse(parsed) }
        } catch (error) {
          if (attempt === 1) throw new Error("The GM returned an invalid response twice. Your saved progress is intact. Retry the action.")
          correction = `\nYour previous response failed validation: ${String(error).slice(0, 1800)}. Correct it.`
        }
      }
      throw new Error("No valid GM response.")
    },
  }
}
