import { randomUUID } from "node:crypto"
import { copyFileSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, extname, join, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { PNG } from "pngjs"
import { locate, minimalEnv, runBounded } from "./cli.mjs"

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
const character =
  "Mira, an adult human fantasy ranger with dark curly hair, warm brown skin, a rust-red cloak, brown leather boots and armor, and a sheathed sword. Painterly tabletop RPG character art. No green clothing, no text, no border. Flat perfectly solid bright green #00ff00 background, no gradient, no cast shadow."
export const imagePrompts = {
  portrait: `${character} One square bust portrait, face clearly visible, centered with generous green margin.`,
  standee: `${character} One landscape sheet showing two full-body views of the SAME character side by side: front view on the left, back view on the right. Exact matching scale, outfit and pose, both feet fully visible, clear green gap between figures and around every edge. No base or ground.`,
}

export function chromaKey(input) {
  const png = PNG.sync.read(input)
  let removed = 0,
    feathered = 0
  for (let i = 0; i < png.data.length; i += 4) {
    const [r, g, b] = png.data.subarray(i, i + 3)
    const excess = g - Math.max(r, b)
    if (g > 90 && excess > 25) {
      const alpha = 1 - Math.min(1, (excess - 25) / 80)
      png.data[i + 3] = Math.round(png.data[i + 3] * alpha)
      png.data[i + 1] = Math.min(g, Math.max(r, b) + 15)
      if (alpha === 0) removed++
      else feathered++
    }
  }
  return {
    png,
    bytes: PNG.sync.write(png),
    metrics: { width: png.width, height: png.height, transparentPixels: removed, featheredPixels: feathered, transparentFraction: removed / (png.width * png.height) },
  }
}

export async function removeBackground(inputPath, outputPath) {
  const started = performance.now()
  const keyed = chromaKey(readFileSync(inputPath))
  let result = keyed
  let method = "local-green-excess-key"
  // Do not silently label an opaque output as background-removed.
  if (keyed.metrics.transparentFraction < 0.1) {
    const script = fileURLToPath(new URL("./remove-background.swift", import.meta.url))
    const segmented = await runBounded("/usr/bin/swift", [script, inputPath, outputPath], { timeout: 120000 })
    if (segmented.code !== 0) throw new Error("background_removal_failed")
    const bytes = readFileSync(outputPath)
    const png = PNG.sync.read(bytes)
    let transparentPixels = 0
    let featheredPixels = 0
    for (let i = 3; i < png.data.length; i += 4) {
      if (png.data[i] === 0) transparentPixels++
      else if (png.data[i] < 255) featheredPixels++
    }
    result = { png, bytes, metrics: { width: png.width, height: png.height, transparentPixels, featheredPixels, transparentFraction: transparentPixels / (png.width * png.height) } }
    method = "local-macos-vision"
  }
  if (result.metrics.transparentFraction < 0.1 || result.metrics.transparentFraction > 0.95) throw new Error("background_removal_failed")
  writeFileSync(outputPath, result.bytes)
  return {
    ...result,
    metrics: { ...result.metrics, backgroundRemoval: method, backgroundRemovalMs: Math.round(performance.now() - started), greenPromptFollowed: keyed.metrics.transparentFraction >= 0.1 },
  }
}

export function splitStandee(png, output, provider) {
  for (const [index, side] of ["front", "back"].entries()) {
    const width = Math.floor(png.width / 2)
    const half = new PNG({ width, height: png.height })
    PNG.bitblt(png, half, index * width, 0, width, png.height, 0, 0)
    writeFileSync(join(output, `${provider}-${side}.png`), PNG.sync.write(half))
  }
}

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

export async function imageTrials(cwd, resultDir) {
  const rows = []
  const output = join(resultDir, "images")
  mkdirSync(output, { recursive: true })
  for (const provider of ["codex", "grok"]) {
    for (const [kind, description] of Object.entries(imagePrompts)) {
      const instructions = `Use only your built-in ${provider === "codex" ? "image generation" : "image_gen"} tool exactly once to generate one ${kind === "portrait" ? "square" : "landscape"} image. Do not use any other tools or write files yourself. Then stop.\n\n${description}`
      const env = minimalEnv()
      const executable = locate(provider)
      const version = await runBounded(executable, ["--version"], { cwd })
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
      const result = await runBounded(executable, args, { cwd, env, input: provider === "codex" ? instructions : "", timeout: 240000, limit: 8_388_608 })
      const events = result.stdout.split("\n").flatMap((line) => {
        try {
          return [JSON.parse(line)]
        } catch {
          return []
        }
      })
      const row = {
        provider,
        version: version.stdout.trim(),
        executable: executable.replace(homedir(), "~"),
        model: provider === "grok" ? "grok-4.7" : "CLI default",
        kind,
        elapsedMs: result.elapsedMs,
        exitCode: result.code,
        timedOut: result.timedOut,
        prompt: description,
      }
      try {
        if (result.code !== 0 || result.timedOut || result.oversized) throw new Error("provider_failed")
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
        const original = join(output, `${provider}-${kind}-original${extname(path)}`)
        copyFileSync(resolved, original)
        let png = original
        if (extname(png) !== ".png") {
          png = join(cwd, `${provider}-${kind}.png`)
          const converted = await runBounded("/usr/bin/sips", ["-s", "format", "png", original, "--out", png])
          if (converted.code !== 0) throw new Error("conversion_failed")
        }
        const keyedPath = join(output, `${provider}-${kind}-transparent.png`)
        const keyed = await removeBackground(png, keyedPath)
        Object.assign(row, { status: "generated", original: `images/${basename(original)}`, transparent: `images/${basename(keyedPath)}`, ...keyed.metrics })
        if (kind === "standee") splitStandee(keyed.png, output, provider)
      } catch (error) {
        row.status = "failed"
        const allowed = [
          "provider_failed",
          "unexpected_tool_event",
          "missing_thread_id",
          "missing_image_output",
          "invalid_image_path",
          "output_outside_image_directory",
          "image_too_large",
          "conversion_failed",
          "background_removal_failed",
        ]
        row.reason = allowed.includes(error.message) ? error.message : "image_unavailable"
      }
      rows.push(row)
      writeFileSync(join(resultDir, "images.json"), JSON.stringify(rows, null, 2))
    }
  }
  return rows
}
