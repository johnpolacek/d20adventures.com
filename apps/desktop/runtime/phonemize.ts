import { entryFor, namesPattern, type Pronunciations } from "@d20/ui/sound/pronunciations"
import { phonemize as espeak } from "phonemizer"

// Text into the sounds Kokoro speaks. This is kokoro-js 1.2.1's own phonemize (Apache-2.0), which it does not export,
// with one change: a listed name (packages/ui/src/sound/pronunciations.ts) is given its listed sounds, not eSpeak's
// guess. Kokoro already sounds out a text in pieces between its punctuation, and a name is one more such piece, so the
// rest of a sentence sounds as it did.

export type Accent = "a" | "b"
const voiceOf = (accent: Accent) => (accent === "a" ? "en-us" : "en")

function year(e: string): string {
  if (e.includes(".")) return e
  if (e.includes(":")) {
    const [h, m] = e.split(":").map(Number)
    return m === 0 ? `${h} o'clock` : m < 10 ? `${h} oh ${m}` : `${h} ${m}`
  }
  const y = parseInt(e.slice(0, 4), 10)
  if (y < 1100 || y % 1000 < 10) return e
  const left = e.slice(0, 2)
  const right = parseInt(e.slice(2, 4), 10)
  const s = e.endsWith("s") ? "s" : ""
  if (y % 1000 >= 100 && y % 1000 <= 999) {
    if (right === 0) return `${left} hundred${s}`
    if (right < 10) return `${left} oh ${right}${s}`
  }
  return `${left} ${right}${s}`
}

function money(e: string): string {
  const unit = e[0] === "$" ? "dollar" : "pound"
  if (isNaN(Number(e.slice(1)))) return `${e.slice(1)} ${unit}s`
  if (!e.includes(".")) return `${e.slice(1)} ${unit}${e.slice(1) === "1" ? "" : "s"}`
  const [whole, part] = e.slice(1).split(".")
  const n = parseInt(part.padEnd(2, "0"), 10)
  const small = e[0] === "$" ? (n === 1 ? "cent" : "cents") : n === 1 ? "penny" : "pence"
  return `${whole} ${unit}${whole === "1" ? "" : "s"} and ${n} ${small}`
}

function decimal(e: string): string {
  const [a, b] = e.split(".")
  return `${a} point ${b.split("").join(" ")}`
}

