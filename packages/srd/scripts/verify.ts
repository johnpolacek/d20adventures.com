import { readdirSync } from "node:fs"
import { resolve } from "node:path"
import { Report } from "./lib/report"
import { root } from "./lib/sources"

// Run every check in scripts/verify, or only those named: pnpm verify spells --verbose
// A check default-exports a function that takes the Report. Checks read data/*.json and the official text only.
const dir = resolve(root, "scripts/verify")
const args = process.argv.slice(2)
const verbose = args.includes("--verbose")
const wanted = args.filter((arg) => !arg.startsWith("--"))
const names = readdirSync(dir)
  .filter((file) => file.endsWith(".ts"))
  .map((file) => file.replace(/\.ts$/, ""))
  .sort()
for (const name of wanted) if (!names.includes(name)) throw new Error(`No check named ${name}`)
const report = new Report()
for (const name of names) {
  if (wanted.length && !wanted.includes(name)) continue
  const check = await import(resolve(dir, `${name}.ts`))
  await check.default(report)
}
report.print(verbose)
if (report.failed) process.exit(1)
