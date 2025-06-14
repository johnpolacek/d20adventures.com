import React from "react"
import { Input } from "@/components/ui/input"
import StepperButtons from "./stepper-buttons"
import { textShadow } from "../typography/styles"

interface StepChooseRaceProps {
  availableRaces: string[]
  selectedRace: string
  onSelect: (race: string) => void
  onNext: () => void
  onBack?: () => void
}

export default function StepChooseRace({ availableRaces, selectedRace, onSelect, onNext, onBack }: StepChooseRaceProps) {
  const handleRaceInput = (e: React.ChangeEvent<HTMLInputElement>) => onSelect(e.target.value)

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <h2 style={textShadow} className="text-lg italic">
        Step 1: Choose Race
      </h2>
      {availableRaces.length > 0 ? (
        <div className="flex flex-wrap gap-2 sm:gap-4 justify-center">
          {availableRaces.map((race) => (
            <button
              key={race}
              className={`capitalize px-4 py-2 rounded transition-all ease-in-out duration-500 ${selectedRace === race ? "border border-transparent bg-amber-400 text-black" : "bg-transparent border border-amber-400 hover:bg-amber-700/30 hover:scale-105 text-amber-300"}`}
              onClick={() => onSelect(race)}
              type="button"
            >
              {race}
            </button>
          ))}
        </div>
      ) : (
        <Input placeholder="Enter your character's race" value={selectedRace} onChange={handleRaceInput} className="w-full bg-black/50" />
      )}
      <StepperButtons onBack={onBack} onNext={onNext} nextDisabled={!selectedRace} />
    </div>
  )
}
