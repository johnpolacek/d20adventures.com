import { z } from "zod"

// Feedback from the app goes to the website with the device token, like the account commands, so Rust adds the
// token and the webview never sees it. The webview shrinks each screenshot to a JPEG and passes it here as base64.

// The website's limits, from lib/feedback/shared.ts. The runtime is bundled apart from the website, so it keeps its own copy.
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
const MAX_SCREENSHOTS = 3

export const feedbackCommandSchema = z.object({
  kind: z.literal("accountFeedback"),
  token: z.string().optional(),
  // The note as the website's feedback route takes it, without its screenshots. The website checks it.
  feedback: z.record(z.string(), z.unknown()),
  // JPEG images as base64.
  images: z.array(z.string()).max(MAX_SCREENSHOTS).default([]),
})
export type FeedbackCommand = z.input<typeof feedbackCommandSchema>
export type FeedbackResponse = { sent: boolean; error?: string }

const FAILED = "Could not send your feedback. Try again."

export async function feedbackCommand(input: FeedbackCommand, site: string, fetchImpl: typeof fetch = fetch): Promise<FeedbackResponse> {
  const command = feedbackCommandSchema.parse(input)
  if (!command.token) return { sent: false, error: "Link this computer to your account to send feedback." }
  const auth = { Authorization: `Bearer ${command.token}` }
  try {
    const screenshots: string[] = []
    for (const image of command.images) {
      const bytes = Buffer.from(image, "base64")
      if (bytes.length > MAX_UPLOAD_BYTES) return { sent: false, error: "That screenshot is too large." }
      const sent = await fetchImpl(`${site}/api/feedback/upload`, { method: "POST", headers: { ...auth, "Content-Type": "image/jpeg" }, body: bytes, signal: AbortSignal.timeout(60_000) })
      const { key, error } = (await sent.json().catch(() => ({}))) as { key?: string; error?: string }
      if (!sent.ok || !key) return { sent: false, error: error ?? "A screenshot could not upload. Try again." }
      screenshots.push(key)
    }
    const res = await fetchImpl(`${site}/api/feedback`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ ...command.feedback, screenshots }),
      signal: AbortSignal.timeout(15_000),
    })
    if (res.ok) return { sent: true }
    return { sent: false, error: ((await res.json().catch(() => ({}))) as { error?: string }).error ?? FAILED }
  } catch {
    return { sent: false, error: FAILED }
  }
}
