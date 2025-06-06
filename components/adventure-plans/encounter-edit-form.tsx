"use client"

import * as React from "react"
import { AdventureEncounter, EncounterTransition, AdventureSection, EncounterCharacterRef } from "@/types/adventure-plan"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ImageUpload } from "@/components/ui/image-upload"
import { Button } from "@/components/ui/button"
import { X, Plus } from "lucide-react"

interface EncounterEditFormProps {
  id: string
  encounter: AdventureEncounter
  adventurePlanId: string
  settingId: string
  sectionIndex: number
  sceneIndex: number
  encounterIndex: number
  allSections: AdventureSection[] // Properly typed sections array
  availableNpcs: Record<string, { id: string; name: string }> // Available NPCs from adventure plan
  onTitleChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newTitle: string) => void
  onIntroChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newIntro: string) => void
  onIdChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newId: string) => void // Keep this for now, we'll use it later
  onInstructionsChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newInstructions: string) => void
  onSkipInitialNpcTurnsChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newValue: boolean) => void
  onResetHealthChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newValue: boolean) => void
  onImageChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newImageUrl: string) => void
  onTransitionsChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newTransitions: EncounterTransition[]) => void
  onNpcChange: (sectionIndex: number, sceneIndex: number, encounterIndex: number, newNpcs: EncounterCharacterRef[]) => void
  onDelete: (sectionIndex: number, sceneIndex: number, encounterIndex: number) => void
  isSaving: boolean
}

