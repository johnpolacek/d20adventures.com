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
  author: string
  image?: string
  draft: boolean
  body: string
}

/** One section of a post, for its contents list. */
export type PostSection = { id: string; title: string }

/** A post as its page draws it: the HTML, its sections and the minutes it takes to read. */
export type RenderedPost = { html: string; sections: PostSection[]; minutes: number }

// A post names its author in its front matter, or it is by the site's one author.
const DEFAULT_AUTHOR = "John Polacek"

function parseFrontmatter(text: string): Record<string, string> {
  const data: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([a-zA-Z]+):\s*(.*)$/)
    if (match) data[match[1]] = match[2].trim().replace(/^["']|["']$/g, "")
  }
  return data
}

/** A markdown file in `content/`, set like a post: its front matter, and its body. */
export async function readPage(file: string): Promise<Update> {
  return readPost(file, path.join(process.cwd(), "content"))
}

async function readPost(file: string, dir = UPDATES_DIR): Promise<Update> {
  const content = await readFile(path.join(dir, file), "utf8")
  const match = content.match(FRONTMATTER_RE)
  const data = match ? parseFrontmatter(match[1]) : {}
  const slug = file.replace(/\.md$/, "")
  return {
    slug,
    title: data.title ?? slug,
    date: data.date ?? "",
    description: data.description ?? "",
    author: data.author || DEFAULT_AUTHOR,
    image: data.image || undefined,
    draft: data.draft === "true",
    body: match ? content.slice(match[0].length) : content,
  }
}

export async function getPosts(): Promise<Update[]> {
  const files = (await readdir(UPDATES_DIR)).filter((file) => file.endsWith(".md"))
  const posts = await Promise.all(files.map((file) => readPost(file)))
  // In development every post shows. On the site a post shows from its date, Chicago time, unless it is a draft.
  const showAll = process.env.NODE_ENV === "development"
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" })
  return posts.filter((post) => showAll || (!post.draft && post.date <= today)).sort((a, b) => b.date.localeCompare(a.date))
}

export async function getPost(slug: string): Promise<Update | undefined> {
  return (await getPosts()).find((post) => post.slug === slug)
}

const escapeHtml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

// What one render gathers as it goes: the depth of the post's top headings, and its sections.
let run: { top: number; sections: PostSection[]; numbered: boolean } = { top: 2, sections: [], numbered: true }

// A prompt longer than this opens folded, behind an Expand button.
const LONG_PROMPT = 600

