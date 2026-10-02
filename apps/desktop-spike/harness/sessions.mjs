import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { ClaudeSession, locate, minimalEnv } from "./cli.mjs"
import { RpcPeer } from "./rpc.mjs"

class CodexSession {
  constructor(cwd, system) {
    this.cwd = cwd
    this.system = system
    this.requests = 0
    this.toolEvents = 0
    const config = {
      "features.shell_tool": false,
      "features.unified_exec": false,
      "features.apply_patch_freeform": false,
      "features.multi_agent": false,
      "features.apps": false,
      "features.hooks": false,
      web_search: "disabled",
    }
    this.peer = new RpcPeer(locate("codex"), [...Object.entries(config).flatMap(([key, value]) => ["-c", `${key}=${JSON.stringify(value)}`]), "app-server"], cwd)
    this.peer.onNotification = (method, params) => {
      if (method === "item/completed" && params.item?.type === "agentMessage") this.messages.push(params.item)
      if (method === "item/started" && ["commandExecution", "fileChange", "mcpToolCall", "webSearch"].includes(params.item?.type)) this.toolEvents++
      if (method === "turn/completed" && this.waiting) {
        const waiting = this.waiting
        this.waiting = null
        clearTimeout(waiting.timer)
        const final = this.messages.filter((m) => m.phase === "final_answer")
        waiting.resolve({ text: (final.length ? final : this.messages).map((m) => m.text).join("\n"), failed: params.turn.status !== "completed", providerTurns: 1 })
      }
    }
    this.peer.onFailure = (reason) => {
      if (this.waiting) {
        clearTimeout(this.waiting.timer)
        this.waiting.reject(new Error(reason))
        this.waiting = null
      }
    }
    this.start = performance.now()
  }
  async initialize() {
    await this.peer.request("initialize", { clientInfo: { name: "d20_desktop_spike", version: "0.0.0" }, capabilities: { experimentalApi: true } })
    this.peer.send({ jsonrpc: "2.0", method: "initialized" })
    const thread = await this.peer.request("thread/start", {
      cwd: this.cwd,
      ephemeral: true,
      approvalPolicy: "untrusted",
      sandbox: "read-only",
      baseInstructions: this.system,
      developerInstructions: "All game context is supplied in messages. Answer directly without host operations.",
      dynamicTools: [],
      environments: [],
    })
    this.id = thread.thread.id
    this.model = thread.model
    this.startupMs = Math.round(performance.now() - this.start)
  }
  async ask(text) {
    if (!this.id) await this.initialize()
    this.requests++
    this.messages = []
    const completion = new Promise((resolve, reject) => {
      this.waiting = { resolve, reject, timer: setTimeout(() => this.peer.fail("turn_timeout"), 120000) }
    })
    // Attach rejection handling while the start request is outstanding.
    completion.catch(() => {})
    try {
      await this.peer.request("turn/start", { threadId: this.id, input: [{ type: "text", text }], effort: "low" })
      return await completion
    } catch (error) {
      this.peer.fail(error.message)
      throw error
    }
  }
  close() {
    this.peer.close()
  }
}

class AcpSession {
  constructor(provider, cwd, system) {
    this.provider = provider
    this.cwd = cwd
    this.system = system
    this.requests = 0
    this.toolEvents = 0
    const env = minimalEnv()
    let args
    if (provider === "gemini") {
      // This fixture supplies all context, so tools need no host access. User
      // configuration and the CLI's own sign-in remain in their normal location.
      const policy = join(cwd, "gm-policy.toml")
      writeFileSync(policy, '[[rule]]\ntoolName = "*"\ndecision = "deny"\npriority = 999\n')
      args = ["--acp", "--policy", policy]
    } else {
      args = ["agent", "stdio"]
      env.GROK_DISABLE_AUTOUPDATER = "1"
    }
    this.peer = new RpcPeer(locate(provider), args, cwd, env)
    this.peer.onNotification = (method, params) => {
      if (method !== "session/update") return
      const update = params.update
      if (update.sessionUpdate === "agent_message_chunk" && update.content?.type === "text") this.text += update.content.text
      if (update.sessionUpdate === "tool_call") this.toolEvents++
      if (update.sessionUpdate === "current_model_update") this.model = update.currentModelId
    }
    this.start = performance.now()
  }
  async initialize() {
    const init = await this.peer.request("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "d20-desktop-spike", version: "0.0.0" },
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    })
    this.protocolVersion = init.protocolVersion
    this.agentVersion = init.agentInfo?.version
    // These are protocol identifiers. Authentication itself stays inside the CLI.
    const methods = (init.authMethods ?? []).map((method) => method.id)
    const auth = this.provider === "grok" ? methods.find((m) => m === "cached_token") : methods.find((m) => /oauth-personal|google-login/.test(m))
    if (auth) {
      await this.peer.request("authenticate", { methodId: auth, _meta: { headless: true } })
      this.authMethod = auth
    }
    const session = await this.peer.request("session/new", { cwd: this.cwd, mcpServers: [] })
    this.id = session.sessionId
    this.model = session.models?.currentModelId ?? "CLI default (unreported)"
    this.mode = session.modes?.currentModeId
    this.startupMs = Math.round(performance.now() - this.start)
  }
  async ask(text) {
    if (!this.id) await this.initialize()
    this.requests++
    this.text = ""
    const result = await this.peer.request("session/prompt", { sessionId: this.id, prompt: [{ type: "text", text: `${this.system}\n\n${text}` }] })
    return { text: this.text, failed: result.stopReason !== "end_turn", stopReason: result.stopReason, providerTurns: null }
  }
  close() {
    this.peer.close()
  }
}

export function createSession(provider, cwd, system) {
  if (provider === "claude") return new ClaudeSession(cwd, system)
  if (provider === "codex") return new CodexSession(cwd, system)
  if (["gemini", "grok"].includes(provider)) return new AcpSession(provider, cwd, system)
  throw new Error("Unsupported provider")
}

export function sessionReport(session) {
  return {
    model: session.model,
    startupMs: session.startupMs ?? null,
    processCount: 1,
    requests: session.requests,
    protocolVersion: session.protocolVersion,
    agentVersion: session.agentVersion,
    authMethod: session.authMethod,
    mode: session.mode,
    toolEvents: session.toolEvents ?? 0,
    deniedHostRequests: session.peer?.deniedRequests ?? 0,
    protocolMethods: session.peer?.methods,
    protocolError: session.peer?.lastError,
    capabilities: session.capabilities,
    configurationPolicy: "Existing CLI home retained. Supported invocation controls applied. Configuration presence is not a failure.",
  }
}
