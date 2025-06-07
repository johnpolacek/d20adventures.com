"use client"

import * as React from "react"
import { AdventurePlan, AdventureSection } from "@/types/adventure-plan"
import type { Character, PCTemplate } from "@/types/character"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ImageUpload } from "@/components/ui/image-upload"
import { EncounterEditForm } from "@/components/adventure-plans/encounter-edit-form"
import { AdventurePlanCharactersEdit } from "@/components/adventure-plans/adventure-plan-characters-edit"
import { AdventurePlanEditSidebar } from "@/components/adventure-plans/adventure-plan-edit-sidebar"
import { updateAdventurePlanAction } from "@/app/_actions/adventure-plan-actions"
import { toast } from "sonner"
import { Download, Loader2, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import slugify from "slugify"

export function AdventurePlanEditForm({ adventurePlan }: { adventurePlan: AdventurePlan }) {
  console.log("AdventurePlanEditForm: Initial adventurePlan.image:", adventurePlan.image)
  const [teaser, setTeaser] = React.useState(adventurePlan.teaser)
  const [overview, setOverview] = React.useState(adventurePlan.overview)
  const [minPartySize, setMinPartySize] = React.useState(adventurePlan.party ? adventurePlan.party[0] : 1)
  const [maxPartySize, setMaxPartySize] = React.useState(adventurePlan.party ? adventurePlan.party[1] : 1)
  const [image, setImage] = React.useState(adventurePlan.image || "")
  const [sections, setSections] = React.useState<AdventureSection[]>(adventurePlan.sections || [])
  const [npcs, setNpcs] = React.useState<Record<string, Character>>(adventurePlan.npcs || {})
  const [premadePlayerCharacters, setPremadePlayerCharacters] = React.useState<PCTemplate[]>(adventurePlan.premadePlayerCharacters || [])
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
    const updatedSections = sections.map((section, sIdx) => {
      if (sIdx === sectionIndex) {
        const updatedScenes = section.scenes.map((scene, scIdx) => {
          if (scIdx === sceneIndex) {
            const updatedEncounters = scene.encounters.map((encounter, eIdx) => {
              if (eIdx === encounterIndex) {
                console.log("[AdventurePlanEditForm] Updating encounter:", encounter.id, "from", encounter.title, "to", newTitle)
                const newId = slugify(newTitle, { lower: true, strict: true })
                const updatedEncounter = { ...encounter, title: newTitle, id: newId }
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

  const handleEncounterNpcChange = (sectionIndex: number, sceneIndex: number, encounterIndex: number, newNpcs: { id: string; behavior: string; initialInitiative?: number }[]) => {
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
                      return { ...encounter, npc: newNpcs }
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

  const handleAddEncounter = (sectionIndex: number, sceneIndex: number) => {
    const newEncounterId = `encounter-${Date.now()}`
    const newEncounter = {
      id: newEncounterId,
      title: "",
      intro: "",
      instructions: "",
      image: "",
      transitions: [],
      npc: [],
      skipInitialNpcTurns: false,
      resetHealth: false,
    }

    setSections((prevSections) =>
      prevSections.map((section, sIndex) => {
        if (sIndex === sectionIndex) {
          return {
            ...section,
            scenes: section.scenes.map((scene, scIndex) => {
              if (scIndex === sceneIndex) {
                return {
                  ...scene,
                  encounters: [...scene.encounters, newEncounter],
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

  // Prepare available NPCs for the encounter form
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

  const handleDownload = () => {
    // Prepare the current adventure plan data (including unsaved changes)
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

    // Convert to JSON with pretty formatting
    const jsonData = JSON.stringify(currentAdventurePlan, null, 2)

    // Create blob and download
    const blob = new Blob([jsonData], { type: "application/json" })
    const url = URL.createObjectURL(blob)

    // Create download link
    const link = document.createElement("a")
    link.href = url
    link.download = `${adventurePlan.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_adventure_plan.json`

    // Trigger download
    document.body.appendChild(link)
    link.click()

    // Cleanup
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success("Adventure plan downloaded successfully!")
  }

  return (
    <div className="pb-8 flex flex-wrap h-[90vh]">
      <div className="flex items-center justify-end gap-4 w-full border-b border-white/10 pb-2">
        <Button ariaLabel="download json" variant="outline" className="text-sm" size="icon" onClick={handleDownload}>
          <Download size={20} className="opacity-50 scale-150" />
        </Button>
        <Button variant="outline" className="font-display font-extrabold tracking-widest text-sm w-24" size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <div className="flex items-center gap-2">
              <Loader2 aria-label="Saving in progress" className="animate-spin" />
            </div>
          ) : (
            "Save"
          )}
        </Button>
      </div>
      <AdventurePlanEditSidebar adventurePlan={{ ...adventurePlan, sections }} />
      <div
        id="adventure-plan-main"
        className="flex-1 pt-2 pr-3 -mr-3 h-full overflow-y-auto [scrollbar-width:thin] [scrollbar-color:dimgray_black] [&::-webkit-scrollbar-track]:bg-black [&::-webkit-scrollbar-thumb]:bg-black [&::-webkit-scrollbar]:w-1"
      >
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

        <h4 className="font-mono pt-12 text-indigo-400 text-center font-bold tracking-widest">Adventure Plan</h4>
        {sections.map((section, sIndex) => (
          <div key={sIndex} id={`section-${sIndex}`} className="w-full flex flex-col gap-4 scroll-mt-20">
            {sections.length > 1 && (
              <>
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
              </>
            )}

            <div>
              <div>
                {section.scenes.map((scene, scIndex) => (
                  <div id={`scene-${sIndex}-${scIndex}`} className={cn(section.scenes.length > 1 && "border border-white/20 rounded-lg p-4 mt-8 flex flex-col gap-4 scroll-mt-20")} key={scIndex}>
                    <div>
                      {section.scenes.length > 1 && (
                        <>
                          <h3 className="text-xl font-bold font-display text-amber-300/80 text-center pb-2">{scene.title || <span className="italic text-gray-400">Untitled Scene</span>}</h3>
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
                        </>
                      )}

                      <div>
                        {scene.encounters.map((encounter, eIndex) => (
                          <EncounterEditForm
                            key={eIndex}
                            id={`encounter-${sIndex}-${scIndex}-${eIndex}`}
                            adventurePlanId={adventurePlan.id}
                            settingId={adventurePlan.settingId}
                            encounter={encounter}
                            sectionIndex={sIndex}
                            sceneIndex={scIndex}
                            encounterIndex={eIndex}
                            allSections={sections}
                            availableNpcs={availableNpcs}
                            onTitleChange={handleEncounterTitleChange}
                            onIntroChange={handleEncounterIntroChange}
                            onIdChange={handleEncounterIdChange}
                            onInstructionsChange={handleEncounterInstructionsChange}
                            onSkipInitialNpcTurnsChange={handleEncounterSkipInitialNpcTurnsChange}
                            onResetHealthChange={handleEncounterResetHealthChange}
                            onImageChange={handleEncounterImageChange}
                            onDelete={handleEncounterDelete}
                            onTransitionsChange={handleEncounterTransitionsChange}
                            onNpcChange={handleEncounterNpcChange}
                            isSaving={isSaving}
                          />
                        ))}

                        <div className="mt-4 flex justify-center">
                          <Button onClick={() => handleAddEncounter(sIndex, scIndex)} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 hover:scale-100">
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
        {sections.length === 0 && <p className="text-sm text-gray-400 italic">This adventure plan currently has no sections defined.</p>}

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
          <Button variant="epic" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  )
}