// A post's top headings are its sections: each is numbered, and has an id for the contents list.
// Every fenced block is drawn as a card with a Copy button (components/updates/post-body.tsx).
// Words after the language name the card. In a block marked `prompt`, a part in [CAPITALS] is a slot for the reader to fill.
// Other code keeps its lines and scrolls sideways.
const CODE_NAMES: Record<string, string> = { sh: "Terminal", bash: "Terminal", zsh: "Terminal", shell: "Terminal", json: "JSON", ts: "TypeScript", tsx: "TypeScript", js: "JavaScript", mjs: "JavaScript", py: "Python", python: "Python", md: "Markdown", css: "CSS", html: "HTML" }
const markdown = new Marked({
  renderer: {
    heading({ tokens, depth, text }) {
      const html = this.parser.parseInline(tokens)
      if (depth !== run.top) return `<h3>${html}</h3>\n`
      const title = text.replace(/[*_`]/g, "")
      let id = slugify(title)
      while (run.sections.some((section) => section.id === id)) id += "-2"
      run.sections.push({ id, title })
      const num = run.numbered ? `<span class="up-num">${String(run.sections.length).padStart(2, "0")}</span>` : ""
      return `<h2 id="${id}">${num}${html}</h2>\n`
    },
    code({ text, lang }) {
      const [kind, ...name] = (lang ?? "").split(/\s+/)
      const prompt = kind === "prompt"
      const title = escapeHtml(name.join(" ") || (prompt ? "Prompt" : CODE_NAMES[kind] ?? (kind ? kind.toUpperCase() : "Code")))
      const escaped = escapeHtml(text)
      const body = prompt ? escaped.replace(/\[[A-Z][^\]a-z]*\]/g, '<span class="up-slot">$&</span>') : escaped
      const long = text.length > LONG_PROMPT
      const more = long ? '<button type="button" class="up-btn is-ghost up-prompt-more" data-expand aria-expanded="false">Expand</button>' : ""
      return `<figure class="up-prompt${prompt ? "" : " is-code"}${long ? " is-long" : ""}"><div class="up-prompt-head"><strong>${title}</strong><button type="button" class="up-btn is-xs" data-copy>Copy</button></div><div class="up-prompt-body"><pre><code>${body}</code></pre></div>${more}</figure>\n`
    },
  },
})

const attribute = (tag: string, name: string) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]

/** A picture standing alone becomes a numbered figure, captioned with its alt text. */
function figures(html: string): string {
  let count = 0
  // Alone in its paragraph, or a block of its own with a tag or nothing after it.
  return html.replace(/<p>(<img\b[^>]*>)<\/p>|(?<=^|\n)(<img\b[^>]*>)(?=\s*(?:<(?!\/p>)|$))/g, (_, inParagraph: string | undefined, alone: string | undefined) => {
    const tag = (inParagraph ?? alone) as string
    count += 1
    const alt = attribute(tag, "alt") ?? ""
    const tall = Number(attribute(tag, "height")) > Number(attribute(tag, "width"))
    // The first picture may be on screen at once, so only the later ones load lazily.
    const img = count > 1 && !/\sloading=/.test(tag) ? tag.replace(/\s*\/?>$/, ' loading="lazy" decoding="async" />') : tag
    const caption = alt ? `<figcaption><span class="up-fig-num">Fig. ${count}</span>${/[.!?]$/.test(alt) ? alt : `${alt}.`}</figcaption>` : ""
    return `<figure class="up-fig${tall ? " is-tall" : ""}">${img}${caption}</figure>`
  })
}

/** A table scrolls sideways in its own frame. Its number cells and its money cells are marked, to be set as figures. */
function tables(html: string): string {
  return html
    .replace(/<table>/g, '<div class="up-table"><table>')
    .replace(/<\/table>/g, "</table></div>")
    .replace(/<td([^>]*)>(\d+)<\/td>/g, '<td$1 class="up-cell-num">$2</td>')
    .replace(/<td([^>]*)>((?:<strong>)?\$[\d.,]+(?:<\/strong>)?)<\/td>/g, '<td$1 class="up-cell-money">$2</td>')
}

/** In a section with one "Explore" link, each picture opens that link too. */
function exploreFigures(html: string): string {
  return html
    .split(/(?=<h[23][ >])/)
    .map((section) => {
      const links = [...section.matchAll(/<a href="([^"]+)">Explore [^<]*<\/a>/g)]
      if (links.length !== 1) return section
      return section.replace(/(<figure class="up-fig[^"]*">)(<img\b[^>]*>)/g, `$1<a href="${links[0][1]}">$2</a>`)
    })
    .join("")
}

// Reading speed, in words a minute.
const READING_SPEED = 200

/** Markdown to HTML, with the post's sections and reading time. A link whose text starts with "Play" is drawn as a button, and one starting "Explore" makes its section's pictures links. */
export function renderPost(post: Update, { numbered = true }: { numbered?: boolean } = {}): RenderedPost {
  const tokens = markdown.lexer(post.body)
  const depths = tokens.flatMap((token) => (token.type === "heading" ? [token.depth as number] : []))
  run = { top: depths.length ? Math.min(...depths) : 2, sections: [], numbered }
  const html = exploreFigures(tables(figures(markdown.parser(tokens)))).replace(/<a href="([^"]+)">(Play [^<]+)<\/a>/g, '<a href="$1" class="up-btn is-primary is-lg up-play">$2</a>')
  // Tags, link addresses and the lines that open and close a fenced block are not read.
  const words = post.body.replace(/<[^>]+>|\]\([^)]*\)|^```.*$/gm, " ").match(/[A-Za-z0-9$][\w'’.$-]*/g)?.length ?? 0
  return { html, sections: run.sections, minutes: Math.max(1, Math.round(words / READING_SPEED)) }
}

/** The post as a markdown file to download: its title, date and link, then its body. */
export function postMarkdown(post: Update): string {
  return `# ${post.title}\n\n${formatPostDate(post.date)} · https://d20adventures.com/updates/${post.slug}\n\n${post.body.trim()}\n`
}

export function formatPostDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
}
