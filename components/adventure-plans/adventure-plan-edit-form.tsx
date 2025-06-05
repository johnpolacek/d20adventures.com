"use client"

import * as React from "react"
import { AdventurePlan, AdventureSection } from "@/types/adventure-plan"
import type { Character } from "@/types/character"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ImageUpload } from "@/components/ui/image-upload"
import { EncounterEditForm } from "@/components/adventure-plans/encounter-edit-form"
import { AdventurePlanNpcsEdit } from "@/components/adventure-plans/adventure-plan-npcs-edit"
import { AdventurePlanEditSidebar } from "@/components/adventure-plans/adventure-plan-edit-sidebar"
import { updateAdventurePlanAction } from "@/app/_actions/adventure-plan-actions"
import { toast } from "sonner"

interface AdventurePlanEditFormProps {
  adventurePlan: AdventurePlan
}

export function AdventurePlanEditForm({ adventurePlan }: AdventurePlanEditFormProps) {
  console.log("AdventurePlanEditForm: Initial adventurePlan.image:", adventurePlan.image)
  const [teaser, setTeaser] = React.useState(adventurePlan.teaser)
  const [overview, setOverview] = React.useState(adventurePlan.overview)
  const [minPartySize, setMinPartySize] = React.useState(adventurePlan.party ? adventurePlan.party[0] : 1)
  const [maxPartySize, setMaxPartySize] = React.useState(adventurePlan.party ? adventurePlan.party[1] : 1)
  const [image, setImage] = React.useState(adventurePlan.image || "")
  const [sections, setSections] = React.useState<AdventureSection[]>(adventurePlan.sections || [])
  const [npcs, setNpcs] = React.useState<Record<string, Character>>(adventurePlan.npcs || {})
  const [isSaving, setIsSaving] = React.useState(false)

  const imageUploadFolder = `images/settings/${adventurePlan.settingId}/${adventurePlan.id}`

  const handleSectionTitleChange = (index: number, newTitle: string) => {
    const updatedSections = sections.map((section, i) => (i === index ? { ...section, title: newTitle } : section))
    setSections(updatedSections)
  }

  const handleSectionSummaryChange = (index: number, newSummary: string) => {
    const updatedSections = sections.map((section, i) => (i === index ? { ...section, summary: newSummary } : section))
    setSections(updatedSections)
  }

  const handleSceneTitleChange = (sectionIndex: number, sceneIndex: number, newTitle: string) => {
    const updatedSections = sections.map((section, sIdx) => {
      if (sIdx === sectionIndex) {
        const updatedScenes = section.scenes.map((scene, scIdx) => {
          if (scIdx === sceneIndex) {
            return { ...scene, title: newTitle }
          }
          return scene
        })
        return { ...section, scenes: updatedScenes }
      }
      return section
    })
    setSections(updatedSections)
  }

  const handleSceneSummaryChange = (sectionIndex: number, sceneIndex: number, newSummary: string) => {
    const updatedSections = sections.map((section, sIdx) => {
      if (sIdx === sectionIndex) {
        const updatedScenes = section.scenes.map((scene, scIdx) => {
          if (scIdx === sceneIndex) {
            return { ...scene, summary: newSummary }
          }
          return scene
        })
        return { ...section, scenes: updatedScenes }
      }
      return section
    })
    setSections(updatedSections)
  }

  const handleEncounterTitleChange = (sectionIndex: number, sceneIndex: number, encounterIndex: number, newTitle: string) => {
    console.log("[AdventurePlanEditForm] handleEncounterTitleChange called")
    console.log("[AdventurePlanEditForm] Indices:", { sectionIndex, sceneIndex, encounterIndex })
    console.log("[AdventurePlanEditForm] New title:", newTitle)
    console.log("[AdventurePlanEditForm] Current sections length:", sections.length)

    const updatedSections = sections.map((section, sIdx) => {
      if (sIdx === sectionIndex) {
        const updatedScenes = section.scenes.map((scene, scIdx) => {
          if (scIdx === sceneIndex) {
            const updatedEncounters = scene.encounters.map((encounter, eIdx) => {
              if (eIdx === encounterIndex) {
                console.log("[AdventurePlanEditForm] Updating encounter:", encounter.id, "from", encounter.title, "to", newTitle)
                const updatedEncounter = { ...encounter, title: newTitle }
                console.log("[AdventurePlanEditForm] Updated encounter object:", updatedEncounter)
                return updatedEncounter
              }
              return encounter
            })
            return { ...scene, encounters: updatedEncounters }
          }
          return scene
        })
        return { ...section, scenes: updatedScenes }
      }
      return section
    })

    console.log("[AdventurePlanEditForm] About to setSections with updated data")
    console.log("[AdventurePlanEditForm] Updated sections:", updatedSections)
    setSections(updatedSections)
  }

  const handleEncounterIntroChange = (sectionIndex: number, sceneIndex: number, encounterIndex: number, newIntro: string) => {
    const updatedSections = sections.map((section, sIdx) => {
      if (sIdx === sectionIndex) {
        const updatedScenes = section.scenes.map((scene, scIdx) => {
          if (scIdx === sceneIndex) {
            const updatedEncounters = scene.encounters.map((encounter, eIdx) => {
              if (eIdx === encounterIndex) {
                return { ...encounter, intro: newIntro }
              }
              return encounter
            })
            return { ...scene, encounters: updatedEncounters }
          }
          return scene
        })
        return { ...section, scenes: updatedScenes }
      }
      return section
    })
    setSections(updatedSections)
  }

  const handleEncounterIdChange = (sectionIndex: number, sceneIndex: number, encounterIndex: number, newId: string) => {
    const updatedSections = sections.map((section, sIdx) => {
      if (sIdx === sectionIndex) {
        const updatedScenes = section.scenes.map((scene, scIdx) => {
          if (scIdx === sceneIndex) {
            const updatedEncounters = scene.encounters.map((encounter, eIdx) => {
              if (eIdx === encounterIndex) {
                return { ...encounter, id: newId }
              }
              return encounter
            })
            return { ...scene, encounters: updatedEncounters }
          }
          return scene
        })
        return { ...section, scenes: updatedScenes }
      }
      return section
    })
    setSections(updatedSections)
  }

  const handleEncounterInstructionsChange = (sectionIndex: number, sceneIndex: number, encounterIndex: number, newInstructions: string) => {
    setSections((prevSections) =>
      prevSections.map((section, sIdx) => {
        if (sIdx === sectionIndex) {
          return {
            ...section,
            scenes: section.scenes.map((scene, scIdx) => {
              if (scIdx === sceneIndex) {
                return {
                  ...scene,
                  encounters: scene.encounters.map((encounter, eIdx) => {
                    if (eIdx === encounterIndex) {
                      return { ...encounter, instructions: newInstructions }
                    }
                    return encounter
                  }),
                }
              }
              return scene
            }),
          }
        }
        return section
      })
    )
  }

  const handleEncounterSkipInitialNpcTurnsChange = (sectionIndex: number, sceneIndex: number, encounterIndex: number, newValue: boolean) => {
    setSections((prevSections) =>
      prevSections.map((section, sIdx) => {
        if (sIdx === sectionIndex) {
          return {
            ...section,
            scenes: section.scenes.map((scene, scIdx) => {
              if (scIdx === sceneIndex) {
                return {
                  ...scene,
                  encounters: scene.encounters.map((encounter, eIdx) => {
                    if (eIdx === encounterIndex) {
                      return { ...encounter, skipInitialNpcTurns: newValue }
                    }
                    return encounter
                  }),
                }
              }
              return scene
            }),
          }
        }
        return section
      })
    )
  }

  const handleEncounterResetHealthChange = (sectionIndex: number, sceneIndex: number, encounterIndex: number, newValue: boolean) => {
    setSections((prevSections) =>
      prevSections.map((section, sIdx) => {
        if (sIdx === sectionIndex) {
          return {
            ...section,
            scenes: section.scenes.map((scene, scIdx) => {
              if (scIdx === sceneIndex) {
                return {
                  ...scene,
                  encounters: scene.encounters.map((encounter, eIdx) => {
                    if (eIdx === encounterIndex) {
                      return { ...encounter, resetHealth: newValue }
                    }
                    return encounter
                  }),
                }
              }
              return scene
            }),
          }
        }
        return section
      })
    )
  }

  const handleEncounterImageChange = (sectionIndex: number, sceneIndex: number, encounterIndex: number, newImageUrl: string) => {
    setSections((prevSections) =>
      prevSections.map((section, sIndex) => {
        if (sIndex === sectionIndex) {
          return {
            ...section,
            scenes: section.scenes.map((scene, scIndex) => {
              if (scIndex === sceneIndex) {
                return {
                  ...scene,
                  encounters: scene.encounters.map((encounter, eIndex) => {
                    if (eIndex === encounterIndex) {
                      return {
                        ...encounter,
                        image: newImageUrl,
                      }
                    }
                    return encounter
                  }),
                }
              }
              return scene
            }),
          }
        }
        return section
      })
    )
  }

  const handleEncounterDelete = (sectionIndex: number, sceneIndex: number, encounterIndex: number) => {
    setSections((prevSections) =>
      prevSections.map((section, sIndex) => {
        if (sIndex === sectionIndex) {
          return {
            ...section,
            scenes: section.scenes.map((scene, scIndex) => {
              if (scIndex === sceneIndex) {
                return {
                  ...scene,
                  encounters: scene.encounters.filter((_, eIndex) => eIndex !== encounterIndex),
                }
              }
              return scene
            }),
          }
        }
        return section
      })
    )
  }

  const handleEncounterTransitionsChange = (sectionIndex: number, sceneIndex: number, encounterIndex: number, newTransitions: { condition: string; encounter: string }[]) => {
    setSections((prevSections) =>
      prevSections.map((section, sIndex) => {
        if (sIndex === sectionIndex) {
          return {
            ...section,
            scenes: section.scenes.map((scene, scIndex) => {
              if (scIndex === sceneIndex) {
                return {
                  ...scene,
                  encounters: scene.encounters.map((encounter, eIndex) => {
                    if (eIndex === encounterIndex) {
                      return { ...encounter, transitions: newTransitions }
                    }
                    return encounter
                  }),
                }
              }
              return scene
            }),
          }
        }
        return section
      })
    )
  }

  const handleNpcsChange = (newNpcs: Record<string, Character>) => {
    setNpcs(newNpcs)
  }

  const handleSave = async () => {
    setIsSaving(true)
    console.log("AdventurePlanEditForm: Saving with image URL:", image)
    const updatedAdventurePlan: AdventurePlan = {
      ...adventurePlan,
      teaser,
      overview,
      party: [Number(minPartySize), Number(maxPartySize)] as [number, number],
      image,
      sections,
      npcs,
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

  return (
    <div className="py-8 flex gap-8 h-[90vh]">
      <AdventurePlanEditSidebar adventurePlan={{ ...adventurePlan, sections }} />
      <div id="adventure-plan-main" className="flex-1 pt-2 h-full overflow-y-auto">
        <div className="grid grid-cols-2 gap-8 pb-4" id="adventure-plan-main-top">
          <div>
            <label htmlFor="adventureImage" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
              Cover Image
            </label>
            <ImageUpload id="adventureImage" value={image} onChange={(newUrl) => setImage(newUrl)} onRemove={() => setImage("")} folder={imageUploadFolder} />
          </div>
          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="teaser" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                Teaser
              </label>
              <Textarea id="teaser" value={teaser} onChange={(e) => setTeaser(e.target.value)} placeholder="A short, enticing teaser for the adventure..." rows={3} disabled={isSaving} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="minPartySize" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                  Min Party Size
                </label>
                <Input
                  id="minPartySize"
                  type="number"
                  value={minPartySize}
                  onChange={(e) => setMinPartySize(parseInt(e.target.value, 10) || 0)}
                  placeholder="Minimum party size"
                  disabled={isSaving}
                  min={1}
                />
              </div>
              <div>
                <label htmlFor="maxPartySize" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                  Max Party Size
                </label>
                <Input
                  id="maxPartySize"
                  type="number"
                  value={maxPartySize}
                  onChange={(e) => setMaxPartySize(parseInt(e.target.value, 10) || 0)}
                  placeholder="Maximum party size"
                  disabled={isSaving}
                  min={minPartySize || 1}
                />
              </div>
            </div>
          </div>
        </div>

        <div>
          <label htmlFor="overview" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
            Overview
          </label>
          <Textarea id="overview" value={overview} onChange={(e) => setOverview(e.target.value)} placeholder="A broader overview of the adventure plan..." rows={6} disabled={isSaving} />
        </div>

        <h4 className="font-mono opacity-70 text-sm pt-12 mb-1 text-indigo-300/80 text-center font-bold tracking-widest uppercase">Adventure Plan Sections</h4>
        {sections.map((section, sIndex) => (
          <div key={sIndex} id={`section-${sIndex}`} className="border-t border-white/20 pt-8 w-full flex flex-col gap-4 scroll-mt-20">
            <h3 className="text-xl font-bold font-display text-amber-300/80 text-center">{section.title || <span className="italic text-gray-400">Untitled Section</span>}</h3>
            <div>
              <label htmlFor={`section-title-${sIndex}`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                Section Title
              </label>
              <Input
                id={`section-title-${sIndex}`}
                value={section.title}
                onChange={(e) => handleSectionTitleChange(sIndex, e.target.value)}
                placeholder="Enter section title"
                disabled={isSaving}
                className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50"
              />
            </div>
            <div>
              <label htmlFor={`section-summary-${sIndex}`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                Section Summary
              </label>
              <Textarea
                id={`section-summary-${sIndex}`}
                value={section.summary}
                onChange={(e) => handleSectionSummaryChange(sIndex, e.target.value)}
                placeholder="Enter section summary"
                rows={3}
                disabled={isSaving}
                className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50"
              />
              <div>
                {section.scenes.map((scene, scIndex) => (
                  <div id={`scene-${sIndex}-${scIndex}`} className="border border-white/20 rounded-lg p-4 mt-8 flex flex-col gap-4 scroll-mt-20" key={scIndex}>
                    <h3 className="text-xl font-bold font-display text-amber-300/80 text-center">{scene.title || <span className="italic text-gray-400">Untitled Scene</span>}</h3>
                    <div>
                      <label htmlFor={`scene-title-${sIndex}-${scIndex}`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                        Scene Title
                      </label>
                      <Input
                        id={`scene-title-${sIndex}-${scIndex}`}
                        value={scene.title}
                        onChange={(e) => handleSceneTitleChange(sIndex, scIndex, e.target.value)}
                        placeholder="Enter scene title"
                        disabled={isSaving}
                        className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50"
                      />
                      <label htmlFor={`scene-summary-${sIndex}-${scIndex}`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1 mt-4">
                        Scene Summary
                      </label>
                      <Textarea
                        id={`scene-summary-${sIndex}-${scIndex}`}
                        value={scene.summary}
                        onChange={(e) => handleSceneSummaryChange(sIndex, scIndex, e.target.value)}
                        placeholder="Enter scene summary"
                        rows={3}
                        disabled={isSaving}
                        className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50"
                      />
                      <div>
                        {scene.encounters.map((encounter, eIndex) => (
                          <EncounterEditForm
                            key={encounter.id || eIndex}
                            id={`encounter-${sIndex}-${scIndex}-${eIndex}`}
                            adventurePlanId={adventurePlan.id}
                            settingId={adventurePlan.settingId}
                            encounter={encounter}
                            sectionIndex={sIndex}
                            sceneIndex={scIndex}
                            encounterIndex={eIndex}
                            allSections={sections}
                            onTitleChange={handleEncounterTitleChange}
                            onIntroChange={handleEncounterIntroChange}
                            onIdChange={handleEncounterIdChange}
                            onInstructionsChange={handleEncounterInstructionsChange}
                            onSkipInitialNpcTurnsChange={handleEncounterSkipInitialNpcTurnsChange}
                            onResetHealthChange={handleEncounterResetHealthChange}
                            onImageChange={handleEncounterImageChange}
                            onDelete={handleEncounterDelete}
                            onTransitionsChange={handleEncounterTransitionsChange}
                            isSaving={isSaving}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
        {sections.length === 0 && <p className="text-sm text-gray-400 italic">This adventure plan currently has no sections defined.</p>}

        <AdventurePlanNpcsEdit id="npcs-editor" npcs={npcs} onNpcsChange={handleNpcsChange} isSaving={isSaving} adventurePlanId={adventurePlan.id} settingId={adventurePlan.settingId} />

        <div className="flex flex-col items-end gap-4 mt-8 px-4">
          <Button variant="epic" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}
