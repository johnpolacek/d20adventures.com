"use client"

import { createPracticeAdventure } from "@/app/_actions/create-adventure"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PCTemplate } from "@/types/character"
import Link from "next/link"
import { useState } from "react"

interface PracticeAdventureSetupProps {
  settingId: string
  adventurePlanId: string
  adventureTitle: string
  minParty: number
  maxParty: number
  premadeCharacters: PCTemplate[]
  savedCharacters: Array<{ key: string; character: PCTemplate }>
}

type SelectableCharacter = {
  id: string
  source: "premade" | "saved"
  characterId: string
  name: string
  archetype: string
  race: string
}

export function PracticeAdventureSetup({
  settingId,
  adventurePlanId,
  adventureTitle,
  minParty,
  maxParty,
  premadeCharacters,
  savedCharacters,
}: PracticeAdventureSetupProps) {
  const [selected, setSelected] = useState<SelectableCharacter[]>([])
  const [isStarting, setIsStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const options: SelectableCharacter[] = [
    ...premadeCharacters.map((character) => ({
      id: `premade:${character.id}`,
      source: "premade" as const,
      characterId: character.id,
      name: character.name,
      archetype: character.archetype,
      race: character.race,
    })),
    ...savedCharacters.map(({ key, character }) => ({
      id: `saved:${key}`,
      source: "saved" as const,
      characterId: key,
      name: character.name,
      archetype: character.archetype,
      race: character.race,
    })),
  ]

  function toggleCharacter(option: SelectableCharacter) {
    setError(null)
    setSelected((prev) => {
      const exists = prev.some((item) => item.id === option.id)
      if (exists) return prev.filter((item) => item.id !== option.id)
      if (prev.length >= maxParty) {
        setError(`You can select up to ${maxParty} characters.`)
        return prev
      }
      return [...prev, option]
    })
  }

  async function handleStartPractice() {
    if (selected.length < minParty) {
      setError(`Select at least ${minParty} characters to start practice mode.`)
      return
    }

    setIsStarting(true)
    setError(null)

    try {
      await createPracticeAdventure({
        settingId,
        adventurePlanId,
        lineup: selected.map((item) => ({
          source: item.source,
          characterId: item.characterId,
        })),
      })
    } catch (err) {
      const isRedirectError =
        err &&
        typeof err === "object" &&
        "digest" in err &&
        String((err as { digest?: string }).digest).includes("NEXT_REDIRECT")

      if (isRedirectError) return

      setError(err instanceof Error ? err.message : "Failed to start practice mode.")
      setIsStarting(false)
    }
  }

  return (
    <div className="max-w-5xl mx-auto w-full">
      <Card className="bg-black/70 border-white/20 mb-8">
        <CardHeader>
          <CardTitle className="font-display text-amber-400 text-3xl">Practice Mode</CardTitle>
          <CardDescription className="text-white/80">
            Start a private rehearsal run for <span className="font-semibold">{adventureTitle}</span>. You will control all selected player characters.
          </CardDescription>
          <CardDescription className="text-primary-200">
            Party size required: {minParty} - {maxParty}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? <div className="text-sm text-red-300 bg-red-900/30 rounded px-3 py-2">{error}</div> : null}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {options.map((option) => {
              const isSelected = selected.some((item) => item.id === option.id)
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => toggleCharacter(option)}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    isSelected ? "border-amber-400 bg-amber-500/10" : "border-white/20 bg-black/40 hover:border-white/40"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="font-display text-lg text-white">{option.name}</div>
                    <div className="text-xxs font-mono uppercase tracking-wide text-primary-200">{option.source === "premade" ? "Premade" : "Saved"}</div>
                  </div>
                  <div className="text-sm text-white/70">
                    {option.race} {option.archetype}
                  </div>
                </button>
              )
            })}
          </div>

          {options.length === 0 ? <div className="text-sm text-white/70">No characters available for this practice run.</div> : null}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
            <div className="text-sm text-white/80">
              Selected: {selected.length} / {maxParty}
            </div>
            <div className="flex items-center gap-3">
              <Link href={`/settings/${settingId}/${adventurePlanId}/edit`}>
                <Button variant="outline" size="sm">
                  Back to Plan
                </Button>
              </Link>
              <Button variant="epic" size="sm" onClick={handleStartPractice} disabled={isStarting || options.length === 0}>
                {isStarting ? "Starting Practice..." : "Start Practice Run"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
