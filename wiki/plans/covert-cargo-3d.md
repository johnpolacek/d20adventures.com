# Covert Cargo in 3D

[Plans](index.md) · [Wiki Home](../index.md) · [Stage authoring](../stage-authoring.md) · [Desktop heroes](feature-desktop-heroes.md)

Status: Active, 2026-10-04. Built on `feature/desktop-heroes`, which is the only branch that bundles Covert Cargo. No merge into main or deployment.

Owner request, 2026-10-04: "do the same thing for the 2-player adventure i made. full 3d experience based off the 2d art assets." The Midnight Summons precedent: every encounter gets a 3D scene matched to its art, characters drawn from their existing art, then a check in the desktop app.

## Scope

Nine encounters, four places, seven characters. Lyra and Poppen already have standees from the hero work.

| Set | Encounters | From the art |
|---|---|---|
| `realm-of-myr/mordava-river-pier` | The Shipment, The Transaction, The Disturbance, The Escape | A quiet fork of the Mordava before dawn. Teal mist over still water, dense woods of moss-hung oaks and willows on both banks, a rickety pier on pilings, and a small riverboat with warm lit cabin windows, a pilothouse and a thin stack. Reeds and ivy at the waterline, where Poppen hides. A bank trail runs downstream into the woods. |
| `realm-of-myr/riverboat-cabin` | The Fake, Battle on the Boat, The Crate | The boat's low wood-panelled cabin: beams, a lantern, a helm wheel and brass gauges on the fore wall, a door with a round porthole open onto the deck and teal water, and the iron-banded crate under hanging ropes and candlelight. |
| `realm-of-myr/kordavos-riverfront` | Return to the City | Kordavos from the river on a bright afternoon: a stone quay, timber-framed houses with red roofs, round towers with conical roofs, the castle on its hill, and sailing ships at their moorings under tall cumulus. |
| `realm-of-myr/old-forest-path` | The End | A mossy path through huge gnarled trees with roots across the ground, green-gold light and soft haze. |

Characters, painted from their web portraits with `scripts/stage-standees.ts`: Reinhard (scarred, dark green-black greatcoat, longsword), Silas (hooded charcoal cloak, daggers), Aelar Moonglimmer (silver-haired elf, dark cloak), the Elven Archer (pale braided hair, longbow) and the Elven Fighter (silver hair, green cloak, longsword). The two elves also stand as crew on the boat in the opening, as the intro describes.

Engine additions, only where no builder fits: a `riverboat`, a `pier` on pilings, hanging moss on trees, and sailing ships for the riverfront. Ground with a river cut lets the pier and the deck sit at standing height above the water.

Desktop: map every encounter to its scene, with Lyra and Poppen as the party slots. A hero who is not in a scene, such as Poppen outside the cabin, stands outside the door rather than vanishing.

## Validation

- `stage:check`, stage and desktop typechecks, scoped Biome.
- Renders of every view at DPR 2 compared with the art, then the review links.
- Desktop tests: every Covert Cargo encounter has a scene, and every character in each real turn has a figure and a portrait.
- A release build and one check of the scenes in the packaged app.

## Progress

- [x] Plan
- [ ] Character standees
- [ ] Builders
- [ ] Sets and stagings
- [ ] Renders compared with the art
- [ ] Desktop mapping and tests
- [ ] Build and packaged-app check
- [ ] Wiki and log
