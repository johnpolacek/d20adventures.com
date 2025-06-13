"use client"

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { ImageUpload } from "@/components/ui/image-upload"
import { Plus, X, Edit, ChevronsUp } from "lucide-react"
import type { Character, PCTemplate } from "@/types/character"
import { cn } from "@/lib/utils"
import Image from "next/image"
import { useCharacterDetails } from "@/components/adventure-plans/hooks/use-character-details"

const IMAGE_HOST = process.env.NEXT_PUBLIC_IMAGE_HOST || ""

interface CharacterCardProps {
  charId: string
  char: Character | PCTemplate
  isNpcs: boolean
  isSaving: boolean
  settingId: string
  adventurePlanId: string
  uniqueKey: string
  editing: boolean
  onToggleEdit: () => void
  onRemove: () => void
  updateCharacter: (charId: string, updates: Partial<Character | PCTemplate>) => void
  getCharacter: (charId: string) => Character | PCTemplate
}

export function CharacterCard({ charId, char, isNpcs, isSaving, settingId, adventurePlanId, uniqueKey, editing, onToggleEdit, onRemove, updateCharacter, getCharacter }: CharacterCardProps) {
  const characterDetails = useCharacterDetails(charId, getCharacter, updateCharacter)
  const imageUploadFolder = `images/settings/${settingId}/${adventurePlanId}/${isNpcs ? "npcs" : "pcs"}`
  const imageUrl = char.image ? IMAGE_HOST + "/" + char.image : ""

  if (!editing) {
    // Collapsed Mode
    return (
      <Card key={uniqueKey} className={cn("bg-white/5 border-white/20 text-white py-0")}>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div onClick={onToggleEdit} className="w-16 h-16 rounded-lg overflow-hidden bg-white/10 flex-shrink-0 cursor-pointer relative">
              {imageUrl ? (
                <Image fill={true} src={imageUrl} alt={char.name || "Character"} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-white/40 text-xs">No Image</div>
              )}
            </div>
            <div onClick={onToggleEdit} className="flex-1 min-w-0 cursor-pointer">
              <div className="text-lg font-display text-amber-300/90 truncate">{char.name || `Unnamed ${isNpcs ? "NPC" : "Character"}`}</div>
              <div className="text-sm text-white/70 space-y-1">
                {char.gender} {char.race} {char.archetype}
              </div>
            </div>
            <Button onClick={onToggleEdit} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 text-sm">
              <Edit size={14} />
              Edit
            </Button>
            <Button onClick={onRemove} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 text-sm">
              <X size={14} />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Expanded Mode
  return (
    <Card key={uniqueKey} className={cn("bg-white/5 border-white/20 text-white")}>
      <CardContent className="relative grid grid-cols-2 gap-8">
        <button onClick={onToggleEdit} className="text-sm flex gap-1 items-center absolute -top-5 right-3 text-indigo-400 hover:text-indigo-300">
          <ChevronsUp size={14} /> close
        </button>

        {/* Left Column */}
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
              <Input id={`char-name-${charId}`} value={char.name || ""} onChange={(e) => updateCharacter(charId, { name: e.target.value })} disabled={isSaving} placeholder="Character Name" />
            </div>
            <div>
              <Label className="font-mono p-1 text-primary-200" htmlFor={`char-gender-${charId}`}>
                Gender
              </Label>
              <Input id={`char-gender-${charId}`} value={char.gender || ""} onChange={(e) => updateCharacter(charId, { gender: e.target.value })} disabled={isSaving} placeholder="Optional" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div>
              <Label className="font-mono p-1 text-primary-200" htmlFor={`char-race-${charId}`}>
                Race
              </Label>
              <Input id={`char-race-${charId}`} value={char.race || ""} onChange={(e) => updateCharacter(charId, { race: e.target.value })} disabled={isSaving} placeholder="e.g., Human, Elf, Dwarf" />
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
                  onChange={(e) => characterDetails.updateAttributes(attr, parseInt(e.target.value) || 0)}
                  disabled={isSaving}
                  placeholder="1-20"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Right Column */}
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

          {/* Skills Section */}
          <div className="space-y-2">
            <div className="font-mono px-1 text-primary-200">Skills</div>
            {(char.skills || []).map((skill, index) => (
              <div key={index} className="flex gap-2">
                <Input value={skill} onChange={(e) => characterDetails.updateSkill(index, e.target.value)} disabled={isSaving} placeholder="Skill name" className="flex-1" />
                <Button onClick={() => characterDetails.removeSkill(index)} disabled={isSaving} size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
                  <X size={16} />
                </Button>
              </div>
            ))}
            <Button onClick={characterDetails.addSkill} disabled={isSaving} size="sm" variant="outline" className="text-xs">
              <Plus size={16} className="mr-2" />
              Add Skill
            </Button>
          </div>

          {/* Spells Section */}
          <div className="space-y-2">
            <div className="font-mono px-1 text-primary-200">Spells</div>
            {(char.spells || []).map((spell, index) => (
              <div key={index} className="space-y-2 p-3 border border-white/10 rounded">
                <div className="flex gap-2">
                  <Input value={spell.name} onChange={(e) => characterDetails.updateSpell(index, { name: e.target.value })} disabled={isSaving} placeholder="Spell name" className="flex-1" />
                  <Button onClick={() => characterDetails.removeSpell(index)} disabled={isSaving} size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
                    <X size={16} />
                  </Button>
                </div>
                <Textarea
                  value={spell.description || ""}
                  onChange={(e) => characterDetails.updateSpell(index, { description: e.target.value })}
                  disabled={isSaving}
                  placeholder="Spell description (optional)"
                  rows={2}
                />
              </div>
            ))}
            <Button onClick={characterDetails.addSpell} disabled={isSaving} size="sm" variant="outline" className="text-xs">
              <Plus size={16} className="mr-2" />
              Add Spell
            </Button>
          </div>

          {/* Special Abilities Section */}
          <div className="space-y-2">
            <div className="font-mono px-1 text-primary-200">Special Abilities</div>
            {(char.specialAbilities || []).map((ability, index) => (
              <div key={index} className="flex gap-2">
                <Input value={ability} onChange={(e) => characterDetails.updateSpecialAbility(index, e.target.value)} disabled={isSaving} placeholder="Special ability name" className="flex-1" />
                <Button onClick={() => characterDetails.removeSpecialAbility(index)} disabled={isSaving} size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
                  <X size={16} />
                </Button>
              </div>
            ))}
            <Button onClick={characterDetails.addSpecialAbility} disabled={isSaving} size="sm" variant="outline" className="text-xs">
              <Plus size={16} className="mr-2" />
              Add Special Ability
            </Button>
          </div>

          {/* Equipment Section */}
          <div className="space-y-2">
            <div className="font-mono px-1 text-primary-200">Equipment</div>
            {(char.equipment || []).map((item, index) => (
              <div key={index} className="space-y-2 p-3 border border-white/10 rounded">
                <div className="flex gap-2">
                  <Input value={item.name} onChange={(e) => characterDetails.updateEquipmentItem(index, { name: e.target.value })} disabled={isSaving} placeholder="Item name" className="flex-1" />
                  <Button onClick={() => characterDetails.removeEquipmentItem(index)} disabled={isSaving} size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
                    <X size={16} />
                  </Button>
                </div>
                <Textarea
                  value={item.description || ""}
                  onChange={(e) => characterDetails.updateEquipmentItem(index, { description: e.target.value })}
                  disabled={isSaving}
                  placeholder="Item description (optional)"
                  rows={2}
                />
              </div>
            ))}
            <Button onClick={characterDetails.addEquipmentItem} disabled={isSaving} size="sm" variant="outline" className="text-xs">
              <Plus size={16} className="mr-2" />
              Add Equipment
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
