// Fails when a file in packages/ui imports Next, Clerk, Convex or the site (`@/`). The package is plain React, shared
// by the website and the desktop app, so both builds run this first.
import { readdirSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../src", import.meta.url))
const banned = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']((?:next|@clerk|convex)(?:\/[^"']*)?|@\/[^"']*)["']/g

const files = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [join(dir, e.name)] : []))

const found = []
for (const file of files(root)) {
  const text = readFileSync(file, "utf8")
  for (const m of text.matchAll(banned)) {
    const line = text.slice(0, m.index).split("\n").length
    found.push(`packages/ui/src/${relative(root, file)}:${line}  ${m[1]}`)
  }
}

if (found.length) {
  console.error(`@d20/ui may not import Next, Clerk, Convex or the site:\n${found.join("\n")}`)
  process.exit(1)
}
