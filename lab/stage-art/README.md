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

Owner, 8 AM, on the Harvest Festival in the app: "still seeing the people move in this view". That set is built, not painted, and the lock was tied to painted sets. It now holds on every set (`PEOPLE_STILL` in `stage.ts`): crowd, cast, lines, falls and hits as above, and the crowd's idle lean is gone from cards and pawns alike. Only the drift in is a painted set's own. Checked on `/dev/stage` with the festival's staging: 44 walkers and 454 people, through four shots, a move, a fall and a hit, nothing changed place or pose while the picture showed.

Owner, 8:36 AM: "the word balloon dialogue jumps around as the camera moves, can we make it do a 300ms fade in after the camera settles". A bubble is hidden while the camera is on its way (`Stage.cameraMoving`: a turn, a cut, a dip) or its speaker slides faster than 40 px a second, and fades in over 300 ms once both have been still for 120 ms (`components/stage/stage-dialogue.tsx`). A painted set's drift in is under that speed, so the bubble rides it. Measured on `/dev/turn`: never shown during a move, 0.1 px the most it shifted in a frame while showing, back about 140 ms after a turn or zoom ends.

The harvest square, 2026-11-11: the second painted set (`realm-of-myr/kordavos-harvest-square`, the Harvest Festival's staging).

- Nine points, one painting each, 1536 px: `square`, `stage` and `overview` from the set's own shots, `party` in front of the heroes looking back at the gate street, and `jewels`, `spices`, `fortune`, `fire` and `merrick` about 3.5 to 4 m in front of each of the five festival people, painted at 70 degrees.
- The four wide ones were painted first, from clean plates. The five close plates were captured again with those four projected on, and painted with `--fill`, so the stalls keep the cloth and timber the square view gave them. The projected paint was badly stretched that close and the painter redrew it. One smear on the fire plate came back as a plank on the cobbles.
- `stage:check`: every view of the staging is on the paint, the eight shots and a speaker's view of each of the nine cast.
- Cards: Karim, Zephyra, Finnian, Liora and Merrick repainted and published, 25 so far. The party's four were done for the gate.
- `STAGE_ART_DESKTOP` names the Desktop folder the tools copy to. This set's is `~/Desktop/kordavos-harvest-spike`.
- Not done: cloth-free twins, so what a flag or awning uncovers as it blows takes the paint beside it. A closer second painting for `party`, whose 44 degree view enlarges its 72 degree painting by 1.6. Views of a hero who has walked to the game stall, the food stalls or the dancing, which are seen from the nearest of these nine points. The square's other set, `kordavos-harvest-square-conflict`, is still built.

The square's other set, the same day (`realm-of-myr/kordavos-harvest-square-conflict`, the Clan Conflict's staging). Owner, a holiday: commits at their real time.

- The two sets differ only in their crowd and three marks, so the conflict set takes eight of the festival's points with their paintings as they are: `square`, `stage`, `overview`, `jewels`, `spices`, `fortune`, `fire`, `merrick`. Its file names the festival's pictures.
- Five points of its own, eleven paintings: `standoff`, north of the two leaders (wide, and a 36 degree one painted with `--sharpen` for their close-ups). `sides`, a step closer, looking left at Larya's people and right at Barok's. `south`, behind them looking up the square, for the views that show Barok's side in the face (centre, left, right). `heroes`, between the party and the standoff looking back at the party (centre, left, right). `crowd`, the authored view of the crowd.
- Why the side paintings: a view of someone at the end of a line of people, set beside a panel, turns well past a 70 degree painting aimed at the middle. `stage:check` named six such views `off the paint`, or sent them to a point 12 m off. A point holds three paintings (`PAINTINGS_PER_POINT`), which is why `sides` is a point of its own.
- `stage:check`: all ten shots and a speaker's view of each of the fifteen cast are on the paint.
- Cards: Barok, Larya, and their four followers repainted and published, 31 so far.
- From a tripod the two leaders' cards face the camera, not each other.

The Dragonbone Inn, the same day: the first interior, begun and not yet published. The Codex image tool hit the subscription's usage limit at 9:53 AM, until 2:01 PM, with six of sixteen paintings made.

