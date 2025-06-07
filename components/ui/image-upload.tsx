"use client"

import { useCallback, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ImagePlus, X, Loader } from "lucide-react"
import Image from "next/image"
import { toast } from "sonner"
import { useFileUpload } from "@/lib/upload-utils"
import { cn } from "@/lib/utils"
import { IMAGE_HOST } from "@/lib/config"

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  onRemove: () => void
  folder?: string
  id?: string
  className?: string
}

// Helper function to strip the image host domain from a URL to get the relative path
function stripImageHost(url: string): string {
  if (!url) return url

  // Remove the IMAGE_HOST domain if present
  if (url.startsWith(IMAGE_HOST)) {
    return url.replace(IMAGE_HOST, "").replace(/^\/+/, "") // Remove leading slashes
  }

  // Also handle the case where the URL might be from the CloudFront domain directly
  // Extract domain from IMAGE_HOST to handle both with and without protocols
  const imageHostDomain = IMAGE_HOST.replace(/^https?:\/\//, "")
  if (url.startsWith(`https://${imageHostDomain}/`)) {
    return url.replace(`https://${imageHostDomain}/`, "")
  }
  if (url.startsWith(`http://${imageHostDomain}/`)) {
    return url.replace(`http://${imageHostDomain}/`, "")
  }

  // If it's already a relative path, return as-is
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return url
  }

  return url
}

// Helper function to construct the full URL for display
function getDisplayUrl(value: string): string {
  if (!value) return value

  // If it's already a full URL, use it as-is
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value
  }

  // If it's a relative path, prepend the IMAGE_HOST
  return `${IMAGE_HOST}/${value.replace(/^\/+/, "")}`
}

export function ImageUpload({ id, value, onChange, onRemove, folder = "uploads", className }: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    console.log("ImageUpload: Received value prop:", value)
  }, [value])

  const { upload } = useFileUpload({
    folder,
    allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  })

  const handleUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      try {
        const file = e.target.files?.[0]
        if (!file) return

        setIsUploading(true)
        console.log(`ImageUpload: Uploading file: ${file.name} to folder: ${folder}`)
        const imageUrl = await upload(file)
        console.log("ImageUpload: Upload successful, imageUrl received:", imageUrl)

        // Strip the image host domain before storing the path
        const relativePath = stripImageHost(imageUrl)
        console.log("ImageUpload: Storing relative path:", relativePath)
        onChange(relativePath)

        toast.success("Image uploaded successfully!")
      } catch (error) {
        console.error("ImageUpload: Error during upload process:", error)
        toast.error(error instanceof Error ? error.message : "Failed to upload image")
      } finally {
        setIsUploading(false)
      }
    },
    [onChange, upload, folder]
  )

  // Get the display URL for showing the image
  const displayUrl = getDisplayUrl(value)
  const isUsableUrl = displayUrl && (displayUrl.startsWith("http://") || displayUrl.startsWith("https://") || displayUrl.startsWith("/"))

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={cn("relative aspect-video w-full overflow-hidden rounded-lg border border-white/20", className)}>
        {isUsableUrl ? (
          <>
            <Image src={displayUrl} alt="" fill className="object-cover" />
            <Button variant="ghost" size="icon" className="absolute h-6 w-6 p-0 right-2 top-2 text-red-500 hover:text-red-500 bg-black/50 hover:bg-black/60" onClick={onRemove}>
              <X className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            {value && !isUsableUrl && <p className="text-xs text-red-500 p-2 text-center">Image path appears invalid for display: {value}. Please re-upload or ensure the path is an absolute URL.</p>}
            <label className={`flex h-full w-full cursor-pointer items-center justify-center bg-gradient-to-tl from-white/10 to-transparent ${value && !isUsableUrl ? "pt-2" : ""}`}>
              <div className="flex flex-col items-center gap-2 text-primary">
                {isUploading ? <Loader className="h-8 w-8 animate-spin" /> : <ImagePlus className="h-8 w-8" />}
                <span className="text-sm font-mono">{isUploading ? "Uploading..." : "Upload Image"}</span>
              </div>
              <input id={id} type="file" accept="image/*" className="hidden" onChange={handleUpload} disabled={isUploading} />
            </label>
          </>
        )}
      </div>
    </div>
  )
}
