# The Dragonbone Inn in 3D

[Plans](index.md) · [Stage authoring](../stage-authoring.md) · [Stage engine](../stage-engine.md) · [March of Davos playtest](march-of-davos-playtest.md)

Status: started on main 2026-10-22.

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

Seated patrons painted with their own stools, if a test render works. Otherwise the crowd library stands at the bar, the hearth and barrel tables.

## Steps

1. Builders for a tavern: room walls with doors and windows, hearth, bar, tables, benches, stools, stairs, chandelier, tableware, the dragon's skull.
2. Generator `scripts/stage-sets/dragonbone-inn.ts`: two sets and three stagings. `pnpm stage:check`.
3. Standees.
4. Look at DPR 2 with `scripts/stage-verify.ts`, then owner review on `/dev/stage`.
5. Map the three encounters in `apps/desktop/src/scenes.ts`, extend the desktop tests.
6. Record results here and in [the stage engine reference](../stage-engine.md).

## Results

Not yet.
