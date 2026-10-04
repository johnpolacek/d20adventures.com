# Stage set authoring

[Home](index.md) · [Stage engine](stage-engine.md) · [Desktop integration](plans/feature-desktop-stage-play.md)

Status: working pattern, 2026-10-03. Used for the Kordavos harvest square and the Valkarr forest trail. Owner direction: build and review 3D scenes on the web viewer first, then check them once in the desktop app.

## Why web first

The web viewer and the desktop app run the same `packages/stage` renderer and the same set files. A change shows up in seconds on the web, the camera can be moved freely, and the owner reviews from a link. The desktop app needs a two-minute rebuild and a save at the right encounter, so it is used for the final check only.

## Steps

1. **Scope.** List the encounters a location serves. One set per location, one staging per encounter. The forest trail set serves Broken Silence, Owlbear Confrontation, and Timely Rescue.
2. **Reference art.** Start from the art already made for the adventure. Each encounter's frontmatter `image` is a painted scene, and `locations/*.md` describe each place. Download them, read palette, light, weather, tree and building shapes, and composition, and keep them beside the renders during review. The Midnight Summons art is misty blue-grey moonlight, light shafts, and gnarled trees.
3. **Brief.** From the reference art, each encounter's intro and GM notes, and the setting's `art-direction.md`, write down what is there, where each character starts, the labelled places players and the GM can name, and the camera views. Record it in the feature plan.
4. **Kit.** Compose existing builders first. Add a builder only for a new kind of thing, with zod params and a footprint if people should walk around it. The forest added `tree`, `fern`, `bush`, `rock`, `log`, `trail`, a `foliage` material, scatter `clear` circles, and sky `gain` for night.
5. **Characters.** Standees use `gemini-3.1-flash-image` at 2K, 9:16, on green, then a distance-from-green key. A front is conditioned on a finished standee for finish and the world style reference. It is described in words, never from a photographic likeness. A back is conditioned on its front. Portraits are cropped from fronts, so faces match across the HUD and the scene. Check each pose against the content: the first owlbear came back with wings.
6. **Specs.** Write the set and staging JSON under `packages/stage/src/sets/<setting>/` and `stagings/<adventure>/<encounter>.json`, and register them in `sets/index.ts`. Cast ids are content character ids.
7. **Check.** `pnpm stage:check` must pass: art exists, nobody starts inside something solid, and the party's walks to every labelled place and character are clear.
8. **Look.** Run `pnpm exec next dev -p 3057` and `scripts/stage-verify.ts --tiers=ultra --staging=<key>` against Chrome at DPR 2. Read every view and the native-pixel character crops before asking for review.
9. **Owner review.** Send `http://localhost:3057/dev/stage?staging=<key>&tier=balanced`. Ultra draws four times the pixels and slows an 8 GB Mac. Do not leave a test Chrome or extra servers running during review. View buttons or number keys switch cameras, tier buttons switch quality, and H hides the panel. Iterate on feedback.
10. **App.** Map each encounter in `apps/desktop/src/scenes.ts` with a place name and a one-line `where` for the GM, extend the desktop tests, build, and check the scene once in the packaged app.
11. **Record.** Add measured counts to [the stage engine reference](stage-engine.md) and results to the plan.

## Lessons

- Night reads from contrast, not brightness. The first forest renders already matched the reference art's average brightness but looked like day: an even blue light and a bright sky. What worked: a dark sky with `clouds` thinned and faint `stars`, a cool moon `glow` (warm by default, which turned the sky orange), mist with its own `fog.color` that matches the sky's horizon so gaps between trees blend, low hemisphere light, and a soft warm `fill` light that travels with the camera so characters stay readable. Games commonly do the same.
- Frame the opening view like the encounter art. The first cottage and stones renders were far-off overviews, while the art is a close view of the door and gear, or of the first stone with the river beside it.
- Paintings cheat light. The stones art shows the moon ahead and the stones lit from the front, so `sun.disc` places the moon apart from the light.
- Match characters to the owner's existing art for that character. Thalbern was first drawn from the written description and did not look like his art. Use the art for costume, hair, and colouring, painted as an original character rather than a photographic likeness.
- Smooth-shaded leaf masses with the alpha `foliage` texture read as painted trees. Flat-shaded spheres read as a low-poly game.
- Clear tree scatter around every camera position, along trails, and along key walks with scatter `clear` circles.
- Keep views near eye height. From above, standees read as flat cards.
- Keep the crowd off the camera lines of close-ups and character focus with `crowd.avoid` circles.
