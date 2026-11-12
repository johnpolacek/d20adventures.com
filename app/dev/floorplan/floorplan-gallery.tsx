"use client"

import { useState } from "react"
import { FloorPlanRailPanel } from "@/components/floorplan/floor-plan-panel"
import type { FloorToken, FloorView } from "@/components/floorplan/view"
import { Button } from "@/components/ui/button"

export type GalleryState = { id: string; title: string; floor: FloorView; characters: FloorToken[]; moved?: FloorToken[]; activeId?: string }

function GalleryCard({ state }: { state: GalleryState }) {
  const [moved, setMoved] = useState(Boolean(state.moved))
  const characters = moved && state.moved ? state.moved : state.characters
  return (
    <div className="flex flex-col gap-2">
      <FloorPlanRailPanel floor={state.floor} characters={characters} activeId={state.activeId} title={state.title} />
      {state.moved && (
        <Button size="sm" variant="outline" className="self-start" onClick={() => setMoved((value) => !value)}>
          {moved ? "Move Back" : "Move"}
        </Button>
      )}
    </div>
  )
}

export function FloorPlanGallery({ states }: { states: GalleryState[] }) {
  return (
    <main className="min-h-screen bg-black px-4 py-10 sm:px-8">
      <div className="mx-auto max-w-[1400px]">
        <h1 className="mb-6 font-display text-2xl text-amber-300">Floor Plans</h1>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3">
          {states.map((state) => (
            <GalleryCard key={state.id} state={state} />
          ))}
        </div>
        <h2 className="mb-4 mt-10 font-display text-xl text-amber-300">Rail Width</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[repeat(auto-fill,360px)]">
          {states.map((state) => (
            <GalleryCard key={state.id} state={state} />
          ))}
        </div>
      </div>
    </main>
  )
}
