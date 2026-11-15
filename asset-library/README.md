# Asset library

The workspace for the game's 3D assets: every character's files, the pipeline that makes them, the clips they play and the isometric looks of the places they stand in. The page that shows it all is `/dev/assets` in the workspace and `/settings/<setting>/assets` on the site.

Written 2026-11-14, brought up to date 2026-11-15, the second time after The Midnight Summons got its looks and its two figures. None of this ships in the game yet: the game's own sets, stagings and paintings are untouched by anything here.

## Where things are

| What | Where | In git? |
|---|---|---|
| A character, all of it | `asset-library/characters/<id>/` | the small files |
| The pipeline | `asset-library/pipeline/` | yes |
| The clips every figure plays | `asset-library/clips.ts` | yes |
| The isometric look of a set | `asset-library/looks.ts` | yes |
| What a figure holds | `asset-library/props.ts` | yes |
| Modelled trees for a look | `asset-library/trees.ts`, files in `public/stage/trees` | yes |
| Scorecards | `asset-library/scorecards/` | yes |
| The page | `asset-library/ui/library.tsx`, shown at `/dev/assets` and `/settings/<setting>/assets` | yes |
| What the page lists | `asset-library/library.ts` | yes |
| A live scene: the cut-away, figures in a stage | `asset-library/scene.ts`, `iso.ts`, `figures.ts` | yes |
| The stage lab, for captures and spikes | `lab/stage-art/` (`viewer.tsx`, `lab.ts`, `capture.ts`) | yes |
| Sets and stagings | `packages/stage/src/sets`, `stagings` | yes |

Models, sheets and check pictures are too heavy for git and are left out by `asset-library/.gitignore`. A character's brief, joints, reports and thumbnail are kept.

## Sharing it

Anyone with the link can open the library: `https://d20adventures.com/settings/realm-of-myr/assets`. It is left out of search.

```sh
pnpm assets:sync          # publish: upload what changed, then the index
pnpm assets:sync --dry    # list what would upload
```

- The public bucket gets what the page shows, under `asset-library/characters/<id>/`: the rigged copies, the thumbnail and `figure.json`. The site serves them at `/asset-library/...`.
- The private bucket gets what a character was made from, under the same path: the brief, the sheets, the joints, the generator's answer, the source model and the rig's report. That is the backup.
- `library.json` is the page's index, every character and place gathered from the repo. It is uploaded last and read from the bucket, so a sync shows on the site within a minute, with no deploy.
- Anything the page can load, a visitor can download. The rigged models are public files.
- A place is assembled live in the visitor's browser, on the public page as in the workspace (`scene.ts`): pick a variant, an encounter or the empty set, and Stage or Isometric. The camera is the visitor's and goes anywhere: drag to turn, scroll to move toward the pointer, right-drag to slide, W A S D to fly (Q and E for down and up, Shift for speed). The card at the top right holds every jump: Camera (the game's own framings in Stage, and Wide, Overhead, Everyone and the encounter's groups in Isometric), then Cast, which stands the camera in front of that person, as a click on them does. Out of doors a look can ask for the whole set under its sky (`isowhole`), and not a model on a board. A look can also `join` other sets that stand in the same world, each at its place in this one: the Gates join the festival square, 112 metres up the street. The game's own sets are untouched by it. Between the two the portcullis is let most of the way down (`portcullisGap` on the gatehouse): an iron grille across the arch, with room to walk under. A scene with a cast opens close on them. In a whole place the views on people (Everyone and the encounter's groups) stand near eye level on the side their faces are, wherever about there nothing built and the fewest others are in the way. In a cut-away room they look down from where the room is seen.
  - Stage is the set as built, with the cast where the encounter opens. A painted set's paintings are left out, since they hold the camera to fixed points.
  - Isometric is the set's look (`looks.ts`), or its room cut open. Cast members with a figure in the library stand as figures: at full detail when three or fewer stand in the scene, at the middle level when more do.
  - The sets and stagings come with the deploy, so a new set shows after a push, not after a sync.

## One command

```sh
pnpm assets list                  # every character, and how far along it is
pnpm assets thalbern              # the free steps: pose sheet, joints, check picture
pnpm assets thalbern --pay        # and the model, then the rig and the shelf
pnpm assets thalbern --redo=rig   # a step again: sheet, joints, model, rig
```

A step whose file is already there is left alone. The model is the one step that costs money ($0.60), and it never runs without `--pay`. Do not run it for a batch of characters without the owner's say.

