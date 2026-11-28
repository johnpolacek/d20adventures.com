import assert from "node:assert/strict"
import { delimiter, dirname } from "node:path"
import test from "node:test"
import { ClaudeSession, efforts, minimalEnv } from "./cli.mjs"
import { createSession, parseAntigravityModels } from "./sessions.mjs"

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

test("parseAntigravityModels picks Neon over Flash at medium effort and lists all medium Gemini options", () => {
  const stdout = [
    "\r⠋ Fetching available models...\rgemini-4-neon-high             Gemini 4 Neon (High)",
    "gemini-4-neon-medium           Gemini 4 Neon (Medium)",
    "gemini-4-hydrogen-medium\tGemini 4 Hydrogen (Medium)",
    "gemini-3.8-flash-medium        Gemini 3.8 Flash (Medium)",
    "gemini-pro-orchestrator-neon   Orchestrator (Neon)",
    "claude-opus-5-5-medium         Claude Opus 5.5 (Medium)",
  ].join("\n")
  const { picked, options } = parseAntigravityModels(stdout)
  assert.deepEqual(picked, { slug: "gemini-4-neon-medium", name: "Gemini 4 Neon", effort: "medium" })
  assert.deepEqual(options, [
    { value: "gemini-4-neon-medium", name: "Gemini 4 Neon" },
    { value: "gemini-4-hydrogen-medium", name: "Gemini 4 Hydrogen" },
    { value: "gemini-3.8-flash-medium", name: "Gemini 3.8 Flash" },
  ])
})

test("all desktop CLI providers default to medium effort", () => {
  assert.deepEqual(efforts, { claude: "medium", codex: "medium", antigravity: "medium" })
})
