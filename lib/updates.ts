import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { marked } from "marked"

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
  const showDrafts = process.env.NODE_ENV === "development"
  return posts.filter((post) => showDrafts || !post.draft).sort((a, b) => b.date.localeCompare(a.date))
}

export async function getPost(slug: string): Promise<Update | undefined> {
  return (await getPosts()).find((post) => post.slug === slug)
}

export function renderPost(post: Update): string {
  return marked.parse(post.body, { async: false })
}

export function formatPostDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
}
