"use client"
import { useTransition } from "react"
import { CharacterSelectCard } from "@/components/ui/character-select-card"
import type { PCTemplate } from "@/types/character"
import { softDeleteUserCharacter } from "@/app/_actions/character"

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
        <div key={char.id} className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4">
          <CharacterSelectCard
            character={char}
            buttonLabel="Edit"
            href={`/player/${username}/characters/${characterFiles[i]}/edit`}
            buttonAsChild={true}
            onDelete={() => handleDelete(characterFiles[i])}
          />
        </div>
      ))}
      {isPending && <div className="w-full text-center text-white/60 text-sm">Deleting…</div>}
    </div>
  )
}

export default CharacterGrid
