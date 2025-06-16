"use client"
import { useState } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import type { PCTemplate } from "@/types/character"
import { getImageUrl } from "@/lib/utils"

export default function ChooseCharacterView({
  characters,
  characterFiles,
  userId,
  settingId,
  adventurePlanId,
}: {
  characters: PCTemplate[]
  characterFiles: string[]
  userId: string
  settingId: string
  adventurePlanId: string
}) {
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleChoose(characterFile: string) {
    setSubmitting(true)
    const { createAdventure } = await import("@/app/_actions/create-adventure")
    await createAdventure({
      settingId,
      adventurePlanId,
      characterChoices: [{ characterId: `characters/${userId}/${characterFile}.json`, mode: "player" }],
    })
    // Optionally redirect or show a success message here
    setSubmitting(false)
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="mb-8 text-2xl font-display text-amber-400">Choose Your Character</div>
      <div className="flex flex-wrap gap-8 justify-center mb-8 w-full max-w-6xl">
        {characters.map((char, i) => (
          <div
            onClick={() => {
              setSelectedCharacter(characterFiles[i])
              handleChoose(characterFiles[i])
            }}
            key={char.id}
            className="w-full sm:w-1/2 md:w-1/3 lg:w-1/4 cursor-pointer"
          >
            <div
              className={`bg-black rounded-lg overflow-hidden flex flex-col items-center ring-8 ring-white/10 hover:ring-primary-400 border border-white/10 pb-6 font-display transition-all ease-in-out duration-500 hover:scale-105 ${selectedCharacter === characterFiles[i] ? "ring-amber-400 border-amber-400" : ""}`}
            >
              <div className="w-full h-48 relative">
                {char.image ? <Image src={getImageUrl(char.image)} alt={char.name} fill={true} className="object-cover w-full h-full" /> : <span className="text-xs text-white/40">No Image</span>}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
              </div>
              <div className="font-bold text-3xl text-amber-400 mb-1 truncate w-full text-center">{char.name}</div>
              <div className="text-base mb-4 text-center">
                {char.gender} {char.race} {char.archetype}
              </div>
              <Button variant="epic" className="text-sm" size="sm" disabled={submitting}>
                Choose
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