function normalize(e: string): string {
  return e
    .replace(/[‘’]/g, "'")
    .replace(/«/g, "“")
    .replace(/»/g, "”")
    .replace(/[“”]/g, '"')
    .replace(/\(/g, "«")
    .replace(/\)/g, "»")
    .replace(/、/g, ", ")
    .replace(/。/g, ". ")
    .replace(/！/g, "! ")
    .replace(/，/g, ", ")
    .replace(/：/g, ": ")
    .replace(/；/g, "; ")
    .replace(/？/g, "? ")
    .replace(/[^\S \n]/g, " ")
    .replace(/  +/, " ")
    .replace(/(?<=\n) +(?=\n)/g, "")
    .replace(/\bD[Rr]\.(?= [A-Z])/g, "Doctor")
    .replace(/\b(?:Mr\.|MR\.(?= [A-Z]))/g, "Mister")
    .replace(/\b(?:Ms\.|MS\.(?= [A-Z]))/g, "Miss")
    .replace(/\b(?:Mrs\.|MRS\.(?= [A-Z]))/g, "Mrs")
    .replace(/\betc\.(?! [A-Z])/gi, "etc")
    .replace(/\b(y)eah?\b/gi, "$1e'a")
    .replace(/\d*\.\d+|\b\d{4}s?\b|(?<!:)\b(?:[1-9]|1[0-2]):[0-5]\d\b(?!:)/g, year)
    .replace(/(?<=\d),(?=\d)/g, "")
    .replace(/[$£]\d+(?:\.\d+)?(?: hundred| thousand| (?:[bm]|tr)illion)*\b|[$£]\d+\.\d\d?\b/gi, money)
    .replace(/\d*\.\d+/g, decimal)
    .replace(/(?<=\d)-(?=\d)/g, " to ")
    .replace(/(?<=\d)S/g, " S")
    .replace(/(?<=[BCDFGHJ-NP-TV-Z])'?s\b/g, "'S")
    .replace(/(?<=X')S\b/g, "s")
    .replace(/(?:[A-Za-z]\.){2,} [a-z]/g, (m) => m.replace(/\./g, "-"))
    .replace(/(?<=[A-Z])\.(?=[A-Z])/gi, "-")
    .trim()
}

const PUNCTUATION = ';:,.!?¡¿—…"«»“”(){}[]'
const PUNCT = new RegExp(`(\\s*[${PUNCTUATION.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}]+\\s*)+`, "g")

function pieces(text: string, pattern: RegExp): { match: RegExpMatchArray | null; text: string }[] {
  const out: { match: RegExpMatchArray | null; text: string }[] = []
  let at = 0
  for (const m of text.matchAll(pattern)) {
    if (at < m.index!) out.push({ match: null, text: text.slice(at, m.index) })
    if (m[0].length > 0) out.push({ match: m, text: m[0] })
    at = m.index! + m[0].length
  }
  if (at < text.length) out.push({ match: null, text: text.slice(at) })
  return out
}

// A possessive 's, as English says it after the name's last sound.
function possessive(sounds: string): string {
  const last = sounds.replace(/[ˈˌː]/g, "").slice(-2)
  if (/(s|z|ʃ|ʒ|tʃ|dʒ)$/.test(last)) return `${sounds}ɪz`
  if (/[ptkfθ]$/.test(last)) return `${sounds}s`
  return `${sounds}z`
}

async function sounded(text: string, accent: Accent): Promise<string> {
  const out = (await espeak(text, voiceOf(accent))).join(" ")
  // eSpeak drops the spaces at a piece's edges, which part it from a name beside it.
  return `${/^\s/.test(text) ? " " : ""}${out}${/\s$/.test(text) && out ? " " : ""}`
}

// A name's sounds, worked out once per accent: listed sounds as given, a sound-alike spelling as eSpeak reads it alone.
const cache = new Map<string, Promise<string>>()
function soundsOf(entry: Pronunciations[string], accent: Accent): Promise<string> {
  if ("ipa" in entry) return Promise.resolve(accent === "a" && entry.us ? entry.us : entry.ipa)
  const key = `${accent}|${entry.like}`
  let s = cache.get(key)
  if (!s) cache.set(key, (s = espeak(entry.like, voiceOf(accent)).then((p) => p.join(" ").trim())))
  return s
}

function finish(s: string, accent: Accent): string {
  let i = s
    .replace(/kəkˈoːɹoʊ/g, "kˈoʊkəɹoʊ")
    .replace(/kəkˈɔːɹəʊ/g, "kˈəʊkəɹəʊ")
    .replace(/ʲ/g, "j")
    .replace(/r/g, "ɹ")
    .replace(/x/g, "k")
    .replace(/ɬ/g, "l")
    .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, " ")
    .replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, "z")
  if (accent === "a") i = i.replace(/(?<=nˈaɪn)ti(?!ː)/g, "di")
  return i.trim()
}

// A made-up word read in a name's place, so the words around it sound as they would beside any name ("the" is "ðə",
// not "ðˈə" said alone), and is then swapped for the name. One for names that open on a vowel ("an Aelar"), one for
// the rest.
const STAND_IN = { vowel: "Ozzbozz", consonant: "Zubzub" }
const standIns = new Map<Accent, Promise<{ vowel: string; consonant: string }>>()
function standInSounds(accent: Accent) {
  let s = standIns.get(accent)
  if (!s) {
    const say = (w: string) => espeak(w, voiceOf(accent)).then((p) => p.join(" ").trim())
    s = Promise.all([say(STAND_IN.vowel), say(STAND_IN.consonant)]).then(([vowel, consonant]) => ({ vowel, consonant }))
    standIns.set(accent, s)
  }
  return s
}
const opensOnVowel = (sounds: string) => /^[ˈˌ]?[aeiouæɑɒɔəɛɜɪʊʌɐ]/.test(sounds)

// A run of words with names in it. eSpeak reads it whole with stand-ins, and each stand-in's sounds become the name's.
// Should eSpeak not give back every stand-in as it reads them alone, each piece is read on its own instead.
async function withNames(text: string, pattern: RegExp, names: Pronunciations, accent: Accent): Promise<string> {
  const parts = await Promise.all(
    pieces(text, pattern).map(async ({ match, text }) => {
      const name = match && entryFor(names, match[1])
      if (!name || (names[name].exact && match[1] !== name)) return { text, sounds: null }
      const sounds = await soundsOf(names[name], accent)
      return { text, sounds: match[2] ? possessive(sounds) : sounds, vowel: opensOnVowel(sounds) }
    })
  )
  const found = parts.filter((p) => p.sounds !== null)
  if (!found.length) return (await espeak(text, voiceOf(accent))).join(" ")
  const stood = parts.map((p) => (p.sounds === null ? p.text : p.vowel ? STAND_IN.vowel : STAND_IN.consonant)).join("")
  const read = (await espeak(stood, voiceOf(accent))).join(" ")
  const s = await standInSounds(accent)
  const marks = new RegExp([s.vowel, s.consonant].map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g")
  const hits = read.match(marks) ?? []
  if (hits.length === found.length && hits.every((h, i) => (h === s.vowel) === found[i].vowel)) {
    let i = 0
    return read.replace(marks, () => found[i++].sounds!)
  }
  const each = await Promise.all(parts.map((p) => (p.sounds === null ? sounded(p.text, accent) : p.sounds)))
  return each.join("").replace(/ {2,}/g, " ").trim()
}

/** A sentence as Kokoro's sounds, with each listed name said as listed. */
export async function phonemize(text: string, accent: Accent, names: Pronunciations = {}): Promise<string> {
  const pattern = namesPattern(Object.keys(names))
  const parts = await Promise.all(
    pieces(normalize(text), PUNCT).map(async ({ match, text }) => {
      if (match) return text
      if (!pattern) return (await espeak(text, voiceOf(accent))).join(" ")
      return withNames(text, pattern, names, accent)
    })
  )
  return finish(parts.join(""), accent)
}
