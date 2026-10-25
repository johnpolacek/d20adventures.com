# The Road to Kordavos in 3D

[Plans](index.md) · [Stage authoring](../stage-authoring.md) · [March of Davos in 3D](march-of-davos-sets.md)

Status: every encounter has a set, 2026-10-23. Reviewed on the web viewer at ultra, DPR 2. Not yet checked in the running desktop app.

## Encounters

| Encounter | Location | Set |
|---|---|---|
| Well Met | The Marquis Road in the hill woods | Road kit: `marquis-road` |
| The Fortune Teller | The Marquis Road nearer the city | Road kit: `marquis-road-fortune` |
| The Gates Ahead | The road before the south gate | The gate set, seen from the road |

## The road kit

`scripts/stage-sets/kits/road.ts`: a dirt road with wheel ruts and grassy verges through daylight woods, for any travel encounter to redress. A dressing gives the road's line, the woods (`hills` or `giants`), the backdrops, the travellers and its own props, places and views. `scripts/stage-sets/marquis-road.ts` writes both road sets and all three stagings.

- **Hills.** Firs along the verges, a dense fir wood with a thicket from 6.5 m back, solid cone firs past 42 m, and the painted `marquis-hills` backdrop of fir hills under two rock peaks. Clear morning, warm grade.
- **Giants.** The old forest path's giant trees and oaks, with deeper shade, browner trunks and thinner haze for the fortune teller's painting.

Both paintings are woods, not open fields. Well Met's shows tall firs and a rock peak, a mounted merchant in red with a fur collar, and pack horses in file behind him. The Fortune Teller's shows great trunks, ferns and dappled light, and a dwarf woman at a carpeted table with a crystal ball.

## The scenes

- **Well Met.** Dmitri rides at the head of his caravan, up the road toward the party: two covered wagons with the Volkov wolf's head, each with its draft horse, a teamster, two pack horses at the tail, and two guards. The party has stopped at a wayside shrine where Sister Mira rests. Elaraen stands by the milestone across the road. Views: the caravan (framed like the painting), the road, the wagons, the shrine.
- **The Fortune Teller.** Borina sits at her low table under a great tree on the west verge, facing the road. Travellers walk the road both ways. Views: the fortune teller (framed like the painting), the road, the crystal ball.
- **The Gates Ahead.** The party stands at the end of the line on the road, 80 m out from the gate. Views: the gate set's own, and the party from behind with the gate beyond.

## Art

- Figures, in `public/stage/fixtures/the-road-to-kordavos/`: Dmitri mounted, a pack horse, a draft horse, two guards, a teamster, Elaraen, Sister Mira and Borina seated. Volkov's house mark is a black wolf's head on saffron.
- Builders: `wagon`, `shrine`, `fortuneTable`. `tree` gained a `fir` kind.
- Party: stock hero placeholders `hero-1` to `hero-3`, since this adventure has no premades. The app puts the player's heroes in their places.

## Known weak spots

- Party walks to the horses behind the first wagon are blocked by it. Walks to every labelled place are clear.
- The gate's party view shows only two of three heroes clearly. The third stands behind.
