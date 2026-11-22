import handles from "./handles.json"
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

${lines("What it is about", part("Point"))}${lines("Why a reader wants it", part("Payoff"))}${lines("Stories to use", part("Stories"))}${lines("Facts gathered so far, check each before using it", part("Facts"))}${lines("Commits", item.commits.join(" "))}${lines("Agent sessions", sessionPaths(item.sessions))}Read docs/writing-voice.md first and write in John’s voice. Read the code and docs behind these commits for the real detail, and link the thing itself where it can be linked. Never invent a fact, number or reason.

Make it useful to someone doing the same thing. Mine the commits and sessions for tips they can use: the setting, prompt or step that worked, what failed first and the fix, the number that decided it. John’s prompts and the final replies hold the decisions, so skip tool output. Every tip needs a source in a commit or session. Keep secrets, keys and private paths out.

Write it to content/updates/ with draft: true. List the pictures and clips it needs, and make the ones the repo’s tools can make. Don’t publish or post anything.`
}

/**
 * Once an idea has its /updates post: a prompt for a Claude Code session to write the X thread and the Reddit
 * post from it, into the idea's file.
 */
export function socialBriefFor(item: QueueItem): string {
  return `Write the social posts for the D20 Adventures post content/updates/${item.post}.md, into the content queue idea content/queue/${item.slug}.md.

Read docs/writing-voice.md first, especially Social threads.

X, under “## X”: a thread that follows the post section by section, in order, with each section’s own picture. One post per section, each under 280 characters, the first carrying the whole idea, the last only the link to the post at https://d20adventures.com/updates/${item.post}. Separate posts with a line of ---. Put each picture as [image: url] and its alt text as [alt: text] on the lines after the post’s words, using the post’s own image URLs and alt text. Don’t add @mentions: the queue page suggests them for John to click in. If the post names a tool, product or person missing from lib/content-queue/handles.json, find its X handle on the official site and add it there with where you found it.

Reddit, under “## Reddit”: name the subreddit that fits, then a title and a native retelling for that sub, with the link once at the end.

Make each post worth reading on its own. Lead with the most useful tip in its section, the specific setting, step or fix, not a summary of the section. Use only facts in the post. If a section has no tip worth posting, say so to John rather than padding it. Then run pnpm content:sync. Don’t post or schedule anything.`
}

// Where the miner's session ids live: claude:<first 8 of the id>, codex:<first 8>.
function sessionPaths(ids: string[]): string {
  return ids
    .map((id) => {
      const [kind, short] = id.split(":")
      return kind === "codex" ? `~/.codex/sessions/**/*${short}*.jsonl` : `~/.claude/projects/-Users-johnpolacek-Projects-d20adventures-com/${short}*.jsonl`
    })
    .join("\n")
}

export type Handle = { name: string; as: string; source: string; checked: string }
export const HANDLES = handles as Handle[]

/** Listed names a post says but doesn't tag yet. */
export function missingHandles(text: string): Handle[] {
  return HANDLES.filter((h) => {
    const handle = h.as.match(/@\w+/)?.[0] ?? ""
    return new RegExp(`\\b${h.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(text) && !text.includes(handle)
  })
}

/** Swaps the first plain mention of a name for its tagged form. */
export function tagHandle(text: string, h: Handle): string {
  return text.replace(new RegExp(`\\b${h.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`), h.as)
}
