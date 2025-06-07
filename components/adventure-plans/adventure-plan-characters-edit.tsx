"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import type { Character, PCTemplate } from "@/types/character"
import { useCharacterManagement } from "@/components/adventure-plans/hooks/use-character-management"
import { CharacterGenerateForm } from "@/components/adventure-plans/character-generate-form"
import { CharacterCard } from "@/components/adventure-plans/character-card"

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
  const [showGenerateForm, setShowGenerateForm] = React.useState(false)
  const [editingCharacters, setEditingCharacters] = React.useState<Set<string>>(new Set())

  const { isNpcs, charactersArray, addNewCharacter, updateCharacter, removeCharacter, getCharacter } = useCharacterManagement(type, characters, onCharactersChange)

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

  const handleRemoveCharacter = (charId: string) => {
    removeCharacter(charId)
    setEditingCharacters((prev) => {
      const newSet = new Set(prev)
      newSet.delete(charId)
      return newSet
    })
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

      {showGenerateForm && <CharacterGenerateForm type={type} characters={characters} onCharactersChange={onCharactersChange} onClose={() => setShowGenerateForm(false)} />}

      {charactersArray.length === 0 && <p className="text-sm text-gray-400 italic text-center py-8">{emptyText}</p>}

      <div className="space-y-4">
        {charactersArray.map(([charKey, charData], index) => {
          const char = charData as Character | PCTemplate
          const charId = isNpcs ? charKey : index.toString()
          const uniqueKey = isNpcs ? charKey : `pc-${index}`
          const editing = isEditing(charId)

          return (
            <CharacterCard
              key={uniqueKey}
              charId={charId}
              char={char}
              isNpcs={isNpcs}
              isSaving={isSaving}
              settingId={settingId}
              adventurePlanId={adventurePlanId}
              uniqueKey={uniqueKey}
              editing={editing}
              onToggleEdit={() => toggleEditMode(charId)}
              onRemove={() => handleRemoveCharacter(charId)}
              updateCharacter={updateCharacter}
              getCharacter={getCharacter}
            />
          )
        })}
      </div>
    </div>
  )
}
