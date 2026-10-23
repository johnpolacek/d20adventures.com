# Stage set authoring

[Home](index.md) · [Stage engine](stage-engine.md)

Status: working pattern, 2026-10-03. Used for the Kordavos harvest square and the Valkarr forest trail. Owner direction: build and review 3D scenes on the web viewer first, then check them once in the desktop app.

## Why web first

The web viewer and the desktop app run the same `packages/stage` renderer and the same set files. A change shows up in seconds on the web, the camera can be moved freely, and the owner reviews from a link. The desktop app needs a two-minute rebuild and a save at the right encounter, so it is used for the final check only.

## Steps

1. **Scope.** List the encounters a location serves. One set per location, one staging per encounter. The forest trail set serves Broken Silence, Owlbear Confrontation, and Timely Rescue.
2. **Reference art.** Start from the art already made for the adventure. Each encounter's frontmatter `image` is a painted scene, and `locations/*.md` describe each place. Download them, read palette, light, weather, tree and building shapes, and composition, and keep them beside the renders during review. The Midnight Summons art is misty blue-grey moonlight, light shafts, and gnarled trees.
3. **Brief.** From the reference art, each encounter's intro and GM notes, and the setting's `art-direction.md`, write down what is there, where each character starts, the labelled places players and the GM can name, and the camera views. Record it in the feature plan.
4. **Kit.** Compose existing builders first. Add a builder only for a new kind of thing, with zod params and a footprint if people should walk around it. The forest added `tree`, `fern`, `bush`, `rock`, `log`, `trail`, a `foliage` material, scatter `clear` circles, and sky `gain` for night.
5. **Characters.** Standees use `gemini-3.1-flash-image` at 2K, 9:16, on green, then a distance-from-green key. A front is conditioned on a finished standee for finish and the world style reference. It is described in words, never from a photographic likeness. A back is conditioned on its front. Portraits are cropped from fronts, so faces match across the HUD and the scene. Check each pose against the content: the first owlbear came back with wings. `scripts/stage-standees.ts` runs this pipeline (`front`, `back`, `key`, or `all`) for the stock hero figures and painted premades. Add a figure there with its description, and with a reference image when the character already has art.
6. **Specs.** Write the set and staging JSON under `packages/stage/src/sets/<setting>/` and `stagings/<adventure>/<encounter>.json`, and register them in `sets/index.ts`. Cast ids are content character ids.
7. **Check.** `pnpm stage:check` must pass: art exists, nobody starts inside something solid, and the party's walks to every labelled place and character are clear.
8. **Look.** Run `pnpm exec next dev -p 3057` and `scripts/stage-verify.ts --tiers=ultra --staging=<key>` against Chrome at DPR 2. Read every view and the native-pixel character crops before asking for review.
9. **Owner review.** Send `http://localhost:3057/dev/stage?staging=<key>&tier=balanced`. Ultra draws four times the pixels and slows an 8 GB Mac. Do not leave a test Chrome or extra servers running during review. View buttons or number keys switch cameras, tier buttons switch quality, and H hides the panel. Iterate on feedback.
10. **App.** Map each encounter in `apps/desktop/src/scenes.ts` with a place name and a one-line `where` for the GM, extend the desktop tests, build, and check the scene once in the packaged app.
11. **Publish art.** Run `pnpm stage:sync` before pushing new or changed files in `public/stage`, `public/stage-lab` or `public/images/app/backgrounds`. Deploys leave them out and the site serves them from the public bucket. See [Vercel deployment storage](plans/vercel-deploy-storage.md).
12. **Record.** Add measured counts to [the stage engine reference](stage-engine.md) and results to the plan.

## Lessons

