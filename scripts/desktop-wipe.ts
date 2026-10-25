// Wipes the desktop app's saved plays on this computer, for a fresh start while testing.
//
//   pnpm desktop:wipe            every saved adventure, current and archived
//   pnpm desktop:wipe --heroes   those, and the heroes you made, with their painted art
//
// It keeps the account link, downloaded story packs and, without --heroes, the hero roster. Hosted games live on the
// website and are not touched. D20_DATA_DIR points it at another data folder.

import { existsSync, rmSync, utimesSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { LocalStore } from "../apps/desktop/runtime/store"

// Where Tauri keeps the app's data, by its identifier.
const APP = "com.d20adventures.desktop"
const dataDir = () => {
  if (process.env.D20_DATA_DIR) return process.env.D20_DATA_DIR
  if (process.platform === "darwin") return join(homedir(), "Library", "Application Support", APP)
  if (process.platform === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), APP)
  return join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"), APP)
}

const heroes = process.argv.includes("--heroes")
const data = dataDir()
const save = join(data, "adventure.sqlite")
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

if (!existsSync(save)) console.log(`No saved plays in ${data}.`)
else {
  let store: LocalStore | undefined
  try {
    store = new LocalStore(save)
    const gone = store.wipe(heroes)
    console.log(`Wiped ${count(gone.plays, "saved adventure")}${heroes ? ` and ${count(gone.heroes, "hero", "heroes")}` : ""} from ${data}.`)
  } catch (error) {
    const why = error instanceof Error ? error.message : String(error)
    console.error(`Nothing wiped: ${why}${why.includes("still running") ? " Wait for the GM to finish, then run this again." : ""}`)
    process.exitCode = 1
  } finally {
    store?.close()
  }
  if (heroes && !process.exitCode) rmSync(join(data, "art"), { recursive: true, force: true })
}

if (!process.exitCode && !process.env.D20_DATA_DIR) {
  // The browser preview keeps its own scratch save.
  rmSync(join(tmpdir(), "d20-desktop-preview"), { recursive: true, force: true })
  // A running dev app still holds the old save in memory. Touching its page makes the dev server reload the window.
  const page = "apps/desktop/index.html"
  if (existsSync(page)) {
    utimesSync(page, new Date(), new Date())
    console.log("If the app is running from pnpm dev, its window has reloaded. Otherwise press Cmd+R in it, or restart it.")
  }
}
