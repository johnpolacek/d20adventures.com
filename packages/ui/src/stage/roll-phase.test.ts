import assert from "node:assert/strict"
import test from "node:test"
import { contestReducer, initialContestPhase } from "./roll-phase"

test("contestReducer transitions gm_rolling -> player_waiting -> player_rolling -> resolved for single and dual dice", () => {
  let state = initialContestPhase(true)
  assert.equal(state.kind, "gm_rolling")

  // Player actions before GM lands are ignored
  state = contestReducer(state, { type: "player_started", count: 2 })
  assert.equal(state.kind, "gm_rolling")

  state = contestReducer(state, { type: "gm_landed", natural: 14 })
  assert.deepEqual(state, { kind: "player_waiting", theirs: 14 })

  // Duplicate gm_landed is ignored
  state = contestReducer(state, { type: "gm_landed", natural: 3 })
  assert.deepEqual(state, { kind: "player_waiting", theirs: 14 })

  // Advantage / Disadvantage: both dice must land before resolving
  state = contestReducer(state, { type: "player_started", count: 2 })
  assert.equal(state.kind, "player_rolling")

  state = contestReducer(state, { type: "player_die_landed", index: 1, natural: 18, count: 2 })
  assert.equal(state.kind, "player_rolling")

  state = contestReducer(state, { type: "player_die_landed", index: 0, natural: 7, count: 2 })
  assert.deepEqual(state, { kind: "resolved", theirs: 14, mine: [7, 18] })
})
