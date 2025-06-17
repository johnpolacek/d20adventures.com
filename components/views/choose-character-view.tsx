"use client"
import { useState } from "react"
import { textShadow } from "../typography/styles"
import { CharacterSelectCard } from "@/components/ui/character-select-card"
import type { PCTemplate } from "@/types/character"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function ChooseCharacterView({
  username,
  characters,
  characterFiles,
  userId,
  settingId,
  adventurePlanId,
}: {
  username: string
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
    <div className="flex flex-col items-center justify-center relative z-10 py-12">
      <div style={textShadow} className="mb-8 text-2xl font-display font-bold text-amber-400">
        Choose Your Character
      </div>
      <div className="flex flex-wrap gap-8 justify-center mb-8 w-full max-w-6xl">
        {characters.map((char, i) => (
          <div
            key={char.id}
            className={
              "w-full sm:w-1/2 md:w-1/3 lg:w-1/4 cursor-pointer transition-all ease-in-out duration-500" + (selectedCharacter === characterFiles[i] ? " ring-amber-400 border-amber-400 scale-105" : "")
            }
            onClick={() => {
              setSelectedCharacter(characterFiles[i])
              handleChoose(characterFiles[i])
            }}
          >
            <CharacterSelectCard character={char} buttonLabel="Choose" disabled={submitting} className={selectedCharacter === characterFiles[i] ? "ring-amber-400 border-amber-400 scale-105" : ""} />
          </div>
        ))}
      </div>
      <div className="flex flex-col items-center justify-center">
        <Link href={`/player/${username}/characters/new`}>
          <Button size="sm" className="text-sm" variant="epic">
            Create New Character
          </Button>
        </Link>
      </div>
    </div>
  )
}
