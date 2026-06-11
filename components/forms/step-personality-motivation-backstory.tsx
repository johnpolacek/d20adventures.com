import { useState } from "react"
import { generatePersonalityMotivationBackstoryAction } from "@/app/_actions/generate-personality-motivation-backstory-action"
import { Button } from "@/components/ui/button"
import { textShadow } from "../typography/styles"
import { Textarea } from "../ui/textarea"
import type { Attributes } from "./step-assign-attributes"
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
  race?: string
  archetype?: string
  attributes?: Attributes
  appearance?: string
  background?: string
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
  race,
  archetype,
  attributes,
  appearance,
  background,
}: StepPersonalityMotivationBackstoryProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await generatePersonalityMotivationBackstoryAction({
        race,
        archetype,
        attributes,
        appearance,
        background,
      })
      if (result.success && result.personality && result.motivation) {
        onPersonalityChange(result.personality)
        onMotivationChange(result.motivation)
        onBackstoryChange(result.backstory || "")
      } else {
        setError(result.error || "Failed to generate personality/motivation/backstory.")
      }
    } catch {
      setError("An error occurred while generating personality/motivation/backstory.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <h2 style={textShadow} className="text-lg italic">
        Step 6: Personality, Motivation & Backstory
      </h2>
      <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-lg p-4 bg-black/70 ring-8 ring-black/30">
        <label className="font-display font-bold text-amber-300/80" htmlFor="personality">
          Personality
        </label>
        <Textarea
          id="personality"
          className="w-full min-h-[60px] rounded bg-black/50 p-2 text-base"
          placeholder="Describe your character's personality (optional)"
          value={personality}
          onChange={(e) => onPersonalityChange(e.target.value)}
        />
        <label className="font-display font-bold text-amber-300/80" htmlFor="motivation">
          Motivation
        </label>
        <Textarea
          id="motivation"
          className="w-full min-h-[60px] rounded bg-black/50 p-2 text-base"
          placeholder="What motivates your character? (optional)"
          value={motivation}
          onChange={(e) => onMotivationChange(e.target.value)}
        />
        <label className="font-display font-bold text-amber-300/80" htmlFor="backstory">
          Backstory
        </label>
        <Textarea
          id="backstory"
          className="w-full min-h-[60px] rounded bg-black/50 p-2 text-base"
          placeholder="Share your character's backstory (optional)"
          value={backstory}
          onChange={(e) => onBackstoryChange(e.target.value)}
        />
        <Button onClick={handleGenerate} disabled={loading} variant="ai" className="mt-2 !text-lg">
          {loading ? "Generating..." : "Generate"}
        </Button>
        {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
      </div>
      <StepperButtons onBack={onBack} onNext={onNext} />
    </div>
  )
}
