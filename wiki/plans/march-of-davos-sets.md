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
| 15 to 17 | The Lower Districts | Done 2026-10-23 |
| 18 to 19 | The Black Market | Done 2026-10-23 |
| 20 to 22 | The auction | Next. A hall behind the Black Market lane's far door |
| 23 to 26 | Silverhand's trail, the hideout, the ambush | Street and cellar kits done 2026-10-23 |
| 27 to 39 | The Blackthorn mansion: front, ballroom, halls, chambers, wine cellar | Bespoke. Grounds, ballroom and wine cellar done 2026-10-23; the halls and chambers next |
| 40 to 44 | The catacombs | Tunnel kit done 2026-10-23. The grate at 40 is the mansion's grounds, done |
| 45 to 46 | The forgotten temple | Bespoke |
| 47 to 49 | The aftermath | Street kit done 2026-10-23 for 47 and 48. 49 reuses the library |

## Owner decision, 2026-10-23: reusable sets

"Use reusable sets instead of one bespoke set per location. 27 encounters still have no 3D set. Build bespoke sets only for the mansion and the temple. Give the trail, the catacombs and the aftermath generic sets you can redress (street, cellar, tunnel)."

A kit is a generator in `scripts/stage-sets/kits/` that takes a dressing and returns a set: layout, time of day, light, props, signs and crowd. Each dressing writes its own set JSON, as the docks' wrecked quay does, since a staging cannot add objects. One script per kit writes every dressing and its stagings.

| Kit | Dressing | Encounters |
|---|---|---|
| Street | Night lanes under a low moon, mist, spires | 23 Shadowing Silverhand |
| Street | Waterfront lane in sea mist, the warehouse's iron door and red lamp | 24 The Hideout |
| Street | Night lanes, archers on the roofs, arrows in a shop door | 26 The Ambush |
| Street | Dawn square, Valkaran banners, a balcony | 47 The New Dawn |
| Street | Day square, black banners, a bier, soldiers | 48 Vengeance of the Blackthorn |
| Cellar | Low timber room, crates and sacks, a long table, one candle | 25 Face-to-Face with Silverhand |
| Cellar | Barrel vaults, wine racks, barrels, a chandelier | 36 The Wine Cellar |
| Tunnel | Tunnel widening to a pillared chamber, powder barrels, a fuse | 41 Into the Catacombs |
| Tunnel | Forks of rough stone, crystal runes, a blank wall | 42 Through the Labyrinth |
| Tunnel | The same wall, a black iron door of glowing sigils, frost | 43 The Sealed Door |
| Tunnel | A vast dark chamber, dust, a narrow lit archway | 44 Big Empty |
| None | The Old Grand Library as built, a table for the talks | 49 The Dust Settles |

Bespoke sets:

- The Blackthorn mansion: the gate and front at night (27), the ballroom with its gallery (28 to 31, 37, 38), the grand stair hall (32), the ranger's door (33), the lavish corridor (34), Thaddeus's study (35), the moonlit balcony (39) and the ivy courtyard with the drain grate (40).
- The forgotten temple: a ruined hall of broken columns before a carved doorway (45, 46).

Order: street kit, cellar kit, tunnel kit, mansion, temple. Each kit is checked with `pnpm stage:check` and reviewed at DPR 2 before the next.

## The street kit

Done 2026-10-23. `scripts/stage-sets/kits/street.ts` builds a Kordavos street from a dressing. `scripts/stage-sets/kordavos-streets.ts` writes the five sets and their stagings.

