import { spawn } from "node:child_process"
import { accessSync, constants, realpathSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join } from "node:path"
import { createInterface } from "node:readline"

export const providers = ["claude", "codex", "antigravity", "grok"]
// A provider whose executable goes by another name.
const binaries = { antigravity: "agy" }
export function minimalEnv(inherited = process.env) {
  // FilmBrain's credential-free allowlist. Do not copy the parent's API/auth/session env.
  return Object.fromEntries(["HOME", "PATH", "USER", "LOGNAME", "LANG", "TMPDIR"].filter((key) => inherited[key]).map((key) => [key, inherited[key]]))
}
export function locate(name) {
  if (![...providers, "node"].includes(name)) throw new Error("Unsupported executable")
  const binary = binaries[name] ?? name
  const candidates = [
    // Native GUI PATH can contain terminal-injected wrappers. Prefer FilmBrain's
    // known installation locations so the spike launches the player's binary itself.
    ...[".local/bin", ".local/share/fnm/aliases/default/bin", ".volta/bin", ".bun/bin", ".grok/bin"].map((dir) => join(homedir(), dir, binary)),
    ...(process.env.PATH ?? "")
      .split(":")
      .filter(isAbsolute)
      .map((dir) => join(dir, binary)),
    `/opt/homebrew/bin/${binary}`,
    `/usr/local/bin/${binary}`,
  ]
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK)
      return realpathSync(candidate)
    } catch {}
  }
  throw new Error(`${name} not installed`)
}
export function runBounded(binary, args, { cwd, input, env = minimalEnv(), timeout = 10000, limit = 1_048_576 } = {}) {
  return new Promise((resolve) => {
    const start = performance.now()
    const child = spawn(binary, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], detached: true })
    let stdout = "",
      stderr = "",
      timedOut = false,
      oversized = false
    const kill = () => {
      try {
        process.kill(-child.pid, "SIGKILL")
      } catch {}
    }
    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, timeout)
    child.stdout.on("data", (data) => {
      stdout += data
      if (Buffer.byteLength(stdout) > limit) {
        oversized = true
        kill()
      }
    })
    // Raw stderr stays in memory, never in durable evidence or UI.
    child.stderr.on("data", (data) => {
      stderr += data
      if (Buffer.byteLength(stderr) > limit) {
        oversized = true
        kill()
      }
    })
    child.stdin.on("error", () => {})
    child.on("error", () => {})
    child.on("close", (code) => {
      clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut, oversized, elapsedMs: Math.round(performance.now() - start) })
    })
    child.stdin.end(input ?? "")
  })
}
// The effort the app asks of a CLI that takes one. The Game Master picker shows these, so set them only here.
export const efforts = { claude: "medium", codex: "low", antigravity: "medium" }
export const claudeArgs = [
  "--print",
  "--input-format",
  "stream-json",
  "--output-format",
  "stream-json",
  "--verbose",
  "--tools",
  "",
  "--safe-mode",
  "--settings",
  JSON.stringify({ enabledPlugins: { "cc-plugin-agents-md@builtin": false, "cc-plugin-telemetry@builtin": false, "cc-plugin-plugin-authoring@builtin": false } }),
  "--setting-sources",
  "",
  "--strict-mcp-config",
  "--disable-slash-commands",
  "--permission-mode",
  "manual",
  "--permission-prompts",
  "none",
  "--no-session-persistence",
  "--exclude-dynamic-system-prompt-sections",
  "--effort",
  efforts.claude,
]

export function gate(provider, help) {
  if (provider === "claude") {
    const required = ["--input-format", "--tools", "--safe-mode", "--setting-sources", "--strict-mcp-config", "--permission-prompts", "--disable-slash-commands"]
    const missing = required.filter((flag) => !help.includes(flag))
    return missing.length ? { allowed: false, reason: `Missing flags: ${missing.join(", ")}` } : { allowed: true }
  }
  const flag = { codex: "app-server", antigravity: "--input-format", grok: "agent" }[provider]
  return help.includes(flag) ? { allowed: true } : { allowed: false, reason: "Persistent protocol not exposed by this installed CLI" }
}

