import { useState } from "react"
import { generateSpellsAction } from "@/app/_actions/generate-spells-action"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { textShadow } from "../typography/styles"
import type { Attributes } from "./step-assign-attributes"
import StepperButtons from "./stepper-buttons"

export interface SpellFormValue {
  name: string
  description?: string
}

interface StepSpellsProps {
  hasSpells: boolean | undefined
  onHasSpellsChange: (val: boolean) => void
  spells: SpellFormValue[]
  onSpellsChange: (spells: SpellFormValue[]) => void
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
  equipment?: string[]
}

export default function StepSpells({
  hasSpells,
  onHasSpellsChange,
  spells,
  onSpellsChange,
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
  equipment,
}: StepSpellsProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSpellChange = (idx: number, value: string) => {
    const updated = [...spells]
    updated[idx].name = value
    onSpellsChange(updated)
  }

  const handleSpellDescriptionChange = (idx: number, value: string) => {
    const updated = [...spells]
    updated[idx].description = value
    onSpellsChange(updated)
  }

  const handleAddSpell = () => {
    onSpellsChange([...spells, { name: "", description: "" }])
  }

  const handleRemoveSpell = (idx: number) => {
    const updated = spells.filter((_, i) => i !== idx)
    onSpellsChange(updated)
  }

  const nonBlankSpells = spells.filter((s) => s.name.trim() !== "")
  const canProceed = typeof hasSpells === "boolean" && (!hasSpells || nonBlankSpells.length > 0)

  const handleNext = () => {
    if (hasSpells) {
      onSpellsChange(nonBlankSpells)
    }
    onNext()
  }

  const handleGenerate = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await generateSpellsAction({
        race,
        archetype,
        attributes,
        appearance,
        background,
        personality,
        motivation,
        backstory,
        skills,
        equipment,
      })
      if (result.success && result.spells) {
        onSpellsChange(result.spells.map((s) => ({ name: s.name, description: s.description })))
      } else {
        setError(result.error || "Failed to generate spells.")
      }
    } catch {
      setError("An error occurred while generating spells.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="w-full flex flex-col items-center gap-8">
      <h2 style={textShadow} className="text-lg italic text-center">
        Does your character have spells?
      </h2>
      <div className="flex gap-6 justify-center">
        <button
          type="button"
          className={`px-8 py-2 rounded font-bold transition-all ease-in-out duration-500 border border-amber-400 text-amber-300 ${hasSpells === true ? "bg-amber-400 text-black border-transparent" : "bg-transparent hover:bg-amber-700/30 hover:scale-105"}`}
          onClick={() => onHasSpellsChange(true)}
        >
          Yes
        </button>
        <button
          type="button"
          className={`px-8 py-2 rounded font-bold transition-all ease-in-out duration-500 border border-amber-400 text-amber-300 ${hasSpells === false ? "bg-amber-400 text-black border-transparent" : "bg-transparent hover:bg-amber-700/30 hover:scale-105"}`}
          onClick={() => onHasSpellsChange(false)}
        >
          No
        </button>
      </div>
      {hasSpells && (
        <div className="w-full max-w-md flex flex-col items-center gap-4 rounded-lg p-4 bg-black/70 ring-8 ring-black/30">
          {spells.map((spell, idx) => (
            <div key={idx} className="flex w-full gap-2 items-center">
              <div className="flex-1 flex flex-col gap-1">
                <Input className="bg-black/50" placeholder={`Spell #${idx + 1} Name`} value={spell.name} onChange={(e) => handleSpellChange(idx, e.target.value)} />
                <Input className="bg-black/40 text-xs" placeholder="Description (optional)" value={spell.description || ""} onChange={(e) => handleSpellDescriptionChange(idx, e.target.value)} />
              </div>
              <button type="button" className="text-red-400 px-2" onClick={() => handleRemoveSpell(idx)} disabled={spells.length === 1}>
                Remove
              </button>
            </div>
          ))}
          <div className="flex w-full justify-center">
            <button
              type="button"
              className="text-amber-300 border border-amber-400 hover:bg-amber-700/30 hover:scale-105 transition-all ease-in-out duration-500 rounded px-8 py-1 mt-2"
              onClick={handleAddSpell}
            >
              Add Spell
            </button>
          </div>
          <Button onClick={handleGenerate} disabled={loading} variant="ai" className="mt-2 !text-lg">
            {loading ? "Generating..." : "Generate"}
          </Button>
          {error && <div className="text-red-400 text-sm mt-2">{error}</div>}
        </div>
      )}
      <StepperButtons onBack={onBack} onNext={handleNext} nextDisabled={!canProceed} />
    </div>
  )
}
