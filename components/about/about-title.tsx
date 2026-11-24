import "./about-title.css"

/**
 * The title of /about: "About" in ink script, its flourishes running into a map route with mountains, trees and a castle
 * on a hill, across the width of the window. The first paragraph after it is set as the lede.
 */
export function AboutTitle({ title }: { title: string }) {
  return (
    <header className="ab-t">
      <h1>
        <img src="/images/about/title.webp" alt={title} width={2172} height={724} />
      </h1>
    </header>
  )
}
