/**
 * The names a setting makes up, and how the narrator says them (packages/ui/src/sound/pronunciations.ts).
 *
 *   pnpm --filter @d20/desktop narrator:names                     every made-up name, listed or not, with its sounds
 *   pnpm --filter @d20/desktop narrator:names --missing           only those not yet in pronunciations.md
 *   pnpm --filter @d20/desktop narrator:names --say <dir> [names]  a WAV of each, in each voice, to listen to
 *   --setting <id>                                                 another setting than realm-of-myr
 *
 * A made-up name is a capitalized word in the setting's markdown that the system dictionary lacks. Names one or two
 * letters apart are shown together, since one may be a misspelling of the other (Kordavos, Kordovas).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { NARRATOR_VOICES } from "@d20/ui/sound/narrator"
import { parsePronunciations, type Pronunciations } from "@d20/ui/sound/pronunciations"
import { phonemize } from "../runtime/phonemize"

const ROOT = resolve(import.meta.dirname, "../../..")
const args = process.argv.slice(2)
const setting = args.includes("--setting") ? args[args.indexOf("--setting") + 1] : "realm-of-myr"
const dir = join(ROOT, "content/settings", setting)
const sayAt = args.includes("--say") ? resolve(args[args.indexOf("--say") + 1]) : null
const only = sayAt ? args.slice(args.indexOf("--say") + 2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--setting") : []

const listFile = join(dir, "pronunciations.md")
const listed: Pronunciations = existsSync(listFile) ? parsePronunciations(readFileSync(listFile, "utf8")) : {}

const files = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(d, e.name)) : e.name.endsWith(".md") ? [join(d, e.name)] : []))
const dictionary = new Set(readFileSync("/usr/share/dict/words", "utf8").split("\n").map((w) => w.toLowerCase()))
// An English word, or an ordinary form of one. A hyphened word is known when its parts are.
const ENDINGS: [string, string][] = [["s", ""], ["es", ""], ["ies", "y"], ["ed", ""], ["ed", "e"], ["d", ""], ["ing", ""], ["ing", "e"], ["er", ""], ["est", ""]]
const known = (w: string): boolean => {
  const l = w.toLowerCase()
  if (l.includes("-")) return l.split("-").every(known)
  return dictionary.has(l) || ENDINGS.some(([end, put]) => l.endsWith(end) && dictionary.has(l.slice(0, -end.length) + put))
}

const counts = new Map<string, number>()
for (const f of files(dir)) {
  if (f === listFile) continue
  for (const m of readFileSync(f, "utf8").matchAll(/(?<![\p{L}'’-])\p{Lu}[\p{Ll}]+(?:['’-]\p{Lu}?[\p{Ll}]+)*/gu)) {
    const word = m[0].replace(/['’]s$/, "")
    if (/['’]/.test(word)) continue
    if (!known(word)) counts.set(word, (counts.get(word) ?? 0) + 1)
  }
}
const lower = new Set(Object.keys(listed).map((n) => n.toLowerCase()))
const isListed = (w: string) => lower.has(w.toLowerCase())
const names = [...counts.keys()].filter((w) => !args.includes("--missing") || !isListed(w)).sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b))

function apart(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

if (!sayAt) {
  console.log(`${setting}: ${counts.size} made-up names, ${Object.keys(listed).length} listed in pronunciations.md\n`)
  for (const w of names) {
    const gb = await phonemize(w, "b", listed)
    const us = await phonemize(w, "a", listed)
    const near = [...counts.keys()].filter((o) => o !== w && o.length > 4 && apart(o.toLowerCase(), w.toLowerCase()) <= Math.min(2, Math.floor(w.length / 4)))
    console.log(`${isListed(w) ? "✓" : " "} ${w.padEnd(16)} ${String(counts.get(w)).padStart(4)}×  gb /${gb}/  us /${us}/${near.length ? `   near: ${near.join(", ")}` : ""}`)
  }
} else {
  // Kokoro, as the narrator runs it (runtime/narrator-main.ts), with its model in the usual cache.
  const { KokoroTTS } = await import("kokoro-js")
  const tts = await KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", { dtype: "q8", device: "cpu" })
  mkdirSync(sayAt, { recursive: true })
  const which = only.length ? only : names
  for (const w of which) {
    for (const { id } of NARRATOR_VOICES) {
      // Alone, then in a sentence, so its sound is heard both ways.
      const sounds = await phonemize(`${w}. They rode on to ${w}, and ${w}'s people knew them.`, id.startsWith("a") ? "a" : "b", listed)
      const { input_ids } = tts.tokenizer(sounds, { truncation: true })
      const out = await tts.generate_from_ids(input_ids, { voice: id })
      writeFileSync(join(sayAt, `${w}-${id}.wav`), wav(out.audio as Float32Array, out.sampling_rate))
    }
    console.log(`${w}: ${NARRATOR_VOICES.length} clips`)
  }
  console.log(`\nIn ${sayAt}`)
}

function wav(audio: Float32Array, rate: number): Buffer {
  const b = Buffer.alloc(44 + audio.length * 2)
  b.write("RIFF", 0)
  b.writeUInt32LE(36 + audio.length * 2, 4)
  b.write("WAVEfmt ", 8)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20)
  b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24)
  b.writeUInt32LE(rate * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write("data", 36)
  b.writeUInt32LE(audio.length * 2, 40)
  for (let i = 0; i < audio.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, audio[i])) * 0x7fff), 44 + i * 2)
  return b
}
