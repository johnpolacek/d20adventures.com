import React from "react"
import { textShadow } from "../typography/styles"
import StepperButtons from "./stepper-buttons"

interface StepAppearanceBackgroundProps {
  appearance: string
  background: string
  onAppearanceChange: (appearance: string) => void
  onBackgroundChange: (background: string) => void
  onNext: () => void
  onBack?: () => void
}

export default function StepAppearanceBackground({ appearance, background, onAppearanceChange, onBackgroundChange, onNext, onBack }: StepAppearanceBackgroundProps) {
  return (
    <div className="w-full flex flex-col items-center gap-6">
      <h2 style={textShadow} className="text-lg italic">
        Step 5: Appearance & Background
      </h2>
      <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-lg p-4 bg-black/70 ring-8 ring-black/30">
        <label className="font-display font-bold text-amber-300/80" htmlFor="appearance">
          Appearance <span className="text-amber-300">*</span>
        </label>
        <textarea
          id="appearance"
          className="w-full min-h-[80px] rounded bg-black/50 p-2 text-base"
          placeholder="Describe your character's appearance (required)"
          value={appearance}
          onChange={(e) => onAppearanceChange(e.target.value)}
          required
        />
        <label className="font-display font-bold text-amber-300/80" htmlFor="background">
          Background
        </label>
        <textarea
          id="background"
          className="w-full min-h-[80px] rounded bg-black/50 p-2 text-base"
          placeholder="Describe your character's background (optional)"
          value={background}
          onChange={(e) => onBackgroundChange(e.target.value)}
        />
      </div>
      <StepperButtons onBack={onBack} onNext={onNext} nextDisabled={!appearance.trim()} />
    </div>
  )
}