## At a glance

| Step | Tool | Time | Cost | Makes |
|---|---|---|---|---|
| 0. Brief | by hand | 2 min | free | `character.json` |
| 1. Pose sheet | Codex CLI image tool | 1 min | free | `sheet.png`, `apose-front.png`, `apose-back.png` |
| 2. Joints | a pose model | 10 sec | free | `joints.json`, `joints.jpg` |
| 3. Model | Tripo H3.1 on fal | 3 min | $0.60 | `tripo.json`, `source.glb` |
| 4. Rig and detail levels | headless Blender | 8 sec | free | `rig.json`, `lod0.glb`, `lod1.glb`, `lod2.glb` |
| 5. Shelf | `build.ts` | 1 sec | free | `figure.json`, `front.webp` |
| 6. Review | `/dev/assets`, frame strips | 5 min | free | |

## What you need

- Blender 5.3 at `/Applications/Blender.app`. `BLENDER` names another.
- `uv`, which fetches the pose model's Python on its first run.
- `FAL_KEY` in `.env` or `.env.local`, with balance on the fal account.
- The Codex CLI signed in to ChatGPT, for the pose sheet.
- A dev server: `pnpm exec next dev -p 3057`. The dev pages need no Convex.
- For captures, Chrome with remote debugging. See `scripts/stage-verify.ts` for the launch line.

This Mac has 8 GB. Run one heavy job at a time. A capture at the ultra tier takes free memory close to 20%.

## Characters

### 0. Brief

`asset-library/characters/<id>/character.json`, by hand:

```json
{
  "id": "thalbern",
  "name": "Thalbern",
  "role": "Ranger of the Valkarr Woods",
  "cast": ["thalbern"],
  "height": 1.82,
  "card": { "front": "/stage/fixtures/the-midnight-summons/thalbern-front.webp", "back": "/stage/fixtures/the-midnight-summons/thalbern-back.webp" },
  "who": "Thalbern, a lean, weathered human ranger with short black hair and stubble, in dark studded leather",
  "stow": "The bow is slung across his back beside the quiver, and both blades stay sheathed at his hips.",
  "arms": 40,
  "party": true
}
```

- `cast` is every id the character goes by in the stagings. Branka is `branka` at the gates and `branka-stoneveil` at the inn. It is how the library marks a card 3D.
- `stow` says where what the card's hands hold goes. A generator fuses anything held into the arm.
- `arms` is how far out the arms stand. Use 45 for a bulky outfit, so a sleeve clears the hip.
- `"creature": true` is for a beast that stands upright. Its sheet is then asked for as a living animal, not a person in costume. See A beast, below.
- A staff has nowhere good to go on the sheet. Held, it fuses into the arm. On the back, it is lost, since the model is made from the front. So it is left off the sheet (`stow`) and given back when the figure is shown: `"holds": { "what": "staff", "hand": "R", "length": 2.1 }`. See What a figure holds.

### 1. Pose sheet

- The card, front and back, repainted as a photoreal figure in an A-pose on flat grey.
- The picture decides the model. Image to 3D bakes it into the textures, so a weak sheet cannot be rescued later.
- Arms against the body fuse into it and cannot be rigged. Shadows in the picture end up painted on the model.
- A copy goes to `~/Desktop/d20-asset-library/<id>-sheet.jpg`.

### 2. Joints

- `joints.py` finds 22 points on the A-pose front with a pose model. Shoulders, elbows, wrists, hips, knees, ankles and toes are the model's. The trunk and head are placed between them, and the top of the head is the top of the figure against the grey.
- `joints.jpg` is the points drawn over the picture. Look at it before paying for step 3.
- Checked against hand marks on two characters: 4 to 6 cm off on average, 14 cm at worst, and the found shoulders and knees looked nearer the truth.
- It expects a person. On the owlbear it was sure of nothing (`leastSure` 0.08): arms and hips came out near, the head and the legs wrong. See A beast.
- A robe to the ground hides the legs. On Wollandora the ankles were found up at the hem and were moved down to the boots by hand, and the knees are a guess.
- To move a point, edit `joints.json` and run `--redo=rig`. `--redo=joints` writes the file again and loses the edit.

### 3. Model

