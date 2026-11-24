// pnpm clean:space: frees disk the dev loop fills. Lab captures older than a week and playthrough videos older than
// 3 days always go. Next's dev build goes while no dev server is running, and rebuilds on the next page it serves.
// pnpm clean:space --rust also runs cargo clean, about 5 GB, which makes the next `pnpm dev:app` a full Rust build.

import { execSync } from "node:child_process"
import { rm } from "node:fs/promises"
import { prunePlaythroughs } from "../apps/desktop/scripts/playthrough-prune"
import { pruneCaptures } from "../lab/stage-art/prune"

const running = (pattern: string) => {
  try {
    return execSync(`pgrep -f '${pattern}'`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim().length > 0
  } catch {
    return false
  }
}
const size = (path: string) => {
  try {
    return execSync(`du -sh '${path}'`, { stdio: ["ignore", "pipe", "ignore"] }).toString().split("\t")[0]
  } catch {
    return "0"
  }
}

async function main() {
  await pruneCaptures()
  prunePlaythroughs()

  if (running("[n]ext dev")) console.log("skipped .next: a next dev server is running")
  else {
    for (const dir of [".next/dev", ".next/cache"]) {
      console.log(`removing ${dir}, ${size(dir)}`)
      await rm(dir, { recursive: true, force: true })
    }
  }

  if (!process.argv.includes("--rust")) return
  if (running("[c]argo |[t]auri dev|[s]rc-tauri/target/")) console.log("skipped Rust build output: cargo, tauri dev or the dev app is running")
  else {
    console.log(`cargo clean, ${size("apps/desktop/src-tauri/target")}`)
    execSync("cargo clean", { cwd: "apps/desktop/src-tauri", stdio: "inherit" })
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
