"use client"

import { Button } from "@/components/ui/button"
import Link from "next/link"
import React from "react"

interface FinalEncounterCompleteMessageProps {
  isSignedIn: boolean
  settingId: string
  adventurePlanId: string
  nextAdventure?: string | null
}

const FinalEncounterCompleteMessage = ({ isSignedIn, settingId, adventurePlanId, nextAdventure }: FinalEncounterCompleteMessageProps) => {
  return (
    <>
      <p className="text-primary-300 text-lg xl:text-xl font-display font-bold mb-4 max-w-md mx-auto">Congratulations, you&#39;ve made it to the end of this adventure!</p>
      {isSignedIn &&
        (nextAdventure ? (
          <Button size="sm" asChild variant="epic">
            <Link href={`/settings/${settingId}/${nextAdventure}/character-select`}>Play Next Adventure</Link>
          </Button>
        ) : (
          <Button size="sm" asChild variant="epic">
            <Link href={`/${settingId}/${adventurePlanId}/character-select`}>Play Again</Link>
          </Button>
        ))}
    </>
  )
}

export default FinalEncounterCompleteMessage
