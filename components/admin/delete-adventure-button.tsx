"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { deleteAdventureAdmin } from "@/app/_actions/admin/delete-adventure"
import { Button } from "@/components/ui/button"
import type { Id } from "@/convex/_generated/dataModel"

export function DeleteAdventureButton({ adventureId, title }: { adventureId: string; title: string }) {
  const router = useRouter()
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!window.confirm(`Delete "${title}" and all of its turns, chat, and audio? This cannot be undone.`)) return
    setIsDeleting(true)
    setError(null)
    try {
      await deleteAdventureAdmin(adventureId as Id<"adventures">)
      router.refresh()
    } catch (err) {
      console.error("Failed to delete adventure:", err)
      setError(err instanceof Error ? err.message : "Delete failed")
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button className="text-xs text-red-300 border-red-800/60 hover:bg-red-900/40 hover:text-red-200" variant="outline" size="sm" onClick={handleDelete} disabled={isDeleting}>
        {isDeleting ? "Deleting..." : "Delete"}
      </Button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  )
}
