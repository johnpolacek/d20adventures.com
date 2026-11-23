// How the narrator says the names a setting makes up. Kokoro guesses a word it does not know from its spelling, and the
// guess drifts with the words around it, so a listed name is given its sounds once and said the same way every time.
//
// A setting's `pronunciations.md` (content/settings/<setting>/) lists one name to a line. Each adventure package carries
// its setting's (stage/pronunciations.json), and the narrator says them so:
//
//   - Myr: "meer"                     sounds like this ordinary spelling, read on its own
//   - Kordavos: /kɔːdˈɑːvɒs/          these sounds, as Kokoro writes them (IPA with its stress marks)
//   - Kordavos: /kɔːdˈɑːvɒs/ /kɔɹdˈɑvoʊs/   British, then American
//
// A name may be several words. It is matched in any case, and with a possessive 's.

// `exact`: matched only as written, for a name that is also a word ("Will", "Rose").
export type Pronunciation = ({ like: string } | { ipa: string; us?: string }) & { exact?: boolean }
export type Pronunciations = Record<string, Pronunciation>

const LINE = /^\s*[-*]\s+(.+?)\s*:\s*(.+?)\s*$/
const LIKE = /^["“](.+)["”]$/
const IPA = /^\/([^/]+)\/(?:\s+\/([^/]+)\/)?$/

/** The entries of a pronunciations.md. A line that is not an entry is prose, and left alone. */
export function parsePronunciations(markdown: string): Pronunciations {
  const out: Pronunciations = {}
  for (const line of markdown.split("\n")) {
    const m = LINE.exec(line)
    if (!m) continue
    const [, name, value] = m
    const like = LIKE.exec(value)
    const ipa = IPA.exec(value)
    if (like) out[name] = { like: like[1] }
    else if (ipa) out[name] = ipa[2] ? { ipa: ipa[1], us: ipa[2] } : { ipa: ipa[1] }
  }
  return out
}

/** Where the listed names stand in a text: the longest first, whole words only, with a possessive 's kept apart. */
export function namesPattern(names: string[]): RegExp | null {
  if (!names.length) return null
  const alts = [...names]
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
  return new RegExp(`(?<![\\p{L}\\p{M}'’-])(${alts.join("|")})(['’]s)?(?![\\p{L}\\p{M}])`, "giu")
}

/** The listed name a match stands for, whatever its case. */
export function entryFor(list: Pronunciations, matched: string): string | undefined {
  const want = matched.replace(/\s+/g, " ").toLowerCase()
  return Object.keys(list).find((n) => n.replace(/\s+/g, " ").toLowerCase() === want)
}

/**
 * The list, with each word of the characters' names added where it is not listed: said as it sounds alone, so a hero
 * the player named is at least said the same way in every sentence. Matched only as written.
 */
export function withCharacters(list: Pronunciations, names: string[]): Pronunciations {
  const out: Pronunciations = {}
  const listed = new Set(Object.keys(list).map((n) => n.toLowerCase()))
  for (const name of names)
    for (const word of name.match(/\p{Lu}[\p{L}\p{M}'’-]{2,}/gu) ?? []) {
      const w = word.replace(/['’]s$/, "")
      if (!listed.has(w.toLowerCase()) && !out[w]) out[w] = { like: w, exact: true }
    }
  return { ...out, ...list }
}
