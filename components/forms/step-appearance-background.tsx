import { generateAppearanceBackgroundAction } from "@/app/_actions/generate-appearance-background-action"
import { Button } from "@/components/ui/button"
import React, { useState } from "react"
import { textShadow } from "../typography/styles"
import { Textarea } from "../ui/textarea"
import type { Attributes } from "./step-assign-attributes"
import StepperButtons from "./stepper-buttons"

interface StepAppearanceBackgroundProps {
  appearance: string
  background: string
  onAppearanceChange: (appearance: string) => void
  onBackgroundChange: (background: string) => void
  onNext: () => void
  onBack?: () => void
  race?: string
  archetype?: string
  name?: string
  attributes?: Attributes
}

export default function StepAppearanceBackground({ appearance, background, onAppearanceChange, onBackgroundChange, onNext, onBack, race, archetype, name, attributes }: StepAppearanceBackgroundProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await generateAppearanceBackgroundAction({
        race,
        archetype,
        name,
        attributes,
      })
      if (result.success && result.appearance) {
        onAppearanceChange(result.appearance)
        onBackgroundChange(result.background || "")
      } else {
        setError(result.error || "Failed to generate appearance/background.")
      }
    } catch {
      setError("An error occurred while generating appearance/background.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <h2 style={textShadow} className="text-lg italic">
        Step 5: Appearance & Background
      </h2>
      <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-lg p-4 bg-black/70 ring-8 ring-black/30">
        <label className="font-display font-bold text-amber-300/80" htmlFor="appearance">
          Appearance
        </label>
        <Textarea
          id="appearance"
          className="w-full min-h-[80px] rounded bg-black/50 p-2 text-sm"
          placeholder="Describe your character's appearance (required)"
          value={appearance}
          onChange={(e) => onAppearanceChange(e.target.value)}
          required
        />
        <label className="font-display font-bold text-amber-300/80" htmlFor="background">
          Background
        </label>
        <Textarea
          id="background"
          className="w-full min-h-[80px] rounded bg-black/50 p-2 text-sm"
          placeholder="Describe your character's background (optional)"
          value={background}
          onChange={(e) => onBackgroundChange(e.target.value)}
        />
        <Button onClick={handleGenerate} disabled={loading} variant="ai" className="mt-2 !text-lg">
          {loading ? "Generating..." : "Generate"}
        </Button>
        {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
      </div>
      <StepperButtons onBack={onBack} onNext={onNext} nextDisabled={!appearance.trim()} />
    </div>
  )
}
