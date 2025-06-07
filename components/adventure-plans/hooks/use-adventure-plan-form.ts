import * as React from "react"
import { AdventurePlan, AdventureSection } from "@/types/adventure-plan"
import type { Character, PCTemplate } from "@/types/character"
import { updateAdventurePlanAction } from "@/app/_actions/adventure-plan-actions"
import { toast } from "sonner"

export function useAdventurePlanForm(adventurePlan: AdventurePlan) {
  const [teaser, setTeaser] = React.useState(adventurePlan.teaser)
  const [overview, setOverview] = React.useState(adventurePlan.overview)
  const [minPartySize, setMinPartySize] = React.useState(adventurePlan.party ? adventurePlan.party[0] : 1)
  const [maxPartySize, setMaxPartySize] = React.useState(adventurePlan.party ? adventurePlan.party[1] : 1)
  const [image, setImage] = React.useState(adventurePlan.image || "")
  const [sections, setSections] = React.useState<AdventureSection[]>(adventurePlan.sections || [])
  const [npcs, setNpcs] = React.useState<Record<string, Character>>(adventurePlan.npcs || {})
  const [premadePlayerCharacters, setPremadePlayerCharacters] = React.useState<PCTemplate[]>(adventurePlan.premadePlayerCharacters || [])
  const [isSaving, setIsSaving] = React.useState(false)

  const saveAdventurePlan = async (overrideImage?: string) => {
    setIsSaving(true)
    const imageToSave = overrideImage !== undefined ? overrideImage : image
    const updatedAdventurePlan: AdventurePlan = {
      ...adventurePlan,
      teaser,
      overview,
      party: [Number(minPartySize), Number(maxPartySize)] as [number, number],
      image: imageToSave,
      sections,
      npcs,
      premadePlayerCharacters,
    }

    try {
      const result = await updateAdventurePlanAction({ adventurePlan: updatedAdventurePlan })
      if (result.success) {
        toast.success(result.message || "Saved successfully!")
      } else {
        toast.error(result.error || "Failed to save.")
      }
    } catch (error) {
      console.error("Error during save operation:", error)
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred."
      toast.error(`Error: ${errorMessage}`)
    } finally {
      setIsSaving(false)
    }
  }

  const availableNpcs = React.useMemo(() => {
    const npcOptions: Record<string, { id: string; name: string }> = {}
    Object.entries(npcs).forEach(([npcId, npcData]) => {
      npcOptions[npcId] = {
        id: npcId,
        name: npcData.name || npcId,
      }
    })
    return npcOptions
  }, [npcs])

  return {
    // State
    teaser,
    setTeaser,
    overview,
    setOverview,
    minPartySize,
    setMinPartySize,
    maxPartySize,
    setMaxPartySize,
    image,
    setImage,
    sections,
    setSections,
    npcs,
    setNpcs,
    premadePlayerCharacters,
    setPremadePlayerCharacters,
    isSaving,
    availableNpcs,
    // Actions
    saveAdventurePlan,
  }
} 