# Stage art lab

Spikes run on 2026-10-17 to test a shared workflow: block out a scene, have an image model paint over a render, project the painting back onto the 3D, and animate characters with a video model. Only (a) was adopted, as the set spec's `backdrops`. The rest of this directory leaves `packages/stage` alone.

All tests use The Midnight Summons, Meeting at the Stones, at the high tier (DPR 1.5, 1350x900 CSS).

## Results

| Spike | Result | Evidence |
|---|---|---|
| (a) Painted backdrop | Works from every shot that faces it. The valley and moon read like the encounter art. Worth adopting. | `results/a-backdrop.jpg`: our render left, backdrop right, four shots. |
| (b) Paint-over | GPT Image 2 keeps the layout. Gemini 3 Pro Image paints closer to the art but moves things. | `results/b-paintover.jpg`: plate, art, Gemini, GPT, then each painting with the render's edges in red. |
| (b) Projection | Superb from the projector's own camera and nearby. Breaks from other shots. Not a scene method for us. | `results/b-projection.jpg`: our render left, projected GPT painting right. Rows: stones, Wollandora, meeting, river, then Gemini projected and stretched paint. |
| (c) Animated standee | Veo 3.1 Fast made a clean 8 second loop. Looks alive and matches the still. Promising. | `results/c-idle.mp4`: still, Minimax H3, Veo. `results/c-idle-meeting.mp4`: in a wider shot. |
| All three | The closest render to the encounter art so far, from the stones camera. | `results/all-three-stones.jpg` |

### (a) Painted backdrop

- Gemini 3 Pro Image painted a 21:9 valley panorama on magenta, at 6336x2688. Gemini Flash's was less like the art.
- It hangs on a far cylinder, 130 degrees wide, replacing the set's three mountain cones. One draw call, a 640 KB WebP.
- Placement matters. The painting's own forest band must sit below the horizon, or it reads as giant trees.
- A magenta key bleeds into the painting. The model tinted one ridge lavender. The key unmixes magenta and holds red to green.
- AgX tone mapping brightens it. Gain 0.6 and haze 0.3 toward the fog colour, tuned by eye.
- Shots that look away from the valley, like Thalbern's close-up, are unchanged.

### (b) Paint-over and projection

- Edge drift, as the share of the render's edges with a painted edge nearby:

| Painting | Within 2 px | Within 8 px |
|---|---|---|
| GPT Image 2 | 76% | 98% |
| Gemini 3 Pro Image | 53% | 86% |
| Unrelated image, chance | 42% | 75% |

- From the stones camera, the projected GPT painting looks like the art: mossy painted stones, painted grass.
- Wollandora's close-up looks the same way, so the stone faces gain a lot.
- Other shots show the method's limits:
  - Far trees pick up painted sky and mist, as cyan patches.
  - Grazing surfaces, like flagstones and the river, smear unless they fade back to their own material.
  - Leafy crowns carry painted sky across their gaps, a pale ghost crown over the moon.
  - Painted moonlight is fixed. It does not follow our lamps or a moving camera.
- Gemini's painting, projected, misses our geometry. Its moved stones paint onto trees behind them.

### (c) Animated standee

- The still front goes on green. The model gets it as the first and the last frame, so the clip loops.
- Minimax H3 cut to a moonlit landscape with a cape mid-clip. Frames 0 to 34 and 112 to 122 stayed green. They make a 3.75 second back-and-forth loop.
- A retry failed: the fal account ran out of balance.
- Veo 3.1 Fast held the green screen for all 8 seconds. Breath, a hand to the chest, a glance.
- Frames are keyed like a standee and packed colour beside alpha in one H.264 video. WebKit plays H.264, VP9 alpha it does not.
- The video texture needed an explicit sRGB decode in the shader. Without it the figure washed out grey.
- Cost per animated front: a 6 MB file at CRF 18, about 14 MB of GPU memory, one video decode.
- Not checked: the desktop app, frame rate, the back view, walking.

## Environment spike, 2026-11-10

The Gates of Kordavos, at the ultra tier, 1350x900 CSS at DPR 2.

Painted track:

```sh
S="staging=welcome-to-kordavos/the-gates-of-kordavos"
node --import tsx lab/stage-art/capture.ts --name=gate-plate --tier=ultra --camera "--q=$S&cast=off" --shots=gate,checkpoint
node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/repaint.ts gate-plate-gate photoreal
open "http://localhost:3057/dev/stage-lab?$S&tier=ultra&project=gate-plate-gate-photoreal&paint=0"
```

Splat track:

