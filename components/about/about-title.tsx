import { TitlePage } from "@/components/updates/title-page"
import "./about-title.css"

/**
 * The title page of /about, dressed as /updates and Contact are: over a pen and ink engraving of a party looking down the road to a walled town, the
 * ornaments, then "About" in ink script, its
 * flourishes running into a map route with mountains, trees and a castle on a hill, then the page's line beneath. The
 * first paragraph after it is set as the lede.
 */
export function AboutTitle({ title, description }: { title: string; description?: string }) {
  return (
    <TitlePage art="/images/updates/about.webp">
      <p className="up-label">The Story So Far</p>
      <h1 className="ab-t">
        <img src="/images/about/title.webp" alt={title} width={2172} height={724} />
      </h1>
      {description && <p className="vn-head-as">{description}</p>}
    </TitlePage>
  )
}
