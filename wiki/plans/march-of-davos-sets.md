# March of Davos in 3D

[Plans](index.md) · [Stage authoring](../stage-authoring.md) · [Stage engine](../stage-engine.md) · [The Dragonbone Inn](dragonbone-inn-stage.md)

Status: in progress on main from 2026-10-22. One location at a time, in story order, each reviewed at DPR 2 before the next.

## Owner request, 2026-10-22

"Do more 3D sets for March of Davos, just keep going through them one-at-a-time and iterate to make better, then do them all the way until the end."

## Locations

Encounters 1 to 7 already had sets: the gate, the harvest square, the Dragonbone Inn.

| Encounters | Location | Status |
|---|---|---|
| 8 | The Old Grand Library and its private archives | Done 2026-10-23 |
| 9 | The Silver Serpent Tavern | Next |
| 10 to 14 | The docks | |
| 15 to 17 | The lower districts | |
| 18 to 19 | The black market | |
| 20 to 22 | The auction | |
| 23 to 26 | Silverhand's trail, the hideout, the ambush | |
| 27 to 39 | The Blackthorn mansion: front, ballroom, halls, chambers, wine cellar | |
| 40 to 44 | The catacombs | |
| 45 to 46 | The forgotten temple | |
| 47 to 49 | The aftermath | |

## The Old Grand Library

Source: the encounter's painting (a tall hall of dark gilt bookcases two storeys high, a balcony over a red door up steps, a painted vault with an oval painting, high arched windows, a red rug, lecterns and leather armchairs), its intro (arched ceilings, stained glass of Valkaran saints, cobbled floor, candles) and the legacy archives notes (a reading table, a locked glass cabinet, narrow stained glass).

- Set `realm-of-myr/old-grand-library`, staging `the-old-grand-library`, written by `scripts/stage-sets/old-grand-library.ts`.
- The hall is 14 by 22 m. Bookcases on every wall, a gallery at 4.2 m with more bookcases between arched saint windows, a painted barrel vault springing at 7.5 m, a coffered crossing with a painted dome and an oculus, two more saints in the crossing's sides, Thyra's tree and moon in glass over the balcony.
- The private archives sit behind the red door at the far end, level with the hall: a low stone vault, shelves, the reading table, the glass cabinet with an orb, a chalice and a book, and dim saints.
- Midday sun comes through the great south window and runs down the floor to the red door, as the painting leads the eye.
- New builders in `packages/stage/src/builders/library.ts`: `panel` (a painting on a flat or round-headed panel), `archHead`, `bookcase`, `vault`, `cupola`, `gallery`, `column`, `desk`, `armchair`, `globe`, `candleStand`. A new `image` material lays a painting by the builder's own uv, with `glow` for stained glass. `beam` takes `open` for light shafts.
- Painted textures: two book spines tinted into eight bindings, the rug, the vault fresco, the dome band, two stained-glass windows, the red door and a globe chart. `scripts/stage-textures.ts` gained `whole` paintings with an aspect and a closed left-right seam.
- Standees: Sister Danica from her portrait, the archivist, and two seated readers.
- `pnpm stage:check` passes, 144 of 144 walks clear. At ultra, DPR 2: 124 to 137 draw calls, 0.50M rendered triangles, 26 to 32 fps.
- Desktop maps the encounter with a `where` line. 78 desktop tests pass.
- Not yet seen in the running desktop app.
