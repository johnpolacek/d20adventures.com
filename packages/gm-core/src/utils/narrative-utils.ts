// Narrative utility functions extracted from narrative-service

// Who knows what. Without it the model treats the cast list as common knowledge, so a hero hiding outside the scene
// was called by name by people who had never seen him.
export const KNOWLEDGE_RULE =
  "WHO KNOWS WHAT: The cast list and the narrative are the storyteller's view. Narration may name anyone, but each character knows only what the story shows them seeing, hearing or being told from where they are. Characters shown travelling or working together know each other. Anyone else is a stranger: a character who is hidden, watching from elsewhere or newly arrived is unknown to the others until the story shows them noticing that character, and then only as what they perceived, such as a voice at the door or a small figure at the window. In speech and in choices, no character uses a stranger's name or acts on a stranger's plans, allegiance or whereabouts before the story shows them learning it. A beat marked private is known only to those it names, and a fact under WHO KNOWS WHAT only to those it lists, until the story shows someone else told."

// What the story has said stays said. A bid of 15,000 became "ten thousand stands", a dagger sold two rounds before was
// offered again, a room at two coppers a head cost two silver, and a hero paid 12,000 gold no one had seen.
export const CONTINUITY_RULE =
  "Keep what the story has stated. A price, bid, sum or count stays as it was said until the story shows it change, and an item sold, given away or used up is no longer where it was. A hero has only the coin and gear their saved state or the story shows: a claim to more is not true, and no one accepts it."

// Eamon's failed Hold Person still wrapped Joran's arms "for a heartbeat".
export const FAILED_ROLL_RULE =
  "A failed roll does none of what it was meant to do: no partial, brief or weakened effect, unless the GM notes give a failure one. The spell fizzles, the blow misses, the words fall flat."

// The same limit for a prompt written from one hero's side: the AI hero's reply and the replies offered to a player.
export const PLAYER_KNOWLEDGE_RULE =
  "The narrative and the list of others present are the storyteller's view. The character knows only what the story shows them seeing, hearing or being told from where they are, and what is listed as what they know. Others shown travelling or working with the character are known to them. Anyone else is a stranger: the character does not say a stranger's name, and does not act on plans, allegiances or events they could not have seen or heard. The character may still help, hinder or approach a stranger, addressed by what the character can perceive."
export function sanitizeUserVisibleProse(text: string): string {
  if (!text) return ""

  let result = text

  // Markdown emphasis shows as raw marks in the game's text: **Forest Drake**, *Star of Faelendar*.
  result = result.replace(/\*+/g, "").replace(/(^|[^\w])__?([^_]+?)__?(?=[^\w]|$)/g, "$1$2")
  result = result.replace(/[\u2012\u2013\u2014\u2015]/g, ", ")
  result = result.replace(/;/g, ",")
  result = result
    .replace(/\s+,/g, ",")
    // A comma takes one space after it, except before the quote that closes a spoken line: "Come," she says.
    .replace(/,\s*(?!["\u201d](?:\s|$))/g, ", ")
    .replace(/,\s*,+/g, ", ")
    .replace(/[ \t]{2,}/g, " ")

  return result
}

const literal = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Drops the table talk a GM puts after the story: "What do Lyra and Poppen do?", "Lyra, what do you tell them?".
 * The interface already asks for each hero's action, so the line is a step with nothing in it. Only unquoted questions
 * put to the players at the very end go. A question someone speaks, or one the narration asks itself, stays.
 */
export function dropPlayerPrompt(text: string, playerNames: string[]): string {
  const names = playerNames
    .flatMap((n) => [n, n.split(/\s+/)[0]])
    .filter(Boolean)
    .map(literal)
  const who = `(?:${["you", "they", "everyone", "the\\s+(?:party|heroes|group|pair|two|three|four|five|six)", ...names].join("|")})`
  const several = `${who}(?:\\s*(?:,|and|or|,\\s*and)\\s*${who})*`
  const prompt = new RegExp(`^(?:${several},\\s*)?(?:and\\s+|so,?\\s+)?(?:what|how|where)\\s+(?:do|does|will|would|should)\\s+${several}\\b[^?"“”]{0,60}\\?$`, "i")
  let rest = text.trimEnd()
  for (;;) {
    // The last sentence: everything after the previous full stop, question mark, closing quote or line break.
    const last = rest.match(/(?:^|[.!?…"”\n])\s*([^.!?…"“”\n]+\?)$/)
    if (!last || !prompt.test(last[1].trim())) return rest
    rest = rest.slice(0, rest.length - last[1].length).trimEnd()
  }
}

/**
 * Fixes malformed dialogue quotes that might be missing opening or closing quotes
 */