- Night reads from contrast, not brightness. The first forest renders already matched the reference art's average brightness but looked like day: an even blue light and a bright sky. What worked: a dark sky with `clouds` thinned and faint `stars`, a cool moon `glow` (warm by default, which turned the sky orange), mist with its own `fog.color` that matches the sky's horizon so gaps between trees blend, low hemisphere light, and a soft neutral `fill` light that travels with the camera so characters stay readable. Games commonly do the same. Set `grade: "neutral"` for moonlight: the default warm grade, in the paint pass and in the standee shader, tints night scenes and their characters orange-brown.
- Frame the opening view like the encounter art. The first cottage and stones renders were far-off overviews, while the art is a close view of the door and gear, or of the first stone with the river beside it.
- Measure the art to place things. From the camera height and field of view, a feature's pixel position gives its distance, height and offset. The Standing Stones' four stones, the river bank and the moon were placed that way, then tuned by render.
- Keep the art's open sky open. A clear wedge in the tree scatters from the main view toward the moon kept the valley, mountains and moon in frame as the art has them.
- Ground needs detail at eye height. Use a `meadow` ground, `grass` tufts in the near field, `flagstones` instead of a tiled strip, and `rock` for stones. Flat noise ground and a tiled path read as a game prototype.
- Avoid thin dark contour lines in a material. The paint pass inks them, so noise cracks read as squiggles drawn on the stone.
- Grass and leaves cost the most triangles. Use `low` trees for distant woods and keep dense grass to the near field.
- Paintings cheat light. The stones art shows the moon ahead and the stones lit from the front, so `sun.disc` places the moon apart from the light.
- Spell out the art's specifics in the brief: apparent age, how the hair is worn, what is tangled in it, and the palette. A generic brief ("silver hair braided with leaves") gave Wollandora clean pigtails and a bright green costume unlike her art. Generate two or more candidates and compare them side by side with the art.
- Match characters to the owner's existing art for that character. Thalbern was first drawn from the written description and did not look like his art. Use the art for costume, hair, and colouring, painted as an original character rather than a photographic likeness.
- Smooth-shaded leaf masses with the alpha `foliage` texture read as painted trees. Flat-shaded spheres read as a low-poly game.
- Clear tree scatter around every camera position, along trails, and along key walks with scatter `clear` circles.
- Keep views near eye height. From above, standees read as flat cards.
- Keep the crowd off the camera lines of close-ups and character focus with `crowd.avoid` circles.
- Generate a set from a script when it has many computed parts. `scripts/stage-sets/covert-cargo.ts` writes four sets and ten stagings: bank rocks along a river curve, scatter clearings along trails, ground cut around a river. Rerun it rather than editing the JSON.
- The `extrude` primitive's "xz" plane mirrors z. Write ground outlines with z negated, or build them in a builder.
- Hanging moss and dense woods cost triangles fast. The first Mordava pier reached 3.2M rendered triangles. Fewer, closer trees with moss only on the near ones brought it to 1.8M with no visible loss in the mist.
- Interiors light from the hemisphere and the camera fill, with `atmosphere.lights` at the lamps. Keep the grade neutral and the wood greyish: the warm grade with warm lamps turned the whole cabin orange. A cold light at the open door brings in the river's teal, as in The Fake.
- Paint surfaces from the art when procedural colour is not enough. `scripts/stage-textures.ts` paints one board's grain, flat-lit, from a crop of the art. The `painted` material adds seams, wear and nails, so the painting must not include them.
- Bright emissive colours wash to peach under AgX tone mapping. Keep lit windows near intensity 0.8 with a deep orange for amber.
- Fog with a `start` distance keeps the near bank's greens and fades only the distance, which reads like the paintings. Plain fog turned every view one flat blue.
- Clear big bushes from camera lines by their size, not just their centre. A 4 m bush two metres from a camera fills the frame.
- Paint green subjects such as leaves on magenta, not green, so the key leaves them whole.
- Alpha-tested leaf cards disappear at distance unless alpha is boosted by mip level. Check far crowns, not just near bushes.
- Paint far scenery as `backdrops` rather than building it. A painted valley replaced the Standing Stones' mountain cones and reads like the art from every shot that faces it. Add an entry to `scripts/stage-backdrops.ts`, paint, review the raw, key. Its lowest band must be forest or ground that sits just below the set's horizon, or it reads as giant. The model tints ridges toward the magenta key, so check the keyed result for lavender. Tune `gain` and `haze` by eye against AgX.
- A character facing the art's view has a close-up looking the other way. Paint that side too, or the close-up shows bare ground. Thalbern's close-up at the stones did.
- Layered hills with pale mist between them read as cloud banks once placed. A dark ridge with a crisp skyline of tree tips reads as land. Keep its treeline at the horizon: whatever the painting holds below 0 degrees is hidden by the land.
- Capture every shot of a set before painting a backdrop. Only shots that show a bare horizon or a bright gap need one, and close-ups usually look the other way from the main view.
- A backdrop can stand near, as a theatre flat. The riverfront's houses hang 70 m out, their street line on the edge of the paving.
- Paint forest depths `opaque`, edge to edge with no sky. A haze that fades into the magenta sky keys pink.
- Time frames with a GPU sync and switch one feature off at a time, interleaving base and test runs. On a busy machine single runs swing by several milliseconds. Trust interleaved medians and work counts (triangles, calls, shadow-map texels) over one fps reading.
- Dense foliage is costliest in the shadow map. Keep low growth and leaf cards out of it under soft or misty light, and cap the map with `sun.shadow.size`.
- Hosts frame a character's turn with a generic shot in front of them. Mark walls and cabins `solid`, keep cast a step clear of posts, and hang ropes and chains away from the lines to doors, or the turn view lands behind them.
- Name a staging's shots after what they show ("The river", "The tug", "The reeds"): narration picks views by matching paragraphs against those labels.
- A character hiding in tall growth reads best from behind and above, looking past them at what they watch. A low front shot shows only stems.
- Do not run Biome on generated set JSON. It reflows the arrays, and every regeneration then shows as a large diff.
- Match a painting's light sources, not only its average colour. The pier's art reads from warm windows against blue mist. Point lights inside the saloon and the pilothouse, a lantern on the pier and a lamp on the bank gave that. Keep lamp lights inside solid walls, not outside them, or they wash the walls. A room people stand in needs its own modest light. Put the spill for the deck just outside its door and windows, above head height and a step out. A strong lamp at head height by the door washes out anyone who stands there: at half a metre it turned Lyra's black hair blond and her blue coat olive.
- Put a scene where the story puts it. An intro that says someone is inside with the cargo needs a room, not a crate on deck: `riverboat.interior` opens the saloon. Tie a late arrival to its line with a staging entrance (`entrances: [{ cast, when: "cabin door opened", from }]`), and keep `from` inside the doorway so the walk on passes through it.
- Frame a small room along its longest line. A camera half a metre from a crate shows only the lid.
- Stage people where the story's logic puts them, not where one line of the intro does. Covert Cargo's escorts stay beside the crate they are paying for, and its guards face outward. When the intro disagrees, fix the intro with the owner.
- Anchor every doorway people walk through as two `door` anchors, a step inside and a step outside, so walks route through it.
- Give an entrance a `shot` when the room is crowded. The computed view from beyond the entrant's place can land on someone else.
- A face peeking over leaves reads better than a view over a hidden character's shoulder. Tall reeds between the camera and the subject hide everything.
- Give an interior a `room`. Without one the night sky's hemisphere and environment light every wall evenly, and the room looks flat. Inside, light only from lamps the art shows, a warm pool on what the scene is about, and darkness between.
- Keep a lamp's light a hand below or beside its glass. A point light inside the glass blows it to white.
- Lay wall boards in panels narrower than they are tall, so the painted grain runs upright. The grain follows a piece's longest side.
- Windows seen from inside need frames, sills and glazing bars, and dark glass. Big plain panes read as blank blue screens.
- Paint an interior's textures from the paintings of that interior, at 1536 px, and tint them near white. A dark texture tinted to a colour loses its grain under lamplight.
- A window people should see through needs a real opening and one-sided `glass`: glowing from outside with the room behind it, clear from inside.
- A cloaked character's back can come out as a front-facing body with the cloak drawn behind it. Give the figure a `backNote` in `scripts/stage-standees.ts` that says the cloak hangs down the back and hides it, and whether the hood is up.
- A death the intro narrates needs no dice and no round. Leave the character out of the encounter's `npcs`, keep them in the staging cast, and give them an exit with the line they fall on. Give the next staging the same cast member with `down: true`, or the body vanishes at the scene change.
- Pace a sequence with encounters, not one long intro. Stage positions reset on every encounter change, so a second encounter can bring someone through a door with an entrance. NPCs do not walk on their own.
- Name a stranger by what the heroes see. A staging can call a cast member "The Ranger", so the plate does not give his name before he does, and narration that says "the ranger" still finds him.
- Give a fall its own shot that shows the floor. A shot on the character looks at head height, so they drop out of frame and seem to vanish. Aim `lands` at open boards: behind Reinhard were a wall, a post and a chain.
- Name the turns of a walk off the set. A walk is one straight line or one doorway, so Covert Cargo's elves leave by `via`: the foredeck, the gangway's two ends, then the trail's own bends. A straight line to the trail stopped at the saloon wall. `stage:check` fails an exit that stops short.
- Try several angles on a character hidden in thick growth before settling. Of five views of Thalbern's thicket, three were inside a bush. The one that worked looks along the bank from 55 degrees off his facing.
- Give two hidden characters hides that cannot see each other, and say so in the scene's `where` line for the GM.
- When the story takes something big off a set, cut a second set from the first in the generator. Covert Cargo's empty pier is the pier's own spec with the tug, everything aboard, its mooring lines, its lights, its room, and the places and views on it filtered out. Hiding it with camera angles does not work: narration picks views by label, and "the tug" would find the boat still moored.
- Check a new standing place against the big trees. The giant by the gangway has a 1.4 m footprint and stopped Poppen's walk to anyone north of it.
- Place a scene's focus in the sun. The harvest square's afternoon sun throws the south-west houses' shadow across its south end, and the first Clan Conflict layout left Larya dim against a blank wall. Moving the standoff a few metres north-east fixed it.
- Say "tall human proportions, long legs, not a dwarf" for a burly human. A brief for a burly, bearded man in armour came back with dwarf proportions.
- Point a close-up across a face-off, not along it, or the other side's shoulder fills the edge of the frame.
- The game pauses a set's loops, so people stay where the staging puts them for the whole encounter. Start the party where the intro needs it: the gate queue had the heroes second in line behind a stranger Garlan questioned, while the intro has him question them.
- Check every authored view against awnings and overhangs. The gate's "Party" view sat at the edge of the watch's awning, which filled half the frame.
- Audit the views at eye height from eight bearings and from above as well as the authored ones, since players drag the camera anywhere. That pass found black awning undersides, flat sheaves and a camera that could enter a tower.
- A portrait reference lends its face. Paint NPC portraits from references that cannot be mistaken for the subject: a woman painted from a woman's portrait came out her twin.
- Seat tavern patrons on stools painted into their standees. `seated: true` in `scripts/stage-standees.ts` asks for the figure on a three-legged stool. A standee leans to the camera, so a 3D stool would show beside it.
- When a back keeps facing the same way as its front, as a seated traveller's knees did, mirror it. The stool, the satchel and the knees all land on the right side.
- Check what stands between the sun and the windows. The houses across the inn's street shaded its whole front at a dawn sun, so they moved back and the sun rose to 30 degrees.
- Keep a lamp off a standing place. A room light at head height by a window blew out the hero standing in the sun beside it.
- A slab that runs into a wall flickers against it. The backroom's ceiling reached into the common room's wall and drew a dashed line along it.
- Interiors full of furniture stop straight walks. Put the party where walks out are clear, and keep a booth to one hero.
- A wall's openings cannot stand one over another. A door and a window above it in one `wall` broke the cuts and the window vanished. Build the wall in two storeys, the upper one with a 3D `at`.
- Close every gap between a vault and the walls or a crossing. Sky leaked through the corners above the vault's ends as bright quads, and the sun through them as a stray patch on the floor.
- A flat `panel` lying with pitch -90 runs from `at` toward -z. Place a rug or a carved slab by its +z edge.
- Paint a book's spine once, pale, and tint it into many bindings. Real book boxes with a painted spine read as a library at every distance.
- The image model draws Earth when asked for a world map, and a wolf when told the land is shaped like one. Name the coastline's features instead.
- Light from a high window leads the eye in a hall. The library's south sun runs down the floor to the red door, as the painting does.
- Hemisphere light has no roof. From outside a building with an open end, the room inside reads as flat grey. Keep the camera inside such a room with `camera.min` and `max`.
- Fog fills interiors too. A thick harbour fog turned the tavern's far half pale grey. Keep fog thin and let a cold room light at the opening and a glow shaft carry the haze.
- Stand posts between tables, not in the aisle. Posts down the aisle's middle stopped every walk from the door.
- Decks are at y = 0, the same as the ground. To make a ship read tall from the quay, drop the water instead, and build up her castles. Ring trims round a hull, never plates across it: a solid gilt plate hid the hold under the hatch.
- Keep a hold's floor above the set's water plane, or the water shows in it.
- Paint a green creature on magenta (`magenta: true`), and check a creature's pose against the text: the painting's drake had no wings, the encounter's does.
- A back can show a front-only garment. Say in `backNote` that an apron shows only its ties from behind.
- Keep crowd walker paths clear of buildings and of the confrontations staged in the scenes that use them.
- Find a walk's blocker by building the set in Node and probing `reachOver` past where the walk stops. A cart's footprint stopped walks across half the quay.
- Put the painting beside the opening view before calling a set done. Find where the painting's camera stands: the docks painting looks down a channel from a quay across its head, with the ship's bow toward the viewer, which a camera on the quay's long side cannot frame.
- A ship's side reads grand only when it is seen at an angle and her stem is nearest. Stern-on, a sterncastle reads as a house.
- Paint sails as one canvas image. The procedural cloth is blotchy at the distances sails are seen from.

