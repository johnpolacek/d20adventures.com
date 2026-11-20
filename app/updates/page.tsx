import type { Metadata } from "next"
import Link from "next/link"
import { Heading } from "@d20/ui/typography/heading"
import { formatPostDate, getPosts } from "@/lib/updates"

export const metadata: Metadata = {
  title: "Updates | D20 Adventures",
  description: "What's new in D20 Adventures.",
  alternates: { types: { "application/rss+xml": "/updates/rss.xml" } },
}

export default async function UpdatesPage() {
  const posts = await getPosts()
  return (
    <div className="container pt-24 pb-12">
      <div className="mx-auto max-w-3xl">
        <Heading variant="h2" as="h1" className="mb-12 text-center">
          Updates
        </Heading>
        <ul className="space-y-10">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link href={`/updates/${post.slug}`} className="group block">
                <time className="text-sm opacity-60">{formatPostDate(post.date)}</time>
                <h2 className="mt-1 font-display text-2xl group-hover:underline underline-offset-4">{post.title}</h2>
                {post.description && <p className="mt-2 opacity-80">{post.description}</p>}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
