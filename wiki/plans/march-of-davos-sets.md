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
| 9 | The Silver Serpent Tavern | Done 2026-10-23 |
| 10 to 14 | The docks | Done 2026-10-23 |
| 15 to 17 | The lower districts | Next |
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

## The Silver Serpent Tavern

Source: the encounter's painting (a long, dark timber hall packed with sailors, glowing amber panels, ship's lanterns, a hanging ring-lamp with a brass globe, long candlelit tables either side of an aisle, and a great arch at the far end bright with harbour fog and smoke), its intro (sticky floor, a sea map carved into a wall, nautical memorabilia behind the bar) and the legacy notes (Harron at the bar, a burly dockworker and his companions at a table).

- Set `realm-of-myr/silver-serpent-tavern`, staging `the-silver-serpent-tavern`, written by `scripts/stage-sets/silver-serpent-tavern.ts`.
- The hall is 12 by 19 m under boards on heavy beams and posts with knee braces. The far end is a 4.6 m arch onto a foggy quay with ships and warehouses, and the riverfront backdrop beyond. Cold daylight lies along the aisle; inside it is dark but for lanterns, candles, the ring-lamp and the amber panels.
- The bar runs down the east side with Harron's shelves and kegs, under a silver sea serpent on an oak board. The carved sea map, 5.6 m wide, fills the west wall over the dockworkers' table. A ship's wheel, an anchor, fishing nets and shelves of curios dress the walls.
- New builders in `packages/stage/src/builders/nautical.ts`: `serpent`, `shipWheel`, `anchor`.
- Painted textures: the carved sea map, a fishing net cut-out, two backlit amber panels.
- Standees: Harron, a burly dockworker and two companions seated, a smuggler in a tricorn. The inn's seated sailor, merchant and two hooded strangers return as patrons. Fifteen crowd figures fill the far half and the arch.
- `pnpm stage:check` passes. 130 of 260 walks are clear: the rest are walks to people seated on the wall side of a table and to Harron behind his bar, which stop at the table or counter. Every walk to a place is clear.
- At ultra, DPR 2: about 150 to 170 draw calls, 0.24M rendered triangles, about 31 fps. 0.12M static triangles.
- The camera stays inside the tavern. Seen from the quay, the room lit by the open sky's hemisphere read as flat grey.
- Desktop maps the encounter with a `where` line. 78 desktop tests pass. Not yet seen in the running desktop app.

## The docks

Source: five paintings (a golden harbour with a great carved ship, stone warehouses with arcades and canvas awnings; the crowded quay by the ship; a wingless crocodile-like drake lunging across planks; a deck with a burst, melted cage hatch; Lady Astrid's portrait) and five encounters. The text gives the drake wings, mossy green and bark-brown scales and yellow eyes, so the standee follows the text.

- Sets `realm-of-myr/kordavos-docks` and `kordavos-docks-wrecked`, both written by `scripts/stage-sets/kordavos-docks.ts`. Stagings `arrival-at-the-docks`, `mystery-cargo`, `the-beast-escapes`, `the-aftermath`, `an-invitation`.
- A cobbled quay along the harbour, its stone face 2.4 m down to the water, bollards, rings and ladders. The Star of Faelendar lies alongside, her deck level with the quay so people walk aboard by the gangway, a doorway for walks. A treadwheel crane, cargo stacks, carts, stalls under the arcades of five stone warehouses, a jetty with skiffs, ships moored and across the harbour, gulls, and a painted far shore with the castle.
- Warehouse 14 is a timber shed in the quay's west corner, doors open: crates of elven wine, silk bales, barrels, the lockbox and the chained crate.
- The wrecked set has smashed cargo and loose planks, a torn main course, the hatch burst open with its doors split across the deck, and the cage in the hold eaten through by acid, its stubs dripping slag.
- New builders in `packages/stage/src/builders/harbour.ts`: `galleon` (walkable, two-tier carved sterncastle, quarter galleries, gunports, shrouds with ratlines, a hold well under the hatch), `cage`, `crane`, `warehouse`, `skiff`, `bollard`. Crates and barrels take `solid`.
- Standees: Finn, Tor, Petra and Alaric from their portraits, three hired blades, Lady Astrid armed and Lady Astrid with the invitation from her painting, and the forest drake. `scripts/stage-standees.ts` gained `magenta` (paint and key a green subject on magenta) and `pose` (a creature's stance).
- Backdrop `docks-harbour.webp`: the far quays, the city on its hill and the castle.
- `pnpm stage:check` passes. Walks: arrival 133 of 133, the beast 108 of 108, the invitation 85 of 85, the aftermath 106 of 108, Mystery Cargo 142 of 160. The blocked ones cross the whole quay through the cargo stacks, or go from the ship's deck into the shed, which takes two doorways.
- At ultra, DPR 2: 180 to 250 draw calls, 0.26M to 0.29M rendered triangles, 21 to 33 fps. 0.10M static triangles.
- Desktop maps the five encounters with `where` lines. 78 desktop tests pass.
- Not yet seen in the running desktop app.

### Quality pass, 2026-10-23

Review against the arrival painting: the opening looked down an empty street, the ship was low and plain, the cobbles huge, the harbour bare, the drake orange.

- The opening shot, "The docks", now frames like the painting: from a quay head across the harbour's west end, low, looking east along the water, moored boats on the left, the Star of Faelendar right of centre with her bow toward the viewer, the warehouses and the far end of the harbour beyond, porters and cargo in the foreground.
- The ship is 42 m long with a 32 m main mast, lying bow west. The water dropped to 5.5 m below the quay, so her hull towers out of it. A curved sterncastle and poop follow the hull's line, a rising gilt stem and beakhead, a forecastle balustrade, gilt rubbing bands, four yards a mast with the top sails furled. The sails are a painted canvas (`sail-canvas.jpg`, an `image` material) in place of the blotchy cloth.
- Small cobbles (`stones` 0.13) with a band of worn flags along the edge, bollards, rope coils, mooring rings and ladders.
- Twenty skiffs and two laden barges, eight more ships in the harbour and down its far end, a jetty east of the ship, nets drying on poles, nine stalls under cream canvas, a round harbour tower, a second backdrop down the harbour, 34 walkers and porters at the cargo, forty gulls.
- Low golden sun from the east-north-east across the water, warmer haze.
- The drake is turned 40 degrees of hue toward green at keying (`hue` in `scripts/stage-standees.ts`).
- The wrecked quay has staved-in and tipped crates, more splintered planks, spilt silk and sacks, barrels rolled loose, a cart on its side, scorch and acid on the stones.
- Walks: arrival 133 of 133, the beast 106 of 108, the aftermath 101 of 108, the invitation 82 of 85, Mystery Cargo 150 of 160. The blocked walks are 40 m walks to the far jetty past the crane, and walks to or from the shed across the cargo.
- At ultra, DPR 2: 189 to 253 draw calls, 0.43M to 0.47M rendered triangles, 23 to 32 fps. 0.16M static triangles.
- The painting's hull is still taller and more richly carved than the built one.

