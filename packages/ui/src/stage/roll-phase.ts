export type RollPhase = "rolling" | "landed" | "totalled" | "verdict"

export type SingleDieState =
  | { kind: "ready" }
  | { kind: "rolling"; face: number }
  | { kind: "landed"; face: number }

export type ContestPhase =
  | { kind: "gm_rolling" }
  | { kind: "player_waiting"; theirs: number }
  | { kind: "player_rolling"; theirs: number; landed: (number | undefined)[] }
  | { kind: "resolved"; theirs: number; mine: number[] }

export type ContestAction =
  | { type: "gm_landed"; natural: number }
  | { type: "player_started"; count: number }
  | { type: "player_die_landed"; index: number; natural: number; count: number }

export function initialContestPhase(hasVersus: boolean): ContestPhase {
  return hasVersus ? { kind: "gm_rolling" } : { kind: "player_waiting", theirs: 0 }
}

export function contestReducer(state: ContestPhase, action: ContestAction): ContestPhase {
  switch (action.type) {
    case "gm_landed": {
      if (state.kind !== "gm_rolling") return state
      return { kind: "player_waiting", theirs: action.natural }
    }
    case "player_started": {
      if (state.kind !== "player_waiting") return state
      return { kind: "player_rolling", theirs: state.theirs, landed: new Array<number | undefined>(action.count).fill(undefined) }
    }
    case "player_die_landed": {
      if (state.kind !== "player_rolling" && state.kind !== "player_waiting") return state
      const landed = state.kind === "player_rolling" ? state.landed.slice() : new Array<number | undefined>(action.count).fill(undefined)
      landed[action.index] = action.natural
      if (landed.length === action.count && landed.every((d): d is number => d !== undefined)) {
        return { kind: "resolved", theirs: state.theirs, mine: landed }
      }
      return { kind: "player_rolling", theirs: state.theirs, landed }
    }
  }
}
