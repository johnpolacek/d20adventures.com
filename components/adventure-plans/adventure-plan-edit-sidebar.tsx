"use client"

import * as React from "react"
import { AdventurePlan } from "@/types/adventure-plan"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { cn } from "@/lib/utils"
import { reverseSlugify } from "@/lib/utils"
import Link from "next/link"
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from "@dnd-kit/core"
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable"
// @ts-expect-error dnd-kit/utilities may not have types in some setups
import { CSS } from "@dnd-kit/utilities"
import { GripVertical } from "lucide-react"

interface AdventurePlanEditSidebarProps {
  adventurePlan: AdventurePlan
  onReorderEncounters?: (sectionIndex: number, sceneIndex: number, newOrder: string[]) => void
}

const scrollToElement = (targetId: string) => {
  const container = document.getElementById("adventure-plan-main")
  const target = document.getElementById(targetId.replace("#", ""))

  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" })
    // Optionally, adjust for fixed headers or offsets if needed
    // setTimeout(() => window.scrollBy(0, -20), 400)
  } else if (container) {
    // fallback: scroll container if target is not found
    // (should rarely happen, but keep for safety)
    container.scrollTo({
      top: 0,
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

function SortableEncounter({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: "grab",
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="flex items-center group">
      <span className="text-primary-400 opacity-60 group-hover:opacity-100 cursor-grab">
        <GripVertical size={16} />
      </span>
      {children}
    </div>
  )
}

export function AdventurePlanEditSidebar({ adventurePlan, onReorderEncounters }: AdventurePlanEditSidebarProps) {
  // Generate default values for all scenes to be open by default
  const defaultOpenScenes = adventurePlan.sections.flatMap((section, sIndex) => section.scenes.map((_, scIndex) => `scene-${sIndex}-${scIndex}`))
  const settingId = adventurePlan.settingId
  const settingName = reverseSlugify(settingId)
  const sensors = useSensors(useSensor(PointerSensor))
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <div id="adventure-plan-edit-sidebar" className="w-[360px] h-full overflow-y-auto pr-8">
      <NavLink href="#adventure-plan-main" className="text-2xl text-amber-400 font-display block hover:text-amber-300 transition-colors">
        {adventurePlan.title}
      </NavLink>
      <div className="text-xs -mt-1 opacity-70 text-primary-100 font-display mb-4">
        <Link className="text-blue-300" href={`/settings/${settingId}`}>
          {settingName}
        </Link>{" "}
      </div>
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
                  {mounted && (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={({ active, over }) => {
                        if (!over || active.id === over.id) return
                        const oldIndex = scene.encounters.findIndex((e) => e.id === active.id)
                        const newIndex = scene.encounters.findIndex((e) => e.id === over.id)
                        if (oldIndex === -1 || newIndex === -1) return
                        const newOrder = arrayMove(scene.encounters, oldIndex, newIndex).map((e) => e.id)
                        onReorderEncounters?.(sIndex, scIndex, newOrder)
                      }}
                    >
                      <SortableContext items={scene.encounters.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1">
                          {scene.encounters.map((encounter, eIndex) => (
                            <SortableEncounter key={encounter.id} id={encounter.id}>
                              <NavLink className="block w-full py-1 ml-1" href={`#encounter-${sIndex}-${scIndex}-${eIndex}`}>
                                {encounter.title || "Untitled Encounter"}
                              </NavLink>
                            </SortableEncounter>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
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
                      {mounted && (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={({ active, over }) => {
                            if (!over || active.id === over.id) return
                            const oldIndex = scene.encounters.findIndex((e) => e.id === active.id)
                            const newIndex = scene.encounters.findIndex((e) => e.id === over.id)
                            if (oldIndex === -1 || newIndex === -1) return
                            const newOrder = arrayMove(scene.encounters, oldIndex, newIndex).map((e) => e.id)
                            onReorderEncounters?.(sIndex, scIndex, newOrder)
                          }}
                        >
                          <SortableContext items={scene.encounters.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-1">
                              {scene.encounters.map((encounter, eIndex) => (
                                <SortableEncounter key={encounter.id} id={encounter.id}>
                                  <NavLink className="block w-full py-1 ml-2" href={`#encounter-${sIndex}-${scIndex}-${eIndex}`}>
                                    {encounter.title || "Untitled Encounter"}
                                  </NavLink>
                                </SortableEncounter>
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </div>
        ))}
        <div className="border-t border-primary-200/30 pt-2 mt-2">
          <div className="font-display">Characters</div>
          <NavLink className="text-xs p-2" href="#npcs-editor">
            NPCs
          </NavLink>
          <NavLink className="text-xs p-2" href="#premade-pcs-editor">
            Premade PCs
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
