"use client"

import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { deleteAdventureAdmin } from "@/app/_actions/admin/delete-adventure"
import { Button } from "@d20/ui/button"
import { Presence, Swap } from "@d20/ui/presence"
import type { Id } from "@/convex/_generated/dataModel"

export function DeleteAdventureButton({ adventureId, title }: { adventureId: string; title: string }) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)

  async function handleDelete() {
    if (!window.confirm(`Delete "${title}" and all of its turns, chat, and audio? This cannot be undone.`)) return
    setIsDeleting(true)
    setError(null)
    try {
      await deleteAdventureAdmin(adventureId as Id<"adventures">)
      // The server draws the table, so the deleted row fades here and the refresh takes it away.
      const row = root.current?.closest("tr")
      row?.classList.remove("enter-fade")
      row?.classList.add("exit-fade")
      router.refresh()
    } catch (err) {
      console.error("Failed to delete adventure:", err)
      setError(err instanceof Error ? err.message : "Delete failed")
      setIsDeleting(false)
    }
  }

  return (
    <div ref={root} className="flex flex-col items-start gap-1">
      <Button variant="plain" className="up-btn is-xs is-bad" onClick={handleDelete} disabled={isDeleting}>
        <Swap id={isDeleting ? "busy" : "idle"} as="span">
          {isDeleting ? "Deleting..." : "Delete"}
        </Swap>
      </Button>
      <Presence show={Boolean(error)} motion="drop" asChild>
        {error && <span className="up-small up-bad !text-xs">{error}</span>}
      </Presence>
    </div>
  )
}
