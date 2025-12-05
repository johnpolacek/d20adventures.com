import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Image from "next/image"

interface AdventurePlanBasicInfoCollapsedProps {
  image: string
  teaser: string
  overview: string
  minPartySize: number
  maxPartySize: number
  onEdit: () => void
}

function getDisplayUrl(value: string): string {
  if (!value) return value
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value
  }
  // Use the same IMAGE_HOST as in ImageUpload
  const IMAGE_HOST = process.env.NEXT_PUBLIC_IMAGE_HOST || ""
  return `${IMAGE_HOST}/${value.replace(/^\/+/, "")}`
}

export function AdventurePlanBasicInfoCollapsed({ image, teaser, overview, minPartySize, maxPartySize, onEdit }: AdventurePlanBasicInfoCollapsedProps) {
  const displayUrl = getDisplayUrl(image)
  return (
    <Card className="mb-6">
      <CardContent className="p-6 flex flex-col gap-6">
        {displayUrl && (
          <div className="w-full aspect-video relative rounded-lg overflow-hidden border border-white/20">
            <Image src={displayUrl} alt="Adventure Cover" fill className="object-cover" />
          </div>
        )}
        <div className="flex flex-col gap-2">
          <div>
            <span className="block text-xs font-mono text-primary-200/70 mb-1">Teaser</span>
            <div className="text-base font-medium text-primary-100">{teaser || <span className="text-muted-foreground">No teaser provided.</span>}</div>
          </div>
          <div>
            <span className="block text-xs font-mono text-primary-200/70 mb-1">Overview</span>
            <div className="text-sm text-primary-100 whitespace-pre-line">{overview || <span className="text-muted-foreground">No overview provided.</span>}</div>
          </div>
          <div className="flex gap-4 mt-2">
            <div>
              <span className="block text-xs font-mono text-primary-200/70 mb-1">Min Party Size</span>
              <span className="text-base font-semibold">{minPartySize}</span>
            </div>
            <div>
              <span className="block text-xs font-mono text-primary-200/70 mb-1">Max Party Size</span>
              <span className="text-base font-semibold">{maxPartySize}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <Button variant="outline" onClick={onEdit} type="button">
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
