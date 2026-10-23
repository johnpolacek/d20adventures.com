// Writes The Dust Settles for March of Davos (wiki/plans/march-of-davos-sets.md): the truce talks at the reading table of
// the Old Grand Library, on the library's own set. Bishop Nicolai presides; Seraphina Valtor and Lady Astrid sit across
// from each other; Sister Danica stands by. The party watches from under the dome.
//
//   pnpm exec tsx scripts/stage-sets/library-talks.ts && pnpm stage:check

import { readFileSync, writeFileSync } from "node:fs"
import type { Obj, V2 } from "./kits/street"

const STAGINGS = "packages/stage/src/stagings/march-of-davos"
const ART = "/stage/fixtures/march-of-davos"
const festival = JSON.parse(readFileSync(`${STAGINGS}/the-harvest-festival.json`, "utf8"))
const art = (name: string) => ({ front: `${ART}/${name}-front.webp`, back: `${ART}/${name}-back.webp`, portrait: `${ART}/${name}-portrait.jpg` })
const member = (id: string, name: string, role: string, height: number, file: string, at: V2, facing: V2) => ({ id, name, role, height, art: art(file), at, facing })
const TABLE: V2 = [-3.3, 5.6]
const WATCH: [string, V2][] = [
  ["branka-stoneveil", [0.2, 2.6]],
  ["cassia-verane", [1.1, 2.2]],
  ["yeva-softstep", [0.6, 3.4]],
  ["milos-radan", [1.6, 3.0]],
]
const staging = {
  format: "d20.stage.staging",
  version: 1,
  id: "march-of-davos/the-dust-settles",
  set: "realm-of-myr/old-grand-library",
  cast: [
    ...WATCH.map(([id, at]) => ({ ...festival.cast.find((c: Obj) => c.id === id), at, facing: TABLE })),
    member("bishop-nicolai", "Bishop Nicolai", "Bishop of the Church of Valkara", 1.82, "bishop-nicolai", [-1.7, 5.6], TABLE),
    member("seraphina-valtor", "Seraphina Valtor", "Head of the Valtor clan", 1.7, "seraphina", [-3.6, 6.55], TABLE),
    member("astrid-blackthorn", "Lady Astrid Blackthorn", "Head of House Blackthorn", 1.78, "astrid-blackthorn", [-3.0, 4.65], TABLE),
    member("sister-danica", "Sister Danica", "Wayfinder of the Church", 1.68, "sister-danica", [-1.0, 6.6], TABLE),
  ],
  shots: {
    talks: { subjects: ["bishop-nicolai", "seraphina-valtor", "astrid-blackthorn"], offset: [2.6, 1.8, -1.4], target: [-0.6, 1.2, 0.2], relative: "world", fov: 50, label: "The talks" },
    bishop: { subject: "bishop-nicolai", distance: 2.2, angle: 0, height: 1.7, lookHeight: 1.65, fov: 44, label: "Bishop Nicolai" },
    party: { subjects: WATCH.map(([id]) => id), offset: [1.6, 1.8, -3.6], target: [0, 1.2, 0], relative: "world", fov: 54, label: "Party" },
  },
  shot: "talks",
}
writeFileSync(`${STAGINGS}/the-dust-settles.json`, `${JSON.stringify(staging, null, 2)}\n`)
console.log("wrote the-dust-settles")
