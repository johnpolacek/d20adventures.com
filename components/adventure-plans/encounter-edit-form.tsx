"use client"

import * as React from "react"
import { AdventureEncounter, EncounterTransition, AdventureSection, EncounterCharacterRef } from "@/types/adventure-plan"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { ImageUpload } from "@/components/ui/image-upload"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { X, ChevronsUp, Plus } from "lucide-react"
import { getImageUrl } from "@/lib/utils"
import { EncounterEditCollapsed } from "./encounter-edit-collapsed"
import { CharacterCard } from "./character-card"
import { Character } from "@/types/character"
import { CharacterGenerateForm } from "./character-generate-form"
import { useNpcManagement } from "./hooks/use-npc-management"

interface EncounterEditFormProps {
  id: string
  encounter: AdventureEncounter
  adventurePlanId: string
  settingId: string
  sectionIndex: number
  sceneIndex: number
  encounterIndex: number
  allSections: AdventureSection[] // Properly typed sections array
  availableNpcs: Record<string, Character> // Available NPCs from adventure plan
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
  onNpcsChange: (npcs: Record<string, Character>) => void
  setNpcs: React.Dispatch<React.SetStateAction<Record<string, Character>>>
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
  onNpcsChange,
  setNpcs,
  isSaving,
}: EncounterEditFormProps) {
  const [isEditing, setIsEditing] = React.useState(false)
  const [showGenerateForm, setShowGenerateForm] = React.useState(false)
  const [prevNpcIds, setPrevNpcIds] = React.useState<string[]>([])

  const npcManagement = useNpcManagement(availableNpcs, setNpcs)

  // Auto-expand new encounters
  React.useEffect(() => {
    if (!encounter.title) {
      setIsEditing(true)
    }
  }, [encounter.title])

  const toggleEditMode = () => {
    setIsEditing(!isEditing)
  }

  const handleTitleChange = (newTitle: string) => {
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

  const handleNpcChange = (npcIndex: number, field: "behavior" | "initialInitiative", value: string | number) => {
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
  const imageUrl = getImageUrl(encounter.image || "")

  const getAvailableEncountersForTransition = () => {
    const selectedEncounterIds = new Set(transitions.map((t) => t.encounter))
    return availableEncounters.filter((enc) => !selectedEncounterIds.has(enc.id))
  }
  const availableEncountersForTransition = getAvailableEncountersForTransition()
  const [addTransitionValue, setAddTransitionValue] = React.useState("")

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

  // Add New NPC logic (manual entry, similar to useNpcManagement)
  const handleAddNewNpc = () => {
    const newNpcId = npcManagement.handleNpcCreateDefault()
    if (newNpcId) {
      // Add to this encounter
      const newNpcs = [...(encounter.npc || []), { id: newNpcId, behavior: "", initialInitiative: 0 }]
      onNpcChange(sectionIndex, sceneIndex, encounterIndex, newNpcs)
    }
  }

  // Effect: When generate form closes, check for new NPC and add to encounter
  React.useEffect(() => {
    if (!showGenerateForm && prevNpcIds.length > 0) {
      const currentNpcIds = Object.keys(availableNpcs)
      const newNpcId = currentNpcIds.find((id) => !prevNpcIds.includes(id))
      if (newNpcId) {
        // Only add if not already in encounter
        if (!encounter.npc?.some((npc) => npc.id === newNpcId)) {
          const newNpcs = [...(encounter.npc || []), { id: newNpcId, behavior: "", initialInitiative: 0 }]
          onNpcChange(sectionIndex, sceneIndex, encounterIndex, newNpcs)
        }
      }
      setPrevNpcIds([])
    }
  }, [showGenerateForm, availableNpcs])

  return (
    <div id={id} className={`border border-white/20 rounded-lg mt-8 flex flex-col gap-4 relative ${!isEditing ? "py-0" : "p-4"}`}>
      {!isEditing ? (
        <EncounterEditCollapsed
          encounter={encounter}
          imageUrl={imageUrl}
          availableEncounters={availableEncounters}
          isSaving={isSaving}
          toggleEditMode={toggleEditMode}
          onDelete={onDelete}
          sectionIndex={sectionIndex}
          sceneIndex={sceneIndex}
          encounterIndex={encounterIndex}
        />
      ) : (
        // Expanded Mode
        <>
          <button onClick={toggleEditMode} className="text-sm flex gap-1 items-center absolute -top-5 right-3 text-indigo-400 hover:text-indigo-300">
            <ChevronsUp size={14} /> close
          </button>
          <div className="absolute -top-4 left-2 text-xxs font-mono text-white/60 px-1.5 pt-8 pb-2 rounded">{encounter.id || ""}</div>
          <h4 className="text-5xl font-display text-amber-400 text-center pt-4">{encounter.title}</h4>

          <div>
            <Label htmlFor={`${baseId}-image-upload`} className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
              Encounter Image
            </Label>
            <ImageUpload
              id={`${baseId}-image-upload`}
              value={encounter.image || ""}
              onChange={(newUrl) => {
                onImageChange(sectionIndex, sceneIndex, encounterIndex, newUrl)
              }}
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

          {/* NPCs Section */}
          <div className="border-t border-white/10 pt-4">
            <div className="mb-3">
              <Label className="text-lg font-display text-amber-400/90 pl-2">NPCs</Label>
            </div>

            {/* Add/Generate NPC Buttons */}
            <div className="flex gap-2 mb-4">
              <Button onClick={handleAddNewNpc} disabled={isSaving} size="sm" variant="outline" className="flex items-center gap-2">
                <Plus size={16} /> Add New NPC
              </Button>
              <Button
                onClick={() => {
                  setPrevNpcIds(Object.keys(availableNpcs))
                  setShowGenerateForm(true)
                }}
                disabled={isSaving}
                size="sm"
                variant="outline"
                className="flex items-center gap-2"
              >
                <Plus size={16} /> Generate NPC
              </Button>
            </div>
            {showGenerateForm && (
              <CharacterGenerateForm
                type="npcs"
                characters={availableNpcs}
                onCharactersChange={(characters) => {
                  if (Array.isArray(characters)) return
                  onNpcsChange(characters)
                }}
                onClose={() => setShowGenerateForm(false)}
              />
            )}

            {!encounter.npc || encounter.npc.length === 0 ? (
              <p className="text-xs text-gray-400 italic mb-2">No NPCs assigned to this encounter.</p>
            ) : (
              <div className="space-y-3 mb-3">
                {encounter.npc.map((npcRef, nIndex) => {
                  const npc = availableNpcs[npcRef.id]
                  if (!npc) return null

                  return (
                    <div key={npc.id} className="border border-white/10 rounded p-3">
                      <CharacterCard
                        char={npc}
                        charId={npc.id}
                        isNpcs={true}
                        isSaving={isSaving}
                        settingId={settingId}
                        adventurePlanId={adventurePlanId}
                        uniqueKey={npc.id}
                        editing={false}
                        onToggleEdit={() => {}}
                        updateCharacter={() => {}}
                        getCharacter={() => npc}
                      />
                      <div className="mt-2 space-y-2">
                        <div>
                          <Label htmlFor={`${baseId}-npc-${nIndex}-behavior`} className="text-xs font-mono text-primary-200/90 mb-1 block">
                            Behavior Instructions
                          </Label>
                          <Textarea
                            id={`${baseId}-npc-${nIndex}-behavior`}
                            value={npcRef.behavior}
                            onChange={(e) => handleNpcChange(nIndex, "behavior", e.target.value)}
                            placeholder="e.g., 'Aggressive attacker, focuses on spellcasters'"
                            rows={2}
                            disabled={isSaving}
                            className="bg-white/5 placeholder:text-white/40 text-xs"
                          />
                        </div>
                        <div className="flex justify-end">
                          <Button onClick={() => handleRemoveNpc(nIndex)} disabled={isSaving} size="sm" variant="ghost" className="text-xs text-red-400 hover:text-red-400 hover:bg-red-400/10">
                            <X size={12} /> Remove
                          </Button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Transitions Section */}
          <div className="border-t border-white/10 pt-4">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-lg font-display text-amber-400/90 pl-2">Transitions</Label>
            </div>

            {transitions.length === 0 ? (
              <p className="text-xs text-gray-400 italic mb-2">No transitions defined. This encounter will end the adventure.</p>
            ) : (
              <div className="space-y-2">
                {transitions.map((transition, tIndex) => (
                  <div key={tIndex} className="border border-white/10 rounded pb-2 space-y-2">
                    <div className="flex items-center justify-end -mb-4">
                      <Button
                        onClick={() => handleRemoveTransition(tIndex)}
                        disabled={isSaving}
                        size="icon"
                        variant="ghost"
                        className="scale-150 h-5 w-5 p-0 text-red-400 hover:text-red-300 hover:bg-red-400/10"
                      >
                        <X size={10} />
                      </Button>
                    </div>

                    <div>
                      <Label htmlFor={`${baseId}-transition-${tIndex}-encounter`} className="text-xs font-mono text-primary-200/90 mb-1 block">
                        Target Encounter
                      </Label>
                      <div className="max-w-[300px]">
                        <select
                          id={`${baseId}-transition-${tIndex}-encounter`}
                          value={transition.encounter}
                          onChange={(e) => handleTransitionChange(tIndex, "encounter", e.target.value)}
                          disabled={isSaving}
                          className="w-full bg-white/5 border border-white/20 rounded p-2 text-base text-white placeholder:text-white/40"
                        >
                          {!transition.encounter && <option value="">Select target encounter...</option>}
                          {availableEncounters.map((enc) => (
                            <option key={enc.id} value={enc.id} className="bg-gray-800">
                              {enc.title}
                            </option>
                          ))}
                        </select>
                      </div>
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
                  </div>
                ))}
              </div>
            )}

            {/* Add Transition Dropdown */}
            {availableEncountersForTransition.length > 0 && (
              <div className="max-w-[300px] mt-2">
                <select
                  value={addTransitionValue}
                  onChange={(e) => {
                    const selected = e.target.value
                    if (selected) {
                      const newTransitions = [...transitions, { condition: "", encounter: selected }]
                      onTransitionsChange(sectionIndex, sceneIndex, encounterIndex, newTransitions)
                      setAddTransitionValue("")
                    }
                  }}
                  disabled={isSaving}
                  className="w-full bg-white/5 border border-white/20 rounded p-2 text-xs text-white placeholder:text-white/40"
                >
                  <option value="">+ Add Transition</option>
                  {availableEncountersForTransition.map((enc) => (
                    <option key={enc.id} value={enc.id} className="bg-gray-800">
                      {enc.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
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

          <div className="w-full flex justify-end items-center">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={isSaving} size="sm" variant="ghost" className="flex items-center gap-2 text-red-400 hover:text-red-400 hover:bg-red-400/10 z-10">
                  <X size={14} />
                  Delete Encounter
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Encounter</AlertDialogTitle>
                  <AlertDialogDescription>Are you sure you want to delete the encounter “{encounter.title || "Untitled Encounter"}”? This action cannot be undone.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(sectionIndex, sceneIndex, encounterIndex)} className="bg-red-800 font-display font-bold hover:bg-red-700 focus:ring-red-800">
                    Delete Encounter
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      )}
    </div>
  )
}
