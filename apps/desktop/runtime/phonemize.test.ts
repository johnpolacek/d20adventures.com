import assert from "node:assert/strict"
import { readFileSync, realpathSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { test } from "node:test"
import { parsePronunciations } from "@d20/ui/sound/pronunciations"
import { phonemize as espeak } from "phonemizer"
import { phonemize } from "./phonemize"

// kokoro-js's own phonemize, taken from its bundle, which does not export it.
const kokoro = readFileSync(`${realpathSync(fileURLToPath(new URL("../node_modules/kokoro-js", import.meta.url)))}/dist/kokoro.js`, "utf8")
const theirs = new Function("l", `${kokoro.slice(kokoro.indexOf("function o(e){"), kokoro.indexOf("function p(e,a=!0)"))}; return m`)(espeak) as (t: string, a: string) => Promise<string>

const names = parsePronunciations(`
Prose about the names, left alone.

- Myr: "meer"
- Kordavos: /kɔːdˈɑːvɒs/ /kɔɹdˈɑːvoʊs/
- Valkarr: /vˈælkɑːɹ/
- Caer Dun: "care dun"
- Aelindor: /ˈeɪlɪndɔːɹ/
`)

test("pronunciations.md lists sound-alikes and sounds, British then American", () => {
  assert.deepEqual(names, {
    Myr: { like: "meer" },
    Kordavos: { ipa: "kɔːdˈɑːvɒs", us: "kɔɹdˈɑːvoʊs" },
    Valkarr: { ipa: "vˈælkɑːɹ" },
    "Caer Dun": { like: "care dun" },
    Aelindor: { ipa: "ˈeɪlɪndɔːɹ" },
  })
})

test("with no names, a sentence sounds as Kokoro's own phonemize makes it", async () => {
  const texts = [
    "The Valkarr woods lie quiet; Myr's moons rise.",
    "In 1492, Dr. Smith paid $3.50 (and £2) at 10:30!",
    "“Halt,” cried Kordavos’s guard. “Who goes there?”",
    "Yeah, the U.S.A. is far, 3-4 days… or more.",
  ]
  for (const t of texts) for (const a of ["a", "b"] as const) assert.equal(await phonemize(t, a), await theirs(t, a), `${a}: ${t}`)
})

test("a listed name is said as listed, wherever it stands", async () => {
  const k = "kɔːdˈɑːvɒs"
  for (const t of ["Kordavos.", "The gates of Kordavos stood open.", "KORDAVOS!", "To kordavos, then."]) assert.ok((await phonemize(t, "b", names)).includes(k), t)
  assert.ok((await phonemize("Kordavos.", "a", names)).includes("kɔɹdˈɑːvoʊs"))
  // A sound-alike is read alone, so it is the same in every sentence.
  const alone = await phonemize("Myr", "b", names)
  assert.ok((await phonemize("The Realm of Myr is old.", "b", names)).includes(` ${alone} `))
})

test("a possessive, several words and a vowel at the start", async () => {
  assert.match(await phonemize("Kordavos's gate", "b", names), /kɔːdˈɑːvɒsɪz ɡˈeɪt/)
  assert.match(await phonemize("Valkarr’s blade", "b", names), /vˈælkɑːɹz blˈeɪd/)
  assert.match(await phonemize("They rode to Caer  Dun.", "b", names), /tə kˈeə dˈʌn\./)
  assert.match(await phonemize("an Aelindor elf", "b", names), /^ɐn ˈeɪlɪndɔːɹ ˈɛlf$/)
})

test("the words around a name sound as they do beside any name", async () => {
  // Said alone, "the" would be stressed (ðˈə).
  assert.equal(await phonemize("the Valkarr woods", "b", names), "ðə vˈælkɑːɹ wˈʊdz")
  // A word that only starts like a name is left to eSpeak.
  assert.equal(await phonemize("Myrtle smiled.", "b", names), await theirs("Myrtle smiled.", "b"))
})
