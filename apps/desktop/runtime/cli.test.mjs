import assert from "node:assert/strict"
import test from "node:test"
import { PNG } from "pngjs"
import { ClaudeSession, minimalEnv } from "./cli.mjs"
import { chromaKey } from "./images.mjs"

test("CLI environment excludes credential variables and parent agent context", () => {
  assert.deepEqual(
    minimalEnv({ HOME: "/home/player", PATH: "/bin", OPENAI_API_KEY: "fake", ANTHROPIC_API_KEY: "fake", GEMINI_API_KEY: "fake", XAI_API_KEY: "fake", NODE_OPTIONS: "injected", CLAUDECODE: "parent" }),
    { HOME: "/home/player", PATH: "/bin" }
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
test("local chroma key removes green while preserving character colors", () => {
  const input = new PNG({ width: 3, height: 1 })
  input.data.set([0, 255, 0, 255, 160, 70, 40, 255, 20, 20, 20, 255])
  const result = chromaKey(PNG.sync.write(input))
  assert.equal(result.png.data[3], 0)
  assert.equal(result.png.data[7], 255)
  assert.equal(result.png.data[11], 255)
  assert.equal(result.metrics.transparentPixels, 1)
})
