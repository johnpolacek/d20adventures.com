import assert from "node:assert/strict"
import { delimiter, dirname } from "node:path"
import test from "node:test"
import { ClaudeSession, minimalEnv } from "./cli.mjs"
import { createSession } from "./sessions.mjs"

test("CLI environment excludes credential variables and parent agent context", () => {
  assert.deepEqual(
    minimalEnv({ HOME: "/home/player", PATH: "/bin", OPENAI_API_KEY: "fake", ANTHROPIC_API_KEY: "fake", GEMINI_API_KEY: "fake", XAI_API_KEY: "fake", NODE_OPTIONS: "injected", CLAUDECODE: "parent" }),
    { HOME: "/home/player", PATH: [dirname(process.execPath), "/bin"].join(delimiter) }
  )
})
test("stream rejects incomplete capability evidence, loaded plugins and tool attempts", () => {
  const init = { type: "system", subtype: "init", tools: [], mcp_servers: [], plugins: [], skills: [] }
  for (const event of [
    { ...init, tools: undefined },
    { ...init, plugins: ["unexpected-plugin"] },
    { type: "assistant", message: { content: [{ type: "tool_use", name: "Bash" }] } },
  ]) {
    const session = Object.create(ClaudeSession.prototype)
    session.start = performance.now()
    session.close = () => {}
    session.consume(JSON.stringify(event))
    assert.ok(["lockdown_failed", "tool_attempt"].includes(session.failure))
    assert.notEqual(session.lockdownVerified, true)
  }
  const session = Object.create(ClaudeSession.prototype)
  session.start = performance.now()
  session.consume(JSON.stringify(init))
  assert.equal(session.lockdownVerified, true)
})

test("ClaudeSession preserves root failure reason when close fires", () => {
  const session = Object.create(ClaudeSession.prototype)
  session.closed = false
  session.child = null
  // Simulate fail("tool_attempt") triggering child close event -> fail("process_exited").
  session.close = function () {
    if (this.closed) return
    this.closed = true
    this.fail("process_exited")
  }
  session.fail("tool_attempt")
  assert.equal(session.failure, "tool_attempt")
  assert.equal(session.closed, true)
})

test("AntigravitySession rejects ask after close without spawning", async () => {
  const session = createSession("antigravity", process.cwd(), "system", "gemini-2.5-flash")
  session.close()
  await assert.rejects(() => session.ask("hello"), /closed/)
  assert.equal(session.child, undefined)
})
