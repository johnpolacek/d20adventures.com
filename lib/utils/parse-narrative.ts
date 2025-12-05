// Utility to parse narrative with [DiceRoll:rollType=...;result=...;difficulty=...;character=...;image=...;success=...]

export type NarrativePart =
  | { type: "paragraph"; value: string }
  | { type: "diceroll"; rollType: string; baseRoll?: number; modifier?: number; result: number; difficulty: number; character: string; image?: string; success: boolean }
  | { type: "original-reply"; value: string }

const diceRollRegex = /^\[DiceRoll:([^\]]+)\]$/i

export function parseNarrative(narrative: string): NarrativePart[] {
  // Convert escaped newlines to actual newlines
  const processedNarrative = narrative.replace(/\\n/g, "\n")

  const parts: NarrativePart[] = []

  // First, extract all [OriginalReply: ...] blocks (which can be multi-line)
  const originalReplyRegex = /\[OriginalReply:\s*([\s\S]*?)\]/g
  let match
  let lastIndex = 0

  while ((match = originalReplyRegex.exec(processedNarrative)) !== null) {
    // Add any content before this OriginalReply as paragraphs/dice rolls
    const beforeContent = processedNarrative.slice(lastIndex, match.index)
    if (beforeContent.trim()) {
      parts.push(...parseNonOriginalReplyContent(beforeContent))
    }

    // Add the OriginalReply
    const originalReplyContent = match[1].trim()
    if (originalReplyContent) {
      parts.push({ type: "original-reply", value: originalReplyContent })
    }

    lastIndex = originalReplyRegex.lastIndex
  }

  // Add any remaining content after the last OriginalReply
  const afterContent = processedNarrative.slice(lastIndex)
  if (afterContent.trim()) {
    parts.push(...parseNonOriginalReplyContent(afterContent))
  }

  return parts.filter((part) => part.type === "diceroll" || part.type === "original-reply" || (part.type === "paragraph" && part.value.length > 0))
}

// Helper function to parse content that doesn't contain OriginalReply blocks
function parseNonOriginalReplyContent(content: string): NarrativePart[] {
  return content.split(/\n/).map<NarrativePart>((line) => {
    const trimmed = line.trim()
    if (!trimmed) return { type: "paragraph", value: "" }

    const match = trimmed.match(diceRollRegex)
    if (match) {
      // Parse key=value pairs
      const fields = Object.fromEntries(
        match[1].split(";").map((pair) => {
          const [key, ...rest] = pair.split("=")
          return [key.trim(), rest.join("=").trim()]
        })
      )
      return {
        type: "diceroll",
        rollType: fields.rollType || "",
        baseRoll: fields.baseRoll !== undefined && fields.baseRoll !== "" ? Number(fields.baseRoll) : undefined,
        modifier: fields.modifier !== undefined && fields.modifier !== "" ? Number(fields.modifier) : undefined,
        result: Number(fields.result),
        difficulty: Number(fields.difficulty),
        character: fields.character || "",
        image: fields.image || "",
        success: fields.success === "true",
      } as const
    }

    return { type: "paragraph", value: trimmed } as const
  })
}
