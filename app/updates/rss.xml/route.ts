import { getPosts } from "@/lib/blog"

export const dynamic = "force-static"

const SITE = "https://d20adventures.com"

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export async function GET() {
  const posts = await getPosts()
  const items = posts
    .map(
      (post) => `<item>
<title>${escape(post.title)}</title>
<link>${SITE}/blog/${post.slug}</link>
<guid>${SITE}/blog/${post.slug}</guid>
<pubDate>${new Date(`${post.date}T12:00:00Z`).toUTCString()}</pubDate>
<description>${escape(post.description)}</description>
</item>`,
    )
    .join("\n")
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>D20 Adventures Blog</title>
<link>${SITE}/blog</link>
<description>What's new in D20 Adventures.</description>
${items}
</channel>
</rss>`
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } })
}
