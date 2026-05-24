"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { AdventureSection } from "@/types/adventure-plan"
import * as React from "react"

interface AdventurePlanSectionsProps {
  sections: AdventureSection[]
  isSaving: boolean
  sectionIndex: number
  sceneIndex: number
  activeEncounterId: string | null
  onSectionTitleChange: (index: number, newTitle: string) => void
  onSectionSummaryChange: (index: number, newSummary: string) => void
  onSceneTitleChange: (sectionIndex: number, sceneIndex: number, newTitle: string) => void
  onSceneSummaryChange: (sectionIndex: number, sceneIndex: number, newSummary: string) => void
  onEncounterTitleChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newTitle: string) => void
  onEncounterIntroChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newIntro: string) => void
  onEncounterInstructionsChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newInstructions: string) => void
  onActiveEncounterChange: (encounterId: string) => void
}

export function AdventurePlanSections({
  sections,
  isSaving,
  sectionIndex,
  sceneIndex,
  activeEncounterId,
  onSectionTitleChange,
  onSectionSummaryChange,
  onSceneTitleChange,
  onSceneSummaryChange,
  onEncounterTitleChange,
  onEncounterIntroChange,
  onEncounterInstructionsChange,
  onActiveEncounterChange,
}: AdventurePlanSectionsProps) {
  const section = sections[sectionIndex]
  const scene = section?.scenes[sceneIndex]

  React.useEffect(() => {
    if (!scene?.encounters.length) return
    if (activeEncounterId && scene.encounters.some((encounter) => encounter.id === activeEncounterId)) return
    onActiveEncounterChange(scene.encounters[0].id)
  }, [activeEncounterId, scene, onActiveEncounterChange])

  React.useEffect(() => {
    const container = document.getElementById("adventure-plan-main")
    if (!container || !scene?.encounters.length) return

    const targets = scene.encounters
      .map((encounter, encounterIndex) => ({
        encounter,
        element: document.getElementById(`encounter-${sectionIndex}-${sceneIndex}-${encounterIndex}`),
      }))
      .filter((entry): entry is { encounter: (typeof scene.encounters)[number]; element: HTMLElement } => Boolean(entry.element))

    if (targets.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => Math.abs(a.boundingClientRect.top - container.getBoundingClientRect().top) - Math.abs(b.boundingClientRect.top - container.getBoundingClientRect().top))[0]

        const visibleTarget = targets.find((target) => target.element === visibleEntry?.target)
        if (visibleTarget) {
          onActiveEncounterChange(visibleTarget.encounter.id)
        }
      },
      {
        root: container,
        threshold: [0.2, 0.6],
      }
    )

    targets.forEach((target) => observer.observe(target.element))
    return () => observer.disconnect()
  }, [scene, sectionIndex, sceneIndex, onActiveEncounterChange])

  if (!section || !scene) {
    return <div className="flex min-h-[50vh] items-center justify-center text-white/70">Select a section and scene to edit adventure prose.</div>
  }

  return (
    <div className="space-y-10 pb-10">
      <section id={`section-${sectionIndex}`} className="space-y-4 rounded-lg border border-primary-200/20 bg-black/10 p-4 scroll-mt-20">
        <div className="text-center font-mono text-xs uppercase tracking-widest text-primary-300">Section</div>
        <div>
          <label htmlFor={`section-title-${sectionIndex}`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
            Section Title
          </label>
          <Input
            id={`section-title-${sectionIndex}`}
            value={section.title}
            onChange={(event) => onSectionTitleChange(sectionIndex, event.target.value)}
            placeholder="Enter section title"
            disabled={isSaving}
            className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50"
          />
        </div>
        <div>
          <label htmlFor={`section-summary-${sectionIndex}`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
            Section Summary
          </label>
          <Textarea
            id={`section-summary-${sectionIndex}`}
            value={section.summary}
            onChange={(event) => onSectionSummaryChange(sectionIndex, event.target.value)}
            placeholder="Enter section summary"
            rows={4}
            disabled={isSaving}
            className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50"
          />
        </div>
      </section>

      <section id={`scene-${sectionIndex}-${sceneIndex}`} className="space-y-4 rounded-lg border border-white/20 bg-white/[0.03] p-4 scroll-mt-20">
        <div className="text-center font-mono text-xs uppercase tracking-widest text-primary-300">Scene</div>
        <div>
          <label htmlFor={`scene-title-${sectionIndex}-${sceneIndex}`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
            Scene Title
          </label>
          <Input
            id={`scene-title-${sectionIndex}-${sceneIndex}`}
            value={scene.title}
            onChange={(event) => onSceneTitleChange(sectionIndex, sceneIndex, event.target.value)}
            placeholder="Enter scene title"
            disabled={isSaving}
            className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50"
          />
        </div>
        <div>
          <label htmlFor={`scene-summary-${sectionIndex}-${sceneIndex}`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
            Scene Summary
          </label>
          <Textarea
            id={`scene-summary-${sectionIndex}-${sceneIndex}`}
            value={scene.summary}
            onChange={(event) => onSceneSummaryChange(sectionIndex, sceneIndex, event.target.value)}
            placeholder="Enter scene summary"
            rows={4}
            disabled={isSaving}
            className="bg-neutral-800/50 border-neutral-700 placeholder:text-white/50"
          />
        </div>
      </section>

      <section className="space-y-8">
        <h4 className="font-mono pb-1 border-b-2 border-primary-700/70 text-primary-300 text-center tracking-widest">Encounters</h4>
        {scene.encounters.length === 0 ? (
          <div className="rounded-lg border border-white/15 p-6 text-center text-white/70">This scene has no encounters.</div>
        ) : (
          scene.encounters.map((encounter, encounterIndex) => (
            <article
              key={encounter.id || `encounter-${encounterIndex}`}
              id={`encounter-${sectionIndex}-${sceneIndex}-${encounterIndex}`}
              className="space-y-4 rounded-lg border border-white/20 bg-black/10 p-4 scroll-mt-20"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="font-mono text-xs uppercase tracking-widest text-primary-300">Encounter {encounterIndex + 1}</div>
                <div className="truncate text-xs text-white/45">{encounter.id}</div>
              </div>
              <div>
                <label htmlFor={`encounter-${sectionIndex}-${sceneIndex}-${encounterIndex}-title`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                  Encounter Title
                </label>
                <Input
                  id={`encounter-${sectionIndex}-${sceneIndex}-${encounterIndex}-title`}
                  value={encounter.title}
                  onChange={(event) => onEncounterTitleChange(sectionIndex, sceneIndex, encounterIndex, event.target.value)}
                  placeholder="Enter encounter title"
                  disabled={isSaving}
                  className="bg-white/10 placeholder:text-white/40"
                />
              </div>
              <div>
                <label htmlFor={`encounter-${sectionIndex}-${sceneIndex}-${encounterIndex}-intro`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                  Encounter Intro
                </label>
                <Textarea
                  id={`encounter-${sectionIndex}-${sceneIndex}-${encounterIndex}-intro`}
                  value={encounter.intro}
                  onChange={(event) => onEncounterIntroChange(sectionIndex, sceneIndex, encounterIndex, event.target.value)}
                  placeholder="Enter encounter introduction narrative"
                  rows={5}
                  disabled={isSaving}
                  className="bg-white/10 placeholder:text-white/40"
                />
              </div>
              <div>
                <label htmlFor={`encounter-${sectionIndex}-${sceneIndex}-${encounterIndex}-instructions`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                  Instructions
                </label>
                <Textarea
                  id={`encounter-${sectionIndex}-${sceneIndex}-${encounterIndex}-instructions`}
                  value={encounter.instructions || ""}
                  onChange={(event) => onEncounterInstructionsChange(sectionIndex, sceneIndex, encounterIndex, event.target.value)}
                  placeholder="Enter AI Game Master instructions"
                  rows={8}
                  disabled={isSaving}
                  className="bg-white/10 placeholder:text-white/40"
                />
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  )
}
