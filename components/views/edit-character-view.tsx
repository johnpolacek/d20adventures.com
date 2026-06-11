"use client"

import { useParams, useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { editCharacterTemplateAction } from "@/app/_actions/edit-character-template"
import { CharacterCard } from "@/components/adventure-plans/character-card"
import type { Character, PCTemplate } from "@/types/character"
import { Button } from "../ui/button"

export function EditCharacterView({ character }: { character: PCTemplate }) {
  const [charState, setCharState] = useState<PCTemplate>(character)
  const [isSaving, startSaving] = useTransition()
  const params = useParams()
  const router = useRouter()

  function updateCharacter(updates: Partial<Character | PCTemplate>) {
    setCharState((prev) => ({
      ...prev,
      ...updates,
      type: "pc",
      attributes: {
        strength: updates.attributes?.strength ?? prev.attributes.strength ?? 1,
        dexterity: updates.attributes?.dexterity ?? prev.attributes.dexterity ?? 1,
        constitution: updates.attributes?.constitution ?? prev.attributes.constitution ?? 1,
        intelligence: updates.attributes?.intelligence ?? prev.attributes.intelligence ?? 1,
        wisdom: updates.attributes?.wisdom ?? prev.attributes.wisdom ?? 1,
        charisma: updates.attributes?.charisma ?? prev.attributes.charisma ?? 1,
      },
    }))
  }
  function getCharacter() {
    return charState
  }

  async function handleSave() {
    startSaving(async () => {
      const filename = params.characterId as string
      const result = await editCharacterTemplateAction({ character: charState, filename })
      if (result.success) {
        toast.success("Character updated!")
        router.push(`/player/${params.username}`)
      } else {
        toast.error(result.error || "Failed to update character")
      }
    })
  }

  return (
    <div className="relative z-10 space-y-6 pt-12">
      <h3 className="text-2xl font-bold text-amber-400 font-display text-center">Edit Character</h3>
      <CharacterCard
        charId={charState.id}
        char={charState}
        isNpcs={false}
        isSaving={isSaving}
        settingId={""}
        adventurePlanId={""}
        uniqueKey={charState.id}
        editing={true}
        updateCharacter={(_id, updates) => updateCharacter(updates)}
        getCharacter={getCharacter}
        className="bg-black/50 ring-8 ring-black/30 bg-gradient-to-tl from-black/70 via-black/90 to-black/30 border border-white/10"
      />
      <div className="flex justify-center pt-4 gap-8">
        <Button variant="ghost" onClick={() => router.push(`/player/${params.username}`)}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving} variant="epic">
          {isSaving ? "Saving..." : "Save Character"}
        </Button>
      </div>
    </div>
  )
}