```sh
node --import tsx lab/stage-art/capture.ts --name=gate-cp --tier=ultra --pano=0.8,1.7,14.8 "--q=$S&cast=off"
node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/repaint.ts pano gate-cp photoreal
node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/marble.ts world gate-cp photoreal marble-1.1
open "http://localhost:3057/dev/stage-lab?$S&tier=ultra&splat=gate-cp-photoreal-m11&paint=0&shot=checkpoint"
```

Painting on the ChatGPT subscription, and covering a play area with several paintings:

```sh
node --import tsx lab/stage-art/repaint.ts gate-plate-gate photoreal --cli
# A second view: its plate with the first painting already projected, then filled in around it.
node --import tsx lab/stage-art/capture.ts --name=cov1 --tier=ultra --camera "--q=$S&cast=off&paint=0&project=gate-plate-checkpoint-photoreal" --shots=twoshot
node --import tsx lab/stage-art/repaint.ts cov1-twoshot photoreal --cli --fill --as=cov-two
open "http://localhost:3057/dev/stage-lab?$S&tier=ultra&paint=0&project=gate-plate-checkpoint-photoreal,cov-two&shadows=0.55"
```

- `--cli` runs the Codex CLI's image tool under the owner's sign-in, with the desktop app's locked-down command. It returns 1536x1024 in about 90 seconds.
- `--sharpen` is for a closer plate from the same point as an earlier painting (`capture.ts --view --camera` with that painting projected): it comes back sharp, and the lab prefers it wherever it is the denser of the two.
- `--place=` and `--detail=` describe a set other than the gate. `repaint.ts drift <plate> <painting>` scores how well a painting kept the plate's edges.
- `&shadows=` lets only figures cast sun shadows and darkens the paint under them. A value over 5 draws the shadow mask itself.
- `&dummy=x,z` stands a person-sized solid there. `capture.ts --glide=from,to` catches a camera move part way. `--eval=` prints a value from the page.
A 3D character in place of a standee:

```sh
node --import tsx lab/stage-art/character.ts sheet garlan "Garlan Ironfist, a broad, bearded human sergeant of the gate watch"
node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/character.ts model garlan 1.94   # paid: $1.52 on fal
open "http://localhost:3057/dev/stage-lab?$S&tier=ultra&paint=0&project=cp-cli,cp-zoom&shadows=0.55&figure=garlan:garlan-idle&shot=checkpoint"
```

The cast's cards repainted as photographs, and a close-up from a tripod point:

```sh
node --import tsx lab/stage-art/cards.ts paint garlan,branka,cassia,yeva,milos,oskar
node --import tsx lab/stage-art/cards.ts crop garlan   # painted beside photoreal, on the Desktop
node --import tsx lab/stage-art/cards.ts paint crowd && node --import tsx lab/stage-art/cards.ts pack   # the crowd's 16 people, then their atlas
# What stood behind the gate's flags and awnings, painted with the cloth taken down:
node --import tsx lab/stage-art/capture.ts --name=gateclear --tier=balanced --camera "--q=$S&cast=off&paint=0&project=gate-plate-gate-photoreal&clear=1&cloth=off&fade=0" --shots=gate
node --import tsx lab/stage-art/repaint.ts gateclear-gate photoreal --cli --fill --clear --as=gate-plate-gate-photoreal-clear "--detail=<the place's materials, with no cloth named>"
V="view=-3.4,2.85,14.6,2.3,1.62,11.1,12"
node --import tsx lab/stage-art/capture.ts --name=closeplate --tier=ultra --view --camera "--q=$S&cast=off&paint=0&project=cp-cli,cp-zoom&$V"
node --import tsx lab/stage-art/repaint.ts closeplate-view photoreal --cli --sharpen --as=cp-close
open "http://localhost:3057/dev/stage-lab?$S&tier=ultra&paint=0&project=cp-cli,cp-zoom,cp-close&shadows=0.55&cards=1&$V"
```

