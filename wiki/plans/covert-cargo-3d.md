# Covert Cargo in 3D

[Plans](index.md) · [Wiki Home](../index.md) · [Stage authoring](../stage-authoring.md) · [Desktop heroes](feature-desktop-heroes.md)

Status: Implemented locally, 2026-10-04, pending owner review. Built on `feature/desktop-heroes`, which is the only branch that bundles Covert Cargo. No merge into main or deployment.

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

## Results

- Characters: Reinhard, Silas, Aelar, the Elven Archer and the Elven Fighter painted from their web portraits. Silas's and Aelar's first backs showed a front-facing body under the cloak. A `backNote` fixed both, and Silas needed one more try with his hood up.
- Builders: `riverboat`, `pier`, `ship`, tree `moss`, and an `ancient` tree kind. See [the stage engine record](../stage-engine.md#recorded-checks-2026-10-04-covert-cargo).
- Sets and stagings from `scripts/stage-sets/covert-cargo.ts`. All pass `stage:check`. Every view rendered at high, DPR 2, within the triangle and draw call budgets after the pier was trimmed from 3.2M triangles to 1.8M.
- Against the art: the river view frames the moored boat with lit windows in teal mist down a wooded river. The door view puts hooded Silas in the cabin doorway with water behind, as in The Fake. Reinhard's close-up has the helm wheel behind him, as in Battle on the Boat. The riverfront has ships at the quay, red-roofed houses and towers, and the castle on its hill. The forest path has huge trees in green-gold haze.
- Known gaps: Spanish moss is thin grey beards, not the art's heavy curtains. The houses on the riverfront are plain boxes with timbering. The ships' hulls are stepped rather than curved. Window light does not reflect in the water. The Transaction's art is a close-up of the scrollcase, so its scene is the pier.
- Desktop: every encounter maps to its scene, with Lyra and Poppen as the party. Poppen waits on the deck outside the cabin door in the cabin scenes. 25 desktop tests pass, two new: a figure and portrait for everyone in all nine encounters, and the real core walking pier, cabin and back to Kordavos with map staging in the GM prompt.
- Release build with two Rust jobs passed with no warnings. The bundle is 55 MB and carries the 21 cast images and four sets.
- Packaged-app check not done: the Mac's screen was locked, so the app could not draw or be captured. Three saves for it, made by the real core, are in `validation-covert-cargo-2026-10-04/` in the app's data folder: the opening at the pier, The Fake in the cabin, and Return to the City.
- The user save was restored with an unchanged SHA-256.

## Owner review

Start the viewer in the worktree with `pnpm exec next dev -p 3057`, then open `http://localhost:3057/dev/stage?staging=covert-cargo/<encounter>&tier=balanced` for each encounter: the-shipment, the-transaction, the-disturbance, the-escape, the-fake, battle-on-the-boat, the-crate, return-to-the-city, the-end.

## Progress

- [x] Plan
- [x] Character standees
- [x] Builders
- [x] Sets and stagings
- [x] Renders compared with the art
- [x] Desktop mapping and tests
- [ ] Packaged-app check, blocked on a locked screen
- [x] Wiki and log
