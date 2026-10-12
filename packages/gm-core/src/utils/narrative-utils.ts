// Narrative utility functions extracted from narrative-service

// Who knows what. Without it the model treats the cast list as common knowledge, so a hero hiding outside the scene
// was called by name by people who had never seen him.
export const KNOWLEDGE_RULE =
  "WHO KNOWS WHAT: The cast list and the narrative are the storyteller's view. Narration may name anyone, but each character knows only what the story shows them seeing, hearing or being told from where they are. Characters shown travelling or working together know each other. Anyone else is a stranger: a character who is hidden, watching from elsewhere or newly arrived is unknown to the others until the story shows them noticing that character, and then only as what they perceived, such as a voice at the door or a small figure at the window. In speech and in choices, no character uses a stranger's name or acts on a stranger's plans, allegiance or whereabouts before the story shows them learning it."

// The same limit for a prompt written from one hero's side: the AI hero's reply and the replies offered to a player.
export const PLAYER_KNOWLEDGE_RULE =
  "The narrative and the list of others present are the storyteller's view. The character knows only what the story shows them seeing, hearing or being told from where they are. Others shown travelling or working with the character are known to them. Anyone else is a stranger: the character does not say a stranger's name, and does not act on plans, allegiances or events they could not have seen or heard. The character may still help, hinder or approach a stranger, addressed by what the character can perceive."
const diceRollShortcodePattern = /\[DiceRoll:[^\]]*\]/g

export function sanitizeUserVisibleProse(text: string): string {
  if (!text) return ""

  const protectedShortcodes: string[] = []
  let result = text.replace(diceRollShortcodePattern, (match) => {
    const token = `__D20_DICE_ROLL_${protectedShortcodes.length}__`
    protectedShortcodes.push(match)
    return token
  })

  result = result.replace(/[\u2012\u2013\u2014\u2015]/g, ", ")
  result = result.replace(/;/g, ",")
  result = result
    .replace(/\s+,/g, ",")
    .replace(/,\s*/g, ", ")
    .replace(/,\s*,+/g, ", ")
    .replace(/[ \t]{2,}/g, " ")

  protectedShortcodes.forEach((shortcode, index) => {
    result = result.replace(`__D20_DICE_ROLL_${index}__`, shortcode)
  })

  return result
}

// Ensures output is at most two sentences and a single paragraph
export function limitToTwoSentences(text: string): string {
  if (!text) return ""
  const oneParagraph = text.replace(/\s+/g, " ").trim()
  const parts = oneParagraph.split(/([.!?])[\s"][^\S\r\n]*/).filter(Boolean)
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
  let result = sanitizeUserVisibleProse(text.replace(/\r\n/g, "\n"))
  result = result.replace(/\n{3,}/g, "\n\n")
  return result.trim()
}

/**
 * Fixes malformed dialogue quotes that might be missing opening or closing quotes
 */
export function fixMalformedQuotes(text: string): string {
  if (!text) return text

  // Replace backticks with proper quotes
  text = text.replace(/`/g, '"')

  // Replace curly/smart quotes with straight quotes
  text = text.replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
  text = text.replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")

  // Count quotes - if odd number, we have a missing quote
  const quoteCount = (text.match(/"/g) || []).length

  if (quoteCount % 2 === 1) {
    // Odd number of quotes - find the unclosed one
    // Check if there's an opening quote without closing
    const openQuoteMatch = text.match(/"([^"]+)$/)
    if (openQuoteMatch) {
      // Add closing quote before the last punctuation or at end
      const lastPuncMatch = text.match(/([.!?])([^.!?"]*?)$/)
      if (lastPuncMatch) {
        text = text.replace(/([.!?])([^.!?"]*?)$/, '"$1$2')
      } else {
        text = `${text}"`
      }
    }
  }

  // Add missing opening quote before a dialogue segment following sentence end
  text = text.replace(/([.!?]\s+)([A-Z][^"]*,"\s*\w+\s+(?:says|asks|replies|shouts|whispers|calls|thinks|states|chirps))/g, '$1"$2')
  // Add missing closing quote for dialogue ending with a question without closing quote
  text = text.replace(/"([^"]+[a-z]\?)$/g, '"$1"')

  return text
}
