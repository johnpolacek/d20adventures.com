"use client"

import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { ImageUpload } from "@/components/ui/image-upload"

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

  return (
    <>
      <div className="grid grid-cols-2 gap-8 pb-4" id="adventure-plan-main-top">
        <div>
          <label htmlFor="adventureImage" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
            Cover Image
          </label>
          <ImageUpload id="adventureImage" value={image} onChange={onImageChange} onRemove={onImageRemove} folder={imageUploadFolder} />
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="teaser" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
              Teaser
            </label>
            <Textarea id="teaser" value={teaser} onChange={(e) => onTeaserChange(e.target.value)} placeholder="A short, enticing teaser for the adventure..." rows={3} disabled={isSaving} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="minPartySize" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
                Min Party Size
              </label>
              <Input
                id="minPartySize"
                type="number"
                value={minPartySize}
                onChange={(e) => onMinPartySizeChange(parseInt(e.target.value, 10) || 0)}
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
                value={maxPartySize}
                onChange={(e) => onMaxPartySizeChange(parseInt(e.target.value, 10) || 0)}
                placeholder="Maximum party size"
                disabled={isSaving}
                min={minPartySize || 1}
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="overview" className="block text-sm font-medium font-mono text-primary-200/90 mb-1">
          Overview
        </label>
        <Textarea id="overview" value={overview} onChange={(e) => onOverviewChange(e.target.value)} placeholder="A broader overview of the adventure plan..." rows={6} disabled={isSaving} />
      </div>
    </>
  )
}
