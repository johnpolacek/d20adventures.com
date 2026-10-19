// Writes March of Davos's Clan Conflict scene (wiki/plans/clan-conflict-stage.md): the harvest square cut with a ring
// of onlookers at its south end, where the street from the gate opens into it, and the staging of the standoff there.
//
//   pnpm exec tsx scripts/stage-sets/clan-conflict.ts && pnpm stage:check
//
// The JSON it writes is what the app loads. Edit this file and rerun rather than editing the JSON by hand.

import { readFileSync, writeFileSync } from "node:fs"

type V2 = [number, number]
type Obj = Record<string, unknown>
const SETS = "packages/stage/src/sets/realm-of-myr"
const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const square = JSON.parse(readFileSync(`${SETS}/kordavos-harvest-square.json`, "utf8"))
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
function write(path: string, data: unknown) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`)
}

// The standoff: the leaders face each other across the line of the street, their people behind them. Set north-east of
// the street's middle, out of the shadow the south-west houses throw across the square in the afternoon.
const MID: V2 = [1.2, 17.6]
const RING = 5.4
const at = (dx: number, dz: number): V2 => [MID[0] + dx, MID[1] + dz]

// ── Set: the square, with the crowd drawn back into a ring around the standoff ──
const set = structuredClone(square)
set.id = "kordavos-harvest-square-conflict"
set.crowd.avoid.circles.push([...MID, RING])
// The party's place at the front of the crowd, on the square's side.
set.crowd.avoid.rects.push([MID[0], MID[1] - 5.4, 3.2, 1.4, 0])
// The walkers crossing the square would cut through the party: they pass further in.
const across = set.crowd.groups.find((g: Obj) => g.type === "walkers" && JSON.stringify(g.path) === "[[-22,12.5],[22,12.5]]")
if (!across) throw new Error("the square's crossing walkers moved")
across.path = [
  [-22, 9],
  [22, 9],
]
// Onlookers around the ring, most of them watching it.
set.crowd.groups.push({
  type: "scatter",
  area: [-9.5, 11.5, 9.5, 27.5],
  count: 48,
  mix: { traveler: 2, merchant: 2, woman: 3, porter: 1, pilgrim: 1, child: 1 },
  face: { toward: MID, jitter: 25, share: 0.9 },
})
set.marks.standoff = { at: MID, label: "the space between the two leaders" }
set.marks.barokSide = { at: at(3.4, 0.1), label: "Barok Redbeard's followers" }
set.marks.laryaSide = { at: at(-3.4, 0.1), label: "Larya Halloway's people" }
write(`${SETS}/kordavos-harvest-square-conflict.json`, set)

// ── Staging ──
const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
const member = (id: string, name: string, role: string, height: number, file: string, place: V2, facing: string | V2) => ({ id, name, role, height, art: art(file), at: place, facing })
// The heroes at the front of the crowd, watching. Premade slots as at the festival. A fifth hero stands at [1.2, 11.4],
// the scene's `spare` in apps/desktop/src/scenes.ts.
const PARTY: [string, V2][] = [
  ["branka-stoneveil", at(-1.8, -5)],
  ["cassia-verane", at(-0.6, -5.4)],
  ["yeva-softstep", at(0.6, -5.4)],
  ["milos-radan", at(1.8, -5)],
]
const party = PARTY.map(([id, place]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at: place, facing: MID }))
// The festival's vendors keep to their stalls.
const vendors = festival.cast.filter((c: Obj) => !PARTY.some(([id]) => id === c.id))
const staging = {
  format: "d20.stage.staging",
  version: 1,
  id: "march-of-davos/clan-conflict",
  set: "realm-of-myr/kordavos-harvest-square-conflict",
  cast: [
    ...party,
    member("barok-redbeard", "Barok Redbeard", "Clan leader", 1.92, "barok", at(0.9, 0), "larya-halloway"),
    member("larya-halloway", "Larya Halloway", "Clan leader", 1.8, "larya", at(-0.9, 0), "barok-redbeard"),
    member("barok-bruiser", "Barok's man", "Follower", 1.88, "barok-bruiser", at(2.5, -0.6), MID),
    member("barok-sellsword", "Barok's woman", "Follower", 1.72, "barok-sellsword", at(2.7, 0.8), MID),
    member("larya-retainer", "Larya's retainer", "Follower", 1.82, "larya-retainer", at(-2.5, -0.5), MID),
    member("larya-kinswoman", "Larya's kinswoman", "Follower", 1.7, "larya-kinswoman", at(-2.6, 0.9), MID),
    ...vendors,
  ],
  shots: {
    // The art's view: across the standoff from the square's side, the street to the gate behind it.
    standoff: { subjects: ["barok-redbeard", "larya-halloway"], offset: [0.25, 1.62, -4.4], target: [0, 1.45, 0], relative: "world", fov: 50, label: "The standoff" },
    barok: { subject: "barok-redbeard", distance: 2.8, angle: -60, height: 1.75, lookHeight: 1.6, fov: 44, label: "Barok" },
    larya: { subject: "larya-halloway", distance: 2.8, angle: -60, height: 1.7, lookHeight: 1.5, fov: 44, label: "Larya" },
    barokPeople: { subjects: ["barok-redbeard", "barok-bruiser", "barok-sellsword"], offset: [-2.6, 1.7, -3.4], target: [0.2, 1.4, 0], relative: "world", fov: 48, label: "Barok's followers" },
    laryaPeople: { subjects: ["larya-halloway", "larya-retainer", "larya-kinswoman"], offset: [2.6, 1.7, -3.4], target: [-0.2, 1.4, 0], relative: "world", fov: 48, label: "Larya's people" },
    party: { subjects: PARTY.map(([id]) => id), offset: [-1.6, 1.9, 3.4], target: [0, 1.2, 0], relative: "facing", fov: 48, label: "Party" },
    crowd: { position: [-6.5, 3.8, 9.5], target: [0.8, 1.1, 20.5], fov: 54, label: "The crowd" },
  },
  shot: "standoff",
}
write(`${STAGINGS}/clan-conflict.json`, staging)
