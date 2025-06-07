import * as React from "react"
import { AdventureSection } from "@/types/adventure-plan"

export function useAdventureSections(
  sections: AdventureSection[],
  setSections: React.Dispatch<React.SetStateAction<AdventureSection[]>>
) {
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

  return {
    handleSectionTitleChange,
    handleSectionSummaryChange,
    handleSceneTitleChange,
    handleSceneSummaryChange,
    handleAddEncounter,
  }
} 