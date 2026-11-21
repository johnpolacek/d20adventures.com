"use client"

import { Button } from "@d20/ui/button"
import type { MouseEvent, ReactNode } from "react"

/** A button's label reads "Copied" for a moment. */
function flashCopied(button: HTMLButtonElement) {
  const label = button.dataset.label ?? button.textContent ?? ""
  button.dataset.label = label
  button.textContent = "Copied"
  button.classList.add("is-copied")
  setTimeout(() => {
    button.textContent = label
    button.classList.remove("is-copied")
  }, 1600)
}

/** A post's HTML. A prompt card's Copy button copies its prompt, and a long prompt's Expand button unfolds it. */
export function PostBody({ html, className }: { html: string; className: string }) {
  const onClick = async (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    const copy = target.closest<HTMLButtonElement>("[data-copy]")
    if (copy) {
      const code = copy.closest("figure")?.querySelector("code")
      if (!code) return
      await navigator.clipboard.writeText(code.textContent ?? "")
      flashCopied(copy)
      return
    }
    const expand = target.closest<HTMLButtonElement>("[data-expand]")
    const card = expand?.closest("figure")
    if (!expand || !card) return
    const open = card.classList.toggle("is-open")
    expand.textContent = open ? "Collapse" : "Expand"
    expand.setAttribute("aria-expanded", String(open))
    if (!open) card.scrollIntoView({ block: "nearest" })
  }
  return <div className={className} onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />
}

/** Copies the page's address, without any #section. */
export function CopyLinkButton({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <Button
      variant="plain"
      className={className}
      onClick={async (event) => {
        const button = event.currentTarget
        await navigator.clipboard.writeText(location.href.split("#")[0])
        const label = button.querySelector<HTMLElement>("[data-label]")
        if (!label) return
        const text = label.textContent
        label.textContent = "Copied"
        setTimeout(() => {
          label.textContent = text
        }, 1600)
      }}
    >
      {children}
    </Button>
  )
}
