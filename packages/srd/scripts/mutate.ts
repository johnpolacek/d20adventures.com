import { execFile } from "node:child_process"
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { availableParallelism, tmpdir } from "node:os"
import { basename, join } from "node:path"
import { registry } from "./lib/registry"
import { root } from "./lib/sources"

// Tests the checks themselves. For every distinct typed field in every data file, change one value and then
// delete one. For every list, add an item. For every group of fields, delete the whole group. Run the checks
// after each and expect a failure. A mutation that passes is something the checks do not guard.
//
// What this cannot show: that a value is right. If a builder and its check share a wrong reading of the text,
// both agree and nothing here changes that. It shows only that the checks notice when the data moves.
//
// It works on copies of the package in a temp folder, so the real data is never touched. It takes some minutes.
// Run: pnpm --filter @d20/srd mutate [file…]

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
type Path = (string | number)[]
type Task = { file: string; id: string; index: number; path: Path; kind: "change" | "delete" | "add" | "delete group"; replacement?: Json }
type Outcome = Task & { result: "content" | "schema" | "missed" }

// Long text is prose, which the sentence, paragraph and spelling checks cover.
const isProse = (value: Json) => typeof value === "string" && (value.length > 40 || (value.includes(" ") && value.length > 25))
const fold = (path: Path) => path.map((key) => (typeof key === "number" ? "[]" : key)).join(".")

function* leaves(value: Json, path: Path = []): Generator<[Path, Json]> {
  if (Array.isArray(value)) for (const [index, item] of value.entries()) yield* leaves(item, [...path, index])
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) yield* leaves(item, [...path, key])
  else yield [path, value]
}

/** Every list and every group of fields in a value, with its path. */
function* branches(value: Json, path: Path = []): Generator<[Path, Json]> {
  if (!value || typeof value !== "object") return
  if (path.length) yield [path, value]
  if (Array.isArray(value)) for (const [index, item] of value.entries()) yield* branches(item, [...path, index])
  else for (const [key, item] of Object.entries(value)) yield* branches(item, [...path, key])
}

/** Another value for a field that its schema is likely to accept: the other boolean, a number one higher, bigger dice, or a value seen elsewhere at the same path. */
function another(value: Json, seen: Json[]): Json | undefined {
  if (typeof value === "boolean") return !value
  if (typeof value === "number") return value + 1
  if (typeof value !== "string") return undefined
  const dice = /^(\d+)d(\d+.*)$/.exec(value)
  if (dice) return `${Number(dice[1]) + 1}d${dice[2]}`
  return seen.find((other) => other !== value)
}

/** One change and one deletion for the first value found at each distinct path of a file. */
function tasksFor(file: string): Task[] {
  const data: { id: string }[] = JSON.parse(readFileSync(join(root, "data", `${file}.json`), "utf8"))
  const first = new Map<string, { index: number; path: Path; value: Json }>()
  const seen = new Map<string, Json[]>()
  for (const [index, entry] of data.entries()) {
    for (const [path, value] of leaves(entry as Json)) {
      if (isProse(value) || (path.length === 1 && path[0] === "id")) continue
      const key = fold(path)
      if (!first.has(key)) first.set(key, { index, path, value })
      if (!seen.has(key)) seen.set(key, [])
      if (!seen.get(key)?.includes(value)) seen.get(key)?.push(value)
    }
  }
  const tasks: Task[] = []
  for (const [key, { index, path, value }] of first) {
    const base = { file, id: data[index].id, index, path }
    const replacement = another(value, seen.get(key) ?? [])
    if (replacement !== undefined) tasks.push({ ...base, kind: "change", replacement })
    tasks.push({ ...base, kind: "delete" })
  }
  // The first list and the first group at each distinct path. A list gains an item taken from the same list in
  // another entry, or a copy of its own first item, so the added item is one its schema accepts.
  const firstBranch = new Map<string, { index: number; path: Path; value: Json }>()
  const items = new Map<string, Json[]>()
  for (const [index, entry] of data.entries()) {
    for (const [path, value] of branches(entry as Json)) {
      const key = fold(path)
      if (!firstBranch.has(key)) firstBranch.set(key, { index, path, value })
      if (Array.isArray(value)) items.set(key, [...(items.get(key) ?? []), ...value])
    }
  }
  for (const [key, { index, path, value }] of firstBranch) {
    const base = { file, id: data[index].id, index, path }
    if (Array.isArray(value) && value.length) {
      const own = new Set(value.map((item) => JSON.stringify(item)))
      const foreign = (items.get(key) ?? []).find((item) => !own.has(JSON.stringify(item)))
      tasks.push({ ...base, kind: "add", replacement: foreign ?? value[0] })
    }
    tasks.push({ ...base, kind: "delete group" })
  }
  return tasks
}

