import type { Metadata } from "next"
import Link from "next/link"
import { share } from "@/lib/share"
import { formatPostDate, getPosts, renderPost, type Update } from "@/lib/updates"
import { TitlePage, Tally } from "@/components/updates/title-page"

// Rebuilt at most hourly, so a post dated today appears within the hour of midnight, Chicago time, with no deploy.
export const revalidate = 3600

export const metadata: Metadata = {
  ...share({ title: "Updates", description: "What’s new in D20 Adventures, with notes on how it is built." }),
  alternates: { canonical: "./", types: { "application/rss+xml": "/updates/rss.xml" } },
}

/** The list's title page, over a herald reading a proclamation in a market square. */
function Header() {
  return (
    <TitlePage art="/images/updates/herald.webp">
      <p className="up-label">Notes from the Road</p>
      <h1>Updates</h1>
      <p className="vn-head-as">What’s new in D20 Adventures, and how it is built</p>
    </TitlePage>
  )
}

/** The /vision emblem a post wears, read from its slug and title. Gameplay videos take the stage. */
function emblem(post: Update) {
  const t = `${post.slug} ${post.title}`.toLowerCase()
  if (t.includes("gameplay")) return "graphics"
  if (t.includes("baldur") || t.includes("open source")) return "open-source"
  if (t.includes("figure") || t.includes("character")) return "characters"
  if (t.includes("multiplayer")) return "multiplayer"
  if (t.includes("rules")) return "rules"
  return "create"
}

/** Each post as a full-width band, led by its emblem, the newest one larger. */
export default async function UpdatesPage() {
  const posts = await getPosts()
  return (
    <>
      <Header />
      <div className="vn-wrap is-edge">
        <ul className="ul-bands">
          {posts.map((post, i) => (
            <li key={post.slug} className={`ul-band${i === 0 ? " is-lead" : ""}`}>
              <Link href={`/updates/${post.slug}`} className="ul-band-link">
                <img className="vn-emblem" src={`/images/vision/emblems/${emblem(post)}.webp`} alt="" width={256} height={256} />
                <span className="vn-name">
                  <time className="ul-date" dateTime={post.date}>
                    {formatPostDate(post.date)}
                  </time>
                  <b>{post.title}</b>
                  {post.description && <small>{post.description}</small>}
                </span>
                <Tally counts={renderPost(post)} />
              </Link>
            </li>
          ))}
        </ul>
        <div className="vn-outro">
          <p>
            Follow along by <a href="/updates/rss.xml">RSS</a>, or see how far along it all is on the <a href="/vision">Vision</a> page.
          </p>
        </div>
      </div>
    </>
  )
}