- `&drift=0.15,8` sways the camera 15 cm about its point over 8 seconds (`capture.ts --motion --record=12 --view`). `&fill=1` runs paint on over what no painting saw, `&bare=1` marks it magenta, and `&fade=0` suits a camera that stays at its painting's point.
- With motion on, cloth blows and carries its paint: the lab looks paint up from the cloth's pose in the plate. A flag that leaves its painted spot shows a copy behind it.
- `capture.ts --dpr=1 --tier=balanced` is a lighter page, for measuring. An ultra capture at DPR 2 took this machine under 20% free memory.
- `cards.ts` is free, on the ChatGPT subscription, about 60 seconds a card. The tool usually answers a green-screen request with a transparent background, and the cutout takes whichever came.
- `publish.ts <setting>/<set> <point>=<painting>[,<closer painting>]` moves lab paintings into the game: WebP files under `public/stage/paintings/<set>/` and the set's `painted.points`. `@2048` after a name sets its width, 1536 otherwise.
- The engine now paints the gate itself. `&plain=1` shows a painted set as built, for a new plate. `&project=` and `&splat=` do the same.
- `capture.ts --do=<expression>` runs in the page once a shot is up, before its capture: `window.__stage.zoomTripod(0.5)`, `turnTripod(dx, dy)`.
- `&crowd=1` loads the repainted crowd atlas from `/stage-lab/crowd`. `&clear=1` uses each painting's cloth-free twin, `<name>-clear.png`, behind loose cloth.
- The balanced tier draws at DPR 1 whatever the page's DPR, so its captures are 1350x900.
- `&cards=1` loads `/stage-lab/cards/<castId>-front.webp` and `-back.webp` as page blobs, since a staging takes only `/stage/` paths.
- `sheet` is free, on the ChatGPT subscription. `model` keeps its response in `raw/`, so a rerun downloads again and does not pay again.
- Clips: `garlan-idle`, `garlan-walking`, `garlan-running`. The idle turns him a long way, so one frame can show his back.
- `WORLDLABS_API_KEY` goes in `.env.local`. World Labs bills use past the balance later, so `marble.ts world` checks the balance first.
- Pick the panorama point where the cameras are, and clear of props: `capture.ts --pano` prints the nearest surface as `zMin`.
- A world generated from a point 14 m from the checkpoint smeared there. One made at the checkpoint held.
- World Labs returns a panorama's URL under `assets.imagery.pano_url`, not at `pano_url` as its docs say.
- `&paint=0` turns the brush filter off. Painted and splat scenery both look worse under it.
- `capture.ts --fps` prints frames a second per shot. `--view` captures the page's `&view=x,y,z,tx,ty,tz` viewpoint.
- Pictures are also copied to `~/Desktop/kordavos-gate-spike`.

## Painted sets, from 2026-11-10

Owner decisions, 2026-11-10: painted, photoreal sets seen from tripod points that sway, cloth in the wind, cast and crowd repainted as photographs. The engine draws a set this way when it has a `painted` section (`packages/stage/src/spec/set.ts`, `render/painted.ts`, `tripod.ts`). The Kordavos gate is the first.

Painting a set:

1. One point per place the camera should stand. Start from the set's shots and each staging's shots.
2. Plate: the set from that camera with nobody in it. `capture.ts --tier=balanced --view --camera "--q=staging=<key>&cast=off&paint=0&project=<paintings nearby>&view=x,y,z,tx,ty,tz,fov"`. Paint a few degrees wider than the shot.
3. Paint: `repaint.ts <plate>-view photoreal --cli --fill --as=<name> "--place=<what the view shows>"`. Several run at once: five took two minutes.
4. Publish: `publish.ts <setting>/<set> <point>=<name>[,<closer painting from the same point>]`.
5. `pnpm stage:check` lists each staging's views by the point they are seen from, and the ones still `off the paint`.
6. `pnpm stage:sync public/stage/paintings` before pushing.

Cards: `cards.ts paint <ids>` repaints cast cards as photographs, and `cards.ts publish <ids>` copies them to a `photoreal` folder beside the painted card and lists them in `public/stage/photoreal.json`. On a painted set the engine shows the photograph of any listed card. Twenty so far: the gate's six and all fourteen stock heroes, so a hero made with a stock figure matches a painted set. Art painted on a player's machine is still a painting. Check each back against its front: one half-orc's back came out with human skin and was painted again.

Image models: `--cli` and `cards.ts` use the Codex CLI's own image tool on the owner's ChatGPT subscription, which names no model. The paid path (`repaint.ts` without `--cli`, `paintover.ts`) names `gpt-image-2`, which OpenAI shuts off on 2027-02-10.

The gate has twelve points and fifteen paintings: `gate` (with a cloth-free twin), `checkpoint` (wide, zoom, close), `party` (two ways), `table`, `queue`, `ramparts`, `through`, `huddle`, `arch`, `road`, `arrive` and `front`. Both stagings on it are fully on the paint.

Sway: owner, 2026-11-10, "the drift on the far away shots is great but on closeups it moves too fast". The sway now shrinks with the subject's distance and the lens, so the foreground slides at most about 1% of the frame's height (`SWAY_ON_SCREEN` in `tripod.ts`). Measured live: 16 cm at the gate as before, 2.3 cm on Garlan's close view where it was 6, 2.4 cm on a hero from the party point where it was 12.

