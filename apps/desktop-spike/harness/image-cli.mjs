import { randomUUID } from "node:crypto"
import { readdirSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { extname, join, sep } from "node:path"
import { locate, minimalEnv } from "./cli.mjs"

// Running Codex's and Grok's own image tools under the player's sign-in, with every other tool off. No image
// processing here, so the desktop runtime can import it without the spike's dependencies.
const forbidden = [
  "read_file",
  "write",
  "search_replace",
  "list_dir",
  "grep",
  "run_terminal_command",
  "kill_command_or_subagent",
  "get_command_or_subagent_output",
  "spawn_subagent",
  "scheduler_create",
  "scheduler_delete",
  "scheduler_list",
  "monitor",
  "search_tool",
  "use_tool",
  "workflow",
  "todo_write",
  "enter_plan_mode",
  "exit_plan_mode",
  "ask_user_question",
  "send_feedback",
  "image_edit",
  "image_to_video",
  "reference_to_video",
  "video_gen",
]
function grokImagePath(events) {
  const visit = (value) => {
    if (typeof value === "string") {
      try {
        return visit(JSON.parse(value))
      } catch {
        return null
      }
    }
    if (Array.isArray(value)) return value.map(visit).find(Boolean)
    if (!value || typeof value !== "object") return null
    if (value.type === "ImageGen" && typeof value.path === "string") return value.path
    return Object.values(value).map(visit).find(Boolean)
  }
  return events
    .filter((e) => e.type === "user")
    .map(visit)
    .find(Boolean)
}

// The locked-down command that makes one image with the provider's own image tool, under the player's sign-in.
export function imageCommand(provider, cwd, instructions, kind = "image") {
  const env = minimalEnv()
  const executable = locate(provider)
  let args
  if (provider === "codex") {
    const settings = {
      project_doc_max_bytes: 0,
      "skills.include_instructions": false,
      include_apps_instructions: false,
      include_permissions_instructions: false,
      include_collaboration_mode_instructions: false,
      web_search: "disabled",
      mcp_servers: {},
      "features.shell_tool": false,
      "features.apply_patch_freeform": false,
      "features.unified_exec": false,
      "features.apps": false,
      "features.plugins": false,
      "features.hooks": false,
      "features.multi_agent": false,
      "features.js_repl": false,
      "features.view_image": false,
      "features.image_generation": true,
      "tools.update_plan.enabled": false,
      "tools.experimental_request_user_input.enabled": false,
    }
    args = [
      "--ask-for-approval",
      "never",
      "--sandbox",
      "read-only",
      "-C",
      cwd,
      ...Object.entries(settings).flatMap(([key, value]) => ["-c", `${key}=${typeof value === "object" ? "{}" : JSON.stringify(value)}`]),
      "exec",
      "--ephemeral",
      "--ignore-user-config",
      "--ignore-rules",
      "--skip-git-repo-check",
      "--color",
      "never",
      "--json",
      "-",
    ]
  } else {
    const promptPath = join(cwd, `${kind}.txt`)
    writeFileSync(promptPath, instructions)
    for (const source of ["CURSOR", "CLAUDE"]) for (const type of ["SKILLS", "RULES", "AGENTS", "MCPS", "HOOKS"]) env[`GROK_${source}_${type}_ENABLED`] = "0"
    Object.assign(env, { GROK_MEMORY: "0", GROK_SUBAGENTS: "0", GROK_TOOL_SEARCH: "0", GROK_LSP_TOOLS: "0", GROK_DISABLE_AUTOUPDATER: "1" })
    args = [
      "--prompt-file",
      promptPath,
      "--verbatim",
      "--output-format",
      "streaming-messages-json",
      "--tools",
      "image_gen",
      "--disallowed-tools",
      forbidden.join(","),
      "--allow",
      "image_gen",
      "--disable-web-search",
      "--no-subagents",
      "--no-plan",
      "--permission-mode",
      "dontAsk",
      "--session-id",
      randomUUID(),
      "--model",
      "grok-4.7",
      ...["Bash(*)", "Read(**)", "Edit(**)", "Grep(**)", "MCPTool(*)"].flatMap((rule) => ["--deny", rule]),
    ]
  }
  return { executable, args, env, input: provider === "codex" ? instructions : "" }
}

// The image a finished run produced, resolved inside the provider's own image directory. Throws a reason code.
export function imageOutput(provider, events) {
  const unexpected = events.some((e) => {
    if (provider === "grok") return e.message?.content?.some((b) => b.type === "tool_use" && b.name !== "image_gen")
    return ["command_execution", "file_change", "mcp_tool_call", "web_search"].includes(e.item?.type)
  })
  if (unexpected) throw new Error("unexpected_tool_event")
  let path
  let allowedRoot
  if (provider === "codex") {
    const thread = events.find((e) => e.type === "thread.started")?.thread_id
    if (!/^[a-f0-9-]{16,64}$/.test(thread ?? "")) throw new Error("missing_thread_id")
    allowedRoot = join(homedir(), ".codex", "generated_images", thread)
    path = readdirSync(allowedRoot)
      .filter((f) => /^[\w.-]+\.png$/.test(f))
      .map((f) => join(allowedRoot, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
  } else {
    path = grokImagePath(events)
    allowedRoot = join(homedir(), ".grok", "sessions")
    if (!path || !path.split(sep).includes("images")) throw new Error("missing_image_output")
  }
  if (!path || ![".png", ".jpg", ".jpeg"].includes(extname(path).toLowerCase())) throw new Error("invalid_image_path")
  const resolved = realpathSync(path)
  if (!resolved.startsWith(realpathSync(allowedRoot) + sep)) throw new Error("output_outside_image_directory")
  if (statSync(resolved).size > 20_971_520) throw new Error("image_too_large")
  return resolved
}