- Tripo H3.1 through fal, from the A-pose front alone: about 59,000 triangles, 13 to 16 MB, unrigged. `source.glb` is the source and nothing overwrites it.
- The answer is kept in `tripo.json`. With it there, the model is fetched again without paying.
- `HTTP 403 ... Exhausted balance` means the fal account is empty. Top it up at fal.ai/dashboard/billing. Nothing was charged.
- Made from the front alone, a model's back is invented. Branka's has no shield on it.
- Tripo beat Meshy 7.1 on the same picture: sharper armour, a face nearer the sheet, half the price.

### 4. Rig and detail levels

What `rig.py` does, in order:

1. Welds the mesh. A glTF mesh comes apart along every seam of its texture, and thinned like that the seams tear open.
1. Turns the model to face forward. A generator faces its figure whichever way it likes. Tripo's faces sideways.
2. Stands it on the ground at its height.
3. Builds the skeleton from the joints: 18 bones, the same names and parents for every character.
4. Solves the weights on a stand-in, the mesh remade as one closed outer skin, and hands them to the real mesh.
5. Sets every bone square to the world at rest, so a clip written once plays on anyone.
6. Writes three copies: the mesh as it came, 20,000 triangles and 6,000 triangles, with 2048, 1024 and 512 pixel textures. The first keeps its colour at 4096, as the generator made it: a face is a hundred pixels of a 2048 texture.

`build.ts` reads `rig.json` and says `LOOK AT rig.json` when any of these is off:

| Field | Good | If not |
|---|---|---|
| `weights.solve` | `heat` | `envelope` means the solve gave up. Expect rough bends. |
| `weights.unweighted` | `0` | Loose points will be left behind when it moves. |
| `lods[].turnedAtRest` | empty | A bone is not square. Clips will bend it wrongly. |
| `lods[].joints` | `18` | An extra joint means points with no weights. |

The report cannot see a skeleton that lies across the body. The first Garlan passed every number with his skeleton sideways. Only the frame strips in step 6 showed it.

Nor can it see a figure rigged back to front. The rig tells front from back by the boots reaching forward of the shins, and a robe to the ankles has no shins. Wollandora passed every number facing backward: in the library she showed her back, and in the walk her knees bent the wrong way. `"turn": 2` in her `joints.json` turns her about. It is quarter turns added to the rig's own guess. Look at the first strip of every robed figure.

### 5. Shelf

`figure.json` and `front.webp` are what `/dev/assets` reads. A character with a `figure.json` has a 3D mark on its card.

### 5b. Card picture

```sh
pnpm assets:thumbs            # every figure, or name some
```

Takes each figure's picture from the library's own page, as `thumb.webp`, for its card. It wants the dev server and Chrome with remote debugging, as captures do. Take it again after a rig is made again. Without one, a card shows the grey pose sheet.

### 6. Review

In the library, alone in a lit room:

```
http://localhost:3057/dev/assets?id=thalbern&lod=0&clip=Walk
```

As frame strips, which is how a movement is judged:

```sh
S="staging=welcome-to-kordavos/the-dragonbone-inn&paint=0&iso=45,35,40,3.6&isoat=3,-0.95&isolight=1.4,0.3,1.8"
node --import tsx lab/stage-art/capture.ts --name=rig --tier=high "--q=$S&figure=beric:@thalbern:16:Walk" --poses=beric:Walk:8
node asset-library/pipeline/strip.mjs lab/stage-art/raw/captures rig-Walk 8 ~/Desktop/d20-asset-library/thalbern-Walk-strip.jpg 640 1100 692 80
```

In a scene, in place of a cast member's card. `@thalbern` is a figure from the library, and `@thalbern/lod2` its lightest copy:

```
http://localhost:3057/dev/stage-lab?staging=welcome-to-kordavos/the-gates-of-kordavos&tier=high&look=play
```

Look for: hands or arms through the body, torn mesh at the armpits and elbows, feet on the floor, the face at each detail level, and the figure facing the way its cast member does.

### What a figure holds

The owner, 2026-11-15, of Wollandora without her staff: "I was expecting to see Wollandora holding her staff like she does in the card image." A figure should hold what its card holds.

