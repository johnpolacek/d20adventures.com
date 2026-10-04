# Stage set authoring

[Home](index.md) · [Stage engine](stage-engine.md) · [Desktop integration](plans/zzz-completed/feature-desktop-stage-play.md)

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
11. **Record.** Add measured counts to [the stage engine reference](stage-engine.md) and results to the plan.

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
- Generate a set from a script when it has many computed parts. `scripts/stage-sets/covert-cargo.ts` writes four sets and nine stagings: bank rocks along a river curve, scatter clearings along trails, ground cut around a river. Rerun it rather than editing the JSON.
- The `extrude` primitive's "xz" plane mirrors z. Write ground outlines with z negated, or build them in a builder.
- Hanging moss and dense woods cost triangles fast. The first Mordava pier reached 3.2M rendered triangles. Fewer, closer trees with moss only on the near ones brought it to 1.8M with no visible loss in the mist.
- Interiors light from the hemisphere and the camera fill, with `atmosphere.lights` at the lamps. Keep the grade neutral and the wood greyish: the warm grade with warm lamps turned the whole cabin orange. A cold light at the open door brings in the river's teal, as in The Fake.
- Paint surfaces from the art when procedural colour is not enough. `scripts/stage-textures.ts` paints one board's grain, flat-lit, from a crop of the art. The `painted` material adds seams, wear and nails, so the painting must not include them.
- Bright emissive colours wash to peach under AgX tone mapping. Keep lit windows near intensity 0.8 with a deep orange for amber.
- Fog with a `start` distance keeps the near bank's greens and fades only the distance, which reads like the paintings. Plain fog turned every view one flat blue.
- Clear big bushes from camera lines by their size, not just their centre. A 4 m bush two metres from a camera fills the frame.
- Paint green subjects such as leaves on magenta, not green, so the key leaves them whole.
- Alpha-tested leaf cards disappear at distance unless alpha is boosted by mip level. Check far crowns, not just near bushes.
- Time frames with a GPU sync and switch one feature off at a time, interleaving base and test runs. On a busy machine single runs swing by several milliseconds. Trust interleaved medians and work counts (triangles, calls, shadow-map texels) over one fps reading.
- Dense foliage is costliest in the shadow map. Keep low growth and leaf cards out of it under soft or misty light, and cap the map with `sun.shadow.size`.
- Hosts frame a character's turn with a generic shot in front of them. Mark walls and cabins `solid`, keep cast a step clear of posts, and hang ropes and chains away from the lines to doors, or the turn view lands behind them.
- Name a staging's shots after what they show ("The river", "The tug", "The reeds"): narration picks views by matching paragraphs against those labels.
- A character hiding in tall growth reads best from behind and above, looking past them at what they watch. A low front shot shows only stems.
- Do not run Biome on generated set JSON. It reflows the arrays, and every regeneration then shows as a large diff.
- Match a painting's light sources, not only its average colour. The pier's art reads from warm windows against blue mist. Point lights inside the saloon and the pilothouse, a lantern on the pier and a lamp on the bank gave that. Keep lamp lights inside walls, not outside them, or they wash the walls.
- A cloaked character's back can come out as a front-facing body with the cloak drawn behind it. Give the figure a `backNote` in `scripts/stage-standees.ts` that says the cloak hangs down the back and hides it, and whether the hood is up.
