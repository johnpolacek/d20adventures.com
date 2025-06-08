"use client"

import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ImageUpload } from "@/components/ui/image-upload"

interface SettingBasicInfoProps {
  settingId: string
  name: string
  description: string
  genre: string
  image: string
  technology: string
  magic: string
  isPublic: boolean
  isSaving: boolean
  onNameChange: (name: string) => void
  onDescriptionChange: (description: string) => void
  onGenreChange: (genre: string) => void
  onImageChange: (url: string) => void
  onImageRemove: () => void
  onTechnologyChange: (technology: string) => void
  onMagicChange: (magic: string) => void
  onIsPublicChange: (isPublic: boolean) => void
}

export function SettingBasicInfo({
  settingId,
  name,
  description,
  genre,
  image,
  technology,
  magic,
  isPublic,
  isSaving,
  onNameChange,
  onDescriptionChange,
  onGenreChange,
  onImageChange,
  onImageRemove,
  onTechnologyChange,
  onMagicChange,
  onIsPublicChange,
}: SettingBasicInfoProps) {
  const imageUploadFolder = `images/settings/${settingId}`

  return (
    <div className="space-y-6 p-4">
      <div className="grid grid-cols-2 gap-8" id="setting-main-top">
        <div>
          <Label htmlFor="settingImage" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
            Setting Image
          </Label>
          <ImageUpload id="settingImage" value={image} onChange={onImageChange} onRemove={onImageRemove} folder={imageUploadFolder} />
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="settingName" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
              Setting Name
            </Label>
            <Input id="settingName" value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Enter setting name..." disabled={isSaving} />
          </div>

          <div>
            <Label htmlFor="settingGenre" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
              Genre
            </Label>
            <Input id="settingGenre" value={genre} onChange={(e) => onGenreChange(e.target.value)} placeholder="Enter genre (e.g., Fantasy, Sci-Fi, Modern)..." disabled={isSaving} />
          </div>

          <div className="flex items-center space-x-2">
            <Switch id="isPublic" checked={isPublic} onCheckedChange={onIsPublicChange} disabled={isSaving} />
            <Label htmlFor="isPublic" className="text-sm font-medium font-mono text-primary-200/90">
              Public Setting
            </Label>
          </div>
        </div>
      </div>

      <div>
        <Label htmlFor="settingDescription" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
          Description
        </Label>
        <Textarea id="settingDescription" value={description} onChange={(e) => onDescriptionChange(e.target.value)} placeholder="Describe the setting..." rows={4} disabled={isSaving} />
      </div>

      <div>
        <Label htmlFor="settingTechnology" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
          Technology
        </Label>
        <Textarea
          id="settingTechnology"
          value={technology}
          onChange={(e) => onTechnologyChange(e.target.value)}
          placeholder="Describe the technology level and available tech..."
          rows={3}
          disabled={isSaving}
        />
      </div>

      <div>
        <Label htmlFor="settingMagic" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
          Magic
        </Label>
        <Textarea id="settingMagic" value={magic} onChange={(e) => onMagicChange(e.target.value)} placeholder="Describe the magic system and availability..." rows={3} disabled={isSaving} />
      </div>
    </div>
  )
}
