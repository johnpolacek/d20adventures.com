import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { test } from "node:test"

const LOCK_SCRIPT = new URL("./heavy-lock.mjs", import.meta.url).pathname

function runLock(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [LOCK_SCRIPT, ...args], {
      env: { ...process.env, D20_HEAVY_POLL_MS: "40", ...env },
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stdout = ""
    let stderr = ""
    child.stdout.on("data", (c) => (stdout += c))
    child.stderr.on("data", (c) => (stderr += c))
    child.on("close", (code) => resolve({ code, stdout, stderr }))
  })
}

test("heavy-lock serializes two concurrent heavy commands and caps VIPS_CONCURRENCY / NODE_OPTIONS", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d20-lock-test-"))
  const lockPath = join(dir, "heavy.lock")
  try {
    const a = runLock(["first", "--", process.execPath, "-e", "console.log('A:start', process.env.VIPS_CONCURRENCY, process.env.NODE_OPTIONS); setTimeout(() => console.log('A:end'), 220)"], {
      D20_HEAVY_LOCK: lockPath,
      NODE_OPTIONS: "",
      VIPS_CONCURRENCY: "",
    })
    await new Promise((r) => setTimeout(r, 60))
    const b = runLock(["second", "--", process.execPath, "-e", "console.log('B:run')"], {
      D20_HEAVY_LOCK: lockPath,
    })
    const [ra, rb] = await Promise.all([a, b])
    assert.equal(ra.code, 0)
    assert.equal(rb.code, 0)
    assert.match(ra.stdout, /A:start 2 .*--max-old-space-size=2048/)
    assert.match(rb.stderr, /second waiting for first/)
    assert.match(rb.stdout, /B:run/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("heavy-lock recovers automatically from a stale lock owned by a dead pid", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d20-lock-stale-"))
  const lockPath = join(dir, "heavy.lock")
  mkdirSync(lockPath)
  writeFileSync(join(lockPath, "owner.json"), JSON.stringify({ pid: 999999, label: "crashed", startedAt: new Date().toISOString() }))
  try {
    const res = await runLock(["fresh", "--", process.execPath, "-e", "console.log('ok')"], { D20_HEAVY_LOCK: lockPath })
    assert.equal(res.code, 0)
    assert.equal(res.stdout.trim(), "ok")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("heavy-lock skips locking when --skip matches a read-only subcommand", async () => {
  const dir = mkdtempSync(join(tmpdir(), "d20-lock-skip-"))
  const lockPath = join(dir, "heavy.lock")
  mkdirSync(lockPath)
  // Current process is alive, so a non-skipped command would block; --skip=list must run immediately.
  writeFileSync(join(lockPath, "owner.json"), JSON.stringify({ pid: process.pid, label: "busy", startedAt: new Date().toISOString() }))
  try {
    const res = await runLock(["assets", "--skip=list", "--", process.execPath, "-e", "console.log(process.argv[1])", "list"], {
      D20_HEAVY_LOCK: lockPath,
    })
    assert.equal(res.code, 0)
    assert.equal(res.stdout.trim(), "list")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
