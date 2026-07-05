"use client"

import { Clapperboard } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { useTurnContext } from "@/lib/context/TurnContext"
import StoryviewOverlay, { type StoryviewSnapshot } from "./storyview-overlay"

export default function StoryviewButton() {
  const { currentTurn } = useTurnContext()
  const [snapshot, setSnapshot] = useState<StoryviewSnapshot | null>(null)

  if (!currentTurn?.narrative) return null

  const open = () => {
    setSnapshot({
      turnId: currentTurn.id,
      narrative: currentTurn.narrative,
      characters: currentTurn.characters.map((c) => ({ id: c.id, name: c.name, image: c.image })),
    })
  }

  return (
    <>
      <Button variant="outline" size="sm" className="text-xs" onClick={open}>
        <Clapperboard className="mr-1 h-3.5 w-3.5" />
        Storyview
      </Button>
      {snapshot && <StoryviewOverlay snapshot={snapshot} onClose={() => setSnapshot(null)} />}
    </>
  )
}
