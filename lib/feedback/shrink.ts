import { MAX_UPLOAD_BYTES } from "./shared"

// Browser only. A screenshot is redrawn as a JPEG small enough to send in one request: at most this many pixels on its
// long side, then at falling quality and size until it fits. An animated GIF keeps its first frame.
const LONG_SIDE = 2560
const QUALITIES = [0.86, 0.76, 0.64, 0.5, 0.4]

export async function shrinkScreenshot(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    let scale = Math.min(1, LONG_SIDE / Math.max(bitmap.width, bitmap.height))
    for (const quality of QUALITIES) {
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const ctx = canvas.getContext("2d")
      if (!ctx) break
      // JPEG has no transparency. Clear pixels would turn black unevenly, so they are painted black first.
      ctx.fillStyle = "#000"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", quality))
      if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob
      scale *= 0.8
    }
    throw new Error("The screenshot could not be made small enough to send.")
  } finally {
    bitmap.close()
  }
}
