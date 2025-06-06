"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { ImageUpload } from "@/components/ui/image-upload"
import { Plus, X, Edit } from "lucide-react"
import type { Character, NPC, PCTemplate, EquipmentItem } from "@/types/character"
import { generateCharacterAction } from "@/app/_actions/generate-character-action"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const IMAGE_HOST = process.env.NEXT_PUBLIC_IMAGE_HOST || ""

interface AdventurePlanCharactersEditProps {
  id: string
  type: "npcs" | "premadePlayerCharacters"
  characters: Record<string, Character> | PCTemplate[]
  onCharactersChange: (characters: Record<string, Character> | PCTemplate[]) => void
  isSaving: boolean
  adventurePlanId: string
  settingId: string
}

export function AdventurePlanCharactersEdit({ id, type, characters, onCharactersChange, isSaving, adventurePlanId, settingId }: AdventurePlanCharactersEditProps) {
  const isNpcs = type === "npcs"
  const [showGenerateForm, setShowGenerateForm] = React.useState(false)
  const [generatePrompt, setGeneratePrompt] = React.useState("")
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [editingCharacters, setEditingCharacters] = React.useState<Set<string>>(new Set())

  // Get the characters array for rendering - convert objects to array format for consistency
  const charactersArray: [string, Character | PCTemplate][] = isNpcs
    ? Object.entries(characters as Record<string, Character>)
    : (characters as PCTemplate[]).map((char, index) => [index.toString(), char])

  const toggleEditMode = (charId: string) => {
    setEditingCharacters((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(charId)) {
        newSet.delete(charId)
      } else {
        newSet.add(charId)
      }
      return newSet
    })
  }

  const isEditing = (charId: string) => editingCharacters.has(charId)

  const addNewCharacter = () => {
    const newId = isNpcs ? `${type}-${Date.now()}` : Date.now().toString()

    if (isNpcs) {
      const newNpc: NPC = {
        id: newId,
        type: "npc",
        name: "",
        image: "",
        archetype: "",
        race: "",
        appearance: "",
        healthPercent: 100,
        equipment: [],
        skills: [],
      }
      const npcsRecord = characters as Record<string, Character>
      onCharactersChange({
        ...npcsRecord,
        [newId]: newNpc,
      })
    } else {
      const newPc: PCTemplate = {
        id: newId,
        type: "pc",
        name: "",
        image: "",
        archetype: "",
        race: "",
        appearance: "",
        healthPercent: 100,
        equipment: [],
        skills: [],
        attributes: {
          strength: 10,
          dexterity: 10,
          constitution: 10,
          intelligence: 10,
          wisdom: 10,
          charisma: 10,
        },
      }
      const pcArray = characters as PCTemplate[]
      onCharactersChange([...pcArray, newPc])
    }
  }

  const updateCharacter = (charId: string, updates: Partial<Character | PCTemplate>) => {
    if (isNpcs) {
      const npcsRecord = characters as Record<string, Character>
      const updatedNpcs = {
        ...npcsRecord,
        [charId]: {
          ...npcsRecord[charId],
          ...updates,
        } as Character,
      }
      onCharactersChange(updatedNpcs)
    } else {
      const pcArray = characters as PCTemplate[]
      const index = parseInt(charId)
      const updatedPcs = pcArray.map((char, i) => (i === index ? ({ ...char, ...updates } as PCTemplate) : char))
      onCharactersChange(updatedPcs)
    }
  }

  const removeCharacter = (charId: string) => {
    if (isNpcs) {
      const npcsRecord = characters as Record<string, Character>
      const updatedNpcs = { ...npcsRecord }
      delete updatedNpcs[charId]
      onCharactersChange(updatedNpcs)
    } else {
      const pcArray = characters as PCTemplate[]
      const index = parseInt(charId)
      const updatedPcs = pcArray.filter((_, i) => i !== index)
      onCharactersChange(updatedPcs)
    }
  }

  const updateEquipment = (charId: string, equipment: EquipmentItem[]) => {
    updateCharacter(charId, { equipment })
  }

  const addEquipmentItem = (charId: string) => {
    const char = isNpcs ? (characters as Record<string, Character>)[charId] : (characters as PCTemplate[])[parseInt(charId)]
    const newEquipment = [...(char.equipment || []), { name: "", description: "" }]
    updateEquipment(charId, newEquipment)
  }

  const removeEquipmentItem = (charId: string, index: number) => {
    const char = isNpcs ? (characters as Record<string, Character>)[charId] : (characters as PCTemplate[])[parseInt(charId)]
    const newEquipment = (char.equipment || []).filter((_, i) => i !== index)
    updateEquipment(charId, newEquipment)
  }

  const updateEquipmentItem = (charId: string, index: number, updates: Partial<EquipmentItem>) => {
    const char = isNpcs ? (characters as Record<string, Character>)[charId] : (characters as PCTemplate[])[parseInt(charId)]
    const newEquipment = (char.equipment || []).map((item, i) => (i === index ? { ...item, ...updates } : item))
    updateEquipment(charId, newEquipment)
  }

  const updateSkills = (charId: string, skills: string[]) => {
    updateCharacter(charId, { skills })
  }

  const addSkill = (charId: string) => {
    const char = isNpcs ? (characters as Record<string, Character>)[charId] : (characters as PCTemplate[])[parseInt(charId)]
    const newSkills = [...(char.skills || []), ""]
    updateSkills(charId, newSkills)
  }

  const removeSkill = (charId: string, index: number) => {
    const char = isNpcs ? (characters as Record<string, Character>)[charId] : (characters as PCTemplate[])[parseInt(charId)]
    const newSkills = (char.skills || []).filter((_, i) => i !== index)
    updateSkills(charId, newSkills)
  }

  const updateSkill = (charId: string, index: number, skill: string) => {
    const char = isNpcs ? (characters as Record<string, Character>)[charId] : (characters as PCTemplate[])[parseInt(charId)]
    const newSkills = (char.skills || []).map((s, i) => (i === index ? skill : s))
    updateSkills(charId, newSkills)
  }

  const updateAttributes = (charId: string, attribute: string, value: number) => {
    const char = isNpcs ? (characters as Record<string, Character>)[charId] : (characters as PCTemplate[])[parseInt(charId)]
    const newAttributes = {
      ...char.attributes,
      [attribute]: value,
    }
    updateCharacter(charId, { attributes: newAttributes })
  }

  const handleGenerate = async () => {
    // Lyra is a a promising young Asterian scholarly mage fascinated by Valkaran lore and elven culture.
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
            [newId]: generatedCharacter as NPC,
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
        setShowGenerateForm(false)
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

  const title = isNpcs ? "NPCs" : "Premade Player Characters"
  const buttonText = isNpcs ? "Add NPC" : "Add PC"
  const generateButtonText = isNpcs ? "Generate NPC" : "Generate PC"
  const emptyText = isNpcs ? "No NPCs added yet." : "No premade player characters added yet."

  return (
    <div id={id} className="border-t border-white/20 pt-8 mt-8 w-full flex flex-col gap-4 scroll-mt-20">
      <div className="flex items-center justify-between">
        <h4 className="font-display opacity-70 text-lg text-indigo-300 font-bold tracking-wide">{title}</h4>
        <div className="flex items-center gap-2">
          <Button onClick={() => setShowGenerateForm(!showGenerateForm)} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 hover:scale-100">
            <Plus size={16} />
            {generateButtonText}
          </Button>
          <Button onClick={addNewCharacter} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 hover:scale-100">
            <Plus size={16} />
            {buttonText}
          </Button>
        </div>
      </div>

      {showGenerateForm && (
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
              <Button onClick={() => setShowGenerateForm(false)} disabled={isGenerating} size="sm" variant="ghost">
                Cancel
              </Button>
              <Button onClick={handleGenerate} disabled={isGenerating || !generatePrompt.trim()} size="sm" variant="epic">
                {isGenerating ? "Generating..." : "Generate Character"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {charactersArray.length === 0 && <p className="text-sm text-gray-400 italic text-center py-8">{emptyText}</p>}

      <div className="space-y-4">
        {charactersArray.map(([charKey, charData], index) => {
          const char = charData as Character | PCTemplate
          const charId = isNpcs ? charKey : index.toString()
          const imageUploadFolder = `images/settings/${settingId}/${adventurePlanId}/${isNpcs ? "npcs" : "pcs"}`
          const imageUrl = char.image ? IMAGE_HOST + char.image : ""
          // Use a unique key that's always a string
          const uniqueKey = isNpcs ? charKey : `pc-${index}`
          const editing = isEditing(charId)

          return (
            <Card key={uniqueKey} className={cn("bg-white/5 border-white/20 text-white", !editing && "py-0")}>
              <CardContent className={`relative ${editing ? "grid grid-cols-2 gap-8" : "p-4"}`}>
                {!editing ? (
                  // Collapsed Mode
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-white/10 flex-shrink-0">
                      {imageUrl ? (
                        <img src={imageUrl} alt={char.name || "Character"} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">No Image</div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-lg font-display text-amber-300/90 truncate">{char.name || `Unnamed ${isNpcs ? "NPC" : "Character"}`}</div>
                      <div className="text-sm text-white/70 space-y-1">
                        {char.gender} {char.race} {char.archetype}
                      </div>
                    </div>
                    <Button onClick={() => toggleEditMode(charId)} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 text-sm">
                      <Edit size={14} />
                      Edit
                    </Button>
                    <Button onClick={() => removeCharacter(charId)} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 text-sm">
                      <X size={14} />
                      Delete
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col">
                      <div className="pb-4">
                        <Label className="font-mono p-1 text-primary-200" htmlFor={`char-image-${charId}`}>
                          Image
                        </Label>
                        <ImageUpload
                          id={`char-image-${charId}`}
                          value={imageUrl || ""}
                          onChange={(url) => updateCharacter(charId, { image: url })}
                          onRemove={() => updateCharacter(charId, { image: "" })}
                          folder={imageUploadFolder}
                          className="aspect-square"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2">
                          <Label className="font-mono p-1 text-primary-200" htmlFor={`char-name-${charId}`}>
                            Name
                          </Label>
                          <Input
                            id={`char-name-${charId}`}
                            value={char.name || ""}
                            onChange={(e) => updateCharacter(charId, { name: e.target.value })}
                            disabled={isSaving}
                            placeholder="Character Name"
                          />
                        </div>
                        <div>
                          <Label className="font-mono p-1 text-primary-200" htmlFor={`char-gender-${charId}`}>
                            Gender
                          </Label>
                          <Input
                            id={`char-gender-${charId}`}
                            value={char.gender || ""}
                            onChange={(e) => updateCharacter(charId, { gender: e.target.value })}
                            disabled={isSaving}
                            placeholder="Optional"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-4">
                        <div>
                          <Label className="font-mono p-1 text-primary-200" htmlFor={`char-race-${charId}`}>
                            Race
                          </Label>
                          <Input
                            id={`char-race-${charId}`}
                            value={char.race || ""}
                            onChange={(e) => updateCharacter(charId, { race: e.target.value })}
                            disabled={isSaving}
                            placeholder="e.g., Human, Elf, Dwarf"
                          />
                        </div>
                        <div>
                          <Label className="font-mono p-1 text-primary-200" htmlFor={`char-archetype-${charId}`}>
                            Archetype
                          </Label>
                          <Input
                            id={`char-archetype-${charId}`}
                            value={char.archetype || ""}
                            onChange={(e) => updateCharacter(charId, { archetype: e.target.value })}
                            disabled={isSaving}
                            placeholder={isNpcs ? "e.g., Guard, Merchant, Noble" : "e.g., Fighter, Wizard, Rogue"}
                          />
                        </div>
                        <div className="hidden">
                          <Label className="font-mono p-1 text-primary-200" htmlFor={`char-health-${charId}`}>
                            Health %
                          </Label>
                          <Input
                            id={`char-health-${charId}`}
                            type="number"
                            min="0"
                            max="100"
                            value={char.healthPercent || 100}
                            onChange={(e) => updateCharacter(charId, { healthPercent: parseInt(e.target.value) || 100 })}
                            disabled={isSaving}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 pt-4">
                        {["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((attr) => (
                          <div key={attr}>
                            <Label className="font-mono p-1 text-primary-200 capitalize" htmlFor={`char-${attr}-${charId}`}>
                              {attr}
                            </Label>
                            <Input
                              id={`char-${attr}-${charId}`}
                              type="number"
                              min="1"
                              max="20"
                              value={char.attributes?.[attr as keyof typeof char.attributes] || ""}
                              onChange={(e) => updateAttributes(charId, attr, parseInt(e.target.value) || 0)}
                              disabled={isSaving}
                              placeholder="1-20"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex flex-col gap-4">
                      <div>
                        <Label className="font-mono p-1 text-primary-200" htmlFor={`char-appearance-${charId}`}>
                          Appearance
                        </Label>
                        <Textarea
                          id={`char-appearance-${charId}`}
                          value={char.appearance || ""}
                          onChange={(e) => updateCharacter(charId, { appearance: e.target.value })}
                          disabled={isSaving}
                          placeholder="Physical description of the character"
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label className="font-mono p-1 text-primary-200" htmlFor={`char-personality-${charId}`}>
                          Personality
                        </Label>
                        <Textarea
                          id={`char-personality-${charId}`}
                          value={char.personality || ""}
                          onChange={(e) => updateCharacter(charId, { personality: e.target.value })}
                          disabled={isSaving}
                          placeholder="Personality traits, mannerisms, speech patterns"
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label className="font-mono p-1 text-primary-200" htmlFor={`char-background-${charId}`}>
                          Background
                        </Label>
                        <Textarea
                          id={`char-background-${charId}`}
                          value={char.background || ""}
                          onChange={(e) => updateCharacter(charId, { background: e.target.value })}
                          disabled={isSaving}
                          placeholder="Background story and history"
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label className="font-mono p-1 text-primary-200" htmlFor={`char-motivation-${charId}`}>
                          Motivation
                        </Label>
                        <Textarea
                          id={`char-motivation-${charId}`}
                          value={char.motivation || ""}
                          onChange={(e) => updateCharacter(charId, { motivation: e.target.value })}
                          disabled={isSaving}
                          placeholder="What drives this character? Goals and desires"
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label className="font-mono p-1 text-primary-200" htmlFor={`char-behavior-${charId}`}>
                          Behavior
                        </Label>
                        <Textarea
                          id={`char-behavior-${charId}`}
                          value={char.behavior || ""}
                          onChange={(e) => updateCharacter(charId, { behavior: e.target.value })}
                          disabled={isSaving}
                          placeholder="How does this character typically behave in interactions?"
                          rows={2}
                        />
                      </div>
                      <div>
                        <div className="font-mono p-1 text-primary-200">Skills</div>
                        {(char.skills || []).map((skill, index) => (
                          <div key={index} className="flex gap-2">
                            <Input value={skill} onChange={(e) => updateSkill(charId, index, e.target.value)} disabled={isSaving} placeholder="Skill name" className="flex-1" />
                            <Button onClick={() => removeSkill(charId, index)} disabled={isSaving} size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
                              <X size={16} />
                            </Button>
                          </div>
                        ))}
                        <Button onClick={() => addSkill(charId)} disabled={isSaving} size="sm" variant="outline" className="text-xs">
                          <Plus size={16} className="mr-2" />
                          Add Skill
                        </Button>
                      </div>
                      <div>
                        <div className="font-mono p-1 text-primary-200">Equipment</div>
                        {(char.equipment || []).map((item, index) => (
                          <div key={index} className="space-y-2 p-3 border border-white/10 rounded">
                            <div className="flex gap-2">
                              <Input value={item.name} onChange={(e) => updateEquipmentItem(charId, index, { name: e.target.value })} disabled={isSaving} placeholder="Item name" className="flex-1" />
                              <Button onClick={() => removeEquipmentItem(charId, index)} disabled={isSaving} size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
                                <X size={16} />
                              </Button>
                            </div>
                            <Textarea
                              value={item.description || ""}
                              onChange={(e) => updateEquipmentItem(charId, index, { description: e.target.value })}
                              disabled={isSaving}
                              placeholder="Item description (optional)"
                              rows={2}
                            />
                          </div>
                        ))}
                        <Button onClick={() => addEquipmentItem(charId)} disabled={isSaving} size="sm" variant="outline" className="text-xs">
                          <Plus size={16} className="mr-2" />
                          Add Equipment
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
