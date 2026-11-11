import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import { root } from "./lib/sources"

// Run every builder in scripts/build, or only those named: pnpm build spells monsters
// A builder default-exports a function that reads the pinned sources and writes its data files.
const dir = resolve(root, "scripts/build")
const wanted = process.argv.slice(2)
const names = readdirSync(dir)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => file.replace(/\.ts$/, ""))
  .sort()
for (const name of wanted) if (!names.includes(name)) throw new Error(`No builder named ${name}`)
for (const name of names) {
  if (wanted.length && !wanted.includes(name)) continue
  console.log(name)
  const builder = await import(resolve(dir, `${name}.ts`))
  await builder.default()
}
