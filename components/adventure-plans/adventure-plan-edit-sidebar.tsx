"use client"

import * as React from "react"
import { AdventurePlan } from "@/types/adventure-plan"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cn } from "@/lib/utils"

interface AdventurePlanEditSidebarProps {
  adventurePlan: AdventurePlan
}

const scrollToElement = (targetId: string) => {
  const container = document.getElementById("adventure-plan-main")
  const target = document.getElementById(targetId.replace("#", ""))

  if (container && target) {
    const containerRect = container.getBoundingClientRect()
    const targetRect = target.getBoundingClientRect()
    const scrollTop = container.scrollTop + targetRect.top - containerRect.top - 20 // 20px offset for better visibility

    container.scrollTo({
      top: scrollTop,
      behavior: "smooth",
    })
  }
}

const NavLink: React.FC<{ href: string; children: React.ReactNode; className?: string }> = ({ href, children, className = "" }) => (
  <a
    href={href}
    className={cn("block font-display text-xs hover:text-amber-300 transition-colors py-1 cursor-pointer", className)}
    onClick={(e) => {
      e.preventDefault()
      scrollToElement(href)
    }}
  >
    {children}
  </a>
)

export function AdventurePlanEditSidebar({ adventurePlan }: AdventurePlanEditSidebarProps) {
  // Generate default values for all scenes to be open by default
  const defaultOpenScenes = adventurePlan.sections.flatMap((section, sIndex) => section.scenes.map((_, scIndex) => `scene-${sIndex}-${scIndex}`))

  return (
    <div id="adventure-plan-edit-sidebar" className="w-[360px] h-full overflow-y-auto pr-4">
      <div className="text-xs p-1 opacity-70 text-primary-100 font-mono">Edit Adventure Plan</div>
      <NavLink href="#adventure-plan-main" className="text-2xl text-amber-400 font-display block mb-2 hover:text-amber-300 transition-colors">
        {adventurePlan.title}
      </NavLink>
      <nav className="space-y-1">
        {adventurePlan.sections.map((section, sIndex) => (
          <div key={`nav-section-${sIndex}`}>
            {adventurePlan.sections.length > 1 && (
              <NavLink href={`#section-${sIndex}`} className="font-medium">
                {section.title || "Untitled Section"}
              </NavLink>
            )}
            {section.scenes.length === 1 ? (
              // Single scene - no accordion needed
              section.scenes.map((scene, scIndex) => (
                <div key={`nav-scene-${sIndex}-${scIndex}`} className="space-y-1 border-t border-primary-200/30 pt-2">
                  <NavLink href={`#scene-${sIndex}-${scIndex}`} className="text-sm block py-1">
                    {scene.title || "Untitled Scene"}
                  </NavLink>
                  <div className="space-y-1">
                    {scene.encounters.map((encounter, eIndex) => (
                      <NavLink className="block w-full py-1 ml-2" key={`nav-encounter-${sIndex}-${scIndex}-${eIndex}`} href={`#encounter-${sIndex}-${scIndex}-${eIndex}`}>
                        {encounter.title || "Untitled Encounter"}
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))
            ) : (
              // Multiple scenes - use accordion
              <Accordion type="multiple" defaultValue={defaultOpenScenes} className="space-y-0">
                {section.scenes.map((scene, scIndex) => (
                  <AccordionItem className="w-full" key={`nav-scene-${sIndex}-${scIndex}`} value={`scene-${sIndex}-${scIndex}`}>
                    <AccordionTrigger>
                      <NavLink href={`#scene-${sIndex}-${scIndex}`}>{scene.title || "Untitled Scene"}</NavLink>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-1">
                        {scene.encounters.map((encounter, eIndex) => (
                          <NavLink className="block w-full py-1" key={`nav-encounter-${sIndex}-${scIndex}-${eIndex}`} href={`#encounter-${sIndex}-${scIndex}-${eIndex}`}>
                            {encounter.title || "Untitled Encounter"}
                          </NavLink>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        ))}
        <div className="border-t border-primary-200/30 pt-2 mt-2">
          <NavLink className="text-sm" href="#npcs-editor">
            NPCs
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
