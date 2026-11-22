import type { Metadata } from "next"
import Link from "next/link"
import { formatPostDate, getPosts, renderPost } from "@/lib/updates"

// Rebuilt at most hourly, so a post dated today appears within the hour of midnight, Chicago time, with no deploy.
export const revalidate = 3600

export const metadata: Metadata = {
  title: "Updates | D20 Adventures",
  description: "What's new in D20 Adventures.",
  alternates: { canonical: "./", types: { "application/rss+xml": "/updates/rss.xml" } },
}

/** The newest post as a wide row with its cover, then the earlier ones as a tight list of text. */
export default async function UpdatesPage() {
  const [latest, ...earlier] = await getPosts()
  return (
    <div className="up-layout up-index">
      <div className="up-main">
        <header className="up-title-block">
          <h1>Updates</h1>
        </header>
        {latest && (
          <Link href={`/updates/${latest.slug}`} className="up-post up-lead">
            {latest.image && (
              // The cover comes from the bucket at one size, so the plain tag serves it as it is.
              <img className="up-post-cover" src={latest.image} alt="" decoding="async" />
            )}
            <div>
              <time dateTime={latest.date}>{formatPostDate(latest.date)}</time>
              <h2>{latest.title}</h2>
              {latest.description && <p>{latest.description}</p>}
              <span className="up-post-more">Read On</span>
            </div>
          </Link>
        )}
        {earlier.length > 0 && (
          <>
            <div className="up-earlier">
              <h2 className="up-label">Earlier</h2>
              <a href="/updates/rss.xml">RSS</a>
            </div>
            <ul className="up-posts">
              {earlier.map((post) => (
                <li key={post.slug}>
                  <Link href={`/updates/${post.slug}`} className="up-post up-row">
                    <time dateTime={post.date}>{formatPostDate(post.date)}</time>
                    <div>
                      <h3>{post.title}</h3>
                      {post.description && <p>{post.description}</p>}
                    </div>
                    <span className="up-post-min">{renderPost(post).minutes} Min</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
