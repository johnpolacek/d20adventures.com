"use client"

import { useEffect, useState } from "react"
import type { PostSection } from "@/lib/updates"

// A section counts as current once its heading is this far from the top of the window.
const CURRENT_LINE = 120

/** A post's contents list. The section being read is marked as the page scrolls. */
export function PostContents({ sections }: { sections: PostSection[] }) {
  const [current, setCurrent] = useState<string>()

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      let id: string | undefined
      for (const section of sections) {
        const heading = document.getElementById(section.id)
        if (heading && heading.getBoundingClientRect().top <= CURRENT_LINE) id = section.id
      }
      setCurrent(id)
    }
    const onScroll = () => {
      frame ||= requestAnimationFrame(update)
    }
    update()
    addEventListener("scroll", onScroll, { passive: true })
    return () => {
      removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [sections])

  return (
    <ol>
      {sections.map((section) => (
        <li key={section.id}>
          <a href={`#${section.id}`} aria-current={section.id === current ? "true" : undefined}>
            {section.title}
          </a>
        </li>
      ))}
    </ol>
  )
}