export async function detect(cwd) {
  const results = []
  for (const provider of providers) {
    try {
      const binary = locate(provider)
      const version = await runBounded(binary, ["--version"], { cwd })
      const args = provider === "codex" ? ["app-server", "--help"] : ["--help"]
      const help = await runBounded(binary, args, { cwd })
      const versionText = version.stdout.trim()
      results.push({
        provider,
        executable: binary.replace(homedir(), "~"),
        version: /^[\w .()[\]-]{1,100}$/.test(versionText) ? versionText : "unrecognized",
        versionExit: version.code,
        helpExit: help.code,
        exposesIgnoreUserConfig: help.stdout.includes("--ignore-user-config"),
        mode: { claude: "stream-json stdin", codex: "app-server JSON-RPC", antigravity: "stream-json stdin", grok: "agent stdio ACP" }[provider],
        ...gate(provider, help.stdout),
      })
    } catch {
      results.push({ provider, allowed: false, reason: "Executable not found or probe failed" })
    }
  }
  return results
}

export class ClaudeSession {
  constructor(cwd, system) {
    this.start = performance.now()
    this.requests = 0
    this.child = spawn(locate("claude"), [...claudeArgs, "--system-prompt", system], { cwd, env: minimalEnv(), detached: true, stdio: ["pipe", "pipe", "pipe"] })
    this.child.stdin.on("error", () => {})
    this.child.stderr.on("data", () => {})
    this.child.on("error", () => this.fail("launch_failed"))
    this.child.on("close", () => this.fail("process_exited"))
    this.bytes = 0
    this.child.stdout.on("data", (chunk) => {
      this.bytes += chunk.length
      if (this.bytes > 4_194_304) this.fail("output_limit")
    })
    createInterface({ input: this.child.stdout }).on("line", (line) => this.consume(line))
  }
  consume(line) {
    let event
    try {
      event = JSON.parse(line)
    } catch {
      this.fail("invalid_stream")
      return
    }
    if (event.type === "system" && event.subtype === "init") {
      this.model = event.model
      this.capabilities = { tools: event.tools ?? [], skills: event.skills ?? [], plugins: event.plugins ?? [], mcpServers: event.mcp_servers ?? [] }
      this.startupMs ??= Math.round(performance.now() - this.start)
      if ([event.tools, event.mcp_servers, event.plugins, event.skills].some((list) => !Array.isArray(list) || list.length !== 0)) {
        this.fail("lockdown_failed")
        return
      }
      this.lockdownVerified = true
    }
    if (event.type === "control_response" && this.pending) {
      const pending = this.pending
      this.pending = null
      clearTimeout(pending.timer)
      const models = event.response?.response?.models ?? []
      const running = models.find((m) => m.value === "default")
      const named = models.find((m) => m.value !== "default" && m.resolvedModel === running?.resolvedModel)
      pending.resolve({ name: named ? `Claude ${named.displayName}` : undefined, effort: running?.supportsEffort ? efforts.claude : undefined })
      return
    }
    if (event.type === "assistant" && event.message?.content?.some((block) => block.type === "tool_use")) {
      this.fail("tool_attempt")
      return
    }
    if (event.type === "result" && this.pending) {
      if (!this.lockdownVerified) {
        this.fail("missing_lockdown_evidence")
        return
      }
      const pending = this.pending
      this.pending = null
      clearTimeout(pending.timer)
      pending.resolve({
        text: typeof event.result === "string" ? event.result : "",
        failed: Boolean(event.is_error),
        providerTurns: event.num_turns ?? null,
        reportedSessionApiMs: event.duration_api_ms ?? null,
      })
    }
  }
  fail(reason) {
    this.failure = reason
    if (this.pending) {
      clearTimeout(this.pending.timer)
      this.pending.reject(new Error(reason))
      this.pending = null
    }
    this.close()
  }
  ask(text) {
    if (this.failure) return Promise.reject(new Error(this.failure))
    this.requests++
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, timer: setTimeout(() => this.fail("request_timeout"), 120000) }
      this.child.stdin.write(`${JSON.stringify({ type: "user", message: { role: "user", content: text } })}\n`)
    })
  }
  // The model this CLI would run, asked over the control channel. No prompt is sent, so nothing is used.
  describe() {
    if (this.failure) return Promise.reject(new Error(this.failure))
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject, timer: setTimeout(() => this.fail("request_timeout"), 120000) }
      this.child.stdin.write(`${JSON.stringify({ type: "control_request", request_id: "describe", request: { subtype: "initialize" } })}\n`)
    })
  }
  close() {
    try {
      process.kill(-this.child.pid, "SIGTERM")
    } catch {}
  }
}
