// Narrative utility functions extracted from narrative-service

// Ensures output is at most two sentences and a single paragraph
export function limitToTwoSentences(text: string): string {
  if (!text) return ""
  const oneParagraph = text.replace(/\s+/g, " ").trim()
  const parts = oneParagraph.split(/([.!?])[\s\"][^\S\r\n]*/).filter(Boolean)
  if (parts.length <= 2) return oneParagraph
  const sentences: string[] = []
  for (let i = 0; i < parts.length - 1; i += 2) {
    const sentence = (parts[i] + (parts[i + 1] || "")).trim()
    if (sentence) sentences.push(sentence)
    if (sentences.length === 2) break
  }
  return sentences.join(" ")
}

/**
 * Appends new narrative content to the previous narrative, ensuring consistent formatting.
 * Does NOT attempt to diff or remove duplication—callers must ensure newContent is truly new.
 */
export function appendNarrative(previousNarrative: string, newContent: string | string[]): string {
  const toAppend = Array.isArray(newContent) ? newContent.filter(Boolean).join("\n") : newContent
  if (!toAppend) return previousNarrative || ""
  if (!previousNarrative) return toAppend
  return `${previousNarrative.trimEnd()}\n\n${toAppend.trimStart()}`
}

/**
 * Normalizes narrative prose formatting for display.
 */
export function normalizeNarrative(text: string): string {
  if (!text) return ""
  let result = text.replace(/\r\n/g, "\n")
  result = result.replace(/[\u2012\u2013\u2014\u2015]/g, ", ")
  result = result
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/,\s*,+/g, ", ")
  result = result.replace(/[ \t]{2,}/g, " ")
  result = result.replace(/\n{3,}/g, "\n\n")
  return result.trim()
}

/**
 * Fixes malformed dialogue quotes that might be missing opening or closing quotes
 */
export function fixMalformedQuotes(text: string): string {
  if (!text) return text
  // Add missing opening quote before a dialogue segment following sentence end
  text = text.replace(/([.!?]\s+)([A-Z][^"]*,"\s*\w+\s+(?:says|asks|replies|shouts|whispers|calls|thinks|states|chirps))/g, '$1"$2')
  // Add missing closing quote for dialogue ending with a question without closing quote
  text = text.replace(/"([^"]+[a-z]\?)$/g, '"$1"')
  return text
}
