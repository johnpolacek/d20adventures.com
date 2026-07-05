export type StoryviewSpeaker = "narrator" | string // characterId

export interface TurnAudioSegment {
  partIndex: number // index into parseNarrative() parts for the turn's narrative
  speaker: StoryviewSpeaker
  characterName?: string
  text: string
  voice: string
  audioKey: string
  durationSec: number
}

export type TurnAudioStatus = "generating" | "ready" | "error"

export interface TurnAudioSegmentWithUrl extends TurnAudioSegment {
  audioUrl: string
}

// Shape returned by GET /api/adventure/turn-audio/[turnId]
export interface TurnAudioManifestResponse {
  status: TurnAudioStatus | "none"
  segments?: TurnAudioSegmentWithUrl[]
  // True when the stored audio was generated from an older version of the
  // turn's narrative (narratives get patched mid-turn).
  stale?: boolean
  error?: string
}
