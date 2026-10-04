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

## Owner feedback, second pass

2026-10-04: "I was expecting it to match the art more exactly for the boat and lighting."

- The boat is rebuilt as the tug in the art: a curved hull rising to the bow, dark below a blue-grey strake with rust rails, a pale cabin, a glazed saloon forward with warm lit windows, a glazed pilothouse with a barrel roof, a thin stack, life rings.
- New engine feature: static point lights in a set's atmosphere. Lamp and window light now pools on the deck and pier and glints in the water.
- Pier lighting: saturated blue mist with warm saloon and pilothouse light, a lantern on the pier and a cold lamp on the bank. Dense bushes and ferns line both banks.
- Cabin lighting: neutral grade, grey-brown wood, warm lanterns and candles, a darker crate, and a cold teal light at the open door.
- Remaining gaps: the water mirrors only the sky, so the windows show glints, not the art's long reflections. Tree crowns are rounder and flatter than the painted oaks. The moss is thinner.
- `stage:check`, stage and desktop typechecks, Biome and 25 desktop tests pass. The pier is 2.30M triangles at high, under the 2.5M budget.

## Third pass: painted textures, props, hillside, fog

2026-10-04, owner: the wood should look like the art's wood. The bank beside the boat should be a hillside thick with moss and trees, with a lot of fog. The boat and the crate are bigger and cooler in the art. No Blender or Godot, the owner chose (a) to (d) below.

- (a) Painted textures. `scripts/stage-textures.ts` paints tileable textures with the standee image model, in the art's style: weathered boards, dark cabin wood, the boat's painted boards, a tarred hull, mossy bark, and hanging moss cut out from green. A new `painted` material wraps them along each board's grain with the wood shader's seams, wear and grime. Textures live in `public/stage/textures/`, so the desktop build copies them. The stage waits for them before its first frame.
- (b) Props. A detailed `strongbox` builder for the crate: bevelled boards, iron corners and bands, rivets, a hasp, a chain and handles. The tug grows toward the art's size, with an upper deck walkway, more trim, fenders and a bow lamp.
- (c) Hillside. A `heightfield` primitive from a grid of heights the generator computes, so trees, bushes and moss sit on the slope. Moss hangs as painted curtains on cards.
- (d) Fog. Thicker height fog that pools low over the water, and soft mist banks between the tree rows.
- Budget: stay within 2.5M triangles and 300 draw calls at high. Thick fog lets distant trees go.
- Validation: `stage:check`, typechecks, Biome, desktop tests, renders at high against the art.

Results:

- Textures: seven painted with `gemini-3.1-flash-image` from crops of the art, made tileable, 150 to 270 KB each: weathered boards, crate oak, dark cabin wood, the boat's peeling paint, tarred hull, mossy bark, and hanging moss on green, keyed.
- Engine: `painted` boards, `card` cut-outs and `mist` materials. A `heightfield` primitive, a `mist` bank builder and the `strongbox` crate. Fog has a `start` distance. Wood grain on curved faces now follows the surface, so the hull's planks run to the bow. Boxes are unchanged.
- Crate: boards with gaps, corner posts and battens, a rimmed lid, iron corners and straps with rivets, a hasp and chain, ring handles, nails. A new close shot, "The crate up close", opens The Crate.
- Tug: 14 m by 4 m, taller cabin and pilothouse, a rail round the whole cabin top, rope fenders. Painted hull, peeling blue-grey cabin, rust trim. Saloon windows amber.
- Bank: the west bank climbs into a hill up to about 14 m, with 150 trees, 60 understory oaks and 380 large bushes on the slope, and moss curtains on near trees. Its foot keeps clear of the reeds, the landing, the trail and every camera. A new shot, "The wooded bank".
- Fog: thicker, starting 14 m out, with mist banks down the river and along the hill, and a sheet over the water.
- Budget at high: the pier 79 to 94 calls and 2.42M triangles, under 2.5M. The cabin 0.22M.
- Gaps: foliage is still round leaf blobs, not the art's painted leaf masses, and big bushes look mottled up close. The water mirrors only the sky. The art's crate hold has ropes, chains and posts this cabin lacks. AgX tone mapping limits how saturated the lit windows can be.
- `stage:check`, stage and desktop typechecks, Biome and 25 desktop tests pass. The Kordavos gate rendered cleanly after the grain change.

## Fourth pass: leaf cards, the crate hold, a bigger tug

2026-10-04, owner picked (a) painted leaf cards and (c) the crate hold's ropes, chains and posts, plus a bigger boat.

- (a) Leaves: paint leaf clumps from the art on magenta, so green leaves key cleanly. A foliage material with a painted map builds each crown and bush blob as a cluster of crossed cards with rounded normals, so it shades like a mass of leaves. Cheaper in triangles than the spheres.
- (c) Crate hold: heavy posts beside the crate, knotted ropes hanging from the beams, chains draped along the back wall, rope coils on the floor, as in The Crate's art. New `rope` and `chain` builders, and a painted rope texture.
- Bigger tug: about 17 m by 4.6 m with a taller cabin. Pilings, mooring lines, stern props, lights and marks move to fit. The cast keeps its places on the foredeck and gangway.
- Validation as before: `stage:check`, typechecks, Biome, desktop tests, renders against the art, the 2.5M triangle budget.

Results:

