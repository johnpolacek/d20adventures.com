import assert from "node:assert/strict"
import { test } from "node:test"
import { judgePrompt, roundsOf } from "../scripts/scene-judge"
import type { Save } from "./store"

test("the scene judge is told each round's place in its scene, counted over rounds in a row in one encounter", () => {
  const turn = (order: number, encounterId: string) => ({ order, encounterId, story: [], characters: [] })
  const save = { turns: [turn(1, "a"), turn(2, "b"), turn(3, "b"), turn(4, "a")] } as unknown as Save
  const rounds = roundsOf(save)
  assert.deepEqual(
    rounds.map((r) => r.sceneRound),
    [1, 1, 2, 1]
  )
  assert.match(judgePrompt("SCENE", rounds[2]), /# The round as played\n\nThis is round 2 of this scene\.\n/)
})
