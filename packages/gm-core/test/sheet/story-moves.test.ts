import assert from "node:assert/strict"
import { test } from "node:test"
import { moveBeats, type StoryBeat } from "../../src/story/beats"
import { cleanStory } from "../../src/story/clean"
import { storyParagraphs, storyText } from "../../src/story/render"

test("a move closes the paragraph before it and stays out of the words", () => {
  const npc = { step: "npc" as const, character: "owlbear" }
  const roll = { step: "roll" as const, character: "thalbern" }
  // Thalbern's arrow lands and the Owlbear charges: its walk of 25 feet closes that paragraph, before its claws.
  const [walk] = moveBeats(npc, "owlbear", [
    { x: 9, y: -11 },
    { x: 2.9, y: 9.4 },
  ])
  const story: StoryBeat[] = [
    { kind: "action", by: roll, text: "The Owlbear charges.", actor: "owlbear", target: "thalbern" },
    walk,
    { kind: "line", by: npc, text: "Skraaa", speaker: "owlbear" },
  ]
  const paragraphs = storyParagraphs(story)
  assert.deepEqual(
    paragraphs.map((p) => [p.beats.map((b) => b.kind), p.text]),
    [
      [["action", "move"], "The Owlbear charges."],
      [["line"], '"Skraaa"'],
    ]
  )
  assert.equal(storyText(story), 'The Owlbear charges.\n\nOwlbear: "Skraaa"')
  // One before any words closes the first paragraph, so none opens with a move.
  assert.deepEqual(storyParagraphs([walk, story[0]]).map((p) => p.beats.map((b) => b.kind)), [["action", "move"]])
  // A walk that went nowhere is no beat.
  assert.deepEqual(moveBeats(npc, "owlbear", [{ x: 1, y: 1 }]), [])
  assert.deepEqual(moveBeats(npc, "owlbear", [{ x: 1, y: 1 }, { x: 1, y: 1 }]), [])
  assert.deepEqual(moveBeats(npc, "owlbear", [{ x: 0, y: 0 }, { x: 0, y: 30 }], true)[0], { kind: "move", by: npc, character: "owlbear", path: [{ x: 0, y: 0 }, { x: 0, y: 30 }], teleport: true })
  // A Dash is a hurry. A teleport has no pace, since it walks nothing.
  assert.equal(moveBeats(npc, "owlbear", [{ x: 0, y: 0 }, { x: 0, y: 60 }], false, "hurry")[0].pace, "hurry")
  assert.equal(moveBeats(npc, "owlbear", [{ x: 0, y: 0 }, { x: 0, y: 60 }], true, "hurry")[0].pace, undefined)
})

test("the story's pace rides on an action that moves within the scene, and on an entrance's", () => {
  const by = { step: "reply" as const, character: "thalbern" }
  const scene = { cast: [{ id: "thalbern", name: "Thalbern" }], places: [{ id: "treeLine", name: "the tree line" }] }
  const [away] = cleanStory([{ kind: "action", who: "thalbern", text: "Thalbern sprints away from the owlbear.", pace: "sprint" }], scene as Parameters<typeof cleanStory>[1], by)
  assert.deepEqual([away.kind === "action" && away.pace, away.kind === "action" && away.enters], ["sprint", undefined])
  const [comes] = cleanStory([{ kind: "action", who: "thalbern", text: "Thalbern creeps out of the trees.", from: "treeLine", pace: "sneak" }], scene as Parameters<typeof cleanStory>[1], by)
  assert.deepEqual([comes.kind === "action" && comes.pace, comes.kind === "action" && comes.enters], [undefined, { from: "treeLine", pace: "sneak" }])
})
