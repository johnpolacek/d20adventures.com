import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { Marked } from "marked"

const UPDATES_DIR = path.join(process.cwd(), "content/updates")
const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/

export type Update = {
  slug: string
  title: string
  date: string
  description: string
  image?: string
  draft: boolean
  body: string
}

function parseFrontmatter(text: string): Record<string, string> {
  const data: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z]+):\s*(.*)$/)
    if (match) data[match[1]] = match[2].trim().replace(/^["']|["']$/g, "")
  }
  return data
}

async function readPost(file: string): Promise<Update> {
  const content = await readFile(path.join(UPDATES_DIR, file), "utf8")
  const match = content.match(FRONTMATTER_RE)
  const data = match ? parseFrontmatter(match[1]) : {}
  const slug = file.replace(/\.md$/, "")
  return {
    slug,
    title: data.title ?? slug,
    date: data.date ?? "",
    description: data.description ?? "",
    image: data.image || undefined,
    draft: data.draft === "true",
    body: match ? content.slice(match[0].length) : content,
  }
}

export async function getPosts(): Promise<Update[]> {
  const files = (await readdir(UPDATES_DIR)).filter((file) => file.endsWith(".md"))
  const posts = await Promise.all(files.map(readPost))
  // In development every post shows. On the site a post shows from its date, Chicago time, unless it is a draft.
  const showAll = process.env.NODE_ENV === "development"
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" })
  return posts.filter((post) => showAll || (!post.draft && post.date <= today)).sort((a, b) => b.date.localeCompare(a.date))
}

export async function getPost(slug: string): Promise<Update | undefined> {
  return (await getPosts()).find((post) => post.slug === slug)
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

// A fenced block marked `prompt` is drawn as a prompt card with a Copy button (components/updates/post-body.tsx).
const markdown = new Marked({
  renderer: {
    code({ text, lang }) {
      if (lang !== "prompt") return false
      return `<figure class="update-prompt not-prose"><figcaption><span>Prompt</span><button type="button" data-copy>Copy</button></figcaption><pre><code>${escapeHtml(text)}</code></pre></figure>`
    },
  },
})

/** Markdown to HTML. A link whose text starts with "Play" is drawn as a button. */
export function renderPost(post: Update): string {
  const html = markdown.parse(post.body, { async: false })
  return html.replace(/<a href="([^"]+)">(Play [^<]+)<\/a>/g, '<a href="$1" class="update-play stage-brass">$2</a>')
}

/** The post as a markdown file to download: its title, date and link, then its body. */
export function postMarkdown(post: Update): string {
  return `# ${post.title}\n\n${formatPostDate(post.date)} · https://d20adventures.com/updates/${post.slug}\n\n${post.body.trim()}\n`
}

export function formatPostDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
}
