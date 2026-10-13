import { writeFileSync } from "node:fs"
import { join } from "node:path"
import { ClaudeSession, efforts, locate, minimalEnv } from "./cli.mjs"
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
      await this.peer.request("turn/start", { threadId: this.id, input: [{ type: "text", text }], effort: efforts.codex })
      return await completion
    } catch (error) {
      this.peer.fail(error.message)
      throw error
    }
  }
  // The model a thread starts on, by the name the CLI lists it under. Starts no turn.
  async describe() {
    if (!this.id) await this.initialize()
    const listed = await this.peer.request("model/list", {}).catch(() => ({}))
    return { name: listed.data?.find((m) => m.model === this.model)?.displayName ?? this.model, effort: efforts.codex }
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
    this.available = session.models?.availableModels ?? []
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
  // The session's model, with the name and effort the CLI reports for it. Sends no prompt.
  async describe() {
    if (!this.id) await this.initialize()
    const current = this.available.find((m) => m.modelId === this.model)
    return { name: current?.name, effort: current?._meta?.reasoningEffort }
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

// What a CLI would run as the GM: its model's name and effort, where it says. Failing the session on the time limit
// rejects the request it is waiting on, so no timer outlives the call.
export async function describeModel(provider, cwd, timeout = 10000) {
  const session = createSession(provider, cwd, "")
  const timer = setTimeout(() => (session.peer ?? session).fail("describe_timeout"), timeout)
  try {
    return await session.describe()
  } finally {
    clearTimeout(timer)
    session.close()
  }
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
