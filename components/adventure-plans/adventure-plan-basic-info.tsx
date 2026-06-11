"use client"

import { Pencil } from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { ImageUpload } from "@/components/ui/image-upload"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Image from "@/components/ui/native-image"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { RULES_PRESETS } from "@/types/adventure-plan"

interface AdventurePlanBasicInfoProps {
  adventurePlanId: string
  settingId: string
  image: string
  teaser: string
  overview: string
  minPartySize: number
  maxPartySize: number
  isSaving: boolean
  onImageChange: (url: string) => void
  onImageRemove: () => void
  onTeaserChange: (teaser: string) => void
  onOverviewChange: (overview: string) => void
  onMinPartySizeChange: (size: number) => void
  onMaxPartySizeChange: (size: number) => void
  premadeOnly: boolean
  setPremadeOnly: (val: boolean) => void
  availableCharacterOptions: { races: string[]; archetypes: string[] }
  setAvailableCharacterOptions: (opts: { races: string[]; archetypes: string[] }) => void
  nextAdventure: string
  setNextAdventure: (val: string) => void
  otherAdventurePlans: { id: string; title: string }[]
  saveAdventurePlan: (overrideImage?: string, overrideDraft?: boolean, characterOptions?: { races: string[]; archetypes: string[] }, nextAdventureId?: string) => Promise<boolean>
}

