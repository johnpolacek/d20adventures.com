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

${lines("What it is about", part("Point"))}${lines("Topic intro", part("Intro") || part("Angle"))}${lines("Why a reader wants it", part("Payoff"))}${lines("The list, each item a thing and what we did, with its picture", part("Items"))}${lines("Stories to use", part("Stories"))}${lines("Pictures from the sessions, look at each before using it", part("Pictures"))}${lines("The conclusion", part("Conclusion"))}${lines("Pages to link in the conclusion", part("Links"))}${lines("Questions for John, ask them before drafting", part("Questions for John"))}${lines("Facts gathered so far, check each before using it", part("Facts"))}${lines("Commits", item.commits.join(" "))}${dossierOrSessions(item)}Read docs/writing-voice.md first, its Patterns that work above all, and write in John’s voice. The post takes the shape there: title, topic intro, the list, and a conclusion linking to these pages. Read the code and docs behind these commits for the real detail, and link the thing itself where it can be linked. Never invent a fact, number or reason.

Make it useful to someone doing the same thing. Mine the commits and sessions for tips they can use: the setting, prompt or step that worked, what failed first and the fix, the number that decided it. John’s prompts and the final replies hold the decisions, so skip tool output. Every tip needs a source in a commit or session. Keep secrets, keys and private paths out.

Every item gets a picture or a clip. Use the one the plan names after looking at it. Where the plan says To make, make it: screenshots and clips of the game from the desktop app (D20 Adventures Dev, through computer use) or the stage preview at /dev/stage, as AGENTS.md and packages/stage/AGENTS.md describe. Convert each to webp at most 1600 wide in public/images/updates/<post>/, link it by its bucket URL with its measured size, and name any you could not make in a comment at the top. Never use a picture that shows anything private.

Write it to content/updates/ with draft: true, then set status: draft and post: <the post's slug> in the front matter of content/queue/${item.slug}.md, so the queue shows it as a draft. Don’t upload, publish or post anything. Once John has read it, pnpm stage:sync public/images/updates/<post> uploads the pictures.`
}

/**
 * Once an idea has its /updates post: a prompt for a Claude Code session to write the X thread and the Reddit
 * post from it, into the idea's file.
 */
export function socialBriefFor(item: QueueItem): string {
  return `Write the social posts for the D20 Adventures post content/updates/${item.post}.md, into the content queue idea content/queue/${item.slug}.md.

Read docs/writing-voice.md first, with the shared guide it points to, especially its Social threads, and this site’s Social posts.

X, under “## X”: a thread that follows the post section by section, in order, with each section’s own picture. One post per section, each under 280 characters, the first carrying the whole idea, the last only the link to the post at https://d20adventures.com/updates/${item.post}. Separate posts with a line of ---. Put each picture as [image: url] and its alt text as [alt: text] on the lines after the post’s words, using the post’s own image URLs and alt text. Don’t add @mentions: the queue page suggests them for John to click in. If the post names a tool, product or person missing from lib/content-queue/handles.json, find its X handle on the official site and add it there with where you found it.

Reddit, under “## Reddit”: name the subreddit that fits, then a title and a native retelling for that sub, with the link once at the end.

Make each post worth reading on its own. Lead with the most useful tip in its section, the specific setting, step or fix, not a summary of the section. Use only facts in the post. If a section has no tip worth posting, say so to John rather than padding it. Then run pnpm content:sync. Don’t post or schedule anything.`
}

// A planned idea has its sessions scrubbed into content/queue/dossiers/<slug>/, which beats the raw logs.
function dossierOrSessions(item: QueueItem): string {
  if (item.sections.some((s) => s.name === "Items" || s.name === "Stories")) {
    return `Sessions, scrubbed, with every picture in them:\ncontent/queue/dossiers/${item.slug}/sessions.md and images.md\n\n`
  }
  return item.sessions.length ? `Agent sessions:\n${sessionPaths(item.sessions)}\n\n` : ""
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
