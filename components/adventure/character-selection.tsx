"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { useRouter } from "next/navigation"
import type { AdventurePlan } from "@/types/adventure-plan"
import Image from "next/image"
import { Users, User, Bot } from "lucide-react"
import { textShadow } from "@/components/typography/styles"

import { getImageUrl } from "@/lib/utils"

interface CharacterSelectionProps {
  adventurePlan: AdventurePlan
  settingId: string
  adventurePlanId: string
}

interface CharacterChoiceMode {
  characterId: string
  mode: "player" | "invite" | "ai"
}

export default function CharacterSelection({ adventurePlan, settingId, adventurePlanId }: CharacterSelectionProps) {
  const router = useRouter()
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null)
  const [characterChoices, setCharacterChoices] = useState<CharacterChoiceMode[]>([])

  // Initialize character choices when a character is selected
  React.useEffect(() => {
    if (selectedCharacterId && characterChoices.length === 0) {
      const choices: CharacterChoiceMode[] = adventurePlan.premadePlayerCharacters.map((char, index) => ({
        characterId: char.id,
        mode: index === 0 && char.id === selectedCharacterId ? "player" : "ai",
      }))
      setCharacterChoices(choices)
    }
  }, [selectedCharacterId, characterChoices.length, adventurePlan.premadePlayerCharacters])

  const handleCharacterSelect = (characterId: string) => {
    setSelectedCharacterId(characterId)
    // Reset choices and set the selected character as player, others as AI
    const choices: CharacterChoiceMode[] = adventurePlan.premadePlayerCharacters.map((char) => ({
      characterId: char.id,
      mode: char.id === characterId ? "player" : "ai",
    }))
    setCharacterChoices(choices)
  }

  const handleModeChange = (characterId: string, mode: "player" | "invite" | "ai") => {
    setCharacterChoices((prev) => prev.map((choice) => (choice.characterId === characterId ? { ...choice, mode } : choice)))
  }

  const handleStartAdventure = () => {
    if (!selectedCharacterId) return

    // For now, just proceed to the adventure with the selected character
    // TODO: In the future, handle party composition and invites
    const searchParams = new URLSearchParams({
      selectedCharacter: selectedCharacterId,
      // Add other character choices as needed
    })

    router.push(`/settings/${settingId}/${adventurePlanId}?${searchParams.toString()}`)
  }

  return (
    <div
      className="min-h-screen relative"
      style={{
        backgroundImage: `url(${getImageUrl(adventurePlan.image)})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Background overlay for better readability */}
      <div className="absolute inset-0 bg-black/60" />

      <div className="container max-w-5xl mx-auto mt-16 p-8 relative z-10">
        <div className="text-center mb-16">
          <h1 style={textShadow} className="text-5xl font-bold font-display mb-2 text-white">
            {adventurePlan.title}
          </h1>
          <p className="text-gray-200">Choose your character to begin the adventure</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 auto-rows-fr">
          {adventurePlan.premadePlayerCharacters.map((character) => (
            <Card
              key={character.id}
              className={`w-full h-full bg-black/80 border-white/20 scale-95 hover:scale-100 hover:bg-black/90 ring-4 ring-black transition-all duration-500 ease-in-out p-0 overflow-hidden cursor-pointer flex flex-col ${
                selectedCharacterId === character.id ? "ring-8 ring-primary-500 scale-100" : "hover:ring-8 hover:ring-primary-500"
              }`}
              onClick={() => handleCharacterSelect(character.id)}
            >
              <div className="pb-2 relative aspect-[1.25] w-full">
                <div style={textShadow} className="absolute bottom-2 left-0 right-0 text-white w-full text-center font-display text-2xl z-10">
                  <div className="font-bold text-amber-300 pb-1">{character.name}</div>
                  <div className="text-base">
                    {character.gender} {character.race} {character.archetype}
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black to-transparent z-[9]" />
                {character.image && <Image src={getImageUrl(character.image)} alt={character.name} fill className="object-cover" />}
              </div>
              <CardContent className="flex-1 flex flex-col">
                <div className="relative z-10 flex-1 flex flex-col">
                  {character.background && <div className="text-gray-300 text-sm -mt-2 mb-3 flex-1 whitespace-pre-line">{character.background}</div>}
                  <div className="w-full flex justify-center pt-2 pb-8">
                    <Button variant="outline" size="lg" className="text-lg w-36">
                      {selectedCharacterId === character.id ? "Selected" : "Select"}
                    </Button>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1/4 bg-gradient-to-tl from-black/50 to-transparent" />
              </CardContent>
            </Card>
          ))}
        </div>

        {selectedCharacterId && characterChoices.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Party Configuration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {characterChoices.map((choice) => {
                  const character = adventurePlan.premadePlayerCharacters.find((c) => c.id === choice.characterId)
                  if (!character) return null

                  return (
                    <div key={choice.characterId} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <div className="flex items-center gap-3">
                        {character.image && (
                          <div className="w-8 h-8 rounded overflow-hidden">
                            <Image src={getImageUrl(character.image)} alt={character.name} width={32} height={32} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <span className="font-medium">{character.name}</span>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant={choice.mode === "player" ? "ai" : "outline"}
                          onClick={() => handleModeChange(choice.characterId, "player")}
                          disabled={choice.characterId === selectedCharacterId}
                          className="flex items-center gap-1"
                        >
                          <User className="w-3 h-3" />
                          You
                        </Button>
                        <Button
                          size="sm"
                          variant={choice.mode === "invite" ? "ai" : "outline"}
                          onClick={() => handleModeChange(choice.characterId, "invite")}
                          disabled={choice.characterId === selectedCharacterId}
                          className="flex items-center gap-1"
                        >
                          <Users className="w-3 h-3" />
                          Invite
                        </Button>
                        <Button
                          size="sm"
                          variant={choice.mode === "ai" ? "ai" : "outline"}
                          onClick={() => handleModeChange(choice.characterId, "ai")}
                          disabled={choice.characterId === selectedCharacterId}
                          className="flex items-center gap-1"
                        >
                          <Bot className="w-3 h-3" />
                          AI
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {selectedCharacterId && (
          <div className="text-center">
            <Button size="lg" onClick={handleStartAdventure}>
              Start Adventure
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