export function AdventurePlanBasicInfo({
  adventurePlanId,
  settingId,
  image,
  teaser,
  overview,
  minPartySize,
  maxPartySize,
  isSaving,
  onImageChange,
  onImageRemove,
  onTeaserChange,
  onOverviewChange,
  onMinPartySizeChange,
  onMaxPartySizeChange,
  premadeOnly,
  setPremadeOnly,
  availableCharacterOptions,
  setAvailableCharacterOptions,
  nextAdventure,
  setNextAdventure,
  otherAdventurePlans,
  saveAdventurePlan,
}: AdventurePlanBasicInfoProps) {
  const imageUploadFolder = `images/settings/${settingId}/${adventurePlanId}`
  const [isEditing, setIsEditing] = useState(false)
  // Local state for editing fields
  const [editImage, setEditImage] = useState(image)
  const [editTeaser, setEditTeaser] = useState(teaser)
  const [editOverview, setEditOverview] = useState(overview)
  const [editMinPartySize, setEditMinPartySize] = useState(minPartySize)
  const [editMaxPartySize, setEditMaxPartySize] = useState(maxPartySize)

  // Reset local state when entering edit mode
  const handleEdit = () => {
    setEditImage(image)
    setEditTeaser(teaser)
    setEditOverview(overview)
    setEditMinPartySize(minPartySize)
    setEditMaxPartySize(maxPartySize)
    setIsEditing(true)
  }

  // Save changes and exit edit mode
  const handleSave = () => {
    if (editImage !== image) onImageChange(editImage)
    if (editTeaser !== teaser) onTeaserChange(editTeaser)
    if (editOverview !== overview) onOverviewChange(editOverview)
    if (editMinPartySize !== minPartySize) onMinPartySizeChange(editMinPartySize)
    if (editMaxPartySize !== maxPartySize) onMaxPartySizeChange(editMaxPartySize)
    setIsEditing(false)
  }

  // Cancel editing and revert changes
  const handleCancel = () => {
    setEditImage(image)
    setEditTeaser(teaser)
    setEditOverview(overview)
    setEditMinPartySize(minPartySize)
    setEditMaxPartySize(maxPartySize)
    setIsEditing(false)
  }

  function getDisplayUrl(value: string): string {
    if (!value) return value
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return value
    }
    const IMAGE_HOST = process.env.NEXT_PUBLIC_IMAGE_HOST || ""
    return `${IMAGE_HOST}/${value.replace(/^\/+/, "")}`
  }

  if (!isEditing) {
    // Collapsed read-only view
    const displayUrl = getDisplayUrl(image)
    return (
      <div className="rounded-lg overflow-hidden relative">
        {displayUrl && (
          <div className="w-full aspect-video relative">
            <Image src={displayUrl} alt="Adventure Cover" fill className="object-cover" />
            <div className="absolute bottom-0 left-0 w-full h-3/4 bg-gradient-to-t from-black via-black/90 to-transparent" />
          </div>
        )}
        <div className="flex flex-col gap-2 px-8 -mt-40 relative z-10 line-clamp-3">
          <div className="text-center text-primary-200 italic">
            {minPartySize === maxPartySize ? `An adventure for ${minPartySize} player${minPartySize === 1 ? "" : "s"}` : `An adventure for ${minPartySize} to ${maxPartySize} players`}
          </div>
          <div className="text-lg text-white/80 line-clamp-2">{teaser || <span className="text-muted-foreground">No teaser provided.</span>}</div>
          {nextAdventure &&
            otherAdventurePlans &&
            otherAdventurePlans.length > 0 &&
            (() => {
              const nextPlan = otherAdventurePlans.find((plan) => plan.id === nextAdventure)
              return nextPlan ? <div className="text-center text-lg pt-4 text-amber-300/70 italic">Next adventure: {nextPlan.title}</div> : null
            })()}
        </div>
        <div className="flex justify-end absolute top-4 right-4 z-10">
          <Button className="text-sm bg-primary-700 py-1" variant="outline" onClick={handleEdit} type="button">
            <Pencil className="w-3 h-3 mr-0.5" />
            Edit Adventure Settings
          </Button>
        </div>
      </div>
    )
  }

  // Editable form view
  return (
    <>
      <div className="grid grid-cols-2 gap-8 pb-4" id="adventure-plan-main-top">
        <div>
          <label htmlFor="adventureImage" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
            Cover Image
          </label>
          <ImageUpload id="adventureImage" value={editImage} onChange={setEditImage} onRemove={onImageRemove} folder={imageUploadFolder} />
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="teaser" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
              Teaser
            </label>
            <Textarea id="teaser" value={editTeaser} onChange={(e) => setEditTeaser(e.target.value)} placeholder="A short, enticing teaser for the adventure..." rows={3} disabled={isSaving} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="minPartySize" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                Min Party Size
              </label>
              <Input
                id="minPartySize"
                type="number"
                value={editMinPartySize}
                onChange={(e) => setEditMinPartySize(Number.parseInt(e.target.value, 10) || 0)}
                placeholder="Minimum party size"
                disabled={isSaving}
                min={1}
              />
            </div>
            <div>
              <label htmlFor="maxPartySize" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                Max Party Size
              </label>
              <Input
                id="maxPartySize"
                type="number"
                value={editMaxPartySize}
                onChange={(e) => setEditMaxPartySize(Number.parseInt(e.target.value, 10) || 0)}
                placeholder="Maximum party size"
                disabled={isSaving}
                min={editMinPartySize || 1}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Character Options Controls */}
      <div className="my-8 space-y-6">
        {/* Premade Characters Only Toggle */}
        <div className="flex items-center gap-4">
          <Switch
            id="premade-only-toggle"
            checked={premadeOnly}
            onCheckedChange={(checked) => {
              setPremadeOnly(checked)
              if (checked) {
                setAvailableCharacterOptions({ races: [], archetypes: [] })
              } else {
                setAvailableCharacterOptions(availableCharacterOptions)
              }
            }}
            disabled={isSaving}
          />
          <Label htmlFor="premade-only-toggle" className="font-mono text-primary-200">
            Premade Characters Only
          </Label>
        </div>
        {/* Rules System Preset Select (native select) */}
        <div className={cn("flex items-center gap-4", premadeOnly && "hidden")}>
          <Label className="font-mono text-primary-200" htmlFor="rules-preset-select">
            Apply Standard Races & Archetypes
          </Label>
          <select
            id="rules-preset-select"
            className="w-56 bg-white/5 border border-white/20 rounded px-2 py-1 text-sm text-white placeholder:text-white/40"
            onChange={(e) => {
              const val = e.target.value
              if (!val) return
              const preset = RULES_PRESETS.find((p) => p.value === val)
              if (preset) {
                setAvailableCharacterOptions({
                  races: preset.races,
                  archetypes: preset.archetypes,
                })
              }
            }}
            disabled={isSaving}
            defaultValue=""
          >
            <option value="" disabled>
              Select a genre...
            </option>
            {RULES_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>
        <div className={cn("flex flex-col md:flex-row gap-8", premadeOnly && "hidden")}>
          <div className="flex-1">
            <Label className="font-mono p-1 text-primary-200" htmlFor="available-races">
              Available Races (comma separated)
            </Label>
            <Input
              id="available-races"
              value={availableCharacterOptions.races.join(", ")}
              onChange={(e) => {
                const races = e.target.value
                  .split(",")
                  .map((r) => r.trim())
                  .filter(Boolean)
                setAvailableCharacterOptions({ ...availableCharacterOptions, races })
              }}
              placeholder="e.g., Human, Elf, Dwarf, Halfling"
              disabled={isSaving}
            />
          </div>
          <div className="flex-1">
            <Label className="font-mono p-1 text-primary-200" htmlFor="available-archetypes">
              Available Archetypes (comma separated)
            </Label>
            <Input
              id="available-archetypes"
              value={availableCharacterOptions.archetypes.join(", ")}
              onChange={(e) => {
                const archetypes = e.target.value
                  .split(",")
                  .map((a) => a.trim())
                  .filter(Boolean)
                setAvailableCharacterOptions({ ...availableCharacterOptions, archetypes })
              }}
              placeholder="e.g., Fighter, Wizard, Rogue, Bard"
              disabled={isSaving || premadeOnly}
            />
          </div>
        </div>
      </div>
      {/* Next Adventure Selection */}
      <div className="mt-8 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="font-mono text-primary-200" htmlFor="next-adventure">
            Next Adventure in Series
          </Label>
          <div className="text-sm text-primary-200/60">Optional</div>
        </div>
        <select
          id="next-adventure"
          className="w-full bg-white/5 border border-white/20 rounded px-2 py-1 text-sm text-white placeholder:text-white/40"
          onChange={async (e) => {
            const nextAdventureId = e.target.value || undefined
            setNextAdventure(e.target.value)
            await saveAdventurePlan(undefined, undefined, premadeOnly ? undefined : availableCharacterOptions, nextAdventureId)
          }}
          value={nextAdventure}
          disabled={isSaving || otherAdventurePlans.length === 0}
        >
          <option value="">None - This is a standalone adventure</option>
          {otherAdventurePlans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {plan.title}
            </option>
          ))}
        </select>
        {otherAdventurePlans.length === 0 && <div className="text-sm text-primary-200/60">No other adventures available in this setting</div>}
      </div>

      <div>
        <label htmlFor="overview" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
          Overview
        </label>
        <Textarea id="overview" value={editOverview} onChange={(e) => setEditOverview(e.target.value)} placeholder="A broader overview of the adventure plan..." rows={6} disabled={isSaving} />
      </div>
      <div className="flex gap-2 justify-end mt-4">
        <Button variant="outline" onClick={handleCancel} type="button" disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} type="button" disabled={isSaving}>
          Save
        </Button>
      </div>
    </>
  )
}
