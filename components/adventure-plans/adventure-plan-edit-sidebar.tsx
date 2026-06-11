"use client"

import Link from "next/link"
import type * as React from "react"
import { cn, reverseSlugify } from "@/lib/utils"
import type { AdventurePlan } from "@/types/adventure-plan"

export type AdventurePlanEditorView = "basic" | "prose" | "npcs" | "premadePlayerCharacters"

interface AdventurePlanEditSidebarProps {
  adventurePlan: AdventurePlan
  activeView: AdventurePlanEditorView
  activeSectionIndex: number
  activeSceneIndex: number
  activeEncounterId: string | null
  onUtilitySelect: (view: Exclude<AdventurePlanEditorView, "prose">) => void
  onSectionSelect: (sectionIndex: number) => void
  onSceneSelect: (sceneIndex: number) => void
  onEncounterSelect: (encounterId: string) => void
}

function SidebarButton({ active, children, className, onClick }: { active?: boolean; children: React.ReactNode; className?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "block w-full rounded border border-transparent px-2 py-1.5 text-left font-display text-xs transition-colors hover:border-primary-400/40 hover:bg-white/5 hover:text-amber-300",
        active && "border-amber-400/50 bg-amber-400/10 text-amber-300",
        className
      )}
    >
      {children}
    </button>
  )
}

export function AdventurePlanEditSidebar({
  adventurePlan,
  activeView,
  activeSectionIndex,
  activeSceneIndex,
  activeEncounterId,
  onUtilitySelect,
  onSectionSelect,
  onSceneSelect,
  onEncounterSelect,
}: AdventurePlanEditSidebarProps) {
  const settingId = adventurePlan.settingId
  const settingName = reverseSlugify(settingId)
  const activeSection = adventurePlan.sections[activeSectionIndex]
  const activeScene = activeSection?.scenes[activeSceneIndex]

  return (
    <aside id="adventure-plan-edit-sidebar" className="w-[360px] h-full overflow-y-auto pr-8">
      <button type="button" className="block w-full text-left text-2xl text-amber-400 font-display hover:text-amber-300 transition-colors" onClick={() => onSectionSelect(0)}>
        {adventurePlan.title}
      </button>
      <div className="text-xs -mt-1 opacity-70 text-primary-100 font-display mb-4">
        <Link className="text-blue-300" href={`/settings/${settingId}`}>
          {settingName}
        </Link>
      </div>

      <nav className="space-y-5" aria-label="Adventure plan editor navigation">
        <div className="space-y-1">
          <div className="font-mono text-[0.65rem] uppercase tracking-widest text-primary-200/70">Utilities</div>
          <SidebarButton active={activeView === "basic"} onClick={() => onUtilitySelect("basic")}>
            Basic Info
          </SidebarButton>
          <SidebarButton active={activeView === "npcs"} onClick={() => onUtilitySelect("npcs")}>
            NPCs
          </SidebarButton>
          <SidebarButton active={activeView === "premadePlayerCharacters"} onClick={() => onUtilitySelect("premadePlayerCharacters")}>
            Premade PCs
          </SidebarButton>
        </div>

        <div className="space-y-1">
          <div className="font-mono text-[0.65rem] uppercase tracking-widest text-primary-200/70">Sections</div>
          {adventurePlan.sections.map((section, sectionIndex) => (
            <SidebarButton key={`nav-section-${sectionIndex}`} active={activeView === "prose" && activeSectionIndex === sectionIndex} onClick={() => onSectionSelect(sectionIndex)} className="text-sm">
              {section.title || `Section ${sectionIndex + 1}`}
            </SidebarButton>
          ))}
        </div>

        {activeView === "prose" && activeSection && (
          <div className="space-y-1">
            <div className="font-mono text-[0.65rem] uppercase tracking-widest text-primary-200/70">Scenes</div>
            {activeSection.scenes.map((scene, sceneIndex) => (
              <SidebarButton key={`nav-scene-${activeSectionIndex}-${sceneIndex}`} active={activeSceneIndex === sceneIndex} onClick={() => onSceneSelect(sceneIndex)} className="text-sm">
                {scene.title || `Scene ${sceneIndex + 1}`}
              </SidebarButton>
            ))}
          </div>
        )}

        {activeView === "prose" && activeScene && (
          <div className="space-y-1 border-t border-primary-200/30 pt-3">
            <div className="font-mono text-[0.65rem] uppercase tracking-widest text-primary-200/70">Encounters</div>
            {activeScene.encounters.map((encounter, encounterIndex) => (
              <SidebarButton key={encounter.id || `encounter-${encounterIndex}`} active={activeEncounterId === encounter.id} onClick={() => onEncounterSelect(encounter.id)} className="pl-4 text-xs">
                {encounter.title || `Encounter ${encounterIndex + 1}`}
              </SidebarButton>
            ))}
          </div>
        )}
      </nav>
    </aside>
  )
}