- `props.ts` builds the prop in code and stands it on the ground beside the figure. A staff is the one prop so far: two stems wound about each other, an eye at the head, a vine up the lower half.
- That arm is bent to it each frame, after the clip has moved the figure: the wrist is sent forward of the shoulder at chest height, the elbow found from the arm's two lengths, and the forearm rolled until the palm faces across the body.
- The hand is closed about it. `relaxHands` bends that hand's fingers much further and lays them together. From outside and in front it reads as a fist on the staff. From her own side the fingers lie flat like a fan: a hand is one bone, and bending its mesh is not a grip. A hand modelled closed needs a new model.
- The staff stays planted and turns on its foot as the hand sways, so Idle, Walk and Hit all hold it with nothing written for it.
- `rig.py` reads `holds` from the brief and leaves it on the skeleton. After changing it, run `--redo=rig`.
- The staff is built, not modelled from her card, so it is a plainer staff than the painted one. The thumb does not wrap.

### Faces

The owner, 2026-11-15: "her face is not good". It was the middle detail level, 20,000 triangles and a 1024 texture, seen from a metre. Two things changed, both free:

- A scene with three figures or fewer stands them at full detail.
- Full detail keeps the generator's own 4096 colour. Figures rigged before 2026-11-15 have 2048: `--redo=rig` on each brings them up, then `pnpm assets:thumbs` and `pnpm assets:sync`.

What is left is the generator's: a mouth a little off, a seam on a cheek. A better face is a new model.

### A beast

The owlbear was the first, on 2026-11-15: 3.3 m, upright, with a person's limbs. It went through for $0.60 on the first try, on the same 18 bones, and Idle, Walk and Hit play on it. What it took:

1. `"creature": true` in the brief, and a `who` that describes the animal. The sheet came back right the first time: upright, feet apart, arms down and out at 40 degrees, claws open, mouth closed. The card's own pose, reared with arms raised, is what the prompt rules out.
2. The joints by hand. The pose model's guess is worth keeping for the arms alone. All 22 points were placed on `apose-front.png` and redrawn with `joints-check.mjs` until the lines lay inside every limb. `headTop` is the tips of the ear tufts, since it sets the scale. `L` is the figure's own left, the picture's right.
3. Nothing else. The rig's report was clean: heat solve, no loose points, 18 joints, arms hanging at 11 and 12 degrees. Paws read as boots for telling front from back.

What looks wrong on it, said plainly:

- The walk is a man's walk on a bear: upright, quick and light, with a man's swinging arms. A beast of that size wants to be slow, heavy and hunched.
- It stands calm with its arms down. The card rears and roars. There is no clip for that, and none for an attack.
- It is slate grey. The card is a deep blue. The sheet lost the colour, and the model follows the sheet.
- One ear tuft came out shorter than the other.
- `relaxHands` treats its claws as fingers and curls them. Nothing looks torn from two metres. Nobody has looked closer.

Still untried: a beast on four legs, wings, a tail. The skeleton has no bones for any of them.

## Clips

`asset-library/clips.ts` holds Idle, Walk and Hit. They are written as turns per bone, not recorded, and no character owns them. The skeleton has one bone to a hand and a generated figure's fingers come straight and spread, so `relaxHands` bends them in the mesh once, when a figure loads: curled a little toward the palm and drawn together, with the hand brought into line with the forearm. The files on disk are not changed.

- A clip reads two things from the figure: how far out its arms were modelled, so standing arms hang the same on everyone, and where its hips rest.
- To add one, add an entry to `WRITTEN` with a name, a length and a pose for each moment. It then shows as a pill in the library for every figure.
- Garlan and Branka play them unchanged: a tall man and a dwarf of 1.38 m.

## Environments

Environments are not generated. They are built from code, and 41 exist.

- A set is a JSON spec under `packages/stage/src/sets/<setting>/<set>.json`: atmosphere, rooms, materials and a list of parts. The builders in `packages/stage/src/builders` turn the parts into geometry.
- A staging under `packages/stage/src/stagings/<adventure>/<encounter>.json` puts a cast and shots into a set. 68 exist.
- After changing a set or a staging: `pnpm stage:check`, then `pnpm stage:plans`.
- Seven sets also carry paintings, projected from fixed camera points. How those are made is in the lab README.

Any set can be seen as built, and a set with a room can be seen as an isometric cut-away:

```
http://localhost:3057/dev/assets?env=realm-of-myr/dragonbone-inn&view=iso
http://localhost:3057/dev/stage-lab?staging=welcome-to-kordavos/the-dragonbone-inn&tier=high&paint=0&iso=45,35,40,17&isolight=1.4,0.3,1.8
```