- Made, in `public/stage-lab` and as WebP in `public/stage/paintings/dragonbone-inn` (not committed): `inn-room` and `inn-backroom` from clean plates, then `inn-front`, `inn-door`, `inn-table` and `inn-stairs` with the room projected on. Edges within 8 px: 85% for the room, whose plate was nearly black in places, 94 to 97% for the four that had its paint to go by.
- Still to paint, plates captured in `raw/captures` as `inn-<name>-view` with the six projected on: `front-w`, `front-e`, `bar`, `hearth`, `bard`, `skull`, `darkCorner`, `table2`, `corner`, `stairs2`. The place and detail wording for each is in this session's paint helper, and follows the pattern of `GATE` in `repaint.ts` with an interior's materials and "the only light is the fire, the candles and the lanterns, each where the render has it".
- Then: `publish.ts realm-of-myr/dragonbone-inn room=inn-room backroom=inn-backroom front=inn-front,inn-front-w,inn-front-e door=inn-door table=inn-table,inn-table2 stairs=inn-stairs,inn-stairs2 corner=inn-corner bar=inn-bar hearth=inn-hearth,inn-bard skull=inn-skull darkCorner=inn-darkCorner`, and in the set's `painted`: `"shadows": 0, "light": "#e6bf96", "crowd": "realm-of-myr-photoreal"`.
- With six points alone, `stage:check` put ten views off the paint and showed the hearth from 9 m, so the set stays built for now.
- Indoors, tried with those six: the paintings, the crowd and the cards all work. Two things an interior needs. `shadows: 0`, since on a painted set only figures block the sun, and the inn's dusk sun, 7 degrees up, would lay 14 m shadows across the floor through the walls. And `light` (new, `spec/set.ts`, `render/painted.ts`): cards are evenly lit, and in a dim amber room they read as cut-outs in daylight. `light` is one colour every card is multiplied by, a grade and not a light, so nothing is shaded or highlighted. `#e6bf96` sat the cast in the firelight.
- Cards: Bram, the bard, Beric, Eamon, Elara and the six seated patrons repainted and published, 42 so far. A seated card keeps its stool.
- The morning inn (`dragonbone-inn-morning`) is the same room in daylight with its own crowd and a few other objects. It needs its own paintings.

The inn finished, 2:40 PM the same day, once the image tool's allowance came back. The ten remaining plates were painted with `--fill`, edges within 8 px 94 to 98%, and the set is published: eleven points, sixteen paintings.

- `room`, `backroom`, `door`, `bar`, `skull`, `darkCorner` and `corner` (one painting each), `front` (the room from the front door, and its hearth end and stairs end), `table` and `stairs` (two each), `hearth` (the hearth, and the bard's corner beside it).
- `stage:check`: both evening stagings, The Dragonbone Inn and An Unsolicited Opportunity, have every shot and every speaker's view on the paint.
- Two speaker's views are seen from the `room` point 8 m off, the sailor's and Bram's at the bar, so they enlarge its painting past what is sharp.
- A picture's file name is lower case, so `publish.ts` writes the `darkCorner` point's as `dark-corner.webp`.

The Midnight Summons, the same day: the whole solo adventure, three forest sets and seven stagings, 21 paintings and three cards.

- `thalberns-forest-home`, a cottage by day: `home` (the door, and Thalbern's side of it), `porch`, `woods`, `ranger`.
- `valkarr-forest-trail`, fog and moonlight: the set's `trail`, `clearing` and `oak`, then one point for where each scene stands its cast: `start` (Broken Silence), `standoff` and `fight` looking at Thalbern and at the Owlbear (Owlbear Confrontation), `rescue`, `fallen` and `druid` (Timely Rescue).
- `old-standing-stones`, a full moon over the river: `stones`, `river`, `path`, `meeting`, and `circle` inside the ring, looking at Wollandora and at Thalbern.
- Wide views first from clean plates, the rest with those projected on and `--fill`. Edges within 8 px: 84 to 95% on the wide ones. A forest scores lower than a street, since a crown of leaves has no one edge to keep.
- `stage:check`: all seven stagings have every shot and every speaker's view on the paint.
- Night sets take `light`, a cool one (`#aebfdc` on the trail, `#b4c4dc` at the stones), and `shadows: 0.4`.
- Grass, ferns and leaves still blow in the built set, but a painted set shows them still: paint is looked up by where a point is, and everything along one line of sight from the tripod takes the same paint. Only cloth carries its paint with it. The river is a still picture too.
- Cards: Thalbern, Wollandora and the Owlbear, 45 so far. Their ids are paths, `fixtures/the-midnight-summons/thalbern`.
- Pictures are copied to `~/Desktop/midnight-summons-spike`.

Portraits, the same day. The turn order and the character card showed the painted portrait beside a photograph on the stage.

- `cards.ts publish` now cuts each card's portrait from its photograph, as `photoreal/<name>-portrait.jpg` beside the painted one, and `cards.ts portraits` does it again for every listed card. All 45 have one.
- Where to cut: the painted portrait is a box of the painted front, so the tool finds that box again, at any size and place, and cuts the same box of the photograph, measured from the figure's outline. The first try assumed the box followed the standee script's rule and only searched for the head's size. Wollandora's and the Owlbear's portraits had been moved by hand and came out as half the figure.
- Four of the gate's party (Branka, Cassia, Milos, Yeva) have a painted scene for a portrait, no part of their card. They take a box by how many heads tall they are (`HEADS` in `cards.ts`).
- The app (`portraitFor` in `apps/desktop/src/scenes.ts`) shows the photograph's portrait when the scene's set is painted, and the painted one on a built set, so the face in the turn order is the one on the stage. With no scene to go by, the scene the portrait was found in decides.
- The app reads the list of photographed cards from `apps/desktop/src/photoreal.json`, a copy `publish` writes beside `public/stage/photoreal.json`: a website deploy leaves `public/stage` out, and the site type checks the app's files.

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
