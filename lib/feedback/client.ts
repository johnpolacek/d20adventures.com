import type { FeedbackDraft } from "./shared"
import { shrinkScreenshot } from "./shrink"

const FAILED = "Could not send your feedback. Try again."

/** Sends feedback from the website: each screenshot shrunk and uploaded, then the note. Resolves to an error, or null. */
export async function sendFeedback(draft: FeedbackDraft): Promise<string | null> {
  try {
    const screenshots: string[] = []
    for (const file of draft.files) {
      const image = await shrinkScreenshot(file).catch(() => null)
      if (!image) return `${file.name} could not be read as an image.`
      const sent = await fetch("/api/feedback/upload", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: image })
      const { key, error } = (await sent.json().catch(() => ({}))) as { key?: string; error?: string }
      if (!sent.ok || !key) return error ?? "A screenshot could not upload. Try again."
      screenshots.push(key)
    }
    const { files: _files, ...note } = draft
    const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...note, screenshots }) })
    if (res.ok) return null
    return ((await res.json().catch(() => ({}))) as { error?: string }).error ?? FAILED
  } catch {
    return FAILED
  }
}
