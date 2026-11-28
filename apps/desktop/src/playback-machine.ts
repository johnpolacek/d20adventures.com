import type { CardCharacter, CardRoll } from "@d20/ui/stage/prompt-card"

// Pure playback state machine for StagePlay.
// Replaces the coupled reading/roll-hold/past-round/level-up useStates and refs
// (previousText, redraw, land, resume, onScreen, viewing, held, paused, levelLater, continued)
// with one explicit discriminated union and pure reducer.

export type SeenSnapshot = {
  turnId: string | null
  paragraphs: readonly string[]
}

export type ReturnCursor = {
  turnId: string
  paragraph: number
  wasReading: boolean
  paragraphCount: number
}

export type HeldRoll = {
  turnId: string
  actor: CardCharacter
  roll: CardRoll
  dice: number[]
  at: number
  fromBeatCount: number
}

type PlaybackShared = {
  adventureId: string | null
  seen: SeenSnapshot
  onScreenTurnId: string | null
  rollTries: number
  continuedKey: string | null
  levelDeferredTurnId: string | null
}

export type PlaybackState = PlaybackShared &
  (
    | {
        phase: "reading"
        turnId: string
        paragraph: number
        paused: boolean
        prowlingKey: string | null
        viewingTurnId: string | null
        returnTo: ReturnCursor | null
      }
    | {
        phase: "interactive"
        turnId: string | null
        paragraph: number
      }
    | {
        phase: "roll_resolving"
        turnId: string
        paragraph: number
        roll: HeldRoll
      }
    | {
        phase: "roll_verdict"
        turnId: string
        paragraph: number
        roll: HeldRoll
        resumeParagraph: number
      }
    | {
        phase: "levelling"
        turnId: string
        paragraph: number
        heroId: string
      }
  )

export type PlaybackAction =
  | {
      type: "SYNC_STORY"
      adventureId: string | null
      turnId: string | null
      paragraphs: readonly string[]
      isPast: boolean
      /** Index of the last paragraph carrying a RollBeat for the currently held roll's actor, or -1. */
      rollBeatIndex: number
    }
  | { type: "RESET_ADVENTURE"; adventureId: string | null }
  | { type: "ADVANCE"; paragraphCount: number }
  | { type: "STEP_BACK" }
  | { type: "STEP_NEXT"; paragraphCount: number }
  | { type: "SKIP_READING" }
  | { type: "REPLAY"; turnId: string; paragraphCount: number }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "SET_PROWLING"; key: string }
  | { type: "CLEAR_PROWLING"; key: string }
  | {
      type: "GO_TO_ROUND"
      targetTurnId: string
      targetParagraphs: readonly string[]
      where: "start" | "end"
      liveTurnId: string
      liveParagraphCount: number
    }
  | {
      type: "RETURN_TO_LIVE"
      liveTurnId: string
      liveParagraphs: readonly string[]
    }
  | { type: "START_ROLL"; roll: HeldRoll }
  | { type: "ROLL_REJECTED" }
  | { type: "LEAVE_ROLL"; paragraphCount: number }
  | { type: "CLEAR_STALE_ROLL" }
  | { type: "OPEN_LEVEL"; turnId: string; heroId: string }
  | { type: "CLOSE_LEVEL" }
  | { type: "DEFER_LEVEL"; turnId: string }
  | { type: "MARK_CONTINUED"; key: string }

export const EMPTY_SEEN: SeenSnapshot = { turnId: null, paragraphs: [] }

export function initialPlaybackState(adventureId: string | null = null): PlaybackState {
  return {
    phase: "interactive",
    adventureId,
    turnId: null,
    paragraph: 0,
    seen: EMPTY_SEEN,
    onScreenTurnId: null,
    rollTries: 0,
    continuedKey: null,
    levelDeferredTurnId: null,
  }
}

export function isStorySynced(seen: SeenSnapshot, turnId: string | undefined, paragraphs: readonly string[]): boolean {
  const id = turnId ?? null
  if (seen.turnId !== id) return false
  if (seen.paragraphs === paragraphs) return true
  if (seen.paragraphs.length !== paragraphs.length) return false
  for (let i = 0; i < paragraphs.length; i++) {
    if (seen.paragraphs[i] !== paragraphs[i]) return false
  }
  return true
}

