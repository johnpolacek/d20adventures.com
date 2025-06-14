import React, { useState } from "react"
import { Input } from "@/components/ui/input"
import StepperButtons from "./stepper-buttons"
import { textShadow } from "../typography/styles"

const GENDER_OPTIONS = ["Male", "Female", "Other"]

interface StepEnterNameGenderProps {
  name: string
  gender: string
  onNameChange: (name: string) => void
  onGenderChange: (gender: string) => void
  onNext: () => void
  onBack?: () => void
}

export default function StepEnterNameGender({ name, gender, onNameChange, onGenderChange, onNext, onBack }: StepEnterNameGenderProps) {
  // Determine if custom gender is being used
  const isCustom = gender && !GENDER_OPTIONS.includes(gender)
  const [customGender, setCustomGender] = useState(isCustom ? gender : "")

  const handleGenderSelect = (option: string) => {
    if (option === "Other") {
      onGenderChange("Other")
    } else {
      setCustomGender("")
      onGenderChange(option)
    }
  }

  const handleCustomGenderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomGender(e.target.value)
    onGenderChange(e.target.value)
  }

  const canProceed =
    !!name &&
    ((gender && gender !== "Other" && GENDER_OPTIONS.includes(gender)) || (gender && gender !== "Other" && !GENDER_OPTIONS.includes(gender)) || (gender === "Other" && customGender.trim() !== ""))

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <h2 style={textShadow} className="text-lg italic">
        Step 3: Name & Gender
      </h2>
      <Input placeholder="Enter your character's name" value={name} onChange={(e) => onNameChange(e.target.value)} className="w-full max-w-md bg-black/50" required />
      <div className="flex flex-col items-center gap-2 w-full max-w-md">
        <label className="font-semibold text-base mb-1">Gender</label>
        <div className="flex flex-wrap gap-2 justify-center mb-2">
          {GENDER_OPTIONS.map((option) => (
            <button
              key={option}
              className={`capitalize px-4 py-2 rounded transition-all ease-in-out duration-500 ${gender === option || (option === "Other" && isCustom) ? "border border-transparent bg-amber-400 text-black" : "bg-transparent border border-amber-400 hover:bg-amber-700/30 hover:scale-105 text-amber-300"}`}
              onClick={() => handleGenderSelect(option)}
              type="button"
            >
              {option}
            </button>
          ))}
        </div>
        {(gender === "Other" || isCustom) && <Input placeholder="Enter custom gender" value={customGender} onChange={handleCustomGenderChange} className="w-full bg-black/50" autoFocus />}
      </div>
      <StepperButtons onBack={onBack} onNext={onNext} nextDisabled={!canProceed} />
    </div>
  )
}
