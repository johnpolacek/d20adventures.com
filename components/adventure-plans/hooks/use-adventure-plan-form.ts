import { updateAdventurePlanAction } from "@/app/_actions/adventure-plan-actions"
import type { AdventurePlan, AdventureSection } from "@/types/adventure-plan"
import type { Character, PCTemplate } from "@/types/character"
import * as React from "react"
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
  const [draft, setDraft] = React.useState(adventurePlan.draft !== undefined ? adventurePlan.draft : true)

  const saveAdventurePlan = React.useCallback(
    async (
      overrideImage?: string,
      overrideDraft?: boolean,
      overrideAvailableCharacterOptions?: AdventurePlan["availableCharacterOptions"],
      overrideNextAdventure?: string,
      options?: { silent?: boolean; sections?: AdventureSection[] }
    ) => {
      if (!options?.silent) {
        setIsSaving(true)
      }
      const imageToSave = overrideImage !== undefined ? overrideImage : image
      const draftToSave = overrideDraft !== undefined ? overrideDraft : draft
      const availableCharacterOptionsToSave = overrideAvailableCharacterOptions !== undefined ? overrideAvailableCharacterOptions : adventurePlan.availableCharacterOptions
      const nextAdventureToSave = overrideNextAdventure !== undefined ? overrideNextAdventure : adventurePlan.nextAdventure
      const sectionsToSave = options?.sections ?? sections

      // Filter out empty premade player characters
      const filteredPremadePlayerCharacters = premadePlayerCharacters.filter((pc) => pc.name.trim() !== "" || pc.archetype.trim() !== "" || pc.race.trim() !== "")

      const updatedAdventurePlan: AdventurePlan = {
        ...adventurePlan,
        teaser,
        overview,
        party: [Number(minPartySize), Number(maxPartySize)] as [number, number],
        image: imageToSave,
        sections: sectionsToSave,
        npcs,
        premadePlayerCharacters: filteredPremadePlayerCharacters,
        draft: draftToSave,
        availableCharacterOptions: availableCharacterOptionsToSave,
        nextAdventure: nextAdventureToSave,
      }
      try {
        const result = await updateAdventurePlanAction({ adventurePlan: updatedAdventurePlan })
        if (result.success) {
          if (!options?.silent) {
            toast.success(result.message || "Saved successfully!")
          }
          return true
        } else {
          toast.error(result.error || "Failed to save.")
          return false
        }
      } catch (error) {
        console.error("Error during save operation:", error)
        const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred."
        toast.error(`Error: ${errorMessage}`)
        return false
      } finally {
        if (!options?.silent) {
          setIsSaving(false)
        }
      }
    },
    [adventurePlan, draft, image, maxPartySize, minPartySize, npcs, overview, premadePlayerCharacters, sections, teaser]
  )

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
    draft,
    setDraft,
    // Actions
    saveAdventurePlan,
  }
}
