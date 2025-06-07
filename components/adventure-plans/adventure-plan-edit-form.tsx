"use client"

import * as React from "react"
import { AdventurePlan } from "@/types/adventure-plan"
import type { Character, PCTemplate } from "@/types/character"
import { Button } from "@/components/ui/button"
import { AdventurePlanCharactersEdit } from "@/components/adventure-plans/adventure-plan-characters-edit"
import { AdventurePlanEditSidebar } from "@/components/adventure-plans/adventure-plan-edit-sidebar"
import { AdventurePlanFormHeader } from "@/components/adventure-plans/adventure-plan-form-header"
import { AdventurePlanBasicInfo } from "@/components/adventure-plans/adventure-plan-basic-info"
import { AdventurePlanSections } from "@/components/adventure-plans/adventure-plan-sections"
import { useAdventurePlanForm } from "@/components/adventure-plans/hooks/use-adventure-plan-form"
import { useAdventureSections } from "@/components/adventure-plans/hooks/use-adventure-sections"
import { useEncounterHandlers } from "@/components/adventure-plans/hooks/use-encounter-handlers"
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
    availableNpcs,
    saveAdventurePlan,
  } = useAdventurePlanForm(adventurePlan)

  const sectionHandlers = useAdventureSections(sections, setSections)
  const encounterHandlers = useEncounterHandlers(sections, setSections)

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
      await saveAdventurePlan(newUrl)
    }
  }

  const handleImageRemove = async () => {
    setImage("")
    await saveAdventurePlan("")
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

  return (
    <div className="pb-8 flex flex-wrap h-[90vh]">
      <AdventurePlanFormHeader isSaving={isSaving} onDownload={handleDownload} onSave={() => saveAdventurePlan()} />
      <AdventurePlanEditSidebar adventurePlan={{ ...adventurePlan, sections }} />

      <div
        id="adventure-plan-main"
        className="flex-1 pt-2 pr-3 -mr-3 h-full overflow-y-auto [scrollbar-width:thin] [scrollbar-color:dimgray_black] [&::-webkit-scrollbar-track]:bg-black [&::-webkit-scrollbar-thumb]:bg-black [&::-webkit-scrollbar]:w-1"
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
        />

        <AdventurePlanSections
          adventurePlanId={adventurePlan.id}
          settingId={adventurePlan.settingId}
          sections={sections}
          availableNpcs={availableNpcs}
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
          <Button variant="epic" size="sm" onClick={() => saveAdventurePlan()} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}
