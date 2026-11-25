import type { ReactNode } from "react"
import type { RenderedPost } from "@/lib/updates"
import "@/app/vision/vision.css"
import "@/app/updates/look.css"

/** The /vision ornament: a rule each side of a small diamond. */
export function Orn() {
  return (
    <div className="vn-orn" aria-hidden>
      <span />
      <i />
      <span />
    </div>
  )
}

/**
 * A title page across the full width, over a pen and ink engraving, dressed as /vision is (app/updates/look.css). The
 * art fills the header from its top edge, and the dark look turns its ink pale. `post` sets it for a post's title.
 */
export function TitlePage({ art, post, children }: { art: string; post?: boolean; children: ReactNode }) {
  return (
    <header className={`vn-head ul-head${post ? " is-post" : ""}`}>
      <img className="ul-head-art" src={art} alt="" width={2172} height={724} />
      <div className="vn-head-inner">
        <Orn />
        {children}
        <Orn />
      </div>
    </header>
  )
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
 * What a post holds: a short ledger of its minutes, words, pictures and videos, each with a small mark. A count of
 * none is left out. It stands as a column beside a post on the list, and as a row atop a post's own page.
 */
export function Tally({ counts, row }: { counts: Pick<RenderedPost, "minutes" | "words" | "images" | "videos">; row?: boolean }) {
  const rows = [
    { key: "minutes", n: counts.minutes, one: "Min Read", many: "Min Read" },
    { key: "words", n: counts.words, one: "Word", many: "Words" },
    { key: "images", n: counts.images, one: "Image", many: "Images" },
    { key: "videos", n: counts.videos, one: "Video", many: "Videos" },
  ] as const
  return (
    <span className={`ul-tally${row ? " is-row" : ""}`}>
      <span className="ul-tally-rows">
        {rows
          .filter((r) => r.n > 0)
          .map((r) => (
            <span key={r.key} className="ul-tally-row">
              <svg viewBox="0 0 16 16" aria-hidden>
                {marks[r.key]}
              </svg>
              <span className="ul-tally-n">{r.n}</span>
              <span className="ul-tally-label">{r.n === 1 ? r.one : r.many}</span>
            </span>
          ))}
      </span>
    </span>
  )
}
