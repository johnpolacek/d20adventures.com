// A daily limit on what the site spends on its own AI calls: the demo's GM, narration and the editor's helpers.
// Every paid call asks `assertBudget` first and reports its cost after. The day's total and the limit live in Convex
// (convex/aiBudget.ts). The limit is $1 a day until the owner sets another on the admin page. Hosted games cost the
// site nothing, since their GM runs on the host's machine. Development is not limited.

import { api } from "@/convex/_generated/api"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"

// US dollars per million tokens, from Google's price list on 2026-11-21. Output includes thinking tokens.
const PRICES: Record<string, { input: number; output: number }> = {
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
  "gemini-3.1-flash-tts-preview": { input: 1, output: 20 },
}
// A model not listed is costed as the dearest that is, so a new model cannot slip under the limit.
const DEAREST = { input: 1, output: 20 }
/** One generated image. An estimate: the image host does not publish a price per image. */
export const IMAGE_USD = 0.02

type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number }

export class BudgetError extends Error {
  constructor() {
    super("The site's AI budget for today is spent.")
    this.name = "BudgetError"
  }
}
export const isBudgetError = (error: unknown): error is BudgetError => error instanceof BudgetError

const limited = () => process.env.NODE_ENV !== "development"

/** The day a call counts toward: the date in US Central time, so the limit turns over at midnight there. */
export const budgetDay = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(now)

/** What a call cost, in US dollars. Whatever the total holds beyond the input is charged as output. */
export function costOf(model: string, usage: Usage | undefined): number {
  const price = PRICES[model] ?? DEAREST
  const input = usage?.inputTokens ?? 0
  const output = Math.max(usage?.outputTokens ?? 0, (usage?.totalTokens ?? 0) - input)
  return (input * price.input + output * price.output) / 1_000_000
}

/** Today's spend and limit. */
export async function budgetToday() {
  const day = budgetDay()
  return { day, ...(await convex.query(api.aiBudget.day, { secret: serverSecret(), day })) }
}

/** Whether the site may still pay for AI today. If the ledger cannot be read, it may not, so an outage cannot run up a bill. */
export async function budgetOpen(): Promise<boolean> {
  if (!limited()) return true
  try {
    const { usd, limit } = await budgetToday()
    return usd < limit
  } catch (error) {
    console.error("budget: could not read today's spend, so the call is refused:", error)
    return false
  }
}

/** Throws once today's spend has reached the limit. */
export async function assertBudget() {
  if (!(await budgetOpen())) throw new BudgetError()
}

/** Adds a call's cost to today. A failure to record never fails the call it follows. */
export async function recordSpend(usd: number) {
  if (!(usd > 0)) return
  try {
    await convex.mutation(api.aiBudget.spend, { secret: serverSecret(), day: budgetDay(), usd })
  } catch (error) {
    console.error("budget: could not record a call's cost:", error)
  }
}

/** Runs a paid model call inside the budget: refused when the day is spent, and costed when it returns. */
export async function paid<T extends { usage?: Usage }>(model: string, call: () => PromiseLike<T>): Promise<T> {
  await assertBudget()
  const result = await call()
  await recordSpend(costOf(model, result.usage))
  return result
}
