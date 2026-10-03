import type { Llm } from "@d20/gm-core"
import { adventurePatchSchema } from "@d20/gm-core/wiki-adventures/adventure-patch"
import { z } from "zod"
import { createSession } from "../../desktop-spike/harness/sessions.mjs"
import { strictModelSchema } from "../../desktop-spike/harness/strict-state.mjs"

export function localLlm(provider: string, cwd: string) {
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
  const llm: Llm = {
    async generateText({ prompt, system }) {
      return { text: await ask(`${system ?? ""}\n${prompt}\nReturn only the requested prose.`) }
    },
    async generateObject({ schema, prompt, system }) {
      // Require the spike's strict world-state contract before core validation.
      const effective = schema instanceof z.ZodObject && "adventurePatch" in schema.shape ? schema.extend({ adventurePatch: strictModelSchema(adventurePatchSchema).optional() }) : schema
      const jsonSchema = z.toJSONSchema(effective, { unrepresentable: "any" })
      let correction = ""
      for (let attempt = 0; attempt < 2; attempt++) {
        const text = await ask(`${system ?? ""}\n${prompt}\nReturn only a JSON value matching this schema:\n${JSON.stringify(jsonSchema)}${correction}`)
        try {
          const value = JSON.parse(text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""))
          return { object: schema.parse(effective.parse(value)) }
        } catch (error) {
          if (attempt === 1) throw new Error("The GM returned an invalid response twice. Your saved progress is intact. Retry the action.")
          correction = `\nYour previous response failed validation: ${String(error).slice(0, 1800)}. Correct it.`
        }
      }
      throw new Error("No valid GM response.")
    },
  }
  return { llm, close: () => session?.close() }
}