Owner review of the live gate, 2026-11-10: Branka's art looked off, the characters did not look as 3D as in the lab, and bubble text was too small.

- Branka: the card prompt said "natural proportions", which made a dwarf taller and slimmer with a younger face. It now says to keep the body's proportions and the face's age, lines and scars. Branka was painted again. The other small folk were painted with the old wording and looked right on review.
- Flat figures, cause one: in a painted set only figures cast sun shadows, so the set's shade never fell on them. The lab shots the owner liked had it. `render/painted.ts` now renders the built set from the sun over 80 m about the current point, and figures take 65% of that shade. At full strength Garlan under his awning was a silhouette.
- Cause two: the sun's shadow map covered the whole set, 300 m, so a figure's own shadow was a few texels. It now covers the same 80 m.
- Cause three: a card seen from the side sat half way through the dissolve between its front and back, as a speckled ghost. A tripod can stand to one side of someone for a whole scene. `figures/standees.ts` now settles on one face, with 80 and 100 degrees as the two thresholds, and dissolves in a quarter of a second when it changes. This applies to every set.
- Bubbles: 17 and 18 px, from 13 and 14, in a 330 px box, and 14 px in the compact layout, from 11.

Owner, same evening, on the Party view in the desktop app: "the standees look really slanted".

- A card leaned only part of the way toward the camera, at most 60 degrees from the way its character faces. That suits a camera that walks round it. From a fixed tripod a card seen from the side stood at an angle to the lens, a slanted board. On a painted set cast and crowd cards now face the camera squarely, and which face shows goes by where the tripod stands, so the sway cannot flip it.
- The Party view also showed backs: the party faces Garlan, and the only point with room for all four stood beside them. New point `front`, beside Garlan, looking back up the line at their faces.
- A shot that meant to show its subjects' faces now counts a point that shows their backs as up to 16 m farther off (`Stage.backs`).

Owner, later the same evening, on a hero's line in the desktop app: "the characters are still too shaded in this view. the lighting effects whether making darker or brighter look weird", and the screen held "way too much".

- Cards are no longer lit at all on a painted set. A card is a photograph with its own soft light, so it shows evenly, graded as the paintings are, with a slight warm tint. The set's shade on figures, added hours earlier, is gone again. Figures still cast shadows on the ground.
- That view was a close-up of belts with the speaker under a panel. The lens had been fitted to the part of the canvas the panels left free, so the whole canvas, two or three times as tall, had to stay on one painting, and the lens narrowed to 10 to 16 degrees. The lens is now the whole canvas, and the subject is set in the free part by turning the camera (`Spot` in `tripod.ts`).
- Play screen: the portrait plate is gone from the 3D scene, since a line was already in the narration and in a bubble. The "Choose a perspective" label and the "Drag to look" hint are gone. The mini-map moved from over the scene to the end of the perspective bar, 128 by 72 px, and still opens the full map.

Owner, 10 PM the same evening: "The people look a little washed out. The word balloon is in an odd place", and a list of play screen trims.

- Washed out: with the light gone, what was left was the card grade meant for hand-painted sets, which lifts shadows with umber and takes a seventh of the colour. Black hair came out brown and a grey coat came out yellow. A painted set now shows the art as it was drawn (`cardArt` in the card shaders), with the paintings' gain and a slighter warm tint.
- Bubble: with no room above a speaker it sat 40 px beside the top of the head with no tail. In a close-up that is on the face. It now clears the head by its size on screen, centres on the face and points at it.
- A subject placed beside a panel slid out of frame when the painting narrowed the lens, since the turn away from it was sized for the lens asked. `fitView` fits again with the lens it got.
- Play screen: the turn line and the "Saved locally" line are gone. A shared table keeps its one line, whether the GM is online. The map is 200 by 112 px at the right end of the bar, a little over its rule, with the place's name under it. The narration card sits over the rule. Skip is a round double-chevron control. Scene Settings is a round icon button. The turn order lights whoever's turn the game waits on and marks them, also while an earlier turn is read.
- Not seen in the app: checked on `/dev/turn`, with the map added for one screenshot. The demo's crowd bubbles can point at empty air, which the app does not have, since only the cast speaks there.

Owner, 11 PM the same evening: "the characters walking is awkward. i think we should keep characters static on closer up views".

