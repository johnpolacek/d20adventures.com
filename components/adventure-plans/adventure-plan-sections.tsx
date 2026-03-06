"use client"

import { generateEncounterAction } from "@/app/_actions/generate-encounter"
import { EncounterEditForm } from "@/components/adventure-plans/encounter-edit-form"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { AdventureEncounter, AdventureSection } from "@/types/adventure-plan"
import type { Character } from "@/types/character"
import { Plus, Wand2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

interface AdventurePlanSectionsProps {
  adventurePlanId: string
  settingId: string
  sections: AdventureSection[]
  availableNpcs: Record<string, Character>
  isSaving: boolean
  onSectionTitleChange: (index: number, newTitle: string) => void
  onSectionSummaryChange: (index: number, newSummary: string) => void
  onSceneTitleChange: (sectionIndex: number, sceneIndex: number, newTitle: string) => void
  onSceneSummaryChange: (sectionIndex: number, sceneIndex: number, newSummary: string) => void
  onEncounterTitleChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newTitle: string) => void
  onEncounterIntroChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newIntro: string) => void
  onEncounterIdChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newId: string) => void
  onEncounterInstructionsChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newInstructions: string) => void
  onEncounterSkipInitialNpcTurnsChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newValue: boolean) => void
  onEncounterResetHealthChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newValue: boolean) => void
  onEncounterImageChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newImageUrl: string) => void
  onEncounterDelete: (sectionIndex: number, sceneIndex: number, encounterIndex: number) => void
  onEncounterTransitionsChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newTransitions: { condition: string; encounter: string }[]) => void
  onEncounterNpcChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newNpcs: { id: string; behavior: string; initialInitiative?: number }[]) => void
  onEncounterMapChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, map3d: AdventureEncounter["map3d"]) => void
  onAddEncounter: (sectionIndex: number, sceneIndex: number, newEncounter?: AdventureEncounter) => void
  onAddSection: () => void
  onNpcsChange: (npcs: Record<string, Character>) => void
  setNpcs: React.Dispatch<React.SetStateAction<Record<string, Character>>>
  maxPartySize: number
}

