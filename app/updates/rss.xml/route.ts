import { SITE_URL } from "@/lib/config"
import { getPosts } from "@/lib/updates"

export const dynamic = "force-static"
// Rebuilt at most hourly, so a post dated today appears within the hour of midnight, Chicago time, with no deploy.
export const revalidate = 3600

const SITE = SITE_URL

function escape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

export async function GET() {
  const posts = await getPosts()
  const items = posts
    .map(
      (post) => `<item>
<title>${escape(post.title)}</title>
<link>${SITE}/updates/${post.slug}</link>
<guid>${SITE}/updates/${post.slug}</guid>
<pubDate>${new Date(`${post.date}T12:00:00Z`).toUTCString()}</pubDate>
<description>${escape(post.description)}</description>
</item>`,
    )
    .join("\n")
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>D20 Adventures Updates</title>
<link>${SITE}/updates</link>
<description>What's new in D20 Adventures.</description>
${items}
</channel>
</rss>`
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } })
}
