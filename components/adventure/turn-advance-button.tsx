"use client"

import { Button } from "@d20/ui/button"

interface TurnAdvanceButtonProps {
  advancing: boolean
  onAdvance: () => void
  navigationMode?: boolean
  navigationLabel?: string
}

const TurnAdvanceButton = ({ advancing, onAdvance, navigationMode = false, navigationLabel }: TurnAdvanceButtonProps) => {
  return (
    <Button
      size="lg"
      variant="epic"
      disabled={advancing}
      onClick={() => {
        if (!advancing) onAdvance()
      }}
    >
      {advancing ? (navigationMode ? "Navigating..." : "Advancing...") : navigationLabel || "Go to Next Turn"}
    </Button>
  )
}

export default TurnAdvanceButton