- `iso=azimuth,elevation,distance,lens`. `asset-library/iso.ts` cuts the two near walls, the ceiling and everything outside the room, and lights the room's own lamps.
- 13 of the 41 sets have a room. Out of doors the ground to keep is given, and parts that roof the people over are left out:

```
http://localhost:3057/dev/stage-lab?staging=welcome-to-kordavos/the-gates-of-kordavos&tier=high&paint=0&iso=-35,35,70,24&isoat=1,10&isobox=-36,-14,36,30&isohide=awning
```

- `isobox=x0,z0,x1,z1`. Everything outside it is cut, the scattered crowd is kept inside it, and the set's own sun lights it.

### A look for a place

A set with a room gets an Isometric view for nothing. A set out of doors gets one when it has a look: an entry in `asset-library/looks.ts` under the set's key. Five sets have one so far: the Gates, the Dragonbone Inn, and the three places of The Midnight Summons. The Gates' entry is the one to copy for a town by day, and the Valkarr trail's for a wood at night.

| Field | What it is |
|---|---|
| `params` | Switches for every view of the place. See below. |
| `shots` | The Camera pills, in order. Each is `iso: "azimuth,elevation,distance,lens"` and `isoat: "x,z,y"`, the point looked at. |
| `open` | The shot a scene with a cast opens on. Without it, `play`. |
| `figures` | A cast id, and the library character who stands there. A cast member whose own id has a figure needs no entry. |
| `cast` | Cast members added to the scene for this view, written as a staging writes them. |
| `materials` | Changes to the set's materials, for this view alone. |
| `edit` | Changes to the set's parts by id, for this view alone. `null` leaves a part out. |
| `join` | Other sets that stand in the same world, each with where its middle falls in this one and the part types to leave out. |