- Turn a walk into an alley with a doorway. A low stone threshold built as a `wall` with one `doorway` across the alley's mouth gives walks from the street a turn there.
- Masonry relief and dark joints read as bevelled cartoon blocks up close under lamps. Keep relief near 0.01 and the mortar close to the stone's colour.
- Close both ends of a street. A view back down an open street showed the bare ground plane and sky. An archway house at each end reads as the way on.
- Small water discs read as black and white blobs, not puddles. Leave them out.
- Keep every shot within the set's `camera.maxDistance`, or check the engine draws its target in. A long shot down a lane was dragged 4 m forward by the orbit, into a passer-by's face.
- A market stall's default footprint reaches 0.9 m past its counter. Along a lane, set `pad` low or walks have nowhere left to go.
- Put a worn threshold doorway across a side lane's mouth, out in the main lane where walks pass, so walks turn into it there.
- Stall awnings stand on poles that block close shots. Over a counter in a close shot, sling a `canvas` from the wall instead.
- A wall that fills a painting's close shot needs a painted stone `image` at real block size. Procedural masonry read as cartoon squares under lamps.
- A seated figure's back can come out as its front with the head turned. Say the back faces straight away, the coat covers it, and only the stool's legs and the heels show.
- Build a location that recurs as a kit and redress it. The street kit's lanes serve both Silverhand's trail and the ambush, and its square both endings.
- A `wall` built as an upper storey still lays its footprint on the ground. Over a door it stops every walk through the door. Build an upper storey as a plain box.
- The crowd's pilgrims are pale robed monks. Do not use them as hooded watchers at night.
- Stand a raised character against the sky, not a darker wall. On a roof lower than its neighbours, Silas was a dark head against dark timber.
- From the street, a parapet hides anyone standing a step behind it. Put rooftop figures right at a low parapet, and frame them from the roof behind, as the painting does.
- At night a long street needs its eight lights spread along it. Lights bunched by the camera left the crossing black.
- Put the moon on the street's axis. Off to one side, the roofs hide it.
- Frame a cave mouth with a stone portal. The cut in the cave wall is wider than the bore's arch, and the gap shows the void as a black frame.
- Below ground, light the rock from the hemisphere as well as lamps, and keep cave rock pale. Point lights alone left a 30 m cavern black.
