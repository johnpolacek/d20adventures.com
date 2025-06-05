"use client"

import * as React from "react"
import type { Character, NPC, EquipmentItem } from "@/types/character"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { ImageUpload } from "@/components/ui/image-upload"
import { Card, CardContent } from "@/components/ui/card"
import { Trash2, Plus, X } from "lucide-react"
import { IMAGE_HOST } from "@/lib/config"

interface AdventurePlanNpcsEditProps {
  id: string
  npcs: Record<string, Character>
  onNpcsChange: (newNpcs: Record<string, Character>) => void
  isSaving: boolean
  adventurePlanId: string
  settingId: string
}

export function AdventurePlanNpcsEdit({ id, npcs, onNpcsChange, isSaving, adventurePlanId, settingId }: AdventurePlanNpcsEditProps) {
  const addNewNpc = () => {
    const newId = `npc-${Date.now()}`
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

    onNpcsChange({
      ...npcs,
      [newId]: newNpc,
    })
  }

  const updateNpc = (npcId: string, updates: Partial<NPC>) => {
    const updatedNpcs = {
      ...npcs,
      [npcId]: {
        ...npcs[npcId],
        ...updates,
      } as NPC,
    }
    onNpcsChange(updatedNpcs)
  }

  const removeNpc = (npcId: string) => {
    const updatedNpcs = { ...npcs }
    delete updatedNpcs[npcId]
    onNpcsChange(updatedNpcs)
  }

  const updateEquipment = (npcId: string, equipment: EquipmentItem[]) => {
    updateNpc(npcId, { equipment })
  }

  const addEquipmentItem = (npcId: string) => {
    const npc = npcs[npcId] as NPC
    const newEquipment = [...(npc.equipment || []), { name: "", description: "" }]
    updateEquipment(npcId, newEquipment)
  }

  const removeEquipmentItem = (npcId: string, index: number) => {
    const npc = npcs[npcId] as NPC
    const newEquipment = (npc.equipment || []).filter((_, i) => i !== index)
    updateEquipment(npcId, newEquipment)
  }

  const updateEquipmentItem = (npcId: string, index: number, updates: Partial<EquipmentItem>) => {
    const npc = npcs[npcId] as NPC
    const newEquipment = (npc.equipment || []).map((item, i) => (i === index ? { ...item, ...updates } : item))
    updateEquipment(npcId, newEquipment)
  }

  const updateSkills = (npcId: string, skills: string[]) => {
    updateNpc(npcId, { skills })
  }

  const addSkill = (npcId: string) => {
    const npc = npcs[npcId] as NPC
    const newSkills = [...(npc.skills || []), ""]
    updateSkills(npcId, newSkills)
  }

  const removeSkill = (npcId: string, index: number) => {
    const npc = npcs[npcId] as NPC
    const newSkills = (npc.skills || []).filter((_, i) => i !== index)
    updateSkills(npcId, newSkills)
  }

  const updateSkill = (npcId: string, index: number, skill: string) => {
    const npc = npcs[npcId] as NPC
    const newSkills = (npc.skills || []).map((s, i) => (i === index ? skill : s))
    updateSkills(npcId, newSkills)
  }

  const updateAttributes = (npcId: string, attribute: string, value: number) => {
    const npc = npcs[npcId] as NPC
    const newAttributes = {
      ...npc.attributes,
      [attribute]: value,
    }
    updateNpc(npcId, { attributes: newAttributes })
  }

  return (
    <div id={id} className="border-t border-white/20 pt-8 mt-8 w-full flex flex-col gap-4 scroll-mt-20">
      <div className="flex items-center justify-between">
        <h4 className="font-mono opacity-70 text-sm text-indigo-300/80 font-bold tracking-widest uppercase">NPCs</h4>
        <Button onClick={addNewNpc} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 hover:scale-100">
          <Plus size={16} />
          Add NPC
        </Button>
      </div>

      {Object.keys(npcs).length === 0 && <p className="text-sm text-gray-400 italic text-center py-8">No NPCs added yet.</p>}

      <div className="space-y-4">
        {Object.entries(npcs).map(([npcId, npcData]) => {
          const npc = npcData as NPC
          const imageUploadFolder = `images/settings/${settingId}/${adventurePlanId}/npcs`
          const imageUrl = npc.image ? IMAGE_HOST + npc.image : ""

          return (
            <Card key={npcId} className="bg-white/5 border-white/20 text-white">
              <CardContent className="grid grid-cols-2 gap-8 relative">
                <div className="flex flex-col">
                  <Button onClick={() => removeNpc(npcId)} disabled={isSaving} size="icon" className="text-red-400 hover:text-red-300 hover:bg-red-400/10 absolute -top-4 right-2">
                    <X size={16} />
                  </Button>
                  <div className="text-lg font-display text-amber-300/90">{npc.name || "Unnamed NPC"}</div>
                  <div className="pb-4">
                    <Label className="font-mono p-1 text-primary-200" htmlFor={`npc-image-${npcId}`}>
                      Image
                    </Label>
                    <ImageUpload
                      id={`npc-image-${npcId}`}
                      value={imageUrl || ""}
                      onChange={(url) => updateNpc(npcId, { image: url })}
                      onRemove={() => updateNpc(npcId, { image: "" })}
                      folder={imageUploadFolder}
                      className="aspect-square"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="font-mono p-1 text-primary-200" htmlFor={`npc-name-${npcId}`}>
                        Name
                      </Label>
                      <Input id={`npc-name-${npcId}`} value={npc.name || ""} onChange={(e) => updateNpc(npcId, { name: e.target.value })} disabled={isSaving} placeholder="NPC Name" />
                    </div>
                    <div>
                      <Label className="font-mono p-1 text-primary-200" htmlFor={`npc-archetype-${npcId}`}>
                        Archetype
                      </Label>
                      <Input
                        id={`npc-archetype-${npcId}`}
                        value={npc.archetype || ""}
                        onChange={(e) => updateNpc(npcId, { archetype: e.target.value })}
                        disabled={isSaving}
                        placeholder="e.g., Guard, Merchant, Noble"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label className="font-mono p-1 text-primary-200" htmlFor={`npc-race-${npcId}`}>
                        Race
                      </Label>
                      <Input id={`npc-race-${npcId}`} value={npc.race || ""} onChange={(e) => updateNpc(npcId, { race: e.target.value })} disabled={isSaving} placeholder="e.g., Human, Elf, Dwarf" />
                    </div>
                    <div>
                      <Label className="font-mono p-1 text-primary-200" htmlFor={`npc-gender-${npcId}`}>
                        Gender
                      </Label>
                      <Input id={`npc-gender-${npcId}`} value={npc.gender || ""} onChange={(e) => updateNpc(npcId, { gender: e.target.value })} disabled={isSaving} placeholder="Optional" />
                    </div>
                    <div>
                      <Label className="font-mono p-1 text-primary-200" htmlFor={`npc-health-${npcId}`}>
                        Health %
                      </Label>
                      <Input
                        id={`npc-health-${npcId}`}
                        type="number"
                        min="0"
                        max="100"
                        value={npc.healthPercent || 100}
                        onChange={(e) => updateNpc(npcId, { healthPercent: parseInt(e.target.value) || 100 })}
                        disabled={isSaving}
                      />
                    </div>
                  </div>
                </div>
                <div className="pt-8 flex flex-col gap-4">
                  <div>
                    <Label className="font-mono p-1 text-primary-200" htmlFor={`npc-appearance-${npcId}`}>
                      Appearance
                    </Label>
                    <Textarea
                      id={`npc-appearance-${npcId}`}
                      value={npc.appearance || ""}
                      onChange={(e) => updateNpc(npcId, { appearance: e.target.value })}
                      disabled={isSaving}
                      placeholder="Physical description of the NPC"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label className="font-mono p-1 text-primary-200" htmlFor={`npc-personality-${npcId}`}>
                      Personality
                    </Label>
                    <Textarea
                      id={`npc-personality-${npcId}`}
                      value={npc.personality || ""}
                      onChange={(e) => updateNpc(npcId, { personality: e.target.value })}
                      disabled={isSaving}
                      placeholder="Personality traits, mannerisms, speech patterns"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label className="font-mono p-1 text-primary-200" htmlFor={`npc-background-${npcId}`}>
                      Background
                    </Label>
                    <Textarea
                      id={`npc-background-${npcId}`}
                      value={npc.background || ""}
                      onChange={(e) => updateNpc(npcId, { background: e.target.value })}
                      disabled={isSaving}
                      placeholder="Background story and history"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label className="font-mono p-1 text-primary-200" htmlFor={`npc-motivation-${npcId}`}>
                      Motivation
                    </Label>
                    <Textarea
                      id={`npc-motivation-${npcId}`}
                      value={npc.motivation || ""}
                      onChange={(e) => updateNpc(npcId, { motivation: e.target.value })}
                      disabled={isSaving}
                      placeholder="What drives this NPC? Goals and desires"
                      rows={2}
                    />
                  </div>
                  <div>
                    <Label className="font-mono p-1 text-primary-200" htmlFor={`npc-behavior-${npcId}`}>
                      Behavior
                    </Label>
                    <Textarea
                      id={`npc-behavior-${npcId}`}
                      value={npc.behavior || ""}
                      onChange={(e) => updateNpc(npcId, { behavior: e.target.value })}
                      disabled={isSaving}
                      placeholder="How does this NPC typically behave in interactions?"
                      rows={2}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    {["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"].map((attr) => (
                      <div key={attr}>
                        <Label className="font-mono p-1 text-primary-200 capitalize" htmlFor={`npc-${attr}-${npcId}`}>
                          {attr}
                        </Label>
                        <Input
                          id={`npc-${attr}-${npcId}`}
                          type="number"
                          min="1"
                          max="20"
                          value={npc.attributes?.[attr as keyof typeof npc.attributes] || ""}
                          onChange={(e) => updateAttributes(npcId, attr, parseInt(e.target.value) || 0)}
                          disabled={isSaving}
                          placeholder="1-20"
                        />
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="font-mono p-1 text-primary-200">Skills</div>
                    {(npc.skills || []).map((skill, index) => (
                      <div key={index} className="flex gap-2">
                        <Input value={skill} onChange={(e) => updateSkill(npcId, index, e.target.value)} disabled={isSaving} placeholder="Skill name" className="flex-1" />
                        <Button onClick={() => removeSkill(npcId, index)} disabled={isSaving} size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
                          <Trash2 size={16} />
                        </Button>
                      </div>
                    ))}
                    <Button onClick={() => addSkill(npcId)} disabled={isSaving} size="sm" variant="outline" className="text-xs">
                      <Plus size={16} className="mr-2" />
                      Add Skill
                    </Button>
                  </div>
                  <div>
                    <div className="font-mono p-1 text-primary-200">Equipment</div>
                    {(npc.equipment || []).map((item, index) => (
                      <div key={index} className="space-y-2 p-3 border border-white/10 rounded">
                        <div className="flex gap-2">
                          <Input value={item.name} onChange={(e) => updateEquipmentItem(npcId, index, { name: e.target.value })} disabled={isSaving} placeholder="Item name" className="flex-1" />
                          <Button onClick={() => removeEquipmentItem(npcId, index)} disabled={isSaving} size="sm" variant="ghost" className="text-red-400 hover:text-red-300">
                            <Trash2 size={16} />
                          </Button>
                        </div>
                        <Textarea
                          value={item.description || ""}
                          onChange={(e) => updateEquipmentItem(npcId, index, { description: e.target.value })}
                          disabled={isSaving}
                          placeholder="Item description (optional)"
                          rows={2}
                        />
                      </div>
                    ))}
                    <Button onClick={() => addEquipmentItem(npcId)} disabled={isSaving} size="sm" variant="outline" className="text-xs">
                      <Plus size={16} className="mr-2" />
                      Add Equipment
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Add NPC button at bottom for convenience */}
      {Object.keys(npcs).length > 0 && (
        <div className="flex justify-center pt-4">
          <Button onClick={addNewNpc} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2 text-sm">
            <Plus size={16} />
            Add Another NPC
          </Button>
        </div>
      )}
    </div>
  )
}
