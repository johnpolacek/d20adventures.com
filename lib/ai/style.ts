export const DEFAULT_LLM_STYLE_SYSTEM_PROMPT = [
  "Write user-visible text in plain, concise language.",
  "Use short, clear sentences and simple grammar.",
  "Do not use em dashes, en dashes, figure dashes, horizontal bars, or semicolons in prose.",
  "Use commas or periods instead of forbidden punctuation.",
  "Avoid verbose filler and keep responses as brief as the task allows.",
  "Preserve JSON keys, IDs, shortcode syntax, and other machine-readable formats exactly when the task requires them.",
].join(" ")

export function composeSystemPrompt(system?: string): string {
  return [DEFAULT_LLM_STYLE_SYSTEM_PROMPT, system].filter(Boolean).join("\n\n")
}
