// A played look's before and after: the same shots of a set as the game builds it, captured before a round of work on
// its look and after it, from look-rounds.json. A built look is code, so its earlier state cannot be rebuilt live:
// what is kept is the frames. They sit in public/stage/looks/<set>/<day>/, out of git, and the public bucket keeps them
// (`pnpm stage:sync public/stage/looks`).
//
// To keep a round: capture both sides with `lab/stage-art/capture.ts --page=stage`, save each as
// <shot>-before.webp and <shot>-after.webp in that folder, and list them here under the set, newest round first.

import manifest from "./look-rounds.json"

export interface LookShot {
  // The shot's key in its staging or set, and its label.
  shot: string
  label: string
  // The scene it was captured in.
  staging: string
  before: string
  after: string
  // What a blind judge chose, shown the two in shuffled order, as a sentence: "Blind judge chose After, 5.8 to 5.5".
  judged?: string
}
export interface LookRound {
  made: string
  note: string
  shots: LookShot[]
}

export const LOOK_ROUNDS = manifest as Record<string, LookRound[]>

export const lookRounds = (set: string): LookRound[] => LOOK_ROUNDS[set] ?? []
