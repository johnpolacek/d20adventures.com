"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { generateCharacterAction } from "@/app/_actions/generate-character-action"
import { toast } from "sonner"
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

  const isNpcs = type === "npcs"
  const generateButtonText = isNpcs ? "Generate NPC" : "Generate PC"

  const handleGenerate = async () => {
    if (!generatePrompt.trim()) return

    setIsGenerating(true)

    try {
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
        <div className="w-full flex items-center justify-end gap-8">
          <Button onClick={onClose} disabled={isGenerating} size="sm" variant="ghost">
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating || !generatePrompt.trim()} size="sm" variant="epic">
            {isGenerating ? "Generating..." : generateButtonText}
          </Button>
        </div>
      </div>
    </div>
  )
}
