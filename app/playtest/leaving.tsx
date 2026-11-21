"use client"

import { useLinkStatus } from "next/link"

// Goes inside a link. While the page the link leads to is on its way, it marks the link, and the card that holds the
// link fades out by its `has-[[data-leaving]]:` classes. A click is then answered at once, not when the server replies.
export function Leaving() {
  const { pending } = useLinkStatus()
  return <span hidden data-leaving={pending ? "" : undefined} />
}
