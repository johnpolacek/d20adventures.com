import React from "react"
import { textShadow } from "../typography/styles"
import StepperButtons from "./stepper-buttons"

interface StepPersonalityMotivationBackstoryProps {
  personality: string
  motivation: string
  backstory: string
  onPersonalityChange: (val: string) => void
  onMotivationChange: (val: string) => void
  onBackstoryChange: (val: string) => void
  onNext: () => void
  onBack?: () => void
}

export default function StepPersonalityMotivationBackstory({
  personality,
  motivation,
  backstory,
  onPersonalityChange,
  onMotivationChange,
  onBackstoryChange,
  onNext,
  onBack,
}: StepPersonalityMotivationBackstoryProps) {
  return (
    <div className="w-full flex flex-col items-center gap-6">
      <h2 style={textShadow} className="text-lg italic">
        Step 6: Personality, Motivation & Backstory
      </h2>
      <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-lg p-4 bg-black/70 ring-8 ring-black/30">
        <label className="font-display font-bold text-amber-300/80" htmlFor="personality">
          Personality
        </label>
        <textarea
          id="personality"
          className="w-full min-h-[60px] rounded bg-black/50 p-2 text-base"
          placeholder="Describe your character's personality (optional)"
          value={personality}
          onChange={(e) => onPersonalityChange(e.target.value)}
        />
        <label className="font-display font-bold text-amber-300/80" htmlFor="motivation">
          Motivation
        </label>
        <textarea
          id="motivation"
          className="w-full min-h-[60px] rounded bg-black/50 p-2 text-base"
          placeholder="What motivates your character? (optional)"
          value={motivation}
          onChange={(e) => onMotivationChange(e.target.value)}
        />
        <label className="font-display font-bold text-amber-300/80" htmlFor="backstory">
          Backstory
        </label>
        <textarea
          id="backstory"
          className="w-full min-h-[60px] rounded bg-black/50 p-2 text-base"
          placeholder="Share your character's backstory (optional)"
          value={backstory}
          onChange={(e) => onBackstoryChange(e.target.value)}
        />
      </div>
      <StepperButtons onBack={onBack} onNext={onNext} />
    </div>
  )
}
