"use client"
import { ChevronDoubleLeftIcon } from "@heroicons/react/24/outline"
import Link from "next/link"
import { type CSSProperties, useEffect, useState } from "react"
import PartySetup from "@/components/adventure/party-setup"
import { Button, buttonClassName, buttonStyle } from "@d20/ui/button"
import { Card } from "@d20/ui/card"
import { Swap } from "@d20/ui/presence"
import { CharacterSelectCard } from "@/components/adventure/character-select-card"
import Image from "@d20/ui/native-image"
import type { PCTemplate } from "@/types/character"
import { textShadow, textShadowSpread } from "@d20/ui/typography/styles"
import { scrollToTop } from "@d20/ui/scroll"

type ChooseStep =
  | { kind: "picking"; selectedFile: string | null }
  | { kind: "submitting"; selectedFile: string }
  | { kind: "party_setup"; selectedFile: string }

export default function ChooseCharacterView({
  username,
  characters,
  characterFiles,
  userId,
  settingId,
  adventurePlanId,
  adventureTitle,
  adventureTeaser,
  premadeCompanions = [],
  party = [1, 1],
}: {
  username: string
  characters: PCTemplate[]
  characterFiles: string[]
  userId: string
  settingId: string
  adventurePlanId: string
  adventureTitle: string
  adventureTeaser: string
  premadeCompanions?: PCTemplate[]
  party?: [number, number]
}) {
  const [step, setStep] = useState<ChooseStep>({ kind: "picking", selectedFile: null })
  // When the adventure has premade companions, picking a character advances to
  // a party-setup step instead of creating the adventure immediately.
  const hasPartyStep = premadeCompanions.length > 0

  // The party step is much shorter than the character grid, so an inherited
  // scroll position would leave its heading tucked under the fixed header.
  useEffect(() => {
    scrollToTop()
  }, [step.kind])

  async function handleChoose(characterFile: string) {
    if (step.kind === "submitting") return
    if (hasPartyStep) {
      setStep({ kind: "party_setup", selectedFile: characterFile })
      return
    }
    setStep({ kind: "submitting", selectedFile: characterFile })
    try {
      const { createAdventure } = await import("@/app/_actions/create-adventure")
      await createAdventure({
        settingId,
        adventurePlanId,
        characterChoices: [{ characterId: `characters/${userId}/${characterFile}.json`, mode: "player" }],
      })
      // The redirect happens in the server action
    } catch (error) {
      const isRedirectError = error && typeof error === "object" && "digest" in error && String((error as { digest?: string }).digest).includes("NEXT_REDIRECT")
      if (isRedirectError) return
      setStep({ kind: "picking", selectedFile: null })
      throw error
    }
  }

  const selectedCharacter = step.selectedFile
  const selectedIndex = selectedCharacter ? characterFiles.indexOf(selectedCharacter) : -1
  const selectedCharacterSheet = selectedIndex >= 0 ? characters[selectedIndex] : null

  const inPartyStep = step.kind === "party_setup" && selectedCharacter && selectedCharacterSheet
  const submitting = step.kind === "submitting"

  return (
    <Swap id={inPartyStep ? "party" : "choose"} asChild>
      {inPartyStep ? (
        // The fixed header is ~110px tall at desktop widths, so pt-24 (96px) clipped the card.
        <div className="flex flex-col items-center justify-center relative z-10 pt-28 sm:pt-36 pb-12">
          <PartySetup
            settingId={settingId}
            adventurePlanId={adventurePlanId}
            selectedCharacterId={`characters/${userId}/${selectedCharacter}.json`}
            selectedCharacterName={selectedCharacterSheet.name}
            selectedCharacterImage={selectedCharacterSheet.image}
            companions={premadeCompanions}
            party={party}
            onBack={() => setStep({ kind: "picking", selectedFile: null })}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center relative z-10 pt-24 pb-12">
          <Card variant="feature" className="mt-8 mb-12 sm:p-8">
            <div style={textShadow} className="mb-4 text-5xl font-display font-bold text-accent-300">
              {adventureTitle}
            </div>
            <div style={textShadow} className="max-w-4xl mx-auto text-base text-accent-50 text-left text-pretty">
              {adventureTeaser}
            </div>
            <Link href={`/settings/${settingId}/play`} className={buttonClassName("ghost", "sm", "mt-2")} style={buttonStyle("ghost", "sm")}>
              <ChevronDoubleLeftIcon className="w-3 h-3" /> Back to Setting Adventures
            </Link>
          </Card>
          <div style={textShadowSpread} className="mb-8 text-3xl font-display font-bold text-accent-100">
            Choose Your Character
          </div>
          <div className="flex flex-wrap gap-8 justify-center mb-8 w-full max-w-6xl">
            {characters.map((char, i) => (
              <div
                key={char.id}
                className={`enter-rise w-full sm:w-1/2 md:w-1/3 lg:w-1/4 cursor-pointer transition-[scale] ease-snap duration-150${selectedCharacter === characterFiles[i] ? " ring-accent-400 border-accent-400 scale-105" : ""}`}
                style={{ "--i": Math.min(i, 8) } as CSSProperties}
                onClick={() => {
                  void handleChoose(characterFiles[i])
                }}
              >
                <CharacterSelectCard
                  character={char}
                  buttonLabel="Choose"
                  disabled={submitting}
                  clickable={true}
                  className={selectedCharacter === characterFiles[i] ? "ring-accent-400/50 border-accent-400/50 hover:scale-[1.01]" : ""}
                />
              </div>
            ))}
            <div
              className="enter-rise w-full md:w-1/2 lg:w-1/3 cursor-pointer transition-[scale] ease-snap duration-150 hover:scale-[1.01] hover:ring-primary-400 active:scale-100"
              style={{ "--i": Math.min(characters.length, 8) } as CSSProperties}
            >
              <Link href={`/player/${username}/characters/new`}>
                <Card variant="portrait" interactive className="w-full h-full">
                  <div className="w-full aspect-video relative">
                    <Image src="/images/app/characters/default.png" alt="Create New Character" fill={true} className="object-cover w-full h-full" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
                  </div>
                  <div className="pb-6 -mt-10 z-10 relative flex flex-col justify-center items-center">
                    <div className="font-bold text-3xl text-accent-400 -mt-8 mb-4 truncate w-full text-center">Create New Character</div>
                    <Button variant="epic" className="text-sm" size="sm">
                      Create
                    </Button>
                  </div>
                </Card>
              </Link>
            </div>
          </div>
        </div>
      )}
    </Swap>
  )
}
