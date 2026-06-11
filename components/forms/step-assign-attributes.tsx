import type React from "react"
import { useState } from "react"
import { generateAttributesAction } from "@/app/_actions/generate-attributes-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { textShadow } from "../typography/styles"
import StepperButtons from "./stepper-buttons"

export interface Attributes {
  strength: number | ""
  dexterity: number | ""
  constitution: number | ""
  intelligence: number | ""
  wisdom: number | ""
  charisma: number | ""
}

interface StepAssignAttributesProps {
  attributes: Attributes
  onChange: (attr: Partial<Attributes>) => void
  onNext: () => void
  onBack?: () => void
  archetype?: string
  race?: string
}

const ATTR_LIST = [
  { key: "strength", label: "Strength" },
  { key: "dexterity", label: "Dexterity" },
  { key: "constitution", label: "Constitution" },
  { key: "intelligence", label: "Intelligence" },
  { key: "wisdom", label: "Wisdom" },
  { key: "charisma", label: "Charisma" },
]

export default function StepAssignAttributes({ attributes, onChange, onNext, onBack, archetype, race }: StepAssignAttributesProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isValid = ATTR_LIST.every(({ key }) => {
    const val = attributes[key as keyof Attributes]
    return typeof val === "number" && val >= 1 && val <= 20
  })

  const handleInput = (key: keyof Attributes) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value === "" ? "" : Number(e.target.value)
    onChange({ [key]: value })
  }

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await generateAttributesAction({
        archetype,
        race,
      })
      if (result.success && result.attributes) {
        onChange(result.attributes)
      } else {
        setError(result.error || "Failed to generate attributes.")
      }
    } catch {
      setError("An error occurred while generating attributes.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <h2 style={textShadow} className="text-lg italic">
        Step 4: Assign Attributes
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-sm border border-white/10 rounded-lg p-4 bg-black/70 ring-8 ring-black/30">
        {ATTR_LIST.map(({ key, label }) => (
          <div key={key} className="flex flex-col items-center">
            <label className="font-display text-sm text-amber-300/70 text-center w-full font-bold mb-1" htmlFor={key}>
              {label}
            </label>
            <Input
              id={key}
              type="number"
              min={1}
              max={20}
              value={attributes[key as keyof Attributes]}
              onChange={handleInput(key as keyof Attributes)}
              className="w-32 bg-black/50 font-mono !text-xl text-center"
              inputMode="numeric"
              pattern="[0-9]*"
            />
          </div>
        ))}
      </div>
      <Button onClick={handleGenerate} disabled={loading} variant="ai" className="mt-2 !text-lg">
        {loading ? "Generating..." : "Generate Attributes"}
      </Button>
      {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
      <StepperButtons onBack={onBack} onNext={onNext} nextDisabled={!isValid} />
    </div>
  )
}
