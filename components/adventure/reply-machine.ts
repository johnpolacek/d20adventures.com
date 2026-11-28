export type ReplyPhase =
  | { kind: "composing"; input: string; error: string | null }
  | { kind: "generating"; input: string }
  | { kind: "submitting"; input: string; mode: "reply" | "defer" }
  | { kind: "awaitingServer" }
  | { kind: "awaitingRoll"; input: string; error: string | null }
  | { kind: "submittingRoll"; input: string }

export type ReplyAction =
  | { type: "reset"; needsRoll: boolean }
  | { type: "sync_server"; needsRoll: boolean }
  | { type: "input_changed"; value: string }
  | { type: "generate_started" }
  | { type: "generate_chunk"; value: string }
  | { type: "generate_finished" }
  | { type: "generate_failed"; error: string }
  | { type: "submit_started"; mode: "reply" | "defer" }
  | { type: "submit_succeeded" }
  | { type: "submit_failed"; error: string | null }
  | { type: "roll_submit_started" }
  | { type: "roll_submit_succeeded" }
  | { type: "roll_submit_failed"; error: string }

export function initialReplyPhase(needsRoll: boolean): ReplyPhase {
  return needsRoll ? { kind: "awaitingRoll", input: "", error: null } : { kind: "composing", input: "", error: null }
}

function inputOf(state: ReplyPhase): string {
  return "input" in state ? state.input : ""
}

export function replyReducer(state: ReplyPhase, action: ReplyAction): ReplyPhase {
  switch (action.type) {
    case "reset":
      return initialReplyPhase(action.needsRoll)

    case "sync_server": {
      if (action.needsRoll) {
        if (state.kind === "awaitingRoll" || state.kind === "submittingRoll") return state
        return { kind: "awaitingRoll", input: inputOf(state), error: null }
      }
      if (state.kind === "awaitingRoll" || state.kind === "submittingRoll") {
        return { kind: "composing", input: "", error: null }
      }
      return state
    }

    case "input_changed": {
      if (state.kind !== "composing" && state.kind !== "generating") return state
      return { kind: "composing", input: action.value, error: null }
    }

    case "generate_started": {
      if (state.kind !== "composing") return state
      return { kind: "generating", input: "" }
    }

    case "generate_chunk": {
      if (state.kind !== "generating") return state
      return { kind: "generating", input: action.value }
    }

    case "generate_finished": {
      if (state.kind !== "generating") return state
      return { kind: "composing", input: state.input, error: null }
    }

    case "generate_failed": {
      if (state.kind !== "generating") return state
      return { kind: "composing", input: state.input, error: action.error }
    }

    case "submit_started": {
      if (state.kind !== "composing" && state.kind !== "generating") return state
      return { kind: "submitting", input: state.input, mode: action.mode }
    }

    case "submit_succeeded": {
      if (state.kind !== "submitting") return state
      return { kind: "awaitingServer" }
    }

    case "submit_failed": {
      if (state.kind !== "submitting") return state
      return { kind: "composing", input: state.input, error: action.error }
    }

    case "roll_submit_started": {
      if (state.kind !== "awaitingRoll") return state
      return { kind: "submittingRoll", input: state.input }
    }

    case "roll_submit_succeeded": {
      if (state.kind !== "submittingRoll") return state
      return { kind: "awaitingServer" }
    }

    case "roll_submit_failed": {
      if (state.kind !== "submittingRoll") return state
      return { kind: "awaitingRoll", input: state.input, error: action.error }
    }
  }
}
