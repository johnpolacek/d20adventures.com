import type { QueueItem } from "./store"

/**
 * A short handoff prompt for drafting one queue idea in a Claude Code session, which can read the code behind it
 * and make its pictures. Copied from /admin/content, or used when John asks Claude to draft an idea.
 */
export function briefFor(item: QueueItem): string {
  const part = (name: string) => item.sections.find((s) => s.name === name)?.body.trim() ?? ""
  const lines = (label: string, body: string) => (body ? `${label}:\n${body}\n\n` : "")
  return `Draft a post for /updates on D20 Adventures, from the content queue idea content/queue/${item.slug}.md.

Title: ${item.title}
Long title: ${item.longTitle || "(none yet)"}

${lines("What it is about", part("Point"))}${lines("Why a reader wants it", part("Payoff"))}${lines("Stories to use", part("Stories"))}${lines("Facts gathered so far, check each before using it", part("Facts"))}${lines("Commits", item.commits.join(" "))}Read docs/writing-voice.md first and write in John’s voice. Read the code and docs behind these commits for the real detail, and link the thing itself where it can be linked. Never invent a fact, number or reason.

Write it to content/updates/ with draft: true. List the pictures and clips it needs, and make the ones the repo’s tools can make. Don’t publish or post anything.`
}