- Leaves: two clumps painted on magenta and keyed, small oak leaves for crowns and broad ivy-like leaves for bushes. Every Covert Cargo set uses them. A crown mass is 14 cards, 28 triangles, against 192 for a leafy sphere, so card crowns carry 14 masses instead of 9.
- Leaf cards vanished at distance because alpha thins in small mipmaps. The foliage shader now boosts alpha by mip level, and the cards cast leaf-shaped shadows.
- The pier went from 1.39M to 0.66M static triangles even with 220 hill trees, 100 understory oaks, 680 big bushes and young trees leaning out behind the tug. 1.15M rendered at high, 35 to 42 fps on the dev build.
- Crate hold: iron-banded 0.32 m posts, four knotted ropes, chains along the fore wall and down a post, two rope coils, a warm light above the crate. Rope is painted hemp. The close shot moved back to show the crate whole.
- Tug: 17 m by 4.6 m, cabin 2.7 m, longer pilothouse. Pilings, lines, stern props, lights, the stern mark and the tug view moved to fit. The cast keeps its places.
- Fog eased to 0.03 from 18 m, so the banks keep their greens.
- Not changed: the old forest path's gold-green haze still hides most of its canopy.
- `stage:check`, typechecks, Biome and 25 desktop tests pass.

## Fifth pass: reflections, a rounder cabin, a wider tug

2026-10-04, owner picked (d) water that reflects the boat and its windows, (f) a rounder, taller cabin like the painting, and a wider boat.

- (d) Planar reflection: on tiers that allow it, the stage renders the scene once more from a camera mirrored in the water plane, at reduced resolution, and the water shader samples it with ripple distortion. Opt-in per water material (`mirror`), so approved sets keep their look. Roughly doubles draw calls on the river sets.
- (f) Cabin: a saloon with a rounded front and windows wrapping it, a taller cabin, an upper deck that overhangs it with a rail, and a pilothouse with a rounded front under its arched roof.
- Wider tug: beam from 4.6 m to about 5.6 m. The tug moves east, the gangway reaches it, and pilings, lines, lights and marks follow.
- Validation as before, plus draw calls and frame rate with reflections on.

Results:

- Reflections: `render/mirror.ts` renders the scene from a camera mirrored in the water, with an oblique near plane at the surface, into a linear target at half the drawing buffer on high, 0.35 on balanced, 0.6 on ultra, off on mobile. Water with `mirror` mixes it into its specular, smeared mostly up and down by the ripples, so lit windows streak down the water as in the art. The pier's river and the cabin's view through the door use it.
- Cost on the pier: 132 to 138 draw calls instead of 93 to 97, and 1.82M rendered triangles. Balanced measured 29 to 34 fps with the reflection and 36 to 40 without, on a busy dev build.
- Cabin: a 3 m saloon whose bow curves round seven windows and a glazed door, rust posts between them, rust fascia, a roof overhanging as an upper deck with a rail all round, and a narrower pilothouse set back from the curve.
- Tug: beam 5.6 m, moved 0.5 m east. The gangway grew to 7.2 m to reach it. Pilings, lines, stern props, lights and marks moved with it.
- Young trees on the bank start aft of the stern, so none hangs over the pilothouse.
- `stage:check`, typechecks, Biome and 25 desktop tests pass.

## Speed pass

2026-10-04, owner picked (g): bring the river scenes back up after leaf cards and reflections.

- Measured with a throwaway bench that times frames with a GPU sync and switches one feature off at a time. On high the river view cost 36.9 ms a frame: leaves 11.7, sun shadows 11.5 (half from leaf cards cutting shadows into a 4096 map), reflection 5.8. The high pipeline alone costs about 14 ms at 1440 by 900, measured on the small cabin.
- Cuts: leaf cards cast no shadows on the pier, and bushes and ferns none anywhere they are marked. The pier caps its shadow map at 2048. Nine larger cards per leaf mass instead of fourteen. 170 hill trees instead of 220, nearer the foot. Painted wood skips noise the painting already carries. The reflection leaves out grass, reeds, ferns, moss, mist and stones, and renders at 0.4 of the screen on high.
- Work per frame on the river view: 1.82M to 1.09M triangles, 138 to 125 draw calls, a quarter of the shadow-map texels on high. The look is unchanged in side-by-side renders.
- The viewer's fps on a busy dev build: balanced 66 on all three river views, high 40 to 48. Before the pass the same counter read 29 to 34 and 14 to 30. The machine's load average was about 17 from other work, so single runs swung by several milliseconds. Only interleaved runs and the work counts are firm.
- Not measured: a release build. The dev viewer page is blocked in production, and the packaged app check still waits.

## Release check, 2026-10-04

- Release build with two Rust jobs: no warnings. The bundle carries all ten painted textures.
- The app's render report (written only with `D20_RENDER_REPORT` set) now samples the stage's fps, draw calls and triangles each second for 50 s.
- Packaged app on the pier save: the stage came up with no errors, on the balanced tier at pixel ratio 1, showing the river shot under the title screen. Reflections, painted wood, leaf cards and moss all render. 121 calls, 1.09M triangles. Median 46 fps, 40 to 59, over 21 s. Load average 3 to 5, swap 3.4 to 3.7 of 4 GB used.
- Not yet measured: the play view. Two runs past the title screen came up hidden or behind other windows, where the stage does not draw, because the owner was using the Mac at the time. The owner's save was restored with an unchanged SHA-256.

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
