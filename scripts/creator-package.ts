/**
 * Puts an adventure's package into the desktop app's creator folder, where the app plays it unsigned beside the
 * bundled adventures (apps/desktop/runtime/creator.ts, plans/adventure-packages.md).
 *
 *   pnpm packages:creator the-road-to-kordavos                     the package as built, under its own id
 *   pnpm packages:creator the-road-to-kordavos --as my-road        a copy under a new id, to make into another adventure
 *   pnpm packages:creator the-road-to-kordavos --to <data folder>  another data folder (D20_DATA_DIR in development)
 *
 * A copy under a new id has the old id replaced wherever it appears: in its story, its stage, its manifest, and the
 * paths of the files kept under the adventure's name (stage/fixtures/<id>/, stage/art/<id>/, stage/covers/<id>.jpg).
 */
import { execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

const args = process.argv.slice(2)
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)
const id = args.find((a, i) => !a.startsWith("--") && !["--as", "--to"].includes(args[i - 1]))
if (!id) throw new Error("Name an adventure: pnpm packages:creator <id> [--as <new-id>] [--to <data folder>]")
const as = flag("--as") ?? id
if (!/^[a-z0-9-]+$/.test(as)) throw new Error(`${as}: an id is lowercase letters, digits and dashes`)

// The app's data folder, as src-tauri/src/main.rs `data_dir` finds it.
const data =
  flag("--to") ??
  process.env.D20_DATA_DIR ??
  (process.platform === "darwin"
    ? join(homedir(), "Library/Application Support/com.d20adventures.desktop")
    : process.platform === "win32"
      ? join(process.env.APPDATA ?? homedir(), "com.d20adventures.desktop")
      : join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"), "com.d20adventures.desktop"))

const root = process.cwd()
execFileSync(resolve(root, "node_modules/.bin/tsx"), [resolve(root, "scripts/adventure-packages.ts"), id], { cwd: root, stdio: "inherit" })

const from = join(root, "build/adventures", id)
const to = join(data, "creator", as)
rmSync(to, { recursive: true, force: true })
mkdirSync(join(data, "creator"), { recursive: true })
cpSync(from, to, { recursive: true })

if (as !== id) {
  const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => (statSync(join(dir, n)).isDirectory() ? walk(join(dir, n)) : [join(dir, n)]))
  // The id in every JSON file.
  for (const file of walk(to).filter((f) => f.endsWith(".json"))) {
    const text = readFileSync(file, "utf8")
    if (text.includes(id)) writeFileSync(file, text.replaceAll(id, as))
  }
  // The files kept under the adventure's name.
  for (const dir of ["files/stage/fixtures", "files/stage/art"]) if (existsSync(join(to, dir, id))) renameSync(join(to, dir, id), join(to, dir, as))
  const covers = join(to, "files/stage/covers")
  if (existsSync(covers)) for (const f of readdirSync(covers).filter((f) => f.startsWith(`${id}.`))) renameSync(join(covers, f), join(covers, f.replace(id, as)))
}
console.log(`${as} is in ${to}. Restart the app to play it.`)
