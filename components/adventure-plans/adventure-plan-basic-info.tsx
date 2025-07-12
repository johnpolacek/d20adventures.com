"use client"

import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { ImageUpload } from "@/components/ui/image-upload"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import { Pencil } from "lucide-react"

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
            <div className="absolute bottom-0 left-0 w-full h-3/4 bg-gradient-to-t from-black via-black/90 to-transparent"></div>
          </div>
        )}
        <div className="flex flex-col gap-2 px-8 -mt-40 relative z-10 line-clamp-3">
          <div className="text-center text-primary-200 italic">
            An adventure for {minPartySize} to {maxPartySize} players.
          </div>
          <div className="text-lg text-white/80 line-clamp-2">{teaser || <span className="text-muted-foreground">No teaser provided.</span>}</div>
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
                onChange={(e) => setEditMinPartySize(parseInt(e.target.value, 10) || 0)}
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
                onChange={(e) => setEditMaxPartySize(parseInt(e.target.value, 10) || 0)}
                placeholder="Maximum party size"
                disabled={isSaving}
                min={editMinPartySize || 1}
              />
            </div>
          </div>
        </div>
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