- `params`: `isowhole: "1"` keeps the whole set under its own sky, and is what an outdoor place wants. Without it the place is a model on a board, cut to `isobox`. `paint: "0"` turns the painterly pass off. `isolight: "gain,ambient,key"`, `isosky`, and `isolamps` (`x,y,z,strength,reach` and, if not a flame's, a colour, joined by `;`) light it. `isohide` leaves out part types that roof people over. `rings` are the cast ids ringed in gold. `shade` darkens the ground under the crowd. `bloom: "on"`. Four more are for night and for woods, below: `isofill`, `isohaze`, `figenv` and `isoclear`.
- A shot's camera stands at the point looked at, plus the distance along the azimuth and elevation. A negative elevation looks up from below that point: the Gates' `arrival` looks at a point 44 m up the gate from 2.6 m off the ground.
- The first shot named `wide` is the place's base view. A look needs one.
- Open on drama. The owner's call, 2026-11-15: a low, wide view that looks up at the place is "dramatic and great", and a high view looking down at the ground is "underwhelming". Give every place an `arrival` like it, set `open: "arrival"`, and keep a look-down `play` for seeing who stands where.
- The views on people (Everyone, and the staging's own group shots) and the front view of each cast member are worked out, not written. They need nothing in the look.
- To find a camera: open the place, fly to the view, and run `__place.view()` in the browser's console. It answers with the camera as a shot is written, `iso` and `isoat`, ready to paste. `__place.stage` is the stage itself.
- A painted set's paintings are left out of both views, so a painted set shows as built.

### A wood, and a night

The three places of The Midnight Summons were the first woods and the first night sets to get a look, on 2026-11-15. What they taught:

- A night set carries a light on its camera (`atmosphere.fill`), for the game's close shots. From a wide view it lights the near grass and nothing else, and the place goes flat. `isofill: "0.25"` leaves a quarter of it.
- Light a night with the moon alone, and keep it dark. The first looks pooled moonlight under lamps and kept the trail's two shafts of light. The owner, 2026-11-15: "i don't like the spotlight effect of light, just remove", and "it should be darker in the forest". So no lamps, the shafts left out by the look's `edit`, a gain near 1 and `ambient` at 0.06 to 0.1. `isolamps` still takes a colour, for a place that has a real lamp.
- `isohaze` is the share of the set's own haze a whole place keeps, 0.3 if not given. A night wood's haze is thick at ten paces and a wall from forty: the trail keeps 0.12. The stones keep 0.7, to put distance into the valley and veil the bare far bank.
- `figenv` is how much a figure reflects of its own lit room, 0.55 out of doors if not given. At night that makes a figure glow. 0.12 to 0.18 sits it in the place.
- A wood seen from above is all canopy, so a look-down `play` shows leaves. `isoclear: "x,z,r;..."` leaves out the trees inside those circles: a tree set by hand is dropped, and a scattered wood keeps clear. Clear the side the views look from and no more. A scatter makes up its number elsewhere, so a few trees move.
- To find which tree is in the way, list the trunks: `__place.stage.footprints.filter(f => f.kind === "circle" && f.height > 8)` in the console gives each tree's place and height.
- The arrival shot does the most. A wood has no gate to look up at, so look up at its tallest thing against the sky: the tallest stone with the moon beside it, the great oak under its shaft of light, the cottage under its oak. Tilt up until the ground is the bottom quarter of the frame.
- `materials` can take the daylight out of grass: lit from above by a lamp, the stones' grass went a lawn's green until its tips were moved toward the moon's colour.
- The views on people know trunks from the engine's footprints, and not leaves: the stage keeps no geometry to test a sight line against. A crown is estimated from each trunk's height (`scene.ts`), and a view with a crown across it is passed over. It is an estimate: a low branch can still cross a face.
- The automatic Overhead view is canopy in a wood. It is left in, since a place may have a clearing.
- The ranger's home is the morning after, by day, though its two scenes belong to the same adventure. The set's own sun lights it, as at the Gates.

### Trees

The owner, 2026-11-15, of the trail: "the trees are of low quality, there must be a better source or approach to rendering these to get triple A quality". A set's trees are built from code, sticks and balls of leaf cards, and under a free camera they read as lollipops.

A look can ask for modelled trees with `trees` (`trees.ts`). All three places of The Midnight Summons do.

- The models are in `public/stage/trees`, with a README of where each came from: twenty shapes of six kinds (oak, pine, ash, aspen, dead, and a sapling and two bushes), grown branch by branch by ez-tree, with crowns of cards that are each a photograph of a leafy twig. That, and real branching, is where the difference comes from.
- The first set was four shapes, and the owner's answer was "the trees are better but there needs to be way more variety". From far off every tree of a kind was one silhouette. Variety has to be in the branching: a broken limb, a one-sided crown, a snapped top, a fork, a lean. Each tree is also turned, tilted a little, and made broader, taller, darker or yellower than its neighbour.
- The set is not changed. Its trees are still built, so the engine keeps their footprints. They are given materials of their own and put out of sight, and a model is stood on each footprint, as tall as the tree it replaces times `taller`.
- Grow forest trees. A model grown in the open is as wide as it is tall, and a wood of those is a roof no camera sees through. The shapes here have crowns that start a third to half way up and are half as wide as the tree is tall. `without` leaves a shape out of a wood, and `leaves` gives a species another's leaf card.
- A sapling's leaves hang at the height of an eye. The stones have none, so the views on people there stay clear.
- `rings` are how far the heavy and the middle weights reach from `near`, where the scene is played. `thin` stands only a share of the trees beyond a distance. `kinds` is the mix, and `hero` names a hand-set tree's shape or kind.
- Shadows are the cost. The near trees throw theirs whole, the middle ones their trunks' alone, the far ones none. A second shadow-casting light (`isolight`'s third number) draws every leaf again: the trail has none.
- The files are geometry alone, and one bark and one leaf material serve a species. About 380 trees in the trail come to 700,000 triangles.
- `tint` darkens leaves for a night (`*`), lightens a species, and greys bark (`bark`).
- Under a canopy the horizon is black. A set's night sky is a bright blue down to the ground, and between trunks it showed as a band of daylight. The owner, 2026-11-15: "it should be almost black as the forest canopy blocks all the light". A look's `atmosphere` changes its set's sky, haze and light from all round: the trail's sky and haze go to black at the horizon, and `isohaze` is raised so the far wood fades into it.
- Run `pnpm stage:sync public/stage/trees` after changing the files.

What it is not: a big-budget game's trees. No free source ships those. Leaves have no light through them, one twig picture serves a whole species, nothing sways in the wind, and by day the bark is still plain. The built bushes and ferns are still the set's own.

Joining the three into one wood was weighed and left alone. The trail's own marks put the stones north up the deer trail and the home south, but no set gives a distance, as the festival square does for the Gates. The Gates' join pays because the arch frames the square. Here nothing of one place shows from another: it is night, the haze is thick, and a hundred metres of trunks stand between. The home is by day and cannot share a sky with the other two. Each set's scattered wood would also plant trees in the other's clearing and river, so every scatter would need its own clearings written. If it is ever wanted, join the trail and the stones only.

## The page

`/dev/assets` is every character and every place in one page.

- Three tabs: Places, Characters and Images. Places and Characters are grids of cards under the adventure each belongs to, with a search and a filter for what has a 3D figure or an Isometric view.
- Characters are the cast of every staging, each person once, and the player hero looks. A card is marked 3D when its cast id is in a character's `cast`.
- Places are the 41 sets as 34 places. A place keeps its variants together: the inn, and the inn at dawn.
- A character opens as its figure, with detail and clip pills, or as its card. A place opens live in the page, edge to edge, by variant and by scene. Isometric comes first and is what a place opens in when it has one. Stage is the other view.
- Images holds every picture by kind: the setting's own, adventure covers, scene art, maps, portraits, set paintings and backgrounds. They are gathered from `public/stage` and from the setting's data in the data bucket. Nothing is copied: the page shows them where the site already serves them.
- A place's picture is one of its paintings, or else the art of a scene set there. It is not a render of the set.
- The page reads the stagings, the sets and the shelf each time it loads. There is no index to keep.

## Known faults

- Arms are fitted to each body: `rig.py` finds the least angle at which a hanging forearm and hand clear what is at the hip, 7 to 22 degrees, and leaves it on the skeleton for the clips. Lyra's free arm hangs at 7, Garlan's sword arm at 22. Milos holds one hand open to the side, as he was modelled.
- Slung gear follows the hips: a thin thing hanging from the belt line, clear of the leg whose weights it was given. Thalbern's bow had 760 such points. Its tip still drifts a little.
- Milos's staff was on his back on the sheet. His model was made from the front, so he has none.
- The crowd is 16 pictures, mirrored and tinted. Near the play they repeat.
- Hands are one bone each. `relaxHands` curls and closes the fingers a little, and the arms still stand out from the body. A hand cannot grip, point or rest on a belt.
- Wollandora: a thin strap at her hip sticks out sideways for part of the walk, and her skirt stretches between her legs as they part. Her 1.86 m is measured to the top of her wreath.
- By day the modelled trees' trunks look like smooth clay. The bark's relief does not show.
- The modelled trees stand still. The set's own swayed.
- The owlbear moves as a person does. See A beast.
- The visitor's camera passes through walls and floors.
- Of 34 places, the Gates and the three places of The Midnight Summons have been looked over in every view. Phones have not been tried.

- The 6,000 triangle copy is coarse up close, with small nicks at the hairline. It no longer tears. It is for a room's distance.
- A figure reflects a lit room of its own in the stage, so its metal does not go dark. This is in the lab's loader only, not the game's.
- A model made from the front alone has an invented back. Branka's has no shield on it.
- The walk is on the spot and has not been scored by anyone but its author.
- Fourteen figures at 59,000 triangles each drop the high tier from 60 to 40 frames a second on an M3. At 6,000 they cost nothing.

## The party

Owner, 2026-11-14: only the party is made in 3D for now. The party is Branka, Thalbern, Lyra, Poppen and Milos the cleric. A brief with `"party": true` is one of them. Everyone else stays a card.

Owner, 2026-11-15: for The Midnight Summons, Wollandora and the owlbear are made in 3D as well, one model each at $0.60. A second try at either needs a new yes. Both were built that day, each on its first model, $1.20 in all.

- All five were built on 2026-11-14 for $0.60 each, and each rig's report was clean on its first run. Idle, Walk and Hit play on all of them unchanged.
- At the Gates the scene's own party is Branka, Cassia, Yeva and Milos. The Gates' look (`looks.ts`) stands Lyra where Cassia is and Poppen where Yeva is, and adds Thalbern beside them. The staging itself is unchanged.

## Not built

- An attack, a fall and a talk clip.
- Detail levels swapped by distance in the stage.
- Blind scoring of looks and movement (`workflow-score-to-target`).
- A home for shipped figures. About 5 MB a character is too heavy for git at 120 characters.
- Props, and monsters that do not stand as a person does. An upright beast goes through as it is (A beast). A beast on four legs has no way through yet.
- Clips for a beast: a heavy walk, a rear and a roar.
- Looks for the other outdoor places. 23 of the 41 sets have neither a room nor a look, so they have no Isometric view.
- The three places of The Midnight Summons joined into one wood, as the Gates join the festival square. Not done, on purpose: see below.
- Any of it in the game itself.
- Running a step from the page itself.
