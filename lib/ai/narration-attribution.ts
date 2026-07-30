import { generateObject as baseGenerateObject, type Schema as AISchema } from "ai"
import { z } from "zod"
import { currentModel } from "./llm"
import { composeSystemPrompt } from "./style"

// Splits narrative paragraphs into ordered narration segments: narrator prose
// and per-character quoted dialogue. Dialogue has no structured attribution in
// the data model, so an LLM pass infers the speaker from context.
//
// Calls the model directly (no auth/charging wrapper): attribution runs in
// background auto-narration where there is no authenticated caller, and its
// provider tokens are folded into the caller's usage_tts_audio charge.

export interface AttributionCharacter {
  id: string
  name: string
  gender?: string
  personality?: string
}

export interface ParagraphInput {
  partIndex: number // index into parseNarrative() parts
  text: string
}

export interface AttributedSegment {
  partIndex: number
  speaker: string // "narrator" | characterId
  characterName?: string
  text: string
  styleHint?: string
}

const attributionSchema = z.object({
  paragraphs: z.array(
    z.object({
      partIndex: z.number(),
      segments: z.array(
        z.object({
          speaker: z.string().describe('"narrator" or the exact character id from the roster'),
          text: z.string().describe("Exact contiguous substring of the paragraph, including surrounding narration or quote marks"),
          styleHint: z.string().optional().describe("2-5 word vocal delivery hint, e.g. 'gruff, weary' or 'urgent whisper'"),
        })
      ),
    })
  ),
})

function normalizeForComparison(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function buildPrompt(paragraphs: ParagraphInput[], characters: AttributionCharacter[]): string {
  const roster = characters.map((c) => `- id: ${c.id} | name: ${c.name}${c.gender ? ` | gender: ${c.gender}` : ""}${c.personality ? ` | personality: ${c.personality}` : ""}`).join("\n")
  const paragraphList = paragraphs.map((p) => `[partIndex ${p.partIndex}]\n${p.text}`).join("\n\n")

  return `Split each narrative paragraph below into ordered segments for audio narration.

Rules:
- Quoted dialogue spoken aloud by a character on the roster gets that character's id as speaker. Everything else (prose, attribution tags like "she says", dialogue by characters not on the roster) is speaker "narrator".
- Quoted written text (notes, letters, messages, inscriptions) belongs to its author only if the author is on the roster; otherwise it is "narrator". Never attribute a quote to a character just because they are reading or receiving it.
- Keep dialogue attribution tags ("he whispers", "she says") with the narrator, not the character.
- Include the quote marks with the character's dialogue segment.
- Segments must appear in original order, and concatenating a paragraph's segment texts must reproduce the paragraph exactly, with no text dropped, added, or rephrased.
- If a paragraph has no roster-character dialogue, return it as a single narrator segment.
- For character segments, add a short styleHint describing vocal delivery based on the scene and the character's personality.

Character roster:
${roster}

Paragraphs:
${paragraphList}`
}

async function runAttributionModel(paragraphs: ParagraphInput[], characters: AttributionCharacter[]) {
  return await baseGenerateObject({
    prompt: buildPrompt(paragraphs, characters),
    system: composeSystemPrompt("You are a precise text segmentation engine for audio narration. You never rewrite source text."),
    schema: attributionSchema as unknown as AISchema,
    model: currentModel,
  })
}

// Falls back to a single narrator segment for any paragraph the LLM mangles;
// only throws if the underlying model call itself fails (after one retry).
// Accepts an explicit paragraph subset so incremental regeneration can
// attribute only new/changed paragraphs.
export async function attributeNarrative(paragraphs: ParagraphInput[], characters: AttributionCharacter[]): Promise<{ segments: AttributedSegment[]; usage: { totalTokens: number } }> {
  if (paragraphs.length === 0) return { segments: [], usage: { totalTokens: 0 } }

  const validIds = new Set(characters.map((c) => c.id))
  const idByName = new Map(characters.map((c) => [c.name.toLowerCase(), c.id]))
  const nameById = new Map(characters.map((c) => [c.id, c.name]))

  let response
  try {
    response = await runAttributionModel(paragraphs, characters)
  } catch (error) {
    console.warn("attributeNarrative: model call failed, retrying once:", error)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    response = await runAttributionModel(paragraphs, characters)
  }

  const object = response.object as z.infer<typeof attributionSchema>
  const totalTokens = response.usage?.totalTokens ?? 0

  const byPartIndex = new Map(object.paragraphs.map((p) => [p.partIndex, p.segments]))
  const segments: AttributedSegment[] = []

  for (const { partIndex, text } of paragraphs) {
    const paragraphSegments = byPartIndex.get(partIndex)
    const narratorFallback: AttributedSegment = { partIndex, speaker: "narrator", text }

    if (!paragraphSegments || paragraphSegments.length === 0) {
      segments.push(narratorFallback)
      continue
    }

    const resolved = paragraphSegments.map((segment) => {
      let speaker = segment.speaker
      if (speaker !== "narrator" && !validIds.has(speaker)) {
        speaker = idByName.get(speaker.toLowerCase()) ?? "narrator"
      }
      return {
        partIndex,
        speaker,
        characterName: speaker === "narrator" ? undefined : nameById.get(speaker),
        text: segment.text,
        styleHint: segment.styleHint,
      }
    })

    const reconstructed = normalizeForComparison(resolved.map((s) => s.text).join(""))
    if (reconstructed !== normalizeForComparison(text)) {
      console.warn(`attributeNarrative: segments for partIndex ${partIndex} do not reconstruct the paragraph; using narrator fallback`)
      segments.push(narratorFallback)
      continue
    }

    segments.push(...resolved)
  }

  return { segments, usage: { totalTokens } }
}
