/**
 * pnpm content:brief <slug>: prints a short handoff prompt for a Claude Code session to draft the post for one
 * queue idea. The session reads the code and docs behind the idea, writes the post in John's voice, and names the
 * pictures it needs. Drafting needs an agent that can open files and take pictures, so it is a prompt, not a script.
 */
import { readItem } from "../lib/content-queue/store"

const slug = process.argv[2]
if (!slug) {
  console.error("pnpm content:brief <slug>")
  process.exit(1)
}

const item = readItem(slug)
const part = (name: string) => item.sections.find((s) => s.name === name)?.body.trim() ?? ""
const lines = (label: string, body: string) => (body ? `${label}:\n${body}\n` : "")

console.log(`Draft a post for /updates on D20 Adventures.

Title: ${item.title}
Long title: ${item.longTitle || "(none yet)"}

${lines("What it is about", part("Point"))}${lines("Why a reader wants it", part("Payoff"))}${lines("Stories to use", part("Stories"))}${lines("Facts gathered so far, check each before using it", part("Facts"))}${lines("Commits", item.commits.join(" "))}
Read docs/writing-voice.md first and write in John’s voice. Read the code and docs behind these commits for the real detail, and link the thing itself where it can be linked. Never invent a fact, number or reason.

Write it to content/updates/<slug>.md with draft: true. List the pictures and clips it needs, and make the ones the repo’s tools can make. Don’t publish or post anything.`)
