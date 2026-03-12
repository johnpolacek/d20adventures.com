"use client"

import { getOtherAdventurePlans } from "@/app/_actions/adventure-plan-actions"
import { AdventurePlanBasicInfo } from "@/components/adventure-plans/adventure-plan-basic-info"
import { AdventurePlanCharactersEdit } from "@/components/adventure-plans/adventure-plan-characters-edit"
import { AdventurePlanEditSidebar } from "@/components/adventure-plans/adventure-plan-edit-sidebar"
import { AdventurePlanFormHeader } from "@/components/adventure-plans/adventure-plan-form-header"
import { AdventurePlanSections } from "@/components/adventure-plans/adventure-plan-sections"
import { useAdventurePlanForm } from "@/components/adventure-plans/hooks/use-adventure-plan-form"
import { useAdventureSections } from "@/components/adventure-plans/hooks/use-adventure-sections"
import { useEncounterHandlers } from "@/components/adventure-plans/hooks/use-encounter-handlers"
import { Button } from "@/components/ui/button"
import type { AdventurePlan } from "@/types/adventure-plan"
import type { Character, PCTemplate } from "@/types/character"
import * as React from "react"
import { toast } from "sonner"

export function AdventurePlanEditForm({ adventurePlan }: { adventurePlan: AdventurePlan }) {
  // Use custom hooks for form state management
  const {
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
    saveAdventurePlan,
    draft,
    setDraft,
  } = useAdventurePlanForm(adventurePlan)

  const sectionHandlers = useAdventureSections(sections, setSections)
  const encounterHandlers = useEncounterHandlers(sections, setSections)

  const [otherAdventurePlans, setOtherAdventurePlans] = React.useState<AdventurePlan[]>([])

  React.useEffect(() => {
    const fetchOtherPlans = async () => {
      try {
        const plans = await getOtherAdventurePlans(adventurePlan.settingId, adventurePlan.id)
        setOtherAdventurePlans(plans)
      } catch (error) {
        console.error("Error fetching other adventure plans:", error)
      }
    }
    fetchOtherPlans()
  }, [adventurePlan.settingId, adventurePlan.id])

  const [availableCharacterOptions, setAvailableCharacterOptions] = React.useState(adventurePlan.availableCharacterOptions || { races: [], archetypes: [] })
  const [premadeOnly, setPremadeOnly] = React.useState(adventurePlan.availableCharacterOptions === undefined)
  const [reorderFlag, setReorderFlag] = React.useState(false)
  // Add local state for nextAdventure
  const [nextAdventure, setNextAdventure] = React.useState(adventurePlan.nextAdventure || "")

  // Sync local state with prop when adventurePlan.nextAdventure changes
  React.useEffect(() => {
    setNextAdventure(adventurePlan.nextAdventure || "")
  }, [adventurePlan.nextAdventure])

  // Character change handlers
  const handleNpcsChange = (newNpcs: Record<string, Character>) => {
    setNpcs(newNpcs)
  }
  const handlePremadePlayerCharactersChange = (newPcs: PCTemplate[]) => {
    setPremadePlayerCharacters(newPcs)
  }

  // Wrapper handlers for the generic component
  const handleNpcsChangeWrapper = (characters: Record<string, Character> | PCTemplate[]) => {
    if (Array.isArray(characters)) {
      // This shouldn't happen for NPCs, but handle gracefully
      console.warn("NPCs handler received array instead of object")
      return
    }
    handleNpcsChange(characters)
  }

  const handlePremadePlayerCharactersChangeWrapper = (characters: Record<string, Character> | PCTemplate[]) => {
    if (!Array.isArray(characters)) {
      // This shouldn't happen for PCs, but handle gracefully
      console.warn("Premade PCs handler received object instead of array")
      return
    }
    handlePremadePlayerCharactersChange(characters)
  }

  // Image handlers with auto-save
  const handleImageChange = async (newUrl: string) => {
    setImage(newUrl)
    if (newUrl) {
      await saveAdventurePlan(newUrl, undefined, premadeOnly ? undefined : availableCharacterOptions)
    }
  }

  const handleImageRemove = async () => {
    setImage("")
    await saveAdventurePlan("", undefined, premadeOnly ? undefined : availableCharacterOptions)
  }

  // Download handler
  const handleDownload = () => {
    const currentAdventurePlan: AdventurePlan = {
      ...adventurePlan,
      teaser,
      overview,
      party: [Number(minPartySize), Number(maxPartySize)] as [number, number],
      image,
      sections,
      npcs,
      premadePlayerCharacters,
    }

    const jsonData = JSON.stringify(currentAdventurePlan, null, 2)
    const blob = new Blob([jsonData], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${adventurePlan.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_adventure_plan.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success("Adventure plan downloaded successfully!")
  }

  React.useEffect(() => {
    if (reorderFlag) {
      saveAdventurePlan(undefined, undefined, premadeOnly ? undefined : availableCharacterOptions)
      setReorderFlag(false)
    }
  }, [reorderFlag])

  return (
    <div className="pb-8 flex flex-wrap h-[80vh]">
      <AdventurePlanFormHeader
        isSaving={isSaving}
        onDownload={handleDownload}
        onSave={(overrideImage, overrideDraft) => saveAdventurePlan(overrideImage, overrideDraft)}
        draft={draft}
        setDraft={setDraft}
      />
      <AdventurePlanEditSidebar
        adventurePlan={{ ...adventurePlan, sections }}
        onReorderEncounters={(sectionIndex, sceneIndex, newOrder) => {
          setSections((prevSections) => {
            const updatedSections = prevSections.map((section, sIdx) => {
              if (sIdx !== sectionIndex) return section
              return {
                ...section,
                scenes: section.scenes.map((scene, scIdx) => {
                  if (scIdx !== sceneIndex) return scene
                  // Reorder encounters in this scene
                  const newEncounters = newOrder.map((id) => scene.encounters.find((e) => e.id === id)).filter(Boolean) // filter out any not found
                  return { ...scene, encounters: newEncounters as typeof scene.encounters }
                }),
              }
            })
            setReorderFlag(true)
            return updatedSections
          })
        }}
      />

      <div
        id="adventure-plan-main"
        className="flex-1 pt-2 pr-3 -mr-3 h-full overflow-y-auto scroll-smooth [scrollbar-width:thin] [scrollbar-color:dimgray_black] [&::-webkit-scrollbar-track]:bg-black [&::-webkit-scrollbar-thumb]:bg-black [&::-webkit-scrollbar]:w-1"
      >
        <AdventurePlanBasicInfo
          adventurePlanId={adventurePlan.id}
          settingId={adventurePlan.settingId}
          image={image}
          teaser={teaser}
          overview={overview}
          minPartySize={minPartySize}
          maxPartySize={maxPartySize}
          isSaving={isSaving}
          onImageChange={handleImageChange}
          onImageRemove={handleImageRemove}
          onTeaserChange={setTeaser}
          onOverviewChange={setOverview}
          onMinPartySizeChange={setMinPartySize}
          onMaxPartySizeChange={setMaxPartySize}
          premadeOnly={premadeOnly}
          setPremadeOnly={setPremadeOnly}
          availableCharacterOptions={availableCharacterOptions}
          setAvailableCharacterOptions={setAvailableCharacterOptions}
          nextAdventure={nextAdventure}
          setNextAdventure={setNextAdventure}
          otherAdventurePlans={otherAdventurePlans}
          saveAdventurePlan={saveAdventurePlan}
        />

        {/* Remove the Next Adventure Selection UI here, as it is now in AdventurePlanBasicInfo */}

        <AdventurePlanSections
          adventurePlanId={adventurePlan.id}
          settingId={adventurePlan.settingId}
          sections={sections}
          availableNpcs={npcs}
          isSaving={isSaving}
          onSectionTitleChange={sectionHandlers.handleSectionTitleChange}
          onSectionSummaryChange={sectionHandlers.handleSectionSummaryChange}
          onSceneTitleChange={sectionHandlers.handleSceneTitleChange}
          onSceneSummaryChange={sectionHandlers.handleSceneSummaryChange}
          onEncounterTitleChange={encounterHandlers.handleEncounterTitleChange}
          onEncounterIntroChange={encounterHandlers.handleEncounterIntroChange}
          onEncounterIdChange={encounterHandlers.handleEncounterIdChange}
          onEncounterInstructionsChange={encounterHandlers.handleEncounterInstructionsChange}
          onEncounterSkipInitialNpcTurnsChange={encounterHandlers.handleEncounterSkipInitialNpcTurnsChange}
          onEncounterResetHealthChange={encounterHandlers.handleEncounterResetHealthChange}
          onEncounterImageChange={encounterHandlers.handleEncounterImageChange}
          onEncounterDelete={encounterHandlers.handleEncounterDelete}
          onEncounterTransitionsChange={encounterHandlers.handleEncounterTransitionsChange}
          onEncounterNpcChange={encounterHandlers.handleEncounterNpcChange}
          onAddEncounter={sectionHandlers.handleAddEncounter}
          onAddSection={sectionHandlers.handleAddSection}
          onNpcsChange={handleNpcsChange}
          setNpcs={setNpcs}
          maxPartySize={Number(maxPartySize)}
        />

        <AdventurePlanCharactersEdit
          id="npcs-editor"
          type="npcs"
          characters={npcs}
          onCharactersChange={handleNpcsChangeWrapper}
          isSaving={isSaving}
          adventurePlanId={adventurePlan.id}
          settingId={adventurePlan.settingId}
        />

        <AdventurePlanCharactersEdit
          id="premade-pcs-editor"
          type="premadePlayerCharacters"
          characters={premadePlayerCharacters}
          onCharactersChange={handlePremadePlayerCharactersChangeWrapper}
          isSaving={isSaving}
          adventurePlanId={adventurePlan.id}
          settingId={adventurePlan.settingId}
        />

        <div className="flex flex-col items-end gap-4 mt-8 px-4 pb-8">
          <Button variant="epic" size="sm" onClick={() => saveAdventurePlan(undefined, undefined, premadeOnly ? undefined : availableCharacterOptions)} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}
