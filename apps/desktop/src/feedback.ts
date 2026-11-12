import type { FeedbackDraft } from "@/lib/feedback/shared"
import { shrinkScreenshot } from "@/lib/feedback/shrink"
import { feedback } from "./bridge"

const base64 = (blob: Blob) =>
  new Promise<string>((done, fail) => {
    const reader = new FileReader()
    reader.onload = () => done(String(reader.result).split(",")[1] ?? "")
    reader.onerror = () => fail(reader.error)
    reader.readAsDataURL(blob)
  })

/**
 * Sends feedback from the app. The webview may not reach the website, so each screenshot is shrunk here and the
 * runtime posts it. Resolves to an error, or null.
 */
export async function sendFeedback(draft: FeedbackDraft): Promise<string | null> {
  const { files, ...note } = draft
  try {
    const images: string[] = []
    for (const file of files) {
      const image = await shrinkScreenshot(file).catch(() => null)
      if (!image) return `${file.name} could not be read as an image.`
      images.push(await base64(image))
    }
    const res = await feedback({ kind: "accountFeedback", feedback: note, images })
    return res?.sent ? null : (res?.error ?? "Could not send your feedback. Try again.")
  } catch {
    return "Could not send your feedback. Try again."
  }
}