- Layouts: night lanes 86 m long with a crossing, a side alley and an archway house; a waterfront lane of stone houses ending at a quay; a street opening into a square 28 m wide under a great stone house with a balcony.
- Times: night under a low moon in teal mist, dawn, and full day. A dressing can move the sun and replace parts of the atmosphere.
- The kit lays the houses, cobbles, lanterns, signs, washing and spires. The dressing adds its own buildings in gaps, props, lamps, crowd, marks and shots. The eight lights spread along the street instead of bunching at the camera.
- Sets: `kordavos-night-lanes`, `kordavos-ambush-lanes`, `kordavos-waterfront`, `kordavos-square-dawn`, `kordavos-square-funeral`.
- The ambush's two flat-roofed stone houses stand 12 m tall with the Cowl's archers at their parapets. The hideout is a stone ground storey with boarded weatherboards above, its iron door open under a red lantern. The funeral has a draped bier with candle stands, two ranks of soldiers along an aisle and knights before the house.
- Engine: a cast member's `y` stands them on something raised, a roof or a balcony. Shots on them rise with them, and `stage:check` leaves them out of ground walks.
- Standees from their portraits: Varchk, Kaeleth and Seraphina. New: Liora the Cowl archer and Joran with the Key. Silas is the Covert Cargo figure.
- `pnpm stage:check` passes. Walks: Shadowing Silverhand 120 of 120, the hideout 77 of 77, the ambush 48 of 48, the new dawn 36 of 36, the funeral 45 of 55, where walks to the steps stop at the bier.
- At ultra, DPR 2: 105 to 175 draw calls, 0.16M to 0.33M rendered triangles, 19 to 32 fps.
- Desktop maps the five encounters. 78 desktop tests pass. Not yet checked in the running desktop app.
- Left: the ambush's rooftop view shows a narrower canyon than the painting. Bram has no figure in the ambush, since he waits at the inn.

## The cellar kit

Done 2026-10-23. `scripts/stage-sets/kits/cellar.ts` builds a room below ground from a dressing. `scripts/stage-sets/cellars.ts` writes both rooms and their stagings.

- A dressing picks the size, a stone barrel vault or a low beamed ceiling on posts, stone or boarded walls, a flagged or boarded floor, a stair or a door in, and a warm or cold tone. No daylight: the dressing's lamps and the camera's fill light it.
- New builders in `packages/stage/src/builders/cellar.ts`: `cask` (rows on cradles, heads out, stacked in tiers), `wineRack` (bottles lying necks out) and `torch` (a live flame in an iron sconce).
- `silverhand-hideout`: the warehouse's back room for Face-to-Face with Silverhand. Board walls, beams, crates and sacks along the walls, a long table with empty chairs, Silverhand seated at the far end behind one candle and the whiskey, Varchk behind him.
- `blackthorn-wine-cellar`: a 22 m barrel vault under the mansion for The Wine Cellar. Racks along both walls, casks before them, two chandeliers, torches at the stair, a tasting table, and the paler rack on the far wall that hides the alcove. The sommelier and the servant walk on from the stair when the narration names them.
- Standees: Clive Stonebrook the sommelier and Mira Hearthstone. Silverhand seated is the auction's figure.
- `pnpm stage:check` passes. Walks: the hideout 35 of 60, since the long table stops walks down the room; the wine cellar 66 of 66.
- At ultra, DPR 2: 78 to 85 draw calls, 0.02M and 0.28M rendered triangles, 27 to 37 fps.
- Desktop maps both encounters. 78 desktop tests pass. Not yet checked in the running desktop app.
- Left: the casks read as banded logs more than staved casks, and the racks behind them stay dim.

## The tunnel kit

Done 2026-10-23. `scripts/stage-sets/kits/tunnel.ts` builds tunnels and caves from a dressing. `scripts/stage-sets/catacombs.ts` writes four sets and their stagings.

