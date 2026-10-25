import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { minimalEnv } from "./cli.mjs"

// Protocol metadata and generated game text only. No configuration/auth reads,
// raw stderr persistence, or proxy access to the host filesystem/terminal.
export class RpcPeer {
  constructor(binary, args, cwd, env = minimalEnv()) {
    this.pending = new Map()
    this.nextId = 1
    this.bytes = 0
    this.stderrBytes = 0
    this.methods = {}
    this.deniedRequests = 0
    this.child = spawn(binary, args, { cwd, env, detached: true, stdio: ["pipe", "pipe", "pipe"] })
    this.child.stdin.on("error", () => {})
    this.child.stderr.on("data", (data) => {
      this.stderrBytes += data.length
      if (this.stderrBytes > 4_194_304) this.fail("stderr_limit")
    })
    this.child.stdout.on("data", (data) => {
      this.bytes += data.length
      if (this.bytes > 16_777_216) this.fail("output_limit")
    })
    this.child.on("error", () => this.fail("launch_failed"))
    this.child.on("close", (code) => {
      this.exitCode = code
      if (!this.closed) this.fail(`process_exited_${code}`)
    })
    createInterface({ input: this.child.stdout }).on("line", (line) => this.consume(line))
  }
  send(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`)
  }
  request(method, params, timeout = 120000) {
    if (this.failure) return Promise.reject(new Error(this.failure))
    const id = this.nextId++
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(`timeout_${method}`), timeout)
      this.pending.set(id, { resolve, reject, timer, method })
      this.send({ jsonrpc: "2.0", id, method, params })
    })
  }
  consume(line) {
    let message
    try {
      message = JSON.parse(line)
    } catch {
      this.fail("invalid_protocol_json")
      return
    }
    if (message.method) {
      this.methods[message.method] = (this.methods[message.method] ?? 0) + 1
      if (message.id !== undefined) {
        this.deniedRequests++
        if (message.method === "session/request_permission") {
          this.send({ jsonrpc: "2.0", id: message.id, result: { outcome: { outcome: "cancelled" } } })
        } else if (message.method.endsWith("requestApproval")) {
          this.send({ jsonrpc: "2.0", id: message.id, result: { decision: "decline" } })
        } else {
          this.send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "Host operation unavailable in this GM fixture" } })
        }
        return
      }
      this.onNotification?.(message.method, message.params)
      return
    }
    const pending = this.pending.get(message.id)
    if (!pending) return
    this.pending.delete(message.id)
    clearTimeout(pending.timer)
    if (message.error) {
      // Keep protocol errors separate from account/configuration notification
      // payloads. URLs and credential-shaped strings are redacted from summaries.
      const raw = String(message.error.message ?? "")
      this.lastError = {
        method: pending.method,
        code: message.error.code,
        message: raw
          .replace(/https?:\/\/\S+/g, "[url]")
          .replace(/\b[\w.-]{40,}\b/g, "[redacted]")
          .slice(0, 500),
      }
      const category = /auth|log.?in|sign.?in|credential/i.test(raw)
        ? "authentication"
        : /model/i.test(raw)
          ? "model"
          : /quota|limit|429/i.test(raw)
            ? "quota"
            : /param|invalid/i.test(raw)
              ? "parameters"
              : "server"
      pending.reject(new Error(`rpc_${category}_${message.error.code}`))
    } else pending.resolve(message.result ?? {})
  }
  fail(reason) {
    this.failure ??= reason
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer)
      reject(new Error(this.failure))
    }
    this.pending.clear()
    this.onFailure?.(this.failure)
    this.close()
  }
  close() {
    if (this.closed) return
    this.closed = true
    try {
      process.kill(-this.child.pid, "SIGTERM")
    } catch {}
    const timer = setTimeout(() => {
      try {
        process.kill(-this.child.pid, "SIGKILL")
      } catch {}
    }, 1000)
    timer.unref()
  }
}
