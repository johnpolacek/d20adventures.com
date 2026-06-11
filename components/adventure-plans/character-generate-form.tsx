"use client"

import * as React from "react"
import { toast } from "sonner"
import { generateCharacterAction } from "@/app/_actions/generate-character-action"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Character, PCTemplate } from "@/types/character"

interface CharacterGenerateFormProps {
  type: "npcs" | "premadePlayerCharacters"
  characters: Record<string, Character> | PCTemplate[]
  onCharactersChange: (characters: Record<string, Character> | PCTemplate[]) => void
  onClose: () => void
}

export function CharacterGenerateForm({ type, characters, onCharactersChange, onClose }: CharacterGenerateFormProps) {
  const [generatePrompt, setGeneratePrompt] = React.useState("")
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [generateMultiple, setGenerateMultiple] = React.useState(false)
  const [batchSize, setBatchSize] = React.useState(3)

  const isNpcs = type === "npcs"
  const generateButtonText = isNpcs ? "Generate NPC" : "Generate PC"

  const handleGenerate = async () => {
    if (!generatePrompt.trim()) return

    setIsGenerating(true)

    try {
      if (isNpcs && generateMultiple) {
        // Generate multiple NPCs
        const npcsRecord = characters as Record<string, Character>
        const updatedNpcs = { ...npcsRecord }
        let generatedCount = 0
        for (let i = 0; i < batchSize; i++) {
          const result = await generateCharacterAction({
            prompt: generatePrompt,
            characterType: "npc",
          })
          if (result.success && result.character) {
            const newId = `${type}-${Date.now()}-${i}`
            const generatedCharacter = {
              ...result.character,
              id: newId,
              image: "",
            }
            updatedNpcs[newId] = generatedCharacter as Character
            generatedCount++
          }
        }
        onCharactersChange(updatedNpcs)
        toast.success(`Generated ${generatedCount} NPCs successfully!`)
      } else {
        const result = await generateCharacterAction({
          prompt: generatePrompt,
          characterType: isNpcs ? "npc" : "pc",
        })

        if (result.success && result.character) {
          // Generate unique ID and add missing fields
          const newId = isNpcs ? `${type}-${Date.now()}` : Date.now().toString()
          const generatedCharacter = {
            ...result.character,
            id: newId,
            image: "", // Start with empty image, user can upload later
          }

          if (isNpcs) {
            // Add to NPCs record
            const npcsRecord = characters as Record<string, Character>
            const updatedNpcs = {
              ...npcsRecord,
              [newId]: generatedCharacter as Character,
            }
            onCharactersChange(updatedNpcs)
          } else {
            // Add to PC array
            const pcArray = characters as PCTemplate[]
            const updatedPcs = [...pcArray, generatedCharacter as PCTemplate]
            onCharactersChange(updatedPcs)
          }

          toast.success(`${isNpcs ? "NPC" : "Character"} generated successfully!`)

          // Reset form
          setGeneratePrompt("")
          onClose()
        } else {
          toast.error(result.error || "Failed to generate character")
        }
      }
    } catch (error) {
      console.error("Error generating character:", error)
      toast.error("An unexpected error occurred while generating the character")
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <div className="border border-white/20 rounded-lg p-4 sm:p-8 bg-white/5">
      <div className="space-y-8">
        <div>
          <Label className="font-mono p-1 text-primary-200" htmlFor="generate-prompt">
            Character Generation Prompt
          </Label>
          <Textarea
            id="generate-prompt"
            value={generatePrompt}
            onChange={(e) => setGeneratePrompt(e.target.value)}
            placeholder={`Describe the ${isNpcs ? "NPC" : "player character"} you want to generate (e.g., "A gruff dwarf blacksmith with a mysterious past" or "A charismatic elven bard who tells tall tales")`}
            rows={3}
            disabled={isGenerating}
          />
        </div>
        {/* Multi-generation controls - only show for NPCs */}
        {isNpcs && (
          <div className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox id="generate-multiple" checked={generateMultiple} onCheckedChange={(checked) => setGenerateMultiple(!!checked)} disabled={isGenerating} />
              <Label htmlFor="generate-multiple" className="text-sm">
                Generate multiple NPCs
              </Label>
            </div>
            {generateMultiple && (
              <div className="space-y-2">
                <Label htmlFor="batch-size" className="text-sm">
                  Number of NPCs to generate (1-10)
                </Label>
                <Input
                  id="batch-size"
                  type="number"
                  min="1"
                  max="10"
                  value={batchSize}
                  onChange={(e) => setBatchSize(Math.min(10, Math.max(1, Number.parseInt(e.target.value, 10) || 1)))}
                  disabled={isGenerating}
                  className="w-24"
                />
              </div>
            )}
          </div>
        )}
        <div className="w-full flex items-center justify-end gap-8">
          <Button onClick={onClose} disabled={isGenerating} size="sm" variant="ghost">
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating || !generatePrompt.trim()} size="sm" variant="epic">
            {isGenerating ? (generateMultiple ? `Generating ${batchSize} NPCs...` : "Generating...") : generateMultiple ? `Generate ${batchSize} NPCs` : generateButtonText}
          </Button>
        </div>
      </div>
    </div>
  )
}