export function AdventurePlanSections({
  adventurePlanId,
  settingId,
  sections,
  availableNpcs,
  isSaving,
  onSectionTitleChange,
  onSectionSummaryChange,
  onSceneTitleChange,
  onSceneSummaryChange,
  onEncounterTitleChange,
  onEncounterIntroChange,
  onEncounterIdChange,
  onEncounterInstructionsChange,
  onEncounterSkipInitialNpcTurnsChange,
  onEncounterResetHealthChange,
  onEncounterImageChange,
  onEncounterDelete,
  onEncounterTransitionsChange,
  onEncounterNpcChange,
  onEncounterMapChange,
  onAddEncounter,
  onAddSection,
  onNpcsChange,
  setNpcs,
  maxPartySize,
}: AdventurePlanSectionsProps) {
  const [generatorOpen, setGeneratorOpen] = React.useState<{ sIndex: number; scIndex: number } | null>(null)
  const [prompt, setPrompt] = React.useState("")
  const [isGenerating, setIsGenerating] = React.useState(false)

  const handleGenerate = async () => {
    if (!generatorOpen) return
    setIsGenerating(true)
    try {
      const newEncounter = await generateEncounterAction({
        prompt,
        sections,
        availableNpcs,
        sectionIndex: generatorOpen.sIndex,
        sceneIndex: generatorOpen.scIndex,
      })
      onAddEncounter(generatorOpen.sIndex, generatorOpen.scIndex, newEncounter)
      toast.success("Encounter generated successfully!")
      setGeneratorOpen(null)
      setPrompt("")
    } catch (error) {
      console.error("Failed to generate encounter:", error)
      toast.error("Failed to generate encounter. Please try again.")
    } finally {
      setIsGenerating(false)
    }
  }

  if (sections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <p className="mb-4 text-muted-foreground">No sections yet. Start by adding your first section!</p>
        <Button onClick={onAddSection} variant="epic" size="sm" className="text-xs px-6 py-3">
          <Plus className="mr-2 h-4 w-4" /> Add Section
        </Button>
      </div>
    )
  }

  return (
    <>
      <h4 className="font-mono pt-12 pb-1 mb-8 border-b-2 border-primary-700/70 text-primary-300 text-center tracking-widest">Adventure Plan</h4>
      {sections.map((section, sIndex) => (
        <div key={sIndex} id={`section-${sIndex}`} className="w-full flex flex-col gap-4 scroll-mt-20">
          {sections.length > 1 && (
            <>
              <h3 className="text-2xl font-bold font-display text-amber-300/80 text-center">{section.title || <span className="italic text-gray-400">Section {sIndex + 1}</span>}</h3>
              <div>
                <label htmlFor={`section-title-${sIndex}`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                  Section Title
                </label>
                <Input
                  id={`section-title-${sIndex}`}
                  value={section.title}
                  onChange={(e) => onSectionTitleChange(sIndex, e.target.value)}
                  placeholder="Enter section title"
                  disabled={isSaving}
                  className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50"
                />
              </div>
              <label htmlFor={`section-summary-${sIndex}`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                Section Summary
              </label>
              <Textarea
                id={`section-summary-${sIndex}`}
                value={section.summary}
                onChange={(e) => onSectionSummaryChange(sIndex, e.target.value)}
                placeholder="Enter section summary"
                rows={3}
                disabled={isSaving}
                className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50"
              />
            </>
          )}

          <div>
            <div>
              {section.scenes.map((scene, scIndex) => (
                <div id={`scene-${sIndex}-${scIndex}`} className={cn(section.scenes.length > 1 && "border border-white/20 rounded-lg p-4 mt-8 flex flex-col gap-4 scroll-mt-20")} key={scIndex}>
                  <div>
                    <h3 className="text-2xl font-bold font-display text-amber-300/80 text-center pb-2">{scene.title || <span className="italic text-gray-400">Scene {scIndex + 1}</span>}</h3>
                    <label htmlFor={`scene-title-${sIndex}-${scIndex}`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                      Scene Title
                    </label>
                    <Input
                      id={`scene-title-${sIndex}-${scIndex}`}
                      value={scene.title}
                      onChange={(e) => onSceneTitleChange(sIndex, scIndex, e.target.value)}
                      placeholder="Enter scene title"
                      disabled={isSaving}
                      className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50"
                    />
                    <label htmlFor={`scene-summary-${sIndex}-${scIndex}`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1 mt-4">
                      Scene Summary
                    </label>
                    <div className="group">
                      <Textarea
                        id={`scene-summary-${sIndex}-${scIndex}`}
                        value={scene.summary}
                        onChange={(e) => onSceneSummaryChange(sIndex, scIndex, e.target.value)}
                        placeholder="Enter scene summary"
                        rows={3}
                        disabled={isSaving}
                        className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50 max-h-[180px] overflow-y-auto group-focus-within:max-h-none"
                      />
                    </div>
                    <p className="text-sm text-white/70 italic pt-2">The scene summary should describe the overall course of the scene for the GameMaster.</p>

                    <div>
                      {scene.encounters.map((encounter, eIndex) => (
                        <EncounterEditForm
                          key={eIndex}
                          id={`encounter-${sIndex}-${scIndex}-${eIndex}`}
                          adventurePlanId={adventurePlanId}
                          settingId={settingId}
                          encounter={encounter}
                          sectionIndex={sIndex}
                          sceneIndex={scIndex}
                          encounterIndex={eIndex}
                          allSections={sections}
                          availableNpcs={availableNpcs}
                          onTitleChange={onEncounterTitleChange}
                          onIntroChange={onEncounterIntroChange}
                          onIdChange={onEncounterIdChange}
                          onInstructionsChange={onEncounterInstructionsChange}
                          onSkipInitialNpcTurnsChange={onEncounterSkipInitialNpcTurnsChange}
                          onResetHealthChange={onEncounterResetHealthChange}
                          onImageChange={onEncounterImageChange}
                          onDelete={onEncounterDelete}
                          onTransitionsChange={onEncounterTransitionsChange}
                          onNpcChange={onEncounterNpcChange}
                          onMapChange={onEncounterMapChange}
                          onNpcsChange={onNpcsChange}
                          setNpcs={setNpcs}
                          isSaving={isSaving}
                          maxPartySize={maxPartySize}
                        />
                      ))}

                      <div className="mt-4 flex justify-center gap-2">
                        <Button onClick={() => onAddEncounter(sIndex, scIndex)} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 hover:scale-100">
                          <Plus size={16} />
                          Add Encounter
                        </Button>
                        <Button
                          onClick={() => setGeneratorOpen({ sIndex, scIndex })}
                          disabled={isSaving || isGenerating}
                          size="sm"
                          variant="outline"
                          className="flex items-center gap-2 hover:scale-100"
                        >
                          <Wand2 size={16} />
                          Generate Encounter
                        </Button>
                      </div>
                      {generatorOpen && generatorOpen.sIndex === sIndex && generatorOpen.scIndex === scIndex && (
                        <div className="mt-4 p-4 border rounded-lg bg-neutral-900/50 border-neutral-700">
                          <h4 className="font-bold mb-2 text-white">Generate Encounter with AI</h4>
                          <Textarea
                            placeholder="e.g., A tense standoff with two goblin guards on a rickety rope bridge over a chasm."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            rows={3}
                            className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50"
                          />
                          <div className="mt-4 flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              onClick={() => {
                                setGeneratorOpen(null)
                                setPrompt("")
                              }}
                            >
                              Cancel
                            </Button>
                            <Button variant="epic" size="sm" className="text-xs px-6 py-3" onClick={handleGenerate} disabled={isGenerating}>
                              {isGenerating ? "Generating..." : "Generate"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  )
}
