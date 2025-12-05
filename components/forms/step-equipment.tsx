import { generateEquipmentAction } from "@/app/_actions/generate-equipment-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import React, { useState } from "react"
import { textShadow } from "../typography/styles"
import type { Attributes } from "./step-assign-attributes"
import StepperButtons from "./stepper-buttons"

interface StepEquipmentProps {
  equipment: string[]
  onEquipmentChange: (equipment: string[]) => void
  onNext: () => void
  onBack?: () => void
  race?: string
  archetype?: string
  attributes?: Attributes
  appearance?: string
  background?: string
  personality?: string
  motivation?: string
  backstory?: string
  skills?: string[]
}

export default function StepEquipment({
  equipment,
  onEquipmentChange,
  onNext,
  onBack,
  race,
  archetype,
  attributes,
  appearance,
  background,
  personality,
  motivation,
  backstory,
  skills,
}: StepEquipmentProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await generateEquipmentAction({
        race,
        archetype,
        attributes,
        appearance,
        background,
        personality,
        motivation,
        backstory,
        skills,
      })
      if (result.success && result.equipment) {
        onEquipmentChange(result.equipment)
      } else {
        setError(result.error || "Failed to generate equipment.")
      }
    } catch {
      setError("An error occurred while generating equipment.")
    } finally {
      setLoading(false)
    }
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
        <Button onClick={handleGenerate} disabled={loading} variant="ai" className="mt-2 !text-lg">
          {loading ? "Generating..." : "Generate"}
        </Button>
        {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
      </div>
      <StepperButtons onBack={onBack} onNext={handleNext} nextDisabled={!canProceed} />
    </div>
  )
}
