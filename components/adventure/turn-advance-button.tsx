"use client"

import React, { useState } from "react"
import { Button } from "@/components/ui/button"

interface TurnAdvanceButtonProps {
  advancing: boolean
  onAdvance: () => void
  navigationMode?: boolean
  navigationLabel?: string
}

const TurnAdvanceButton = ({ advancing, onAdvance, navigationMode = false, navigationLabel }: TurnAdvanceButtonProps) => {
  const [hasClicked, setHasClicked] = useState(false)

  return (
    <Button
      size="lg"
      variant="epic"
      disabled={advancing}
      onClick={() => {
        if (!hasClicked) {
          setHasClicked(true)
          onAdvance()
        }
      }}
    >
      {hasClicked ? (navigationMode ? "Navigating..." : "Advancing...") : navigationLabel || (navigationMode ? "Go to Next Turn" : "Go to Next Turn")}
    </Button>
  )
}

export default TurnAdvanceButton