- New builders in `packages/stage/src/builders/tunnels.ts`: `bore`, a tunnel swept along a path with laid-stone or rough-hewn walls, a round vault, a floor and optional blank end walls; and `cave`, a rough domed chamber with mouths cut where bores come in. Both lay their walls down as footprints.
- The kit adds stone portals round each mouth, crystal clusters, and tones of light: green, blue and frost.
- `catacombs-powder` (Into the Catacombs): a laid-stone tunnel with torches into a pillared chamber, six powder kegs, the fuse across the floor with its ember, four Covenant agents, Astrid's soldiers behind the party.
- `catacombs-labyrinth` (Through the Labyrinth): a cave where the way forks, crystal runes in the walls, cold mist; the left fork bends twice to a blank wall.
- `catacombs-sealed-door` (The Sealed Door): the same tunnels, the blank wall now a black iron door in a stone frame with glowing rings, spokes and runes, frost before it.
- `catacombs-hall` (Big Empty): a cavern 20 by 30 m in grey dust, a narrow archway glowing blue at the far end. Three undead rise from the dust when the narration says so.
- Standees: a Covenant rogue, a cultist, and an ancient undead warrior.
- `pnpm stage:check` passes. Walks: powder 136 of 140, labyrinth 61 of 72 and sealed door 40 of 72, where walks round the bends stop at the rock; hall 107 of 108.
- At ultra, DPR 2: 63 to 97 draw calls, under 0.04M rendered triangles, 16 to 32 fps.
- Desktop maps the four encounters. 78 desktop tests pass. Not yet checked in the running desktop app.
- Left: the labyrinth is darker than its painting, and its crystals read as pale shards.

## The Blackthorn mansion

Bespoke, written by `scripts/stage-sets/blackthorn-mansion.ts`. The ballroom and the grounds done 2026-10-23; the stair hall, the corridor and the study next.

- `blackthorn-ballroom`: an 18 by 34 m hall on the first floor. Fluted marble columns under gilded arches, a painted barrel vault, three chandeliers, red velvet at the tall windows, banquet tables and a gem display, a stage with banners and drapes, and a curtained cage on its west half. Glazed doors in the east wall open onto a moonlit balcony. The hall is a `room` lit by its own eight lamps.
- `blackthorn-ballroom-drake`: the same hall with the cage's curtain drawn back and the forest drake inside, for The Speech and Death to the Murderer. Thaddeus stands raised on the stage; he falls there, and the assassin runs out through the colonnade to the balcony.
- `blackthorn-grounds`: the house by night under a high moon. A long front of dressed stone with lit, mullioned windows, spired corner towers, a portico over a grand stair, a cobbled court, wrought-iron gates open on a street of townhouses. East of the house a walled garden under the ballroom balcony: flower beds, gravel paths, ivy, the drain grate with faint runes, a rope hanging from the balustrade. Entry to the Ball, The Chase from the balcony, and The Hunt for the Assassin.
- Masked guests are standees in four costumes, each used twice; the crowd's figures are kept to the far end of the hall, since they read as travellers with packs.
- Standees: the door guard, a Blackthorn guard, Thaddeus masked, Astrid in her ball gown and gold mask, Seraphina and Bishop Nicolai masked, the bishop bare-faced for the talks, Aelindor with his lyre, the Covenant assassin, and four masked guests.
- `pnpm stage:check` passes, every walk clear or blocked only by the stage and the cage.
- At ultra, DPR 2: 104 to 129 draw calls, 0.07M to 0.20M rendered triangles, 22 to 33 fps.
- Desktop maps the nine encounters. 78 desktop tests pass. Not yet checked in the running desktop app.

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


## The Lower Districts

Source: three paintings. The walk in is a long narrow street of leaning half-timbered houses, crowded with cloaked people, lanterns on the walls and a house built across the street. The urchins' painting is a close-up of the red-haired halfling girl with the crowd behind. The finding painting is a carved dagger sign on a wet paving stone in a dark alley. The intros add washing, chimney smoke, street performers, and a sign of a snake round a crescent moon.

