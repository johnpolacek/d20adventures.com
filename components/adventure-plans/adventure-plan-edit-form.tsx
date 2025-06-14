"use client"

import * as React from "react"
import { AdventurePlan, RULES_PRESETS } from "@/types/adventure-plan"
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
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"

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
    draft,
    setDraft,
  } = useAdventurePlanForm(adventurePlan)

  const sectionHandlers = useAdventureSections(sections, setSections)
  const encounterHandlers = useEncounterHandlers(sections, setSections)

  const [availableCharacterOptions, setAvailableCharacterOptions] = React.useState(adventurePlan.availableCharacterOptions || { races: [], archetypes: [] })
  const [premadeOnly, setPremadeOnly] = React.useState(adventurePlan.availableCharacterOptions === undefined)
  const [reorderFlag, setReorderFlag] = React.useState(false)

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
        />

        {/* New: Available Character Options (Races & Archetypes) */}
        <div className="my-8 space-y-6">
          {/* Premade Characters Only Toggle */}
          <div className="flex items-center gap-4">
            <Switch
              id="premade-only-toggle"
              checked={premadeOnly}
              onCheckedChange={(checked) => {
                setPremadeOnly(checked)
                if (checked) {
                  setAvailableCharacterOptions({ races: [], archetypes: [] })
                } else {
                  setAvailableCharacterOptions(adventurePlan.availableCharacterOptions || { races: [], archetypes: [] })
                }
              }}
              disabled={isSaving}
            />
            <Label htmlFor="premade-only-toggle" className="font-mono text-primary-200">
              Premade Characters Only
            </Label>
          </div>
          {/* Rules System Preset Select (native select) */}
          <div className={cn("flex items-center gap-4", premadeOnly && "hidden")}>
            <Label className="font-mono text-primary-200" htmlFor="rules-preset-select">
              Apply Standard Races & Archetypes:
            </Label>
            <select
              id="rules-preset-select"
              className="w-56 bg-white/5 border border-white/20 rounded px-2 py-1 text-base text-white placeholder:text-white/40"
              onChange={(e) => {
                const val = e.target.value
                if (!val) return
                const preset = RULES_PRESETS.find((p) => p.value === val)
                if (preset) {
                  setAvailableCharacterOptions({
                    races: preset.races,
                    archetypes: preset.archetypes,
                  })
                }
              }}
              disabled={isSaving}
              defaultValue=""
            >
              <option value="" disabled>
                Choose a rules system...
              </option>
              {RULES_PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label}
                </option>
              ))}
            </select>
          </div>
          <div className={cn("flex flex-col md:flex-row gap-8", premadeOnly && "hidden")}>
            <div className="flex-1">
              <Label className="font-mono p-1 text-primary-200" htmlFor="available-races">
                Available Races (comma separated)
              </Label>
              <Input
                id="available-races"
                value={availableCharacterOptions.races.join(", ")}
                onChange={(e) => {
                  const races = e.target.value
                    .split(",")
                    .map((r) => r.trim())
                    .filter(Boolean)
                  setAvailableCharacterOptions((prev) => ({ ...prev, races }))
                }}
                placeholder="e.g., Human, Elf, Dwarf, Halfling"
                disabled={isSaving}
              />
            </div>
            <div className="flex-1">
              <Label className="font-mono p-1 text-primary-200" htmlFor="available-archetypes">
                Available Archetypes (comma separated)
              </Label>
              <Input
                id="available-archetypes"
                value={availableCharacterOptions.archetypes.join(", ")}
                onChange={(e) => {
                  const archetypes = e.target.value
                    .split(",")
                    .map((a) => a.trim())
                    .filter(Boolean)
                  setAvailableCharacterOptions((prev) => ({ ...prev, archetypes }))
                }}
                placeholder="e.g., Fighter, Wizard, Rogue, Bard"
                disabled={isSaving || premadeOnly}
              />
            </div>
          </div>
        </div>

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
          onAddSection={sectionHandlers.handleAddSection}
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
