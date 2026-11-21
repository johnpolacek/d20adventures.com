import type { Metadata } from "next"
import Link from "next/link"
import { formatPostDate, getPosts } from "@/lib/updates"

// Rebuilt at most hourly, so a post dated today appears within the hour of midnight, Chicago time, with no deploy.
export const revalidate = 3600

export const metadata: Metadata = {
  title: "Updates | D20 Adventures",
  description: "What's new in D20 Adventures.",
  alternates: { canonical: "./", types: { "application/rss+xml": "/updates/rss.xml" } },
}

export default async function UpdatesPage() {
  const posts = await getPosts()
  return (
    <div className="up-layout up-index">
      <div className="up-main">
        <header className="up-title-block">
          <h1>Updates</h1>
        </header>
        <ul className="up-posts">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link href={`/updates/${post.slug}`} className="up-post">
                <div className="up-post-text">
                  <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                  <h2>{post.title}</h2>
                  {post.description && <p>{post.description}</p>}
                  <span className="up-post-more">Read On</span>
                </div>
                {post.image && (
                  // The cover comes from the bucket at one size, so the plain tag serves it as it is.
                  <img className="up-post-cover" src={post.image} alt="" loading="lazy" decoding="async" />
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
