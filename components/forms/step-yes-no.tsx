import React from "react"
import StepperButtons from "./stepper-buttons"
import { textShadow } from "../typography/styles"

interface StepYesNoProps {
  question: string
  value: boolean | undefined
  onChange: (val: boolean) => void
  onNext: () => void
  onBack?: () => void
}

export default function StepYesNo({ question, value, onChange, onNext, onBack }: StepYesNoProps) {
  return (
    <div className="w-full flex flex-col items-center gap-8">
      <h2 style={textShadow} className="text-lg italic text-center">
        {question}
      </h2>
      <div className="flex gap-6 justify-center">
        <button
          type="button"
          className={`px-8 py-2 rounded font-bold transition-all ease-in-out duration-500 border border-amber-400 text-amber-300 ${value === true ? "bg-amber-400 text-black border-transparent" : "bg-transparent hover:bg-amber-700/30 hover:scale-105"}`}
          onClick={() => onChange(true)}
        >
          Yes
        </button>
        <button
          type="button"
          className={`px-8 py-2 rounded font-bold transition-all ease-in-out duration-500 border border-amber-400 text-amber-300 ${value === false ? "bg-amber-400 text-black border-transparent" : "bg-transparent hover:bg-amber-700/30 hover:scale-105"}`}
          onClick={() => onChange(false)}
        >
          No
        </button>
      </div>
      <StepperButtons onBack={onBack} onNext={onNext} nextDisabled={typeof value !== "boolean"} />
    </div>
  )
}
