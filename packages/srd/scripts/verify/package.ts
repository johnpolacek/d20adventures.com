import { readdirSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { readData } from "../lib/data"
import { pages } from "../lib/official"
import { registry } from "../lib/registry"
import type { Report } from "../lib/report"
import { root } from "../lib/sources"

/** Every string in a value, with the path that reaches it. */
function* strings(value: unknown, path = ""): Generator<[string, string]> {
  if (typeof value === "string") yield [path, value]
  else if (Array.isArray(value)) for (const [index, item] of value.entries()) yield* strings(item, `${path}[${index}]`)
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) yield* strings(item, `${path}.${key}`)
}

/** Every null in a value, by path. */
function* nulls(value: unknown, path = ""): Generator<string> {
  if (value === null) yield path
  else if (Array.isArray(value)) for (const [index, item] of value.entries()) yield* nulls(item, `${path}[${index}]`)
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) yield* nulls(item, `${path}.${key}`)
}

// Marks left by PDF extraction or by an upstream source. None belongs in shipped text.
const stray: [RegExp, string][] = [
  [/\u00a0/, "a non-breaking space"],
  [/\u00ad/, "a soft hyphen"],
  [/[\ufb00-\ufb06]/, "a ligature"],
  [/\t/, "a tab"],
  [/ {2,}/, "doubled spaces"],
  [/^\s|\s$/, "leading or trailing space"],
  [/\/api\/|\burl\b:/, "an upstream API path"],
]

// A word keeps its inner hyphens and apostrophes: "foul-smelling", "can’t".
const words = (text: string) => text.toLowerCase().match(/[a-z]+(?:[’-][a-z]+)*/g) ?? []

/**
 * Every word the official text prints, as a test for a spelling. The PDF breaks words at line ends ("cen-" /
 * "tered", "foul-smell-" / "ing"), and a break does not say whether its hyphen is real. So a broken word is
 * settled by the rest of the text: by the form printed unbroken elsewhere, or else by whether its halves are
 * words on their own ("nine-course" may keep its hyphen, "leav-ing" may not).
 */
function officialSpelling(): (word: string) => boolean {
  const text = pages.join("\n").toLowerCase()
  const broken = /([a-z]+(?:[’-][a-z]+)*)-\n([a-z]+(?:[’-][a-z]+)*)/g
  const whole = new Set(words(text.replace(broken, " ")))
  const plain = new Set([...whole].filter((word) => !word.includes("-")))
  const accepted = new Set(whole)
  for (const [, left, right] of text.matchAll(broken)) {
    const joined = left + right
    const hyphenated = `${left}-${right}`
    if (whole.has(joined) !== whole.has(hyphenated)) continue
    accepted.add(joined)
    if (hyphenated.split("-").every((part) => plain.has(part))) accepted.add(hyphenated)
  }
  // A compound the text never prints whole still passes when each part is a word, as in "foot-radius".
  return (word) => accepted.has(word) || (word.includes("-") && word.split("-").every((part) => plain.has(part)))
}

/** Checks that hold for the package as a whole: the set of files, their schemas, their modules and their text. */
export default async function verify(report: Report) {
  const files = readdirSync(resolve(root, "data"))
    .filter((file) => file.endsWith(".json"))
    .map((file) => file.replace(/\.json$/, ""))
  const names = Object.keys(registry)

  const setFailures = [
    ...files.filter((file) => !registry[file]).map((file) => `data/${file}.json is not in the registry`),
    ...names.filter((name) => !files.includes(name)).map((name) => `data/${name}.json is missing`),
  ]
  report.check("package", "the data files are exactly the registered set", new Set([...files, ...names]).size, setFailures)

  const schemaFailures: string[] = []
  const orderFailures: string[] = []
  const moduleFailures: string[] = []
  const textFailures: string[] = []
  const wordFailures: string[] = []
  const printed = officialSpelling()
  let entries = 0
  let texts = 0
  for (const name of names.filter((name) => files.includes(name))) {
    const data = readData<{ id: string }>(name)
    entries += data.length
    for (const entry of data) {
      const result = registry[name].schema.safeParse(entry)
      if (!result.success) schemaFailures.push(`${name} ${entry.id}: ${result.error.issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join("; ")}`)
      // Parsing must change nothing, or the file would differ from what the types promise.
      else if (JSON.stringify(result.data) !== JSON.stringify(entry)) schemaFailures.push(`${name} ${entry.id}: parsing changes the entry`)
      for (const path of nulls(entry)) textFailures.push(`${name} ${entry.id}${path}: null`)
      for (const [path, text] of strings(entry)) {
        texts++
        if (text === "") textFailures.push(`${name} ${entry.id}${path}: an empty string`)
        for (const [pattern, what] of stray) if (pattern.test(text)) textFailures.push(`${name} ${entry.id}${path}: ${what}`)
        // Ids and field keys are our own spelling. Everything else is the SRD's wording, so each word must be one it prints.
        if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text) || /^[a-z]+(?:[A-Z][a-z]+)+$/.test(text)) continue
        const unknown = words(text).filter((word) => !printed(word))
        if (unknown.length) wordFailures.push(`${name} ${entry.id}${path}: ${[...new Set(unknown)].join(", ")}`)
      }
    }
    const ids = data.map((entry) => entry.id)
    if (new Set(ids).size !== ids.length) orderFailures.push(`${name}: duplicate ids`)
    if (ids.some((id, index) => index > 0 && ids[index - 1] >= id)) orderFailures.push(`${name}: not sorted by id`)

    // The module a host imports must hand out the same entries the file holds.
    const module = await import(resolve(root, "src", `${name}.ts`)).catch(() => null)
    const list = module?.[registry[name].exportName]
    if (!Array.isArray(list)) moduleFailures.push(`src/${name}.ts does not export ${registry[name].exportName}`)
    else if (JSON.stringify(list) !== JSON.stringify(data)) moduleFailures.push(`src/${name}.ts exports something other than data/${name}.json`)
    const lookup = module && Object.entries(module).find(([key, value]) => key.endsWith("ById") && value instanceof Map)?.[1]
    if (!(lookup instanceof Map) || lookup.size !== data.length) moduleFailures.push(`src/${name}.ts has no lookup by id over every entry`)
  }
  report.check("package", "every entry parses with its strict schema, unchanged", entries, schemaFailures)
  report.check("package", "every file is sorted by id with no duplicates", names.length, orderFailures)
  report.check("package", "every data file has a module that exports its entries and a lookup by id", names.length, moduleFailures)
  report.check("package", "no null, empty string, extraction mark or upstream API path in any text", texts, textFailures)
  report.check("package", "every word of every text is a word the official text prints", texts, wordFailures)

  // Data is imported by category so a host bundles only what it uses. The shared entry point must stay free of it.
  const shared = ["src/index.ts", "src/lookup.ts", "src/attribution.ts", ...readdirSync(resolve(root, "src/schema")).map((file) => `src/schema/${file}`)]
  const importFailures = shared.filter((file) => /from "[^"]*data\/|\.json"/.test(readFileSync(resolve(root, file), "utf8"))).map((file) => `${file} imports data`)
  report.check("package", "the shared entry point and the schemas import no data", shared.length, importFailures)
}
