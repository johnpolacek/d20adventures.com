/**
 * Scene pipeline, stage "brief": turn one encounter of an adventure plan into the
 * prompts that author its 3D set.
 *
 * Writes to out/scene-pipeline/<encounterId>/:
 *   brief-request.md   the prompt that asks a model to write the SCENE BRIEF
 *   brief.md           the brief itself (only with --generate)
 *   scene-prompt.md    the standalone three.js prompt, brief substituted in (only with --generate)
 *   reference.<ext>    the encounter's reference image (only with --generate)
 *
 * Usage:
 *   pnpm exec dotenv -e .env.local -e .env -- tsx scripts/scene-pipeline/brief.ts <planId> <encounterId> [options]
 *
 * Options:
 *   --setting <id>   setting id (default: realm-of-myr)
 *   --generate       call the model to write the brief, then emit scene-prompt.md
 *   --sets <file>    JSON array of {id, summary} of authored sets (default: the setting's entries in lib/scene-sets/manifest.ts)
 *   --art-direction <file>  setting art-direction markdown (default: content/settings/<setting>/art-direction.md)
 *   --image <file|url>  reference image to use instead of the encounter's own
 *   --no-image       ignore the encounter's image (e.g. an exterior shot for an interior scene)
 *   --notes <text>   director's notes: steering that overrides the encounter text ("larger, connected rooms, crowded")
 *   --out <dir>      output root (default: out/scene-pipeline)
 *
 * Without --generate it only writes brief-request.md, for pasting into a stronger
 * model by hand. The lib/ai wrapper is Clerk/token-coupled (server-action context
 * only); --generate talks to the provider directly so this runs headless.
 */
import fs from "node:fs/promises"
import path from "node:path"
import { google } from "@ai-sdk/google"
import { generateText, type UserModelMessage } from "ai"
import { buildBriefRequestPrompt, buildStandaloneScenePrompt, type SceneBriefSetCandidate } from "@/lib/scene-pipeline/brief"
import { sceneBriefInputFromPlan } from "@/lib/scene-pipeline/from-plan"
import { SET_MANIFEST } from "@/lib/scene-sets/manifest"
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"

const BRIEF_MODEL_ID = "gemini-3.6-flash"

function parseArgs(argv: string[]) {
  const positional: string[] = []
  let settingId = "realm-of-myr"
  let generate = false
  let setsFile: string | undefined
  let artDirectionFile: string | undefined
  let image: string | undefined
  let noImage = false
  let notes: string | undefined
  let outRoot = path.join("out", "scene-pipeline")

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--setting") settingId = argv[++i]
    else if (arg === "--generate") generate = true
    else if (arg === "--sets") setsFile = argv[++i]
    else if (arg === "--art-direction") artDirectionFile = argv[++i]
    else if (arg === "--image") image = argv[++i]
    else if (arg === "--no-image") noImage = true
    else if (arg === "--notes") notes = argv[++i]
    else if (arg === "--out") outRoot = argv[++i]
    else positional.push(arg)
  }

  const [planId, encounterId] = positional
  if (!planId || !encounterId) throw new Error("Usage: tsx scripts/scene-pipeline/brief.ts <planId> <encounterId> [--setting id] [--generate] [--sets file.json] [--out dir]")
  return { planId, encounterId, settingId, generate, setsFile, artDirectionFile: artDirectionFile ?? path.join("content", "settings", settingId, "art-direction.md"), image, noImage, notes, outRoot }
}

/** The art-direction entry minus its frontmatter, or undefined when the setting has none. */
async function readArtDirection(file: string): Promise<string | undefined> {
  const raw = await fs.readFile(file, "utf8").catch(() => null)
  if (raw === null) {
    console.warn(`[scene-pipeline] no art-direction file at ${file}; heraldry and palette will be inferred`)
    return undefined
  }
  return raw.replace(/^---[\s\S]*?---\s*/, "").trim()
}

const MEDIA_TYPES: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }

/** Copy a local file or download a URL into the output dir as reference.<ext>. */
async function fetchReferenceImage(source: string, dir: string): Promise<{ file: string; data: Uint8Array; mediaType: string } | null> {
  let data: Uint8Array
  let mediaType: string
  if (/^https?:\/\//.test(source)) {
    const response = await fetch(source)
    if (!response.ok) {
      console.warn(`[scene-pipeline] reference image fetch failed (${response.status}): ${source}`)
      return null
    }
    mediaType = response.headers.get("content-type")?.split(";")[0] || "image/png"
    data = new Uint8Array(await response.arrayBuffer())
  } else {
    data = new Uint8Array(await fs.readFile(source))
    mediaType = MEDIA_TYPES[path.extname(source).slice(1).toLowerCase()] ?? "image/png"
  }
  const ext = mediaType === "image/jpeg" ? "jpg" : mediaType === "image/webp" ? "webp" : "png"
  const file = path.join(dir, `reference.${ext}`)
  await fs.writeFile(file, data)
  return { file, data, mediaType }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const plan = await loadAdventurePlanForRuntime(args.settingId, args.planId)
  const existingSets: SceneBriefSetCandidate[] = args.setsFile
    ? JSON.parse(await fs.readFile(args.setsFile, "utf8"))
    : SET_MANIFEST.filter((entry) => entry.settingId === args.settingId).map((entry) => ({ id: entry.id, summary: entry.summary }))
  const artDirection = await readArtDirection(args.artDirectionFile)
  const input = sceneBriefInputFromPlan(plan, args.encounterId, { existingSets, artDirection })
  input.directorNotes = args.notes
  if (args.noImage) input.referenceImageUrl = undefined
  else if (args.image) input.referenceImageUrl = args.image

  const dir = path.join(args.outRoot, args.encounterId)
  await fs.mkdir(dir, { recursive: true })

  const request = buildBriefRequestPrompt(input)
  await fs.writeFile(path.join(dir, "brief-request.md"), request)
  console.log(`wrote ${path.join(dir, "brief-request.md")}`)
  if (input.referenceImageUrl) console.log(`reference image: ${input.referenceImageUrl}`)
  else console.warn(`[scene-pipeline] ${args.noImage ? "reference image ignored (--no-image)" : "encounter has no reference image"}; the brief is text-only`)

  if (!args.generate) return

  const reference = input.referenceImageUrl ? await fetchReferenceImage(input.referenceImageUrl, dir) : null
  const content: Exclude<UserModelMessage["content"], string> = [{ type: "text", text: request }]
  if (reference) content.push({ type: "image", image: reference.data, mediaType: reference.mediaType })
  const message: UserModelMessage = { role: "user", content }

  const result = await generateText({ model: google(BRIEF_MODEL_ID), messages: [message], temperature: 0.7, maxOutputTokens: 8000 })
  const brief = result.text.trim()
  if (result.finishReason !== "stop") console.warn(`[scene-pipeline] generation finished with reason "${result.finishReason}"; the brief may be incomplete`)
  await fs.writeFile(path.join(dir, "brief.md"), brief)
  console.log(`wrote ${path.join(dir, "brief.md")} (${result.usage?.totalTokens ?? "?"} tokens)`)

  const scenePrompt = buildStandaloneScenePrompt({ encounterTitle: input.encounterTitle, brief, referenceImagePath: reference ? `@${path.basename(reference.file)}` : undefined })
  await fs.writeFile(path.join(dir, "scene-prompt.md"), scenePrompt)
  console.log(`wrote ${path.join(dir, "scene-prompt.md")}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
