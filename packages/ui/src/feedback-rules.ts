import { z } from "zod"

// What a player may send from the game: a note, an ending's answers, and a few screenshots.

// A picked screenshot may be this large. The browser shrinks it to a JPEG before it is sent.
export const MAX_SCREENSHOT_BYTES = 20 * 1024 * 1024
// What the upload route takes: a shrunk JPEG, under the host's limit on a request's size.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024
export const MAX_SCREENSHOTS = 3
export const SCREENSHOT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"]

const note = z.string().trim().max(4000, "Keep each answer under 4,000 characters.")

export const feedbackSchema = z
  .object({
    kind: z.enum(["general", "ending"]),
    message: note.default(""),
    rating: z.number().int().min(1).max(5).optional(),
    bestMoment: note.optional(),
    broke: note.optional(),
    // Keys the upload route gave for this player's screenshots.
    screenshots: z.array(z.string().min(1).max(200)).max(MAX_SCREENSHOTS).default([]),
    // Where the player was: the adventure, encounter, turn and Game Master.
    context: z
      .record(z.string().max(40), z.string().max(300))
      .default({})
      .refine((context) => Object.keys(context).length <= 20, "Too much context."),
  })
  .refine((f) => Boolean(f.message || f.rating || f.bestMoment || f.broke || f.screenshots.length), "Write a note, pick a rating or attach a screenshot.")

/** A player's feedback before it is sent, with its screenshots still files. */
export type FeedbackDraft = {
  kind: "general" | "ending"
  message: string
  rating?: number
  bestMoment?: string
  broke?: string
  files: File[]
  context: Record<string, string>
}

/** Why a file cannot be attached, or null when it can. */
export function screenshotProblem(file: { type: string; size: number }) {
  if (!SCREENSHOT_TYPES.includes(file.type)) return "Screenshots must be PNG, JPEG, WebP or GIF images."
  if (file.size > MAX_SCREENSHOT_BYTES) return "Each screenshot must be 20 MB or smaller."
  return null
}
