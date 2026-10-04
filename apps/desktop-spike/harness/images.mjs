import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { basename, extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { PNG } from "pngjs"
import { locate, runBounded } from "./cli.mjs"
import { imageCommand, imageOutput } from "./image-cli.mjs"

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

export async function imageTrials(cwd, resultDir) {
  const rows = []
  const output = join(resultDir, "images")
  mkdirSync(output, { recursive: true })
  for (const provider of ["codex", "grok"]) {
    for (const [kind, description] of Object.entries(imagePrompts)) {
      const instructions = `Use only your built-in ${provider === "codex" ? "image generation" : "image_gen"} tool exactly once to generate one ${kind === "portrait" ? "square" : "landscape"} image. Do not use any other tools or write files yourself. Then stop.\n\n${description}`
      const executable = locate(provider)
      const version = await runBounded(executable, ["--version"], { cwd })
      const command = imageCommand(provider, cwd, instructions, kind)
      const result = await runBounded(executable, command.args, { cwd, env: command.env, input: command.input, timeout: 240000, limit: 8_388_608 })
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
        const resolved = imageOutput(provider, events)
        const original = join(output, `${provider}-${kind}-original${extname(resolved)}`)
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
