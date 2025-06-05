"use client"

import { useCallback, useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ImagePlus, X, Loader } from "lucide-react"
import Image from "next/image"
import { toast } from "sonner"
import { useFileUpload } from "@/lib/upload-utils"
import { cn } from "@/lib/utils"

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  onRemove: () => void
  folder?: string
  id?: string
  className?: string
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
        onChange(imageUrl)
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

  const isUsableUrl = value && (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/"))

  return (
    <div className="flex flex-col items-center gap-4">
      <div className={cn("relative aspect-video w-full overflow-hidden rounded-lg border border-white/20", className)}>
        {isUsableUrl ? (
          <>
            <Image src={value} alt="" fill className="object-cover" />
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
