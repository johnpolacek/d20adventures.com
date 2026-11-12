"use client"

import { useEffect, useRef, useState } from "react"
import StoryviewRailPanel from "@/components/adventure/storyview/storyview-rail-panel"
import { FloorPlanButton, FloorPlanRailPanel } from "@/components/floorplan/floor-plan-panel"
import { useLiveFloor } from "@/components/floorplan/use-live-floor"
import type { FloorView } from "@/components/floorplan/view"
import { useTurn } from "@/lib/context/TurnContext"
import { cn } from "@/lib/utils"
import type { AdventureEncounter } from "@/types/adventure-plan"
import GameChat from "./game-chat"
import TurnCharacterList from "./turn-character-list"
import TurnNarrative from "./turn-narrative"

export default function Turn({ nextAdventure, encounter, floor: initialFloor, isSolo }: { nextAdventure?: string; encounter?: AdventureEncounter | null; floor?: FloorView | null; isSolo?: boolean }) {
  // The plan follows the live turn: its characters as they move, and its encounter's floor.
  const turn = useTurn()
  const floor = useLiveFloor(initialFloor, turn?.encounterId)
  const characters = turn?.characters ?? []

  // The map is titled by the place it depicts; fall back to the encounter title
  // for plans that don't declare locations.
  const mapTitle = encounter?.location || encounter?.title

  // Match the chat card to the map card's height. The plan is 16:9, so its height
  // tracks the rail width — measure it and mirror it onto the chat rather than
  // letting the chat stretch to the viewport bottom.
  const mapCardRef = useRef<HTMLDivElement>(null)
  const [chatHeight, setChatHeight] = useState<number | undefined>(undefined)
  useEffect(() => {
    const el = mapCardRef.current
    if (!el) {
      setChatHeight(undefined)
      return
    }
    // Guard against a zero measurement (card not rendered yet) so the chat
    // falls back to filling the rail instead of collapsing.
    const update = () => setChatHeight(el.offsetHeight > 0 ? el.offsetHeight : undefined)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [floor])

  return (
    <div className="relative mx-auto w-full max-w-[1536px] 2xl:max-w-[1700px] flex flex-col gap-4 px-6 sm:px-8 pb-24 lg:grid lg:grid-cols-[336px_minmax(0,1fr)] lg:items-start lg:gap-6 xl:grid-cols-[336px_minmax(0,1fr)_360px] 2xl:grid-cols-[380px_minmax(0,1fr)_440px] 2xl:gap-12">
      {/* Left rail: character list. The negative margin + padding keeps the initiative
          badges (which hang outside the cards) from being clipped by the scroll area.
          -mt-18 lifts the rail to align with the narrative's "It is your turn!" bar. */}
      <div className="lg:sticky lg:top-20 lg:-ml-6 lg:-mt-18 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto lg:pb-4 lg:pl-6 lg:pr-1">
        <TurnCharacterList />
      </div>

      {/* Center: narrative */}
      <div className="flex min-w-0 flex-col gap-6">
        <TurnNarrative nextAdventure={nextAdventure} />
      </div>

      {/* Right rail (wide desktop): mini map on top, chat below matching its height.
          Without a map the chat falls back to filling the rail. Solo runs have no chat.
          -mt-18 aligns the rail top with the narrative's "It is your turn!" bar. */}
      <aside className={cn("hidden xl:sticky xl:top-20 xl:-mt-18 xl:flex xl:flex-col xl:gap-4", !chatHeight && !isSolo && "xl:h-[calc(100vh-7rem)]")}>
        {floor && (
          <div ref={mapCardRef} className="flex-none">
            <FloorPlanRailPanel floor={floor} characters={characters} title={mapTitle} />
          </div>
        )}
        <StoryviewRailPanel className="flex-none" />
        {!isSolo && (
          <div className={cn("min-h-0", chatHeight ? "flex-none" : "flex-1")} style={chatHeight ? { height: chatHeight } : undefined}>
            <GameChat variant="rail" className="h-full" />
          </div>
        )}
      </aside>

      {/* Below xl: floating buttons (the rail is hidden) */}
      <div className="fixed right-4 top-20 z-50 flex items-center gap-3 xl:hidden">
        {floor && <FloorPlanButton floor={floor} characters={characters} title={mapTitle} />}
        {!isSolo && <GameChat />}
      </div>
    </div>
  )
}
