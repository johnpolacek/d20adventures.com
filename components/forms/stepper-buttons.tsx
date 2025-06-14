import React from "react"
import { Button } from "@/components/ui/button"

interface StepperButtonsProps {
  onBack?: () => void
  onNext: () => void
  nextDisabled?: boolean
  nextLabel?: string
  backLabel?: string
}

export default function StepperButtons({ onBack, onNext, nextDisabled, nextLabel = "Next", backLabel = "Back" }: StepperButtonsProps) {
  return (
    <div className="flex flex-row gap-4 mt-4 w-full max-w-xs justify-center">
      {onBack && (
        <Button variant="ghost" onClick={onBack} className="transition-all ease-in-out duration-500">
          {backLabel}
        </Button>
      )}
      <Button onClick={onNext} disabled={nextDisabled} className="w-40 transition-all ease-in-out duration-500" variant="epic">
        {nextLabel}
      </Button>
    </div>
  )
}
