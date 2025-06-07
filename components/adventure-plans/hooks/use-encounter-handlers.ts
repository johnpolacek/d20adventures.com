import * as React from "react"
import { AdventureSection } from "@/types/adventure-plan"
import slugify from "slugify"

export function useEncounterHandlers(
  sections: AdventureSection[],
  setSections: React.Dispatch<React.SetStateAction<AdventureSection[]>>
) {
  const handleEncounterTitleChange = (sectionIndex: number, sceneIndex: number, encounterIndex: number, newTitle: string) => {
    const updatedSections = sections.map((section, sIdx) => {
      if (sIdx === sectionIndex) {
        const updatedScenes = section.scenes.map((scene, scIdx) => {
          if (scIdx === sceneIndex) {
            const updatedEncounters = scene.encounters.map((encounter, eIdx) => {
              if (eIdx === encounterIndex) {
                const newId = slugify(newTitle, { lower: true, strict: true })
                return { ...encounter, title: newTitle, id: newId }
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

  return {
    handleEncounterTitleChange,
    handleEncounterIntroChange,
    handleEncounterIdChange,
    handleEncounterInstructionsChange,
    handleEncounterSkipInitialNpcTurnsChange,
    handleEncounterResetHealthChange,
    handleEncounterImageChange,
    handleEncounterDelete,
    handleEncounterTransitionsChange,
    handleEncounterNpcChange,
  }
} 