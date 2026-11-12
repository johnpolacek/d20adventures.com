"use client"

import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { toast } from "sonner"
import { editCharacterTemplateAction } from "@/app/_actions/edit-character-template"
import type { Hero } from "@/apps/desktop/runtime/heroes"
import { HeroCreator } from "@/apps/desktop/src/hero-creator"
import type { PCTemplate } from "@/types/character"

// Editing a hero of the player's own: the creator's review, where their story can change. Their rules change by levels.
export function EditCharacterView({ character }: { character: PCTemplate }) {
  const [busy, setBusy] = useState(false)
  const params = useParams()
  const router = useRouter()
  const back = () => router.push(`/player/${params.username}`)
  return (
    <div className="relative z-10 min-h-screen">
      <HeroCreator
        options={{ races: [], archetypes: [] }}
        // The website's stage reads no chosen figure yet.
        editing={{ ...character, figure: "" } as Hero}
        figures={false}
        busy={busy}
        onDraft={async () => undefined}
        onSave={async ({ figure: _figure, painted: _painted, arrivals: _arrivals, ...hero }) => {
          setBusy(true)
          const result = await editCharacterTemplateAction({ character: hero, filename: params.characterId as string }).catch(() => ({ success: false, error: undefined }))
          setBusy(false)
          if (!result.success) {
            toast.error(result.error || "Failed to update character")
            return false
          }
          toast.success("Character updated!")
          back()
          return true
        }}
        onClose={back}
      />
    </div>
  )
}
