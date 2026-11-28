// Cross-session lock for memory-heavy commands (Blender, Playwright, Next build, 4K texture pipelines) on an 8 GB Mac.
// Serializes heavy spikes across concurrent CLI sessions instead of thrashing swap, and caps Node/sharp memory.
//
//   node scripts/heavy-lock.mjs <label> [--skip=arg1,arg2] -- <command> [args...]
//
// Set D20_NO_HEAVY_LOCK=1 to bypass. Nested invocations pass through via D20_HEAVY_LOCK_HELD=1.

import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const LOCK_DIR = process.env.D20_HEAVY_LOCK || join(tmpdir(), "d20-heavy.lock")
const OWNER_FILE = join(LOCK_DIR, "owner.json")
const POLL_MS = Number(process.env.D20_HEAVY_POLL_MS) || 500
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms))

function alive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return err?.code === "EPERM"
  }
}

function readOwner() {
  try {
    return JSON.parse(readFileSync(OWNER_FILE, "utf8"))
  } catch {
    return null
  }
}

function release() {
  const owner = readOwner()
  if (owner && owner.pid !== process.pid) return
  try {
    rmSync(LOCK_DIR, { recursive: true, force: true })
  } catch {}
}

async function acquire(label) {
  let announced = null
  for (;;) {
    try {
      mkdirSync(LOCK_DIR)
      writeFileSync(OWNER_FILE, `${JSON.stringify({ pid: process.pid, label, startedAt: new Date().toISOString() })}\n`)
      return
    } catch (err) {
      if (err?.code !== "EEXIST") throw err
    }
    // Give a newly-created lock a moment to write owner.json before assuming it is stale.
    let owner = readOwner()
    if (!owner) {
      await SLEEP(150)
      owner = readOwner()
    }
    if (!owner || !alive(owner.pid)) {
      try {
        rmSync(LOCK_DIR, { recursive: true, force: true })
      } catch {}
      continue
    }
    const key = `${owner.pid}:${owner.label}`
    if (announced !== key) {
      process.stderr.write(`[heavy-lock] ${label} waiting for ${owner.label} (pid ${owner.pid})...\n`)
      announced = key
    }
    await SLEEP(POLL_MS)
  }
}

function cappedEnv(held) {
  const env = { ...process.env }
  if (held) env.D20_HEAVY_LOCK_HELD = "1"
  if (!env.VIPS_CONCURRENCY) env.VIPS_CONCURRENCY = "2"
  const opts = env.NODE_OPTIONS ?? ""
  if (!opts.includes("--max-old-space-size")) env.NODE_OPTIONS = `${opts} --max-old-space-size=2048`.trim()
  return env
}

async function main() {
  const sep = process.argv.indexOf("--")
  if (sep < 3 || sep === process.argv.length - 1) {
    process.stderr.write("Usage: node scripts/heavy-lock.mjs <label> [--skip=a,b] -- <command> [args...]\n")
    process.exit(2)
  }
  const meta = process.argv.slice(2, sep)
  const label = meta[0]
  const skipArg = meta.find((a) => a.startsWith("--skip="))?.slice(7) ?? ""
  const skip = new Set(skipArg.split(",").filter(Boolean))
  const [cmd, ...cmdArgs] = process.argv.slice(sep + 1)

  const bypass =
    process.env.D20_NO_HEAVY_LOCK === "1" ||
    process.env.D20_HEAVY_LOCK_HELD === "1" ||
    (skip.size > 0 && cmdArgs.some((a) => skip.has(a)))

  let holding = false
  if (!bypass) {
    await acquire(label)
    holding = true
  }

  const child = spawn(cmd, cmdArgs, { stdio: "inherit", env: cappedEnv(holding || process.env.D20_HEAVY_LOCK_HELD === "1") })
  const forward = (sig) => {
    try {
      child.kill(sig)
    } catch {}
  }
  process.on("SIGINT", forward)
  process.on("SIGTERM", forward)

  const code = await new Promise((resolve) => {
    child.on("error", (err) => {
      process.stderr.write(`[heavy-lock] failed to launch ${cmd}: ${err.message}\n`)
      resolve(1)
    })
    child.on("close", (status, signal) => resolve(signal ? 128 : (status ?? 1)))
  })

  if (holding) release()
  process.exit(code)
}

main().catch((err) => {
  release()
  process.stderr.write(`[heavy-lock] ${err instanceof Error ? err.message : String(err)}\n`)
  process.exit(1)
})
