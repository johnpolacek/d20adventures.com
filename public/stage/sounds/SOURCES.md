# Sound sources

Every file in `fx` and `ambience` is CC0 (public domain), from OpenGameArt. `scripts/sound-assets.ts` builds them from
the packs below, unpacked into one folder, and sets their levels.

## Effects (`fx`)

- `blade`, `fire`, `spell`, `growl`, `hurt`: "80 CC0 RPG SFX", https://opengameart.org/content/80-cc0-rpg-sfx
- `hit`, `thunk`: "100 CC0 SFX", https://opengameart.org/content/100-cc0-sfx
- `cloth`, `coins`, `key`, `book`, `draw`, `step`: Kenney, "50 RPG sound effects", https://opengameart.org/content/50-rpg-sound-effects
- `step-leaves`, `step-wood`, `step-stone`, `step-gravel`: "Different steps on wood, stone, leaves, gravel and mud",
  https://opengameart.org/content/different-steps-on-wood-stone-leaves-gravel-and-mud

## Ambience (`ambience`)

- `hearth`: https://opengameart.org/content/fireplace-sound-loop
- `crowd`: https://opengameart.org/content/crowd-shoutingspeaking-ambience
- `wind`: https://opengameart.org/content/mild-wind-background-noise
- `night`: https://opengameart.org/content/crickets-ambient-noise-loopable
- `birds`, `river`: https://opengameart.org/content/park-ambiences
- `dawn`: https://opengameart.org/content/amb-morning-sounds-perfect-loop
- `dungeon`: https://opengameart.org/content/loopable-dungeon-ambience
- `drip`: https://opengameart.org/content/dripping-water-loop

## Made with earshot

- `door-open`, `door-close`, `door-creak`, `chest`, `rain`, `roof-rain`, `storm`, `splash`, `crack`, `rope`, `bowstring`, `hull`: earshot, https://github.com/Leonxlnx/earshot

earshot (MIT) renders each sound in code, many from public domain recordings, and the sounds are ours to use. Made
2026-11-23 with `earshot make --sound <design>`: `door/open`, `door/close`, `door/creak`, `chest/open` (cut under
2.8 kHz to take out its sparkle), `rain/leaves`, `rain/roof`, and `rain/street` with three takes of `thunder/distant`
for the storm. The renders are in `~/Desktop/d20-sound-sources/earshot`.

Covert Cargo's sounds are earshot recipes (`earshot make --recipe`), each laid from its designs and cut under 2.8 kHz.
`splash` is `splash/big` with `splash/plunge` lower, a little `underwater/deep` and a low thump. `crack` is
`drawer/wood` far lower as the lid straining, then `ice/crack`, `break/crate` and `twigs/snap`. `rope` is the recipe
`earshot build` drafted, `velcro/rip`, `zip_tie/pull` and `paper/rip`, behind a `knife/slice`, with a soft thump.
`bowstring` is `bow/shot` lower, with a piece of `crossbow/shot` or a second `bow/shot` and a soft thump under it.
`hull` is the cookbook's `creaky_ship` slowed to a moored boat: `door/creak`, `floor/creak` and `swing/creak` low
over `waves/rocks` and `waves/sand`. The recipes are in `~/Desktop/d20-sound-sources/earshot/drafts/recipes`.

The `d20-roll` takes predate this list.
