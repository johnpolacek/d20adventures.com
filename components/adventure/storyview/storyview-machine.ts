import type { StoryviewAutoStatus, TurnAudioSegmentWithUrl } from "@/types/turn-audio"

export const MAX_POLL_ATTEMPTS = 90

export type StoryviewPlayback =
  | { kind: "playing"; slideIndex: number; segmentIndex: number }
  | { kind: "paused"; slideIndex: number; segmentIndex: number }
  | { kind: "finished"; slideIndex: number; segmentIndex: number }

export type StoryviewState =
  | { kind: "closed" }
  | { kind: "fetching"; storyviewAuto?: StoryviewAutoStatus }
  | { kind: "generating"; attempts: number; storyviewAuto?: StoryviewAutoStatus }
  | { kind: "error"; code: "error" | "insufficient-tokens"; message: string; storyviewAuto?: StoryviewAutoStatus }
  | { kind: "ready"; segments: TurnAudioSegmentWithUrl[]; playback: StoryviewPlayback; storyviewAuto?: StoryviewAutoStatus }

export type StoryviewAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "GENERATING"; storyviewAuto?: StoryviewAutoStatus }
  | { type: "POLL_TICK"; storyviewAuto?: StoryviewAutoStatus }
  | { type: "MANIFEST_READY"; segments: TurnAudioSegmentWithUrl[]; storyviewAuto?: StoryviewAutoStatus; autoPlay?: boolean }
  | { type: "FAILED"; code: "error" | "insufficient-tokens"; message: string; storyviewAuto?: StoryviewAutoStatus }
  | { type: "PLAY" }
  | { type: "PAUSE" }
  | { type: "ADVANCE"; slideSegmentCounts: number[] }
  | { type: "GO_TO_SLIDE"; index: number; slideCount: number }

function prevAuto(state: StoryviewState): StoryviewAutoStatus | undefined {
  return state.kind === "closed" ? undefined : state.storyviewAuto
}

export function storyviewReducer(state: StoryviewState, action: StoryviewAction): StoryviewState {
  switch (action.type) {
    case "OPEN":
      return { kind: "fetching" }

    case "CLOSE":
      return { kind: "closed" }

    case "GENERATING":
      return {
        kind: "generating",
        attempts: 0,
        storyviewAuto: action.storyviewAuto ?? prevAuto(state),
      }

    case "POLL_TICK": {
      if (state.kind !== "generating") return state
      const attempts = state.attempts + 1
      const storyviewAuto = action.storyviewAuto ?? state.storyviewAuto
      if (attempts >= MAX_POLL_ATTEMPTS) {
        return {
          kind: "error",
          code: "error",
          message: "Narration generation timed out. Please try again.",
          storyviewAuto,
        }
      }
      return { kind: "generating", attempts, storyviewAuto }
    }

    case "MANIFEST_READY":
      return {
        kind: "ready",
        segments: action.segments,
        playback: { kind: action.autoPlay === false ? "paused" : "playing", slideIndex: 0, segmentIndex: 0 },
        storyviewAuto: action.storyviewAuto ?? prevAuto(state),
      }

    case "FAILED":
      return {
        kind: "error",
        code: action.code,
        message: action.message,
        storyviewAuto: action.storyviewAuto ?? prevAuto(state),
      }

    case "PLAY": {
      if (state.kind !== "ready") return state
      if (state.playback.kind === "finished") {
        return { ...state, playback: { kind: "playing", slideIndex: 0, segmentIndex: 0 } }
      }
      if (state.playback.kind === "playing") return state
      return { ...state, playback: { ...state.playback, kind: "playing" } }
    }

    case "PAUSE": {
      if (state.kind !== "ready" || state.playback.kind !== "playing") return state
      return { ...state, playback: { ...state.playback, kind: "paused" } }
    }

    case "ADVANCE": {
      if (state.kind !== "ready") return state
      const { slideIndex, segmentIndex } = state.playback
      const totalSlides = action.slideSegmentCounts.length
      if (slideIndex >= totalSlides) {
        return { ...state, playback: { kind: "finished", slideIndex, segmentIndex } }
      }
      const segCount = action.slideSegmentCounts[slideIndex] ?? 0
      if (segmentIndex < segCount - 1) {
        return { ...state, playback: { ...state.playback, segmentIndex: segmentIndex + 1 } }
      }
      if (slideIndex < totalSlides - 1) {
        return { ...state, playback: { ...state.playback, slideIndex: slideIndex + 1, segmentIndex: 0 } }
      }
      return { ...state, playback: { kind: "finished", slideIndex, segmentIndex } }
    }

    case "GO_TO_SLIDE": {
      if (state.kind !== "ready") return state
      if (action.index < 0 || action.index >= action.slideCount) return state
      const nextKind = state.playback.kind === "playing" ? "playing" : "paused"
      return { ...state, playback: { kind: nextKind, slideIndex: action.index, segmentIndex: 0 } }
    }
  }
}
