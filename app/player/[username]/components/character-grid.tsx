"use client"
import { type CSSProperties, useTransition } from "react"
import { softDeleteUserCharacter } from "@/app/_actions/character"
import { CharacterSelectCard } from "@/components/adventure/character-select-card"
import { Presence } from "@d20/ui/presence"
import type { PCTemplate } from "@/types/character"

interface CharacterGridProps {
  username: string
  characters: PCTemplate[]
  characterFiles: string[]
}

export function CharacterGrid({ username, characters, characterFiles }: CharacterGridProps) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = (fileId: string) => {
    if (!confirm("Delete this character? This can be undone by admins, but it will be removed from your list.")) return
    startTransition(async () => {
      await softDeleteUserCharacter(fileId)
      // Force a refresh so server page re-fetches characters
      window.location.reload()
    })
  }

  return (
    <div className="flex flex-wrap gap-6 justify-center">
      {characters.map((char, i) => (
        <div key={char.id} className="enter-rise w-full sm:w-1/2 md:w-1/3 lg:w-1/4" style={{ "--i": Math.min(i, 8) } as CSSProperties}>
          <CharacterSelectCard
            character={char}
            buttonLabel="Edit"
            href={`/player/${username}/characters/${characterFiles[i]}/edit`}
            onDelete={() => handleDelete(characterFiles[i])}
          />
        </div>
      ))}
      <Presence show={isPending} asChild motion="fade">
        <div className="w-full text-center text-white/60 text-sm">Deleting…</div>
      </Presence>
    </div>
  )
}

export default CharacterGrid