export function heldRollOf(state: PlaybackState): HeldRoll | null {
  return state.phase === "roll_resolving" || state.phase === "roll_verdict" ? state.roll : null
}

export function viewingTurnIdOf(state: PlaybackState): string | null {
  return state.phase === "reading" ? state.viewingTurnId : null
}

export function levellingHeroIdOf(state: PlaybackState): string | null {
  return state.phase === "levelling" ? state.heroId : null
}

export function isReadingOf(state: PlaybackState): boolean {
  return state.phase === "reading"
}

export function isPausedOf(state: PlaybackState): boolean {
  return state.phase === "reading" && state.paused
}

export function prowlingKeyOf(state: PlaybackState): string | null {
  return state.phase === "reading" ? state.prowlingKey : null
}

function sharedOf(state: PlaybackState): PlaybackShared {
  return {
    adventureId: state.adventureId,
    seen: state.seen,
    onScreenTurnId: state.onScreenTurnId,
    rollTries: state.rollTries,
    continuedKey: state.continuedKey,
    levelDeferredTurnId: state.levelDeferredTurnId,
  }
}

function firstChangedIndex(prev: readonly string[], next: readonly string[]): number {
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== prev[i]) return i
  }
  return -1
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case "RESET_ADVENTURE": {
      if (state.adventureId === action.adventureId && state.seen.turnId === null && state.phase === "interactive") {
        return state
      }
      return initialPlaybackState(action.adventureId)
    }

    case "SYNC_STORY": {
      // Switching adventures resets prior playback context before syncing the new turn.
      const base = action.adventureId !== state.adventureId ? initialPlaybackState(action.adventureId) : state
      const nextOnScreen = !action.isPast && action.turnId ? action.turnId : base.onScreenTurnId

      if (!action.turnId) {
        if (base.seen.turnId === null && base.seen.paragraphs.length === 0 && base.phase === "interactive") return base
        return {
          ...sharedOf(base),
          seen: EMPTY_SEEN,
          onScreenTurnId: null,
          phase: "interactive",
          turnId: null,
          paragraph: 0,
        }
      }

      const sameTurn = base.seen.turnId === action.turnId
      const changedAt = sameTurn ? firstChangedIndex(base.seen.paragraphs, action.paragraphs) : 0
      const unchanged = sameTurn && changedAt < 0 && action.paragraphs.length === base.seen.paragraphs.length

      if (unchanged) {
        if (nextOnScreen === base.onScreenTurnId && base === state) return state
        return { ...base, onScreenTurnId: nextOnScreen }
      }

      const nextSeen: SeenSnapshot = { turnId: action.turnId, paragraphs: action.paragraphs }
      const nextShared: PlaybackShared = { ...sharedOf(base), seen: nextSeen, onScreenTurnId: nextOnScreen }

      // While a roll is held on this turn, its answer waits for Continue and will resume after the roll beat.
      if (base.phase === "roll_resolving" || base.phase === "roll_verdict") {
        if (base.roll.turnId === action.turnId) {
          const resumeParagraph =
            action.rollBeatIndex >= 0
              ? action.rollBeatIndex + 1
              : base.phase === "roll_verdict"
                ? base.resumeParagraph
                : Math.max(0, changedAt)
          return {
            ...nextShared,
            phase: "roll_verdict",
            turnId: action.turnId,
            paragraph: resumeParagraph,
            roll: base.roll,
            resumeParagraph,
          }
        }
      }

      // Keep an open level-up modal undisturbed while recording the latest story snapshot.
      if (base.phase === "levelling") {
        return { ...base, ...nextShared }
      }

      // A turn with nothing told yet (such as a hero's own turn opening a round) shows its card immediately.
      if (action.paragraphs.length === 0) {
        return {
          ...nextShared,
          phase: "interactive",
          turnId: action.turnId,
          paragraph: 0,
        }
      }

      // Narration that arrives while an earlier paragraph of the same turn is still being read waits its turn.
      if (sameTurn && base.phase === "reading" && changedAt > base.paragraph) {
        return {
          ...base,
          ...nextShared,
        }
      }

      const startAt = Math.max(0, Math.min(changedAt < 0 ? 0 : changedAt, action.paragraphs.length - 1))
      return {
        ...nextShared,
        phase: "reading",
        turnId: action.turnId,
        paragraph: startAt,
        paused: false,
        prowlingKey: null,
        viewingTurnId: action.isPast ? action.turnId : null,
        returnTo: action.isPast && base.phase === "reading" ? base.returnTo : null,
      }
    }

    case "ADVANCE": {
      if (state.phase !== "reading") return state
      if (state.paragraph < action.paragraphCount - 1) {
        return { ...state, paragraph: state.paragraph + 1, prowlingKey: null }
      }
      if (state.viewingTurnId) return state
      return {
        ...sharedOf(state),
        phase: "interactive",
        turnId: state.turnId,
        paragraph: state.paragraph,
      }
    }

    case "STEP_BACK": {
      if (state.phase !== "reading" || state.paragraph <= 0) return state
      return { ...state, paragraph: state.paragraph - 1, prowlingKey: null }
    }

    case "STEP_NEXT": {
      if (state.phase !== "reading" || state.paragraph >= action.paragraphCount - 1) return state
      return { ...state, paragraph: state.paragraph + 1, prowlingKey: null }
    }

    case "SKIP_READING": {
      if (state.phase !== "reading" || state.viewingTurnId) return state
      return {
        ...sharedOf(state),
        phase: "interactive",
        turnId: state.turnId,
        paragraph: state.paragraph,
      }
    }

    case "REPLAY": {
      if (action.paragraphCount <= 0) return state
      if (state.phase === "roll_resolving" || state.phase === "roll_verdict" || state.phase === "levelling") return state
      return {
        ...sharedOf(state),
        phase: "reading",
        turnId: action.turnId,
        paragraph: 0,
        paused: false,
        prowlingKey: null,
        viewingTurnId: state.phase === "reading" ? state.viewingTurnId : null,
        returnTo: state.phase === "reading" ? state.returnTo : null,
      }
    }

    case "SET_PAUSED": {
      if (state.phase !== "reading" || state.paused === action.paused) return state
      return { ...state, paused: action.paused }
    }

    case "SET_PROWLING": {
      if (state.phase !== "reading" || state.prowlingKey === action.key) return state
      return { ...state, prowlingKey: action.key }
    }

    case "CLEAR_PROWLING": {
      if (state.phase !== "reading" || state.prowlingKey !== action.key) return state
      return { ...state, prowlingKey: null }
    }

    case "GO_TO_ROUND": {
      // Do not navigate away while a roll waits on the card or level-up is open.
      if (state.phase === "roll_resolving" || state.phase === "roll_verdict" || state.phase === "levelling") return state
      const isLive = action.targetTurnId === action.liveTurnId
      const existingReturn = state.phase === "reading" ? state.returnTo : null
      const returnTo: ReturnCursor | null = isLive
        ? null
        : existingReturn ?? {
            turnId: action.liveTurnId,
            paragraph: state.paragraph,
            wasReading: state.phase === "reading",
            paragraphCount: action.liveParagraphCount,
          }
      const nextSeen: SeenSnapshot = { turnId: action.targetTurnId, paragraphs: action.targetParagraphs }
      const nextShared: PlaybackShared = {
        ...sharedOf(state),
        seen: nextSeen,
        onScreenTurnId: isLive ? action.liveTurnId : state.onScreenTurnId,
      }
      if (action.targetParagraphs.length === 0) {
        return {
          ...nextShared,
          phase: "interactive",
          turnId: action.targetTurnId,
          paragraph: 0,
        }
      }
      const targetParagraph = action.where === "start" ? 0 : Math.max(0, action.targetParagraphs.length - 1)
      return {
        ...nextShared,
        phase: "reading",
        turnId: action.targetTurnId,
        paragraph: targetParagraph,
        paused: false,
        prowlingKey: null,
        viewingTurnId: isLive ? null : action.targetTurnId,
        returnTo,
      }
    }

    case "RETURN_TO_LIVE": {
      const saved = state.phase === "reading" ? state.returnTo : null
      const nextSeen: SeenSnapshot = { turnId: action.liveTurnId, paragraphs: action.liveParagraphs }
      const nextShared: PlaybackShared = {
        ...sharedOf(state),
        seen: nextSeen,
        onScreenTurnId: action.liveTurnId,
      }
      if (action.liveParagraphs.length === 0) {
        return {
          ...nextShared,
          phase: "interactive",
          turnId: action.liveTurnId,
          paragraph: 0,
        }
      }
      if (saved && saved.turnId === action.liveTurnId) {
        // If new paragraphs arrived on the live turn while viewing a past round, read from the first new one.
        if (action.liveParagraphs.length > saved.paragraphCount) {
          return {
            ...nextShared,
            phase: "reading",
            turnId: action.liveTurnId,
            paragraph: Math.min(saved.paragraphCount, action.liveParagraphs.length - 1),
            paused: false,
            prowlingKey: null,
            viewingTurnId: null,
            returnTo: null,
          }
        }
        const clamped = Math.max(0, Math.min(saved.paragraph, action.liveParagraphs.length - 1))
        if (!saved.wasReading) {
          return {
            ...nextShared,
            phase: "interactive",
            turnId: action.liveTurnId,
            paragraph: clamped,
          }
        }
        return {
          ...nextShared,
          phase: "reading",
          turnId: action.liveTurnId,
          paragraph: clamped,
          paused: false,
          prowlingKey: null,
          viewingTurnId: null,
          returnTo: null,
        }
      }
      return {
        ...nextShared,
        phase: "reading",
        turnId: action.liveTurnId,
        paragraph: 0,
        paused: false,
        prowlingKey: null,
        viewingTurnId: null,
        returnTo: null,
      }
    }

    case "START_ROLL": {
      return {
        ...sharedOf(state),
        phase: "roll_resolving",
        turnId: action.roll.turnId,
        paragraph: state.paragraph,
        roll: action.roll,
      }
    }

    case "ROLL_REJECTED": {
      if (state.phase !== "roll_resolving" && state.phase !== "roll_verdict") return state
      return {
        ...sharedOf(state),
        rollTries: state.rollTries + 1,
        phase: "interactive",
        turnId: state.turnId,
        paragraph: state.paragraph,
      }
    }

    case "LEAVE_ROLL": {
      if (state.phase !== "roll_resolving" && state.phase !== "roll_verdict") return state
      const nextShared: PlaybackShared = { ...sharedOf(state), rollTries: state.rollTries + 1 }
      if (state.phase === "roll_verdict" && state.resumeParagraph < action.paragraphCount) {
        return {
          ...nextShared,
          phase: "reading",
          turnId: state.turnId,
          paragraph: state.resumeParagraph,
          paused: false,
          prowlingKey: null,
          viewingTurnId: null,
          returnTo: null,
        }
      }
      return {
        ...nextShared,
        phase: "interactive",
        turnId: state.turnId,
        paragraph: state.paragraph,
      }
    }

    case "CLEAR_STALE_ROLL": {
      if (state.phase !== "roll_resolving" && state.phase !== "roll_verdict") return state
      return {
        ...sharedOf(state),
        phase: "interactive",
        turnId: state.turnId,
        paragraph: 0,
      }
    }

    case "OPEN_LEVEL": {
      if (state.phase === "roll_resolving" || state.phase === "roll_verdict") return state
      return {
        ...sharedOf(state),
        phase: "levelling",
        turnId: action.turnId,
        paragraph: state.paragraph,
        heroId: action.heroId,
      }
    }

    case "CLOSE_LEVEL": {
      if (state.phase !== "levelling") return state
      return {
        ...sharedOf(state),
        phase: "interactive",
        turnId: state.turnId,
        paragraph: state.paragraph,
      }
    }

    case "DEFER_LEVEL": {
      if (state.levelDeferredTurnId === action.turnId) return state
      return { ...state, levelDeferredTurnId: action.turnId }
    }

    case "MARK_CONTINUED": {
      if (state.continuedKey === action.key) return state
      return { ...state, continuedKey: action.key }
    }
  }
}
