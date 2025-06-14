import React from "react"
import { Input } from "@/components/ui/input"
import { textShadow } from "../typography/styles"
import StepperButtons from "./stepper-buttons"

interface StepEquipmentProps {
  equipment: string[]
  onEquipmentChange: (equipment: string[]) => void
  onNext: () => void
  onBack?: () => void
}

export default function StepEquipment({ equipment, onEquipmentChange, onNext, onBack }: StepEquipmentProps) {
  const handleEquipmentChange = (idx: number, value: string) => {
    const updated = [...equipment]
    updated[idx] = value
    onEquipmentChange(updated)
  }

  const handleAddEquipment = () => {
    onEquipmentChange([...equipment, ""])
  }

  const handleRemoveEquipment = (idx: number) => {
    const updated = equipment.filter((_, i) => i !== idx)
    onEquipmentChange(updated)
  }

  // Only require at least one non-blank equipment item
  const nonBlankEquipment = equipment.filter((e) => e.trim() !== "")
  const canProceed = nonBlankEquipment.length > 0

  // Filter out blank equipment before calling onNext
  const handleNext = () => {
    onEquipmentChange(nonBlankEquipment)
    onNext()
  }

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <h2 style={textShadow} className="text-lg italic">
        Step 8: Equipment
      </h2>
      <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-lg p-4 bg-black/70 ring-8 ring-black/30">
        {equipment.map((item, idx) => (
          <div key={idx} className="flex w-full gap-2 items-center">
            <Input className="flex-1 bg-black/50" placeholder={`Equipment #${idx + 1}`} value={item} onChange={(e) => handleEquipmentChange(idx, e.target.value)} />
            <button type="button" className="text-red-400 px-2" onClick={() => handleRemoveEquipment(idx)} disabled={equipment.length === 1}>
              Remove
            </button>
          </div>
        ))}
        <div className="flex w-full justify-center">
          <button
            type="button"
            className="text-amber-300 border border-amber-400 hover:bg-amber-700/30 hover:scale-105 transition-all ease-in-out duration-500 rounded px-8 py-1 mt-2"
            onClick={handleAddEquipment}
          >
            Add Equipment
          </button>
        </div>
      </div>
      <StepperButtons onBack={onBack} onNext={handleNext} nextDisabled={!canProceed} />
    </div>
  )
}
