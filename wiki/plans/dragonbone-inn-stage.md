# The Dragonbone Inn in 3D

[Plans](index.md) · [Stage authoring](../stage-authoring.md) · [Stage engine](../stage-engine.md) · March of Davos playtest

Status: implemented on main 2026-10-22. Owner review on `/dev/stage` and a check in the running app are next.

## Owner request, 2026-10-22

"More 3D sets. Do Dragonbone Inn."

## Source

- `the-dragonbone-inn.md`, evening: warm, roasting meat, a bard with a lute, merchants and travellers, a few suspicious figures huddled in dark corners, a large fireplace on one wall. Bram, a burly innkeeper, ushers the party to a corner table and sets down a tray of drinks.
- `an-unsolicited-opportunity.md`, late evening: Beric, a scarred dockworker, and Eamon, a half-elf scholar in spectacles, approach the party, then lead them to a dim backroom with a sturdy table and mismatched chairs.
- `morning-at-the-dragonbone.md`, dawn light through the windows, bread and coffee. Bram prepares for the day. Elara comes in by the door, pale and distraught, and Bram goes straight to her.
- `art-direction.md`: warm oak, a large stone hearth, roasting meat and a bard, mixed clientele.
- Art: the inn's front at dusk (half-timbered, a "Dragon Bone" sign, lit windows, barrels, a blue street). Beric and Eamon by a lantern against amber plank walls. Elara at a sunlit window with a dark wood frame and books.
- NPC portraits: `bram`, `beric`, `eamon`, `elara`.

## Brief

- Place: the inn's common room, about 14 by 10 m, under heavy oak beams. The scenes play inside, so no street front.
- West wall: a great stone hearth with a fire, a spit of roasting meat and a pot. A dragon's skull is mounted over the mantel, the inn's name.
- North wall: the bar, shelves of bottles and mugs, kegs on a rack. A doorway to the backroom at its east end.
- East wall: stairs up to the rooms.
- South wall: the front door and leaded windows onto the street.
- The party's corner table in the south-east corner, under a window, with a high-backed settle.
- Tables, benches and stools, two wheel chandeliers, a dark corner by the hearth for the suspicious figures, the bard by the fire.
- The backroom: plank walls, a sturdy table, mismatched chairs, one lantern, stores.
- Two sets from one generator: evening (fire and candles, dusk in the windows) and morning (banked fire, sun through the south windows, dust in the light, few patrons).

## Places

The hearth, the bar, the corner table, the front door, the stairs, the backroom, the bard's corner, the dark corner.

## Characters

| Cast id | Look | Source |
|---|---|---|
| `bram` | Burly, curly grey-brown hair, big moustache and beard, an embroidered leather waistcoat over a white shirt, an apron. | Portrait |
| `beric` | Burly dockworker, short dark hair, stubble, a scar across the face, dark worn coat. | Portrait |
| `eamon` | Slender older half-elf, grey hair, round spectacles, white beard, a fur-trimmed ochre scholar's robe. | Portrait |
| `elara` | Young woman, dark tousled hair, tired red-rimmed eyes, a white blouse under a dark bodice, a pendant. | Portrait |
| `bard` | A travelling bard with a lute. | New |

Six seated patrons, painted with their own stools: a laughing merchant, an old farmer, a river sailor, a tired traveller, and a hooded man and a cloaked woman in the dark corner. The crowd library stands at the bar, the barrel by it and the bard.

## Steps

1. Builders for a tavern: room walls with doors and windows, hearth, bar, tables, benches, stools, stairs, chandelier, tableware, the dragon's skull.
2. Generator `scripts/stage-sets/dragonbone-inn.ts`: two sets and three stagings. `pnpm stage:check`.
3. Standees.
4. Look at DPR 2 with `scripts/stage-verify.ts`, then owner review on `/dev/stage`.
5. Map the three encounters in `apps/desktop/src/scenes.ts`, extend the desktop tests.
6. Record results here and in [the stage engine reference](../stage-engine.md).

## Results

- Sets `realm-of-myr/dragonbone-inn` and `realm-of-myr/dragonbone-inn-morning`, written by `scripts/stage-sets/dragonbone-inn.ts`. Stagings `the-dragonbone-inn`, `an-unsolicited-opportunity` and `morning-at-the-dragonbone`.
- The common room is 14 by 10 m with a ceiling at 3.5 m, the backroom 4.2 by 3.3 m at 2.9 m. Leaded windows on the street, a door that stands open at dawn, a kitchen doorway and the backroom doorway.
- New builders in `packages/stage/src/builders/tavern.ts`: `wall`, `hearth`, `bar`, `table`, `bench` (a settle with `back`), `stool`, `chair`, `stairs`, `chandelier`, `dragonSkull`.
- The evening: Bram at the party's corner table, the bard by the fire, Beric and Eamon unnamed at a barrel by the bar. Late evening: Beric and Eamon at the corner table, Bram at the bar. Dawn: the party at the table under the windows turned to the door, Elara walking in on "door creaks open", Bram in front of the bar, the farmer at breakfast.
- Two engine fixes found on the way. Going straight from one room into another kept the first room's lamps, so the backroom was black. Window glass cast shadows, so no sun came through.
- `pnpm stage:check` passes. Walks go straight or through one doorway, so tables stop some: the hero in the booth, and walks from the bar side to the hearth.
- `scripts/stage-verify.ts` at ultra, DPR 2: every view of the three stagings passes, 121 to 167 draw calls and 0.16M to 0.20M triangles, 25 to 36 fps on this Mac.
- Desktop maps the three encounters with `where` lines and a spare spot. The scenes test checks Bram, Beric, Eamon and Elara's figures and portraits and the GM's staging, then story view at the Old Grand Library. 78 desktop tests pass.
- Not yet seen in the running desktop app.
