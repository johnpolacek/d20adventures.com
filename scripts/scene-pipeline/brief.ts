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
 *   --sets <file>    JSON array of {id, summary} for sets already authored (reuse decisions)
 *   --art-direction <file>  setting art-direction markdown (default: content/settings/<setting>/art-direction.md)
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
import { loadAdventurePlanForRuntime } from "@/lib/wiki-adventures/plan-view"

const BRIEF_MODEL_ID = "gemini-3.6-flash"

function parseArgs(argv: string[]) {
  const positional: string[] = []
  let settingId = "realm-of-myr"
  let generate = false
  let setsFile: string | undefined
  let artDirectionFile: string | undefined
  let outRoot = path.join("out", "scene-pipeline")

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--setting") settingId = argv[++i]
    else if (arg === "--generate") generate = true
    else if (arg === "--sets") setsFile = argv[++i]
    else if (arg === "--art-direction") artDirectionFile = argv[++i]
    else if (arg === "--out") outRoot = argv[++i]
    else positional.push(arg)
  }

  const [planId, encounterId] = positional
  if (!planId || !encounterId) throw new Error("Usage: tsx scripts/scene-pipeline/brief.ts <planId> <encounterId> [--setting id] [--generate] [--sets file.json] [--out dir]")
  return { planId, encounterId, settingId, generate, setsFile, artDirectionFile: artDirectionFile ?? path.join("content", "settings", settingId, "art-direction.md"), outRoot }
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

async function fetchReferenceImage(url: string, dir: string): Promise<{ file: string; data: Uint8Array; mediaType: string } | null> {
  const response = await fetch(url)
  if (!response.ok) {
    console.warn(`[scene-pipeline] reference image fetch failed (${response.status}): ${url}`)
    return null
  }
  const mediaType = response.headers.get("content-type")?.split(";")[0] || "image/png"
  const ext = mediaType === "image/jpeg" ? "jpg" : mediaType === "image/webp" ? "webp" : "png"
  const data = new Uint8Array(await response.arrayBuffer())
  const file = path.join(dir, `reference.${ext}`)
  await fs.writeFile(file, data)
  return { file, data, mediaType }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const plan = await loadAdventurePlanForRuntime(args.settingId, args.planId)
  const existingSets: SceneBriefSetCandidate[] | undefined = args.setsFile ? JSON.parse(await fs.readFile(args.setsFile, "utf8")) : undefined
  const artDirection = await readArtDirection(args.artDirectionFile)
  const input = sceneBriefInputFromPlan(plan, args.encounterId, { existingSets, artDirection })

  const dir = path.join(args.outRoot, args.encounterId)
  await fs.mkdir(dir, { recursive: true })

  const request = buildBriefRequestPrompt(input)
  await fs.writeFile(path.join(dir, "brief-request.md"), request)
  console.log(`wrote ${path.join(dir, "brief-request.md")}`)
  if (input.referenceImageUrl) console.log(`reference image: ${input.referenceImageUrl}`)
  else console.warn("[scene-pipeline] encounter has no reference image; the brief will be text-only")

  if (!args.generate) return

  const reference = input.referenceImageUrl ? await fetchReferenceImage(input.referenceImageUrl, dir) : null
  const content: Exclude<UserModelMessage["content"], string> = [{ type: "text", text: request }]
  if (reference) content.push({ type: "image", image: reference.data, mediaType: reference.mediaType })
  const message: UserModelMessage = { role: "user", content }

  const result = await generateText({ model: google(BRIEF_MODEL_ID), messages: [message], temperature: 0.7, maxOutputTokens: 4000 })
  const brief = result.text.trim()
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
