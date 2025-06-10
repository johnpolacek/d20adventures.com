"use client"

import { AdventureSection } from "@/types/adventure-plan"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { EncounterEditForm } from "@/components/adventure-plans/encounter-edit-form"
import { cn } from "@/lib/utils"
import { Plus } from "lucide-react"

interface AdventurePlanSectionsProps {
  adventurePlanId: string
  settingId: string
  sections: AdventureSection[]
  availableNpcs: Record<string, { id: string; name: string }>
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
  onAddEncounter: (sectionIndex: number, sceneIndex: number) => void
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
  onAddEncounter,
}: AdventurePlanSectionsProps) {
  if (sections.length === 0) {
    return <p className="text-sm text-gray-400 italic">This adventure plan currently has no sections defined.</p>
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
                          isSaving={isSaving}
                        />
                      ))}

                      <div className="mt-4 flex justify-center">
                        <Button onClick={() => onAddEncounter(sIndex, scIndex)} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 hover:scale-100">
                          <Plus size={16} />
                          Add Encounter
                        </Button>
                      </div>
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
