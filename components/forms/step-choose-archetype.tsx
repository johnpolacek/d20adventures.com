import React from "react"
import { Input } from "@/components/ui/input"
import StepperButtons from "./stepper-buttons"
import { textShadow } from "../typography/styles"

interface StepChooseArchetypeProps {
  availableArchetypes: string[]
  selectedArchetype: string
  onSelect: (archetype: string) => void
  onNext: () => void
  onBack?: () => void
}

export default function StepChooseArchetype({ availableArchetypes, selectedArchetype, onSelect, onNext, onBack }: StepChooseArchetypeProps) {
  const handleArchetypeInput = (e: React.ChangeEvent<HTMLInputElement>) => onSelect(e.target.value)

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <h2 style={textShadow} className="text-lg italic">
        Step 2: Choose Class
      </h2>
      {availableArchetypes.length > 0 ? (
        <div className="flex flex-wrap gap-2 sm:gap-4 justify-center">
          {availableArchetypes.map((archetype) => (
            <button
              key={archetype}
              className={`capitalize px-4 py-2 rounded transition-all ease-in-out duration-500 ${selectedArchetype === archetype ? "border border-transparent bg-amber-400 text-black" : "bg-transparent border border-amber-400 hover:bg-amber-700/30 hover:scale-105 text-amber-300"}`}
              onClick={() => onSelect(archetype)}
              type="button"
            >
              {archetype}
            </button>
          ))}
        </div>
      ) : (
        <Input placeholder="Enter your character's class" value={selectedArchetype} onChange={handleArchetypeInput} className="w-full bg-black/50" />
      )}
      <StepperButtons onBack={onBack} onNext={onNext} nextDisabled={!selectedArchetype} />
    </div>
  )
}
