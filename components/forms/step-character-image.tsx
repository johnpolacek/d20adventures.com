import { ImageUpload } from "@/components/ui/image-upload"
import { Button } from "../ui/button"
import { Label } from "../ui/label"
import React from "react"

interface StepCharacterImageProps {
  image: string
  onImageChange: (url: string) => void
  onImageRemove: () => void
  settingId: string
  adventurePlanId: string
  onNext: () => void
  onBack?: () => void
}

export default function StepCharacterImage({ image, onImageChange, onImageRemove, settingId, adventurePlanId, onNext, onBack }: StepCharacterImageProps) {
  const imageUploadFolder = `images/settings/${settingId}/${adventurePlanId}/pcs`
  return (
    <div className="w-full max-w-md mx-auto flex flex-col items-center gap-8">
      <div className="w-full">
        <Label htmlFor="character-image-upload" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
          Character Image
        </Label>
        <ImageUpload id="character-image-upload" value={image} onChange={onImageChange} onRemove={onImageRemove} folder={imageUploadFolder} className="aspect-square" />
      </div>
      <div className="flex gap-4 justify-center mt-4">
        {onBack && (
          <Button type="button" variant="ghost" onClick={onBack}>
            Back
          </Button>
        )}
        <Button type="button" variant="epic" onClick={onNext} disabled={!image}>
          Next
        </Button>
      </div>
    </div>
  )
}
