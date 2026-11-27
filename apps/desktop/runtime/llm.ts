import { appendFileSync } from "node:fs"
import type { Llm } from "@d20/gm-core"
import { z } from "zod"
import { createSession } from "./sessions.mjs"
import { desktopPatchSchema } from "./characters"

const SYSTEM = "You are the Game Master for D20 Adventures. Use only supplied fictional context. Do not use tools or host operations. Follow the requested output format exactly."
// These CLIs hold one conversation per process. Codex and Grok start a new one on the same process for each call.
const perProcess = ["claude", "antigravity", "gemini"]

// Each GM call runs in a conversation of its own, as the website's calls do. Every prompt carries all it needs, and one
// shared conversation would send every earlier prompt again with each call, and show a character's prompt what was
// written for another. A CLI that holds one conversation per process is started anew for each call, the next one
// launched while this one works, so no call waits for a CLI to start but the first.
// `strict` holds advancement to the local game's world-state contract. Hosted games keep the website's contract.
// `model` is a Claude alias from the Game Master picker. Without one the CLI runs its own default.
export function localLlm(provider: string, cwd: string, validatePatch?: (patch: { characterUpdates?: unknown }) => void, strict = true, model?: string) {
  type Session = ReturnType<typeof createSession>
  const open = new Set<Session>()
  let kept: Session | undefined
  let closed = false
  const start = () => {
    const session = createSession(provider, cwd, SYSTEM, model)
    open.add(session)
    return session
  }
  const take = () => {
    if (closed) throw new Error("closed")
    if (!perProcess.includes(provider)) return (kept ??= start())
    const session = kept ?? start()
    // Claude starts its process at once, so the spare is ready by the next call. The others start on their first ask.
    kept = provider === "claude" ? start() : undefined
    return session
  }
  const done = (session: Session) => {
    session.close()
    open.delete(session)
    if (kept === session) kept = undefined
  }
  const ask = async (prompt: string) => {
    let result
    // A session that failed stays failed, so it is replaced and the request tried once more.
    for (let attempt = 0; !result; attempt++) {
      if (closed) throw new Error("closed")
      const session = take()
      try {
        const started = Date.now()
        const answer = await session.ask(prompt)
        if (process.env.D20_GM_TRACE) trace(process.env.D20_GM_TRACE, prompt, Date.now() - started, (answer as { usage?: Tokens }).usage)
        if (answer.failed || !answer.text.trim()) throw new Error("failed")
        result = answer
        if (perProcess.includes(provider)) done(session)
      } catch (error) {
        done(session)
        if (closed) throw new Error("closed")
        // The session's own reason goes with it: a failed lockdown or a timeout is not a usage limit.
        const reason = error instanceof Error && error.message !== "failed" ? ` (${error.message})` : ""
        if (attempt > 0) throw new Error(`${provider} could not finish this request${reason}. Check its sign-in or usage limit, then retry.`)
      }
    }
    return result.text.trim()
  }
  return {
    llm: schemaLlm(ask, validatePatch, strict),
    close: () => {
      closed = true
      for (const session of open) session.close()
      open.clear()
      kept = undefined
    },
  }
}

// One line per GM call, for measuring what calls cost: `D20_GM_TRACE=file.jsonl`. Claude reports its tokens.
type Tokens = { input_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number; output_tokens?: number }
function trace(file: string, prompt: string, ms: number, usage?: Tokens) {
  const line = {
    ms,
    chars: prompt.length,
    head: prompt.slice(0, 60),
    input: usage?.input_tokens,
    written: usage?.cache_creation_input_tokens,
    read: usage?.cache_read_input_tokens,
    output: usage?.output_tokens,
  }
  appendFileSync(file, `${JSON.stringify(line)}\n`)
}

export function schemaLlm(ask: (prompt: string) => Promise<string>, validatePatch?: (patch: { characterUpdates?: unknown }) => void, strict = true): Llm {
  return {
    async generateText({ prompt, system }) {
      return { text: await ask(`${system ?? ""}\n${prompt}\nReturn only the requested prose.`) }
    },
    async generateObject({ schema, prompt, system }) {
      // Require the strict world-state contract before core validation.
      const advancement = strict && schema instanceof z.ZodObject && "adventurePatch" in schema.shape
      // The patch asked for is what play reads (story.ts, characters.ts): no discoveries or entity updates, which
      // took most of a round end's output and were read by nothing.
      const effective = advancement ? schema.extend({ adventurePatch: desktopPatchSchema.omit({ discoveries: true, entityUpdates: true }).required({ characterUpdates: true }) }) : schema
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
          // Each call is a new conversation, so the answer that failed is quoted for the model to correct.
          correction = `\nYour previous response was:\n${text.slice(0, 6000)}\nIt failed validation: ${String(error).slice(0, 1800)}. Correct it.`
        }
      }
      throw new Error("No valid GM response.")
    },
  }
}
