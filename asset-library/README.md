# Asset library

The workspace for the game's 3D assets: every character's files, the pipeline that makes them, the clips they play and the isometric looks of the places they stand in. The page that shows it all is `/dev/assets`.

Written 2026-11-14. None of this ships in the game yet.

## Where things are

| What | Where | In git? |
|---|---|---|
| A character, all of it | `asset-library/characters/<id>/` | the small files |
| The pipeline | `asset-library/pipeline/` | yes |
| The clips every figure plays | `asset-library/clips.ts` | yes |
| The isometric look of a set | `asset-library/looks.ts` | yes |
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
- A place is assembled live in the visitor's browser, on the public page as in the workspace (`scene.ts`): pick a variant, an encounter or the empty set, and Stage or Isometric. The camera is the visitor's and goes anywhere: drag to turn, scroll to move toward the pointer, right-drag to slide, W A S D to fly (Q and E for down and up, Shift for speed). The card at the top right holds every jump: Camera (the game's own framings in Stage, and Wide, Overhead, Everyone and the encounter's groups in Isometric), then Cast, which stands the camera in front of that person, as a click on them does. Out of doors a look can ask for the whole set under its sky (`isowhole`), and not a model on a board. A look can also `join` other sets that stand in the same world, each at its place in this one: the Gates join the festival square, 112 metres up the street. The game's own sets are untouched by it. A scene with a cast opens close on them.
  - Stage is the set as built, with the cast where the encounter opens. A painted set's paintings are left out, since they hold the camera to fixed points.
  - Isometric is the set's look (`looks.ts`), or its room cut open. Cast members with a figure in the library stand as figures, at the middle detail level.
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

### 1. Pose sheet

- The card, front and back, repainted as a photoreal figure in an A-pose on flat grey.
- The picture decides the model. Image to 3D bakes it into the textures, so a weak sheet cannot be rescued later.
- Arms against the body fuse into it and cannot be rigged. Shadows in the picture end up painted on the model.
- A copy goes to `~/Desktop/d20-asset-library/<id>-sheet.jpg`.

### 2. Joints

- `joints.py` finds 22 points on the A-pose front with a pose model. Shoulders, elbows, wrists, hips, knees, ankles and toes are the model's. The trunk and head are placed between them, and the top of the head is the top of the figure against the grey.
- `joints.jpg` is the points drawn over the picture. Look at it before paying for step 3.
- Checked against hand marks on two characters: 4 to 6 cm off on average, 14 cm at worst, and the found shoulders and knees looked nearer the truth.
- It expects a person. It has not been tried on a monster or a beast.
- To move a point, edit `joints.json` and run `--redo=rig`.

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
6. Writes three copies: the mesh as it came, 20,000 triangles and 6,000 triangles, with 2048, 1024 and 512 pixel textures.

`build.ts` reads `rig.json` and says `LOOK AT rig.json` when any of these is off:

| Field | Good | If not |
|---|---|---|
| `weights.solve` | `heat` | `envelope` means the solve gave up. Expect rough bends. |
| `weights.unweighted` | `0` | Loose points will be left behind when it moves. |
| `lods[].turnedAtRest` | empty | A bone is not square. Clips will bend it wrongly. |
| `lods[].joints` | `18` | An extra joint means points with no weights. |

The report cannot see a skeleton that lies across the body. The first Garlan passed every number with his skeleton sideways. Only the frame strips in step 6 showed it.

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

## Clips

`asset-library/clips.ts` holds Idle, Walk and Hit. They are written as turns per bone, not recorded, and no character owns them.

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
- The Gates are the only outdoor set framed this way so far. The library does not yet offer it.

## The page

`/dev/assets` is every character and every place in one page.

- Two tabs, Characters and Environments. Each is a grid of cards under the adventure it belongs to, with a search and a filter for what has a 3D figure or an isometric view.
- Characters are the cast of every staging, each person once, and the player hero looks. A card is marked 3D when its cast id is in a character's `cast`.
- Environments are the 41 sets as 34 places. A place keeps its variants together: the inn, and the inn at dawn.
- A character opens as its figure, with detail and clip pills, or as its card. A place opens in the stage's own page, by variant, by scene, and as built or as a cut-away.
- A third tab, Images, holds every picture by kind: the setting's own, adventure covers, scene art, maps, portraits, set paintings and backgrounds. They are gathered from `public/stage` and from the setting's data in the data bucket. Nothing is copied: the page shows them where the site already serves them.
- A place's picture is one of its paintings, or else the art of a scene set there. It is not a render of the set.
- The page reads the stagings, the sets and the shelf each time it loads. There is no index to keep.

## Known faults

- Arms are fitted to each body: `rig.py` finds the least angle at which a hanging forearm and hand clear what is at the hip, 7 to 22 degrees, and leaves it on the skeleton for the clips. Lyra's free arm hangs at 7, Garlan's sword arm at 22. Milos's palms face forward, as they were modelled.
- Slung gear follows the hips: a thin thing hanging from the belt line, clear of the leg whose weights it was given. Thalbern's bow had 760 such points. Its tip still drifts a little.
- Milos's staff was on his back on the sheet. His model was made from the front, so he has none.
- The crowd is 16 pictures, mirrored and tinted. Near the play they repeat.

- The 6,000 triangle copy is coarse up close, with small nicks at the hairline. It no longer tears. It is for a room's distance.
- A figure reflects a lit room of its own in the stage, so its metal does not go dark. This is in the lab's loader only, not the game's.
- A model made from the front alone has an invented back. Branka's has no shield on it.
- The walk is on the spot and has not been scored by anyone but its author.
- Fourteen figures at 59,000 triangles each drop the high tier from 60 to 40 frames a second on an M3. At 6,000 they cost nothing.

## The party

Owner, 2026-11-14: only the party is made in 3D for now. The party is Branka, Thalbern, Lyra, Poppen and Milos the cleric. A brief with `"party": true` is one of them. Everyone else stays a card.

- All five were built on 2026-11-14 for $0.60 each, and each rig's report was clean on its first run. Idle, Walk and Hit play on all of them unchanged.
- At the Gates the scene's own party is Branka, Cassia, Yeva and Milos. The Gates' look (`looks.ts`) stands Lyra where Cassia is and Poppen where Yeva is, and adds Thalbern beside them. The staging itself is unchanged.

## Not built

- An attack, a fall and a talk clip.
- Detail levels swapped by distance in the stage.
- Blind scoring of looks and movement (`workflow-score-to-target`).
- A home for shipped figures. About 5 MB a character is too heavy for git at 120 characters.
- Props and monsters.
- Running a step from the page itself.