- A card is a photograph of someone standing, so up close a walk is a cut-out sliding across the picture.
- A view is a close-up when someone standing where the camera aims is taller than 15% of the frame (`CLOSE_SHARE` in `stage.ts`). At the gate that is the checkpoint, party, two-shot and close views. The gate, the line and the ramparts are far.
- In a close-up the crowd's passers-by stand where they are and walk on when the view is far again.
- A cast member told to walk in a close-up, or one standing that tall near the camera in a far view, is put where they were going while the picture dips for 190 ms, as on a cut. The legs of one walk share a dip. A walk under way when the camera cuts to it ends the same way.
- Tried first and dropped: stopping each passer-by who looked large. They piled up at the edge of the frame, since every path that passes the camera ends there.
- Not covered: the queue loop, which still shuffles in a close-up. The app holds every loop still, so only the `/dev/turn` demo shows it.

Movement: owner, 2026-11-11, "a drift in only then after that is static with just minor ambient animations like flags, banners billowing, smoke", "the people should be locked in". This replaces the sway and the close-up rule above.

- The camera drifts in once on arriving at a point, by a cut or as the first view, and then holds still. It starts off to one side and a little back, as far as the sway went (`driftIn` in `tripod.ts`, the set's `painted.drift`, 16 cm at the gate and 2 cm on a close view), and comes to rest over 7 seconds, easing all the way.
- It also pushes in 3% (`DRIFT_PUSH` in `stage.ts`, the camera's `zoom`). The view ends that much closer than the one it was fitted to and never wider, so a view at the edge of its painting stays on the paint.
- A turn or zoom from the same point does not drift again: the turn is the movement.
- Nobody walks in any view. The crowd's passers-by stand where they are, and a standing card no longer leans from side to side.
- A cast member told to move is put there while the picture dips for 190 ms, in every view.
- What still moves: cloth, smoke, birds and dust.

Owner, later that morning: "i'm still seeing the standees move around", "i want only camera movements and ambient animations". The site had not deployed since 7:09 (a type error in `packages/srd`), so the owner was looking at the close-up rule. What was still left to move is now locked as well:

- A line of people (`loops/queue.ts`) holds still on a painted set. It moves on only when a beat waits for its cue or skips to it, and then everyone is put in their new place under a dip (`finish`, `skipLoops`). Its own back and forth, the official's questions and the coins, does not run.
- A fall is put under a dip: the figure is down when the picture comes back.
- A struck figure flashes and does not shake.
- A card put in a new place is turned to the camera at once, with no swing.
- Checked on `/dev/turn`, 48 paragraphs read through: 4,049 frames, no cast member, card or crowd figure changed place or pose while the picture showed, and 129 were placed in three dips.
- Left as it is: a card dissolves between its front and its back over a quarter second when its character turns about.

Known limits:

- A view lies inside one painting. It cannot straddle two.
- A subject closer than about 3 m to a point sits near the edge of a 46 degree painting. Paint such points wider.
- A point with one wide painting zooms to half its lens. A closer `--sharpen` painting lets it go tighter.
- The checkpoint awning shows a lighter patch where the zoom painting ends.
- A staging's `painted: false` shows a painted set as built, for a staging its paintings do not reach.

## Running it

```sh
pnpm exec next dev -p 3057
# Chrome with --remote-debugging-port=9478 --force-device-scale-factor=2, as in scripts/stage-verify.ts
open "http://localhost:3057/dev/stage-lab?backdrop=stones-backdrop.webp&project=stones-paint-gpt&animate=thalbern"
```

Toggles in the panel switch each spike. `?clip=thalbern-h3-idle` plays the H3 loop. `&fade=0` shows stretched paint.

| Script | Does |
|---|---|
| `backdrop.ts` | Paints and keys the panorama. |
| `paintover.ts` | Paints over a plate, and scores edge drift. |
| `animate.ts` | Puts a standee on green, animates it with H3 or Veo, keys and packs it. |
| `capture.ts` | Captures and records lab views over CDP. |
| `repaint.ts` | Repaints a shot's plate or a 360 panorama with GPT Image 2, painterly or photoreal. |
| `marble.ts` | World Labs: credits, depth to panorama, panorama to splat world. |
| `character.ts` | A standee redrawn as an A-pose sheet, then a rigged 3D model from Meshy on fal. |
| `cards.ts` | The cast's cards repainted as photographs through the Codex CLI, and cut out. |
| `lab.ts`, `viewer.tsx` | The three changes, applied to a running Stage, and the lab page at `app/dev/stage-lab`. |

Generated assets in `public/stage-lab/` and raw outputs in `raw/` are not committed. The scripts regenerate them, with new model output each time.
