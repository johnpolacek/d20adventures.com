"use client"

import React, { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"

interface TurnAdvanceButtonProps {
  advancing: boolean
  onAdvance: () => void | Promise<void>
}

const TurnAdvanceButton = React.forwardRef<HTMLButtonElement, TurnAdvanceButtonProps>(({ advancing, onAdvance }, ref) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const [hasClicked, setHasClicked] = useState(false)

  // Allow parent to pass a ref, but default to our own
  const combinedRef = (node: HTMLButtonElement) => {
    if (typeof ref === "function") ref(node)
    else if (ref) (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node
    buttonRef.current = node
  }

  useEffect(() => {
    if (buttonRef.current) {
      buttonRef.current.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, [])

  return (
    <Button
      ref={combinedRef}
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
      {hasClicked ? "Advancing..." : "Go to Next Turn"}
    </Button>
  )
})

TurnAdvanceButton.displayName = "TurnAdvanceButton"

export default TurnAdvanceButton