function mutate(text: string, task: Task): string {
  const data = JSON.parse(text)
  let parent = data[task.index]
  for (const key of task.path.slice(0, -1)) parent = parent[key]
  const last = task.path[task.path.length - 1]
  if (task.kind === "change") parent[last] = task.replacement
  else if (task.kind === "add") parent[last].push(task.replacement)
  else if (Array.isArray(parent)) parent.splice(last as number, 1)
  else delete parent[last]
  return `${JSON.stringify(data, null, 2)}\n`
}

/** Run a file's check, with the package and reference checks, in a copy of the package. Resolves to the names of the checks that failed. */
function failedChecks(copy: string, check: string): Promise<string[] | null> {
  return new Promise((done) => {
    execFile(process.execPath, [...process.execArgv, "scripts/verify.ts", check, "package", "references"], { cwd: copy, maxBuffer: 64 * 1024 * 1024 }, (error, stdout) => {
      const failed = stdout.split("\n").filter((line) => line.trimStart().startsWith("✗"))
      done(error ? failed : null)
    })
  })
}

const wanted = process.argv.slice(2)
for (const name of wanted) if (!registry[name]) throw new Error(`No data file named ${name}`)
const tasks = Object.keys(registry)
  .filter((name) => wanted.length === 0 || wanted.includes(name))
  .flatMap(tasksFor)

const work = mkdtempSync(join(tmpdir(), "srd-mutate-"))
const workers = Math.max(1, Math.min(tasks.length, availableParallelism() - 2))
const outcomes: Outcome[] = []
let next = 0
try {
  await Promise.all(
    Array.from({ length: workers }, async (_, worker) => {
      // A copy of the package, sharing the installed modules and the upstream cache.
      const copy = join(work, String(worker), basename(root))
      cpSync(root, copy, { recursive: true, filter: (source) => !["node_modules", ".cache"].includes(basename(source)) })
      for (const shared of ["node_modules", ".cache"]) symlinkSync(join(root, shared), join(copy, shared))
      while (next < tasks.length) {
        const task = tasks[next++]
        const path = join(copy, "data", `${task.file}.json`)
        const original = readFileSync(path, "utf8")
        writeFileSync(path, mutate(original, task))
        const failed = await failedChecks(copy, registry[task.file].check)
        writeFileSync(path, original)
        // The schema check alone catching a deletion says the field is required, not that its value is guarded.
        const content = failed?.some((line) => !line.includes("parses with its strict schema"))
        outcomes.push({ ...task, result: failed === null ? "missed" : content ? "content" : "schema" })
        if (outcomes.length % 100 === 0) console.log(`  ${outcomes.length}/${tasks.length}`)
      }
    })
  )
} finally {
  rmSync(work, { recursive: true, force: true })
}

const count = (result: Outcome["result"]) => outcomes.filter((outcome) => outcome.result === result).length
const missed = outcomes.filter((outcome) => outcome.result === "missed")
const what = (task: Task) =>
  task.kind === "change"
    ? `changed to ${JSON.stringify(task.replacement)}`
    : task.kind === "add"
      ? `gained ${JSON.stringify(task.replacement)}`
      : task.kind === "delete"
        ? "deleted"
        : "deleted with all it holds"
for (const miss of missed) console.log(`MISSED ${miss.file} ${miss.id} ${fold(miss.path)} ${what(miss)}`)
console.log(`\n${outcomes.length} mutations: ${count("content")} caught by a content check, ${count("schema")} by the schema alone, ${missed.length} missed.`)
if (missed.length) process.exit(1)