export function EncounterEditForm({
  id,
  encounter,
  adventurePlanId,
  settingId,
  sectionIndex,
  sceneIndex,
  encounterIndex,
  allSections,
  availableNpcs,
  onTitleChange,
  onIntroChange,
  onInstructionsChange,
  onSkipInitialNpcTurnsChange,
  onResetHealthChange,
  onImageChange,
  onTransitionsChange,
  onNpcChange,
  onDelete,
  isSaving,
}: EncounterEditFormProps) {
  React.useEffect(() => {
    console.log("[EncounterEditForm] Component rendered/updated")
    console.log("[EncounterEditForm] Encounter data:", encounter)
    console.log("[EncounterEditForm] Encounter title:", encounter.title)
    console.log("[EncounterEditForm] Is saving:", isSaving)
  }, [encounter, isSaving])

  const handleTitleChange = (newTitle: string) => {
    console.log("[EncounterEditForm] handleTitleChange called with:", newTitle)
    console.log("[EncounterEditForm] Current encounter title:", encounter.title)
    console.log("[EncounterEditForm] Section/Scene/Encounter indices:", sectionIndex, sceneIndex, encounterIndex)

    onTitleChange(sectionIndex, sceneIndex, encounterIndex, newTitle)
  }

  const getAllEncounterIds = () => {
    const encounters: { id: string; title: string; sectionTitle?: string; sceneTitle?: string }[] = []
    allSections.forEach((section) => {
      section.scenes?.forEach((scene) => {
        scene.encounters?.forEach((enc) => {
          if (enc.id) {
            encounters.push({
              id: enc.id,
              title: enc.title || "Untitled Encounter",
              sectionTitle: section.title,
              sceneTitle: scene.title,
            })
          }
        })
      })
    })
    return encounters
  }

  const availableEncounters = getAllEncounterIds()
  const transitions = encounter.transitions || []

  const handleAddTransition = () => {
    const newTransitions = [...transitions, { condition: "", encounter: "" }]
    onTransitionsChange(sectionIndex, sceneIndex, encounterIndex, newTransitions)
  }

  const handleTransitionChange = (transitionIndex: number, field: "condition" | "encounter", value: string) => {
    const newTransitions = transitions.map((transition, idx) => {
      if (idx === transitionIndex) {
        return { ...transition, [field]: value }
      }
      return transition
    })
    onTransitionsChange(sectionIndex, sceneIndex, encounterIndex, newTransitions)
  }

  const handleRemoveTransition = (transitionIndex: number) => {
    const newTransitions = transitions.filter((_, idx) => idx !== transitionIndex)
    onTransitionsChange(sectionIndex, sceneIndex, encounterIndex, newTransitions)
  }

  const handleAddNpc = () => {
    const newNpcs = [...(encounter.npc || []), { id: "", behavior: "", initialInitiative: 0 }]
    onNpcChange(sectionIndex, sceneIndex, encounterIndex, newNpcs)
  }

  const handleNpcChange = (npcIndex: number, field: "id" | "behavior" | "initialInitiative", value: string | number) => {
    const newNpcs = (encounter.npc || []).map((npc, idx) => {
      if (idx === npcIndex) {
        return { ...npc, [field]: value }
      }
      return npc
    })
    onNpcChange(sectionIndex, sceneIndex, encounterIndex, newNpcs)
  }

  const handleRemoveNpc = (npcIndex: number) => {
    const newNpcs = (encounter.npc || []).filter((_, idx) => idx !== npcIndex)
    onNpcChange(sectionIndex, sceneIndex, encounterIndex, newNpcs)
  }

  const baseId = `encounter-${sectionIndex}-${sceneIndex}-${encounterIndex}`
  const imageUploadFolder = `images/settings/${settingId}/${adventurePlanId}/encounters/${encounter.id || `temp-${baseId}`}`

  return (
    <div id={id} className="border border-white/20 rounded-lg p-4 mt-8 flex flex-col gap-4 relative">
      <div className="absolute top-2 right-2 text-xxs font-mono text-white/60 px-1.5 pt-8 pb-2 rounded">{encounter.id || ""}</div>
      <Button
        onClick={() => onDelete(sectionIndex, sceneIndex, encounterIndex)}
        disabled={isSaving}
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 p-0 h-6 w-6 text-red-400 hover:text-red-300 hover:bg-red-400/10 z-10"
      >
        <X size={14} />
      </Button>
      <h4 className="text-lg font-bold font-display text-amber-300/80 text-center pt-4">
        <span className="relative -top-4">{encounter.title}</span>
      </h4>

      <div>
        <Label htmlFor={`${baseId}-image-upload`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
          Encounter Image
        </Label>
        <ImageUpload
          id={`${baseId}-image-upload`}
          value={encounter.image || ""}
          onChange={(newUrl) => onImageChange(sectionIndex, sceneIndex, encounterIndex, newUrl)}
          onRemove={() => onImageChange(sectionIndex, sceneIndex, encounterIndex, "")}
          folder={imageUploadFolder}
        />
      </div>

      <div>
        <Label htmlFor={`${baseId}-title`} className="block text-sm font-medium font-mono text-primary-200/90 cursor-pointer mb-1">
          Encounter Title
        </Label>
        <Input
          id={`${baseId}-title`}
          value={encounter.title}
          onChange={(e) => {
            console.log("[EncounterEditForm] Input onChange triggered, value:", e.target.value)
            handleTitleChange(e.target.value)
          }}
          placeholder="Enter encounter title"
          disabled={isSaving}
          className="bg-white/10 placeholder:text-white/40"
        />
      </div>
      <div>
        <Label htmlFor={`${baseId}-intro`} className="block text-sm font-medium font-mono text-primary-200/90 cursor-pointer mb-1">
          Encounter Intro
        </Label>
        <Textarea
          id={`${baseId}-intro`}
          value={encounter.intro}
          onChange={(e) => onIntroChange(sectionIndex, sceneIndex, encounterIndex, e.target.value)}
          placeholder="Enter encounter introduction narrative"
          rows={5}
          disabled={isSaving}
          className="bg-white/10 placeholder:text-white/40"
        />
      </div>
      <div>
        <Label htmlFor={`${baseId}-instructions`} className="block text-sm font-medium font-mono text-primary-200/90 cursor-pointer mb-1">
          Instructions
        </Label>
        <Textarea
          id={`${baseId}-instructions`}
          value={encounter.instructions}
          onChange={(e) => onInstructionsChange(sectionIndex, sceneIndex, encounterIndex, e.target.value)}
          placeholder="Enter GM instructions for the encounter"
          rows={5}
          disabled={isSaving}
          className="bg-white/10 placeholder:text-white/40"
        />
      </div>

      {/* Transitions Section */}
      <div className="border-t border-white/10 pt-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-sm font-medium font-mono text-primary-200/90">Transitions</Label>
          <Button onClick={handleAddTransition} disabled={isSaving} size="sm" variant="outline" className="h-8 px-2 text-xs">
            <Plus size={12} className="mr-1" />
            Add Transition
          </Button>
        </div>

        {transitions.length === 0 ? (
          <p className="text-xs text-gray-400 italic mb-2">No transitions defined. This encounter will end the adventure.</p>
        ) : (
          <div className="space-y-3">
            {transitions.map((transition, tIndex) => (
              <div key={tIndex} className="border border-white/10 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-white/60">Transition {tIndex + 1}</span>
                  <Button onClick={() => handleRemoveTransition(tIndex)} disabled={isSaving} size="icon" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10">
                    <X size={10} />
                  </Button>
                </div>

                <div>
                  <Label htmlFor={`${baseId}-transition-${tIndex}-condition`} className="text-xs font-mono text-primary-200/90 mb-1 block">
                    Condition
                  </Label>
                  <Textarea
                    id={`${baseId}-transition-${tIndex}-condition`}
                    value={transition.condition}
                    onChange={(e) => handleTransitionChange(tIndex, "condition", e.target.value)}
                    placeholder="e.g., 'Player successfully unlocks the door' or 'Combat ends with all enemies defeated'"
                    rows={2}
                    disabled={isSaving}
                    className="bg-white/5 placeholder:text-white/40 text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor={`${baseId}-transition-${tIndex}-encounter`} className="text-xs font-mono text-primary-200/90 mb-1 block">
                    Target Encounter
                  </Label>
                  <select
                    id={`${baseId}-transition-${tIndex}-encounter`}
                    value={transition.encounter}
                    onChange={(e) => handleTransitionChange(tIndex, "encounter", e.target.value)}
                    disabled={isSaving}
                    className="w-full bg-white/5 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder:text-white/40"
                  >
                    <option value="">Select target encounter...</option>
                    {availableEncounters.map((enc) => (
                      <option key={enc.id} value={enc.id} className="bg-gray-800">
                        {enc.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NPCs Section */}
      <div className="border-t border-white/10 pt-4">
        <div className="flex items-center justify-between mb-3">
          <Label className="text-sm font-medium font-mono text-primary-200/90">NPCs in Encounter</Label>
          <Button onClick={handleAddNpc} disabled={isSaving} size="sm" variant="outline" className="h-8 px-2 text-xs">
            <Plus size={12} className="mr-1" />
            Add NPC
          </Button>
        </div>

        {!encounter.npc || encounter.npc.length === 0 ? (
          <p className="text-xs text-gray-400 italic mb-2">No NPCs assigned to this encounter.</p>
        ) : (
          <div className="space-y-3">
            {encounter.npc.map((npc, nIndex) => (
              <div key={nIndex} className="border border-white/10 rounded p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono text-white/60">NPC {nIndex + 1}</span>
                  <Button onClick={() => handleRemoveNpc(nIndex)} disabled={isSaving} size="icon" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10">
                    <X size={10} />
                  </Button>
                </div>

                <div>
                  <Label htmlFor={`${baseId}-npc-${nIndex}-id`} className="text-xs font-mono text-primary-200/90 mb-1 block">
                    NPC Character
                  </Label>
                  <select
                    id={`${baseId}-npc-${nIndex}-id`}
                    value={npc.id}
                    onChange={(e) => handleNpcChange(nIndex, "id", e.target.value)}
                    disabled={isSaving}
                    className="w-full bg-white/5 border border-white/20 rounded px-2 py-1 text-xs text-white placeholder:text-white/40"
                  >
                    <option value="">Select NPC...</option>
                    {Object.entries(availableNpcs).map(([npcId, npcData]) => (
                      <option key={npcId} value={npcId} className="bg-gray-800">
                        {npcData.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor={`${baseId}-npc-${nIndex}-behavior`} className="text-xs font-mono text-primary-200/90 mb-1 block">
                    Behavior Instructions
                  </Label>
                  <Textarea
                    id={`${baseId}-npc-${nIndex}-behavior`}
                    value={npc.behavior}
                    onChange={(e) => handleNpcChange(nIndex, "behavior", e.target.value)}
                    placeholder="e.g., 'Aggressive attacker, focuses on spellcasters' or 'Tries to negotiate before fighting'"
                    rows={2}
                    disabled={isSaving}
                    className="bg-white/5 placeholder:text-white/40 text-xs"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center space-x-2 pt-2">
        <Checkbox
          id={`${baseId}-skipNpcTurns`}
          checked={encounter.skipInitialNpcTurns || false}
          onCheckedChange={(checked) => onSkipInitialNpcTurnsChange(sectionIndex, sceneIndex, encounterIndex, !!checked)}
          disabled={isSaving}
        />
        <Label htmlFor={`${baseId}-skipNpcTurns`} className="text-sm font-medium font-mono text-primary-200/90 cursor-pointer">
          Skip Initial NPC Turns?
        </Label>
      </div>
      <div className="flex items-center space-x-2">
        <Checkbox
          id={`${baseId}-resetHealth`}
          checked={encounter.resetHealth || false}
          onCheckedChange={(checked) => onResetHealthChange(sectionIndex, sceneIndex, encounterIndex, !!checked)}
          disabled={isSaving}
        />
        <Label htmlFor={`${baseId}-resetHealth`} className="text-sm font-medium font-mono text-primary-200/90 cursor-pointer">
          Reset Health on Encounter Start?
        </Label>
      </div>
    </div>
  )
}
