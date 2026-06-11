"use client"

import { useState } from "react"

interface UploadOptions {
  folder?: string
  maxSize?: number // in bytes
  allowedTypes?: string[]
}

const RASTER_UPLOAD_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])
const RASTER_UPLOAD_TARGET_SIZE = 5 * 1024 * 1024

const defaultOptions: UploadOptions = {
  folder: "uploads",
  maxSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"],
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file)

  try {
    const image = new Image()
    image.decoding = "async"
    image.src = url
    await image.decode()
    return image
  } finally {
    URL.revokeObjectURL(url)
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Could not compress image"))
          return
        }
        resolve(blob)
      },
      type,
      quality
    )
  })
}

function compressedFileName(fileName: string, outputType: string) {
  const extension = outputType === "image/png" ? "png" : outputType === "image/jpeg" ? "jpg" : "webp"
  const baseName = fileName.replace(/\.[^.]+$/, "") || "image"
  return `${baseName}.${extension}`
}

export async function compressRasterImageForUpload(file: File, targetSize = RASTER_UPLOAD_TARGET_SIZE): Promise<File> {
  if (!RASTER_UPLOAD_TYPES.has(file.type) || file.size <= targetSize) {
    return file
  }

  const sourceImage = await loadImage(file)
  const outputType = file.type === "image/png" ? "image/png" : "image/webp"
  let width = Math.max(1, Math.floor(sourceImage.naturalWidth * 0.5))
  let height = Math.max(1, Math.floor(sourceImage.naturalHeight * 0.5))

  while (width >= 1 && height >= 1) {
    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext("2d")
    if (!context) {
      throw new Error("Could not prepare image compression")
    }

    context.drawImage(sourceImage, 0, 0, width, height)
    const blob = await canvasToBlob(canvas, outputType, 0.86)

    if (blob.size <= targetSize) {
      return new File([blob], compressedFileName(file.name, outputType), {
        type: outputType,
        lastModified: Date.now(),
      })
    }

    if (width === 1 && height === 1) {
      break
    }

    width = Math.max(1, Math.floor(width * 0.5))
    height = Math.max(1, Math.floor(height * 0.5))
  }

  throw new Error("Could not compress image below the upload target")
}

export async function uploadFile(file: File, options: UploadOptions = {}): Promise<string> {
  const { folder = "uploads", maxSize, allowedTypes } = { ...defaultOptions, ...options }

  if (!file) {
    throw new Error("No file provided")
  }

  const uploadFile = await compressRasterImageForUpload(file)

  // Validate file type if allowedTypes is provided
  if (allowedTypes && !allowedTypes.includes(uploadFile.type)) {
    throw new Error(`File type not allowed. Please upload one of: ${allowedTypes.join(", ")}`)
  }

  // Validate file size if maxSize is provided
  if (maxSize && uploadFile.size > maxSize) {
    throw new Error(`File size exceeds ${Math.round(maxSize / (1024 * 1024))}MB limit`)
  }

  const formData = new FormData()
  formData.append("file", uploadFile)
  formData.append("folder", folder)

  try {
    const response = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      const data = await response.json()
      throw new Error(data.error || "Failed to upload file")
    }

    const data = await response.json()
    return data.url
  } catch (error) {
    console.error("Error uploading file:", error)
    throw error
  }
}

export function useFileUpload(options: UploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false)

  const upload = async (file: File): Promise<string> => {
    setIsUploading(true)
    try {
      const url = await uploadFile(file, options)
      return url
    } finally {
      setIsUploading(false)
    }
  }

  return {
    upload,
    isUploading,
  }
}
