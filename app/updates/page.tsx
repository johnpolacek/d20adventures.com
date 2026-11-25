import type { Metadata } from "next"
import Link from "next/link"
import { share } from "@/lib/share"
import { formatPostDate, getPosts, renderPost, type Update } from "@/lib/updates"
import "@/app/vision/vision.css"
import "./index.css"

// Rebuilt at most hourly, so a post dated today appears within the hour of midnight, Chicago time, with no deploy.
export const revalidate = 3600

export const metadata: Metadata = {
  ...share({ title: "Updates", description: "What’s new in D20 Adventures, with notes on how it is built." }),
  alternates: { canonical: "./", types: { "application/rss+xml": "/updates/rss.xml" } },
}

function Orn() {
  return (
    <div className="vn-orn" aria-hidden>
      <span />
      <i />
      <span />
    </div>
  )
}

/**
 * A title page over a pen and ink engraving of a herald reading a proclamation in a market square, dressed as /vision
 * is. The dark look turns its ink pale, as /vision does.
 */
function Header() {
  return (
    <header className="vn-head ul-head">
      <img className="ul-head-art" src="/images/updates/herald.webp" alt="" width={2020} height={724} />
      <div className="vn-head-inner">
        <Orn />
        <p className="up-label">Notes from the Road</p>
        <h1>Updates</h1>
        <p className="vn-head-as">What’s new in D20 Adventures, and how it is built</p>
        <Orn />
      </div>
    </header>
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

/** Small line marks for the tally, drawn in the ink at the stroke of the /vision rings. */
const marks = {
  minutes: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M8 5v3l2 1.5" />
    </>
  ),
  words: <path d="M3 4h10M3 8h10M3 12h6" />,
  images: (
    <>
      <rect x="2.5" y="3" width="11" height="10" rx="1" />
      <path d="M2.5 11l3.5-3.5 3 3 2-2 2.5 2.5" />
      <circle cx="10.5" cy="6" r="1" />
    </>
  ),
  videos: (
    <>
      <circle cx="8" cy="8" r="5.5" />
      <path d="M6.75 5.75v4.5L10.5 8z" />
    </>
  ),
}

/**
 * What a post holds, down the band's right side: a short ledger of its minutes, words, pictures and videos, each with
 * a small mark. A count of none is left out.
 */
function Tally({ post }: { post: Update }) {
  const { minutes, words, images, videos } = renderPost(post)
  const rows = [
    { key: "minutes", n: minutes, one: "Min Read", many: "Min Read" },
    { key: "words", n: words, one: "Word", many: "Words" },
    { key: "images", n: images, one: "Image", many: "Images" },
    { key: "videos", n: videos, one: "Video", many: "Videos" },
  ] as const
  return (
    <span className="ul-tally">
      <span className="ul-tally-rows">
        {rows
          .filter((row) => row.n > 0)
          .map((row) => (
            <span key={row.key} className="ul-tally-row">
              <svg viewBox="0 0 16 16" aria-hidden>
                {marks[row.key]}
              </svg>
              <span className="ul-tally-n">{row.n.toLocaleString("en-US")}</span>
              <span className="ul-tally-label">{row.n === 1 ? row.one : row.many}</span>
            </span>
          ))}
      </span>
    </span>
  )
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
                <Tally post={post} />
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
