"use client"
import { useState } from "react"
import { textShadow, textShadowSpread } from "../typography/styles"
import { CharacterSelectCard } from "@/components/ui/character-select-card"
import type { PCTemplate } from "@/types/character"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import Image from "next/image"

export default function ChooseCharacterView({
  username,
  characters,
  characterFiles,
  userId,
  settingId,
  adventurePlanId,
  adventureTitle,
  adventureTeaser,
}: {
  username: string
  characters: PCTemplate[]
  characterFiles: string[]
  userId: string
  settingId: string
  adventurePlanId: string
  adventureTitle: string
  adventureTeaser: string
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
    // The redirect happens in the server action
    setSubmitting(false)
  }

  return (
    <div className="flex flex-col items-center justify-center relative z-10 pt-24 pb-12">
      <Card className="text-center mt-8 mb-12 p-8 bg-gradient-to-tl from-black/80 to-black/50 border-none ring-8 ring-black/20">
        <div style={textShadow} className="mb-4 text-5xl font-display font-bold text-amber-300">
          {adventureTitle}
        </div>
        <div style={textShadow} className="max-w-4xl mx-auto text-base text-amber-50 text-left text-pretty">
          {adventureTeaser}
        </div>
      </Card>
      <div style={textShadowSpread} className="mb-8 text-3xl font-display font-bold text-amber-100">
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
            <CharacterSelectCard
              character={char}
              buttonLabel="Choose"
              disabled={submitting}
              clickable={true}
              className={selectedCharacter === characterFiles[i] ? "ring-amber-400/50 border-amber-400/50 hover:scale-[1.01]" : ""}
            />
          </div>
        ))}
        {/* Create New Character Card */}
        <div className="w-full md:w-1/2 lg:w-1/3 cursor-pointer transition-all ease-in-out duration-500 hover:scale-[1.01] hover:ring-primary-400">
          <Link href={`/player/${username}/characters/new`}>
            <Card className="bg-black text-white rounded-lg overflow-hidden flex flex-col items-center ring-8 ring-black/30 border border-white/10 p-0 font-display w-full h-full transition-all ease-in-out duration-500 hover:scale-105 hover:ring-primary-400/80">
              <div className="w-full aspect-video relative">
                <Image src="/images/app/characters/default.png" alt="Create New Character" fill={true} className="object-cover w-full h-full" />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
              </div>
              <div className="pb-6 -mt-10 z-10 relative flex flex-col justify-center items-center">
                <div className="font-bold text-3xl text-amber-400 mb-1 truncate w-full text-center">Create New Character</div>
                <div className="text-base mb-4 text-center">Start a new adventure</div>
                <Button variant="epic" className="text-sm" size="sm">
                  Create
                </Button>
              </div>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  )
}
