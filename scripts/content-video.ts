/**
 * Gameplay videos: a record of when each was recorded, and a draft of the posts each one can carry, from the
 * commits made since the video before it.
 *
 *   pnpm content:video add <youtube url> --at 2026-11-21T00:20 --title "D20 Adventures - Gameplay 11-21-2026"
 *   pnpm content:video draft            the latest video
 *   pnpm content:video draft 2          the third video in the list
 *
 * The record lives in content/queue/videos.json, synced to the private bucket with the rest of the queue.
 */
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { syncQueue } from "../lib/content-queue/sync"
import { CONTEXT, claude, scrub, section, sharedVoice, titleGuide } from "./content-mine"

const REPO = path.resolve(__dirname, "..")
const QUEUE = path.join(REPO, "content/queue")
const VIDEOS = path.join(QUEUE, "videos.json")

type Video = { title: string; recorded: string; recordedNote?: string; youtube: string | null; queued?: string }
type Clip = { change: string; post: string; clip: string }
type Draft = { title: string; longTitle: string; changes: { group: string; items: string[] }[]; clips: Clip[] }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

function readVideos(): Video[] {
  return fs.existsSync(VIDEOS) ? JSON.parse(fs.readFileSync(VIDEOS, "utf8")) : []
}

function writeVideos(list: Video[]) {
  fs.writeFileSync(VIDEOS, `${JSON.stringify(list, null, 2)}\n`)
}

// A time without an offset is Chicago time, where John records.
function chicago(at: string): string {
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(at)) return new Date(at).toISOString()
  const guess = new Date(`${at}Z`)
  const offset = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", timeZoneName: "shortOffset" })
    .formatToParts(guess)
    .find((p) => p.type === "timeZoneName")?.value.replace("GMT", "") || "-6"
  const hours = Number(offset.split(":")[0])
  return new Date(guess.getTime() - hours * 3_600_000).toISOString()
}

function commitsBetween(from: string, to: string): string {
  const out = execFileSync("git", ["log", `--since=${from}`, `--until=${to}`, "--no-merges", "--reverse", "--format=%x1e%h %s%x1f%b"], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  })
  return out
    .split("\x1e")
    .filter((s) => s.trim())
    .map((rec) => {
      const [head, body = ""] = rec.split("\x1f")
      const detail = body.replace(/Co-Authored-By:.*$/gim, "").trim().replace(/\s+/g, " ").slice(0, 400)
      return `- ${head.trim()}${detail ? `\n  ${detail}` : ""}`
    })
    .join("\n")
}

// The voice sections a short post needs, from the shared guide John edits, then this site's own social rules.
function voiceGuide(): string {
  const doc = sharedVoice()
  const site = fs.readFileSync(path.join(REPO, "docs/writing-voice.md"), "utf8")
  return [section(doc, "Voice in a nutshell"), section(doc, "Social threads"), section(site, "Social posts")].filter(Boolean).join("\n\n")
}

function draftPrompt(video: Video, commits: string): string {
  return `${CONTEXT}

John recorded a gameplay video of D20 Adventures${video.youtube ? ` (${video.youtube})` : ""}. Below are the commits made since his previous gameplay video. Work out what changed that a viewer can see or hear in the game, and draft the posts this video can carry.

Rules:
- Only changes a player would notice: how it looks, sounds, plays, reads, or how the game master behaves. Skip tooling, tests, refactors, admin pages, docs, the website's own pages, and posts.
- Never invent a change, number or reason. Every item must come from the commits.
- Plain words a player understands. No file names, function names or internal terms.

Return only a JSON object:
{
  "title": the video's short title,
  "longTitle": the video's long title,
  "changes": [{"group": "Stage and Visuals" | "Sound" | "GM and Rules" | "Play UI" | another short group name, "items": [one short sentence per change]}],
  "clips": [3 to 6 of the most watchable changes, best first: {"change": what changed, "post": a short post for X and Bluesky in John's voice, under 260 characters, no hashtags, no link, "clip": what moment of the video to cut, 5 to 15 seconds}]
}

How to title, from John's voice guide:
${titleGuide()}

How John writes short posts:
${voiceGuide()}

Commits:
${scrub(commits)}`
}

function parseObject(text: string): Draft {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const raw = fenced ? fenced[1] : text
  return JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1))
}

function writeItem(video: Video, draft: Draft): string {
  const day = new Date(video.recorded).toLocaleDateString("en-CA", { timeZone: "America/Chicago" })
  const slug = `gameplay-${day}`
  const q = (s: string) => JSON.stringify(s)
  const changes = draft.changes.map((g) => `**${g.group}**\n\n${g.items.map((i) => `- ${i}`).join("\n")}`).join("\n\n")
  const clips = draft.clips.map((c, i) => `${i + 1}. ${c.change}\n   - Post: ${c.post}\n   - Clip: ${c.clip}`).join("\n")
  const md = `---
title: ${q(draft.title)}
longTitle: ${q(draft.longTitle)}
kind: video
status: idea
rank: 1
tier: 1
score: 0
scores:
  hook: 0
  payoff: 0
  spread: 0
audience: both
formats:
  - youtube
  - x
  - bluesky
  - reddit
  - screenshot-saturday
asset: ${q(video.youtube ?? "")}
recorded: ${q(video.recorded)}
mined: ${q(new Date().toISOString().slice(0, 10))}
commits: []
sessions: []
posted: {}
---

## Point

A gameplay video recorded ${day}, showing what changed since the last one.

## Changes

${changes}

## Clips

${clips}

## X

${draft.clips[0]?.post ?? ""}
`
  fs.writeFileSync(path.join(QUEUE, `${slug}.md`), md)
  return slug
}

async function main() {
  const [command, which] = process.argv.slice(2)
  const videos = readVideos()

  if (command === "add") {
    const url = which
    if (!url?.startsWith("http")) throw new Error("pnpm content:video add <youtube url> [--at <time>] [--title <title>]")
    const recorded = chicago(arg("at") ?? new Date().toISOString())
    videos.push({ title: arg("title") ?? "D20 Adventures gameplay", recorded, youtube: url })
    videos.sort((a, b) => a.recorded.localeCompare(b.recorded))
    writeVideos(videos)
    console.log(`recorded ${recorded}, ${videos.length} videos`)
    return void (await syncQueue())
  }

  if (command === "draft") {
    const i = which === undefined ? videos.length - 1 : Number(which)
    const video = videos[i]
    const before = videos[i - 1]
    if (!video || !before) throw new Error("need a video with one recorded before it")
    const commits = commitsBetween(before.recorded, video.recorded)
    console.log(`${commits.split("\n- ").length} commits between ${before.recorded} and ${video.recorded}`)
    const draft = parseObject(await claude(draftPrompt(video, commits)))
    const slug = writeItem(video, draft)
    videos[i] = { ...video, queued: slug }
    writeVideos(videos)
    console.log(`content/queue/${slug}.md: ${draft.title}`)
    return void (await syncQueue())
  }

  console.log("pnpm content:video add <youtube url> [--at <time>] [--title <title>]\npnpm content:video draft [index]")
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message ?? e)
    process.exit(1)
  })
}
