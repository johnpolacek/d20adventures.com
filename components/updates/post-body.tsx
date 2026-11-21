"use client"

import type { MouseEvent } from "react"

/** A post's HTML. A prompt card's Copy button copies its prompt. */
export function PostBody({ html, className }: { html: string; className: string }) {
  const onClick = async (event: MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-copy]")
    const code = button?.closest("figure")?.querySelector("code")
    if (!button || !code) return
    await navigator.clipboard.writeText(code.textContent ?? "")
    button.textContent = "Copied"
    setTimeout(() => {
      button.textContent = "Copy"
    }, 1600)
  }
  return <div className={className} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}
