import { useState } from "react"
import { generateSkillsAction } from "@/app/_actions/generate-skills-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { textShadow } from "../typography/styles"
import type { Attributes } from "./step-assign-attributes"
import StepperButtons from "./stepper-buttons"

interface StepSkillsProps {
  skills: string[]
  onSkillsChange: (skills: string[]) => void
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
}

export default function StepSkills({ skills, onSkillsChange, onNext, onBack, race, archetype, attributes, appearance, background, personality, motivation, backstory }: StepSkillsProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSkillChange = (idx: number, value: string) => {
    const updated = [...skills]
    updated[idx] = value
    onSkillsChange(updated)
  }

  const handleAddSkill = () => {
    onSkillsChange([...skills, ""])
  }

  const handleRemoveSkill = (idx: number) => {
    const updated = skills.filter((_, i) => i !== idx)
    onSkillsChange(updated)
  }

  // Only require at least one non-blank skill
  const nonBlankSkills = skills.filter((s) => s.trim() !== "")
  const canProceed = nonBlankSkills.length > 0

  // Filter out blank skills before calling onNext
  const handleNext = () => {
    onSkillsChange(nonBlankSkills)
    onNext()
  }

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await generateSkillsAction({
        race,
        archetype,
        attributes,
        appearance,
        background,
        personality,
        motivation,
        backstory,
      })
      if (result.success && result.skills) {
        onSkillsChange(result.skills)
      } else {
        setError(result.error || "Failed to generate skills.")
      }
    } catch {
      setError("An error occurred while generating skills.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full flex flex-col items-center gap-6">
      <h2 style={textShadow} className="text-lg italic">
        Step 7: Skills
      </h2>
      <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-lg p-4 bg-black/70 ring-8 ring-black/30">
        {skills.map((skill, idx) => (
          <div key={idx} className="flex w-full gap-2 items-center">
            <Input className="flex-1 bg-black/50" placeholder={`Skill #${idx + 1}`} value={skill} onChange={(e) => handleSkillChange(idx, e.target.value)} />
            <button type="button" className="text-red-400 px-2" onClick={() => handleRemoveSkill(idx)} disabled={skills.length === 1}>
              Remove
            </button>
          </div>
        ))}
        <div className="flex w-full justify-center">
          <button
            type="button"
            className="text-amber-300 border border-amber-400 hover:bg-amber-700/30 hover:scale-105 transition-all ease-in-out duration-500 rounded px-8 py-1 mt-2"
            onClick={handleAddSkill}
          >
            Add Skill
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