- Set `realm-of-myr/kordavos-lower-districts`, stagings `welcome-to-the-lower-districts`, `beset-by-street-urchins` and `finding-the-black-market`, written by `scripts/stage-sets/lower-districts.ts`.
- A street of 6.4 m between stone ground floors, its timber storeys jutting further at each floor. There is an archway house at each end, the far one 68 m up the street. A side alley 2.6 m wide turns off west to a dark archway and a shut gate. Washing hangs across both, along with bracket lanterns, hanging signs with emblems, shopfronts, clutter, a handcart and two stalls. Spires of the upper city show beyond. The time is the grey end of the day.
- The day signs: a carved dagger on a paving slab in the alley and a serpent-and-moon block over a doorway, both painted textures.
- New builders in `packages/stage/src/builders/streets.ts`: `tenement` (a jettied townhouse with a door, shop, arch or passage ground floor, a gable or eaves, a lean, framed sides for corners and alleys), `laundry`, `wallLantern` and `hangingSign`.
- A low stone threshold across the alley's mouth is a doorway to the walks, so walks from the street turn into the alley there.
- Standees: Finn Swiftfoot and Mara Redleaf from their portraits, as halflings the size of children with the portraits' pointed ears, two more urchins, a street fiddler, a hooded local and a trinket-seller. The trinket-seller's back was repainted: the first showed his tray behind him.
- `pnpm stage:check` passes. Walks: 107 of 112, 156 of 162 and 78 of 90. The blocked ones go from the alley to the bridge-house, which needs two turns, or start against the wall clutter.
- At ultra quality, DPR 2: 129 to 173 draw calls, 0.32M to 0.34M rendered triangles, 20 to 28 fps. 0.17M static triangles, 84 walkers.
- Desktop maps the three encounters. 78 desktop tests pass.
- Left: the crowd library's robed figures are paler than the paintings' dark cloaks. The cobbles have no wet sheen. Not yet checked in the running desktop app.


## The Black Market

Source: the entrance painting (a hooded guard before an arched doorway hung with ochre curtains, old stone and wood, warm light, dark beyond), the stalls painting (a grinning scarred dealer leaning over gold and gems, a narrow lane of stalls and lanterns behind him crowded with cloaked buyers, a pale sky slot), and the two intros (a doorway of old planks between crumbling buildings, a labyrinth of stalls and tents, potions, stolen artifacts, blades, masked figures). The auction intro puts its chamber "deeper in the Black Market".

- Set `realm-of-myr/kordavos-black-market`, stagings `the-entrance-to-the-black-market` and `labyrinthine-stalls`, written by `scripts/stage-sets/black-market.ts`.
- A court between crumbling houses ends in an old stone wall with the curtained arch and planked-up doors. Behind it a lane of stalls 5.6 m wide runs 42 m between leaning houses, roofed with patched canvas and strung with lantern globes, braziers smoking. Side lanes turn east to Mizrith's tent of curiosities and west to the shadowy stall of elven goods. The lane ends at the auction house: a tall stone front, a door hung with wine curtains between braziers and two guards, the serpent-and-moon over it. The auction hall goes behind that door.
- Nightfall. The court is a `room` with its own four lights, so the market keeps the set's eight.
- Grendar's counter heaped with gold, gems, goblets and an open casket, his shelves of potions. Vera's rack of blades and a table of daggers. Potion shelves, cloth, spice, jewel and arms stalls.
- New builders in `packages/stage/src/builders/blackmarket.ts`: `curtain` (pleated, drawn and tied back), `lanternString`, `curioShelf`, `treasureCounter`, `bladeRack`, `boards`, `canvas` (a sheet slung overhead with no poles). `stall` takes `pad`, how far round it walks keep clear.
- Painted texture `stone-old.jpg` from the entrance painting, an `image` material with `size` metres a tile.
- Standees from their portraits: Garrick, Grendar, Vera Azimov, Rae the Scarred, Mizrith; and the oily vendor of the elven goods, seated. Three backs repainted: Garrick's cloak open on his armour, Mizrith's and the vendor's hands behind them.
- Engine fix: a shot whose target lies beyond the set's `camera.maxDistance` had its camera dragged toward the target by the orbit. The target is now drawn in along the same line. Shots of the library, the Silver Serpent, the docks and the Lower Districts that were affected now frame as authored.
- `pnpm stage:check` passes. Walks: entrance 76 of 80, the stalls 138 of 180. The blocked ones start at a dealer behind a counter, or go from the court into a side lane, which takes two doorways.
- At ultra, DPR 2: 146 to 231 draw calls, 0.31M to 0.42M rendered triangles, 23 to 33 fps. 0.21M static triangles, 48 walkers.
- Desktop maps both encounters. 78 desktop tests pass.
- Left: the crowd library's pale robes against the painting's dark cloaks, and a lane brighter than the painting's sky slot. Not yet checked in the running desktop app.
