# Asset pipeline

How a 3D asset is made for the isometric stage, from a painting to something that walks in a scene. Written 2026-11-14, from one character taken all the way through (Garlan Ironfist). Everything here is a spike in `lab/stage-art`. None of it ships in the game yet.

Results and measurements are in [lab/stage-art/README.md](../lab/stage-art/README.md). This page is the how.

## At a glance

| Step | Tool | Time | Cost | By hand? |
|---|---|---|---|---|
| 1. A-pose sheet | Codex CLI image tool | 2 min | free | no |
| 2. Joints file | a text editor | 10 min | free | yes |
| 3. Image to 3D | Tripo H3.1 on fal | 3 min | $0.60 | no |
| 4. Rig and detail levels | headless Blender | 5 sec | free | no |
| 5. Shelve | `library.ts` | 1 sec | free | no |
| 6. Review | `/dev/assets`, frame strips | 5 min | free | yes |

One character is about $0.60 and twenty minutes. Step 2 is the only step that does not yet run on its own.

## What you need

- Blender 5.3 at `/Applications/Blender.app`.
- `FAL_KEY` in `.env` or `.env.local`, with balance on the fal account.
- The Codex CLI signed in to ChatGPT, for step 1.
- A dev server: `pnpm exec next dev -p 3057`. The dev pages need no Convex.
- For captures, Chrome with remote debugging. See `scripts/stage-verify.ts` for the launch line.

This Mac has 8 GB. Run one heavy job at a time. A capture at the ultra tier takes free memory close to 20%.

## Characters

### 1. A-pose sheet

```sh
node --import tsx lab/stage-art/character.ts sheet garlan "Garlan Ironfist, a broad, bearded human sergeant of the gate watch"
```

- In: the character's standee front and back, `public/stage/fixtures/welcome-to-kordavos/<id>-front.webp` and `-back.webp`. That folder is fixed in the script today.
- Out: `lab/stage-art/raw/<id>-sheet.png`, split into `<id>-apose-front.png` and `<id>-apose-back.png`.
- The picture decides the model. Image to 3D bakes it into the textures, so a weak sheet cannot be rescued later.
- The prompt asks for arms about 40 degrees out, nothing in the hands, flat shadowless light and a plain grey ground. Arms against the body fuse into it and cannot be rigged. Shadows in the picture end up painted on the model.

### 2. Joints file

`lab/stage-art/figures/<id>.json`: the character's height in metres, and 22 points marked on the A-pose front, in its pixels.

```json
{ "height": 1.94, "joints": { "hips": [432, 520], "headTop": [432, 12], "upperarmL": [515, 228], "toeL": [545, 985] } }
```

- Points: `hips`, `spine`, `chest`, `neck`, `head`, `headTop`, and for each side `upperarm`, `forearm`, `hand`, `handTip`, `thigh`, `shin`, `foot`, `toe`.
- `L` is the character's left, which is the right of the picture.
- This is marked by hand. Finding the points from the picture is not built.

### 3. Image to 3D

```sh
node --env-file=.env --env-file=.env.local --import tsx lab/stage-art/character.ts tripo garlan 1.94
```

- Out: `public/stage-lab/<id>-tripo-model.glb`, about 59,000 triangles and 16 MB, unrigged. This is the source. Nothing overwrites it.
- The response is kept in `raw/<id>-tripo.json`. Running the command again reads it and does not pay again.
- `--meshy-rig` also has Meshy rig it ($0.32), for comparing. We do not use that rig: it stretched a sheet out of Garlan's waist.
- Tripo H3.1 beat Meshy 7.1 on the same picture: sharper armour, a face nearer the sheet, half the price.

### 4. Rig and detail levels

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b -P lab/stage-art/rig.py -- \
  public/stage-lab/garlan-tripo-model.glb lab/stage-art/figures/garlan.json public/stage-lab garlan-rig
```

What `rig.py` does, in order:

1. Turns the model to face forward. A generator faces its figure whichever way it likes. Tripo's faces sideways.
2. Stands it on the ground at its height.
3. Builds the skeleton from the joints file: 18 bones, the same names and parents for every character.
4. Solves the weights on a stand-in, the mesh remade as one closed outer skin, and hands them to the real mesh.
5. Sets every bone square to the world at rest, so a clip written once plays on anyone.
6. Writes three copies: the mesh as it came, 20,000 triangles and 6,000 triangles, with 2048, 1024 and 512 pixel textures.

Out: `<name>-lod0.glb`, `-lod1.glb`, `-lod2.glb` with no clips in them, and `<name>.json`, the report.

Read the report before going on:

| Field | Good | If not |
|---|---|---|
| `weights.solve` | `heat` | `envelope` means the solve gave up. Expect rough bends. |
| `weights.unweighted` | `0` | Loose points will be left behind when it moves. |
| `lods[].turnedAtRest` | empty | A bone is not square. Clips will bend it wrongly. |
| `lods[].joints` | `18` | An extra joint means points with no weights. |

The report cannot see a skeleton that lies across the body. The first Garlan passed every number with his skeleton sideways. Only the frame strips in step 6 showed it.

### 5. Shelve

```sh
node --import tsx lab/stage-art/library.ts add garlan garlan-rig "Garlan Ironfist" "Sergeant of the Gate Watch" --generator="Tripo H3.1 on fal" --cost=0.6
```

Out: `public/stage-lab/figures/<id>/` with `figure.json`, `lod0.glb`, `lod1.glb`, `lod2.glb` and `front.webp`. The asset library lists whatever is in that folder.

### 6. Review

In the library, alone in a lit room:

```
http://localhost:3057/dev/assets?id=garlan&lod=0&clip=Walk
```

As frame strips, which is how a movement is judged:

```sh
S="staging=welcome-to-kordavos/the-dragonbone-inn&paint=0&iso=45,35,40,3.6&isoat=3,-0.95&isolight=1.4,0.3,1.8"
node --import tsx lab/stage-art/capture.ts --name=rig --tier=high "--q=$S&figure=beric:garlan-rig-lod0:16:Walk" --poses=beric:Walk:8
node lab/stage-art/strip.mjs lab/stage-art/raw/captures rig-Walk 8 ~/Desktop/d20-iso-spike/rig-Walk-strip.jpg 640 1100 692 80
```

In a scene, in place of a cast member's card:

```
http://localhost:3057/dev/stage-lab?staging=welcome-to-kordavos/the-dragonbone-inn&tier=high&paint=0&iso=45,35,40,17&isolight=1.4,0.3,1.8&figure=bram:garlan-rig-lod0:0:Idle
```

Look for: hands or arms through the body, torn mesh at the armpits and elbows, feet on the floor, the face at each detail level, and the figure facing the way its cast member does.

## Clips

`lab/stage-art/clips.ts` holds Idle, Walk and Hit. They are written as turns per bone, not recorded, and no character owns them.

- A clip reads two things from the figure: how far out its arms were modelled, so standing arms hang the same on everyone, and where its hips rest.
- To add one, add an entry to `WRITTEN` with a name, a length and a pose for each moment. It then shows as a pill in the library for every figure.
- Only Garlan has played them. A second body has not proved they carry over.

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

- `iso=azimuth,elevation,distance,lens`. `lab/stage-art/iso.ts` cuts the two near walls, the ceiling and everything outside the room, and lights the room's own lamps.
- 13 of the 41 sets have a room. The other 28 are outdoors or open, and have no isometric view yet.

## Where things are

| What | Where | In git? |
|---|---|---|
| Scripts | `lab/stage-art/` | yes |
| Joints files | `lab/stage-art/figures/` | yes |
| Sheets, paid responses, captures | `lab/stage-art/raw/` | no |
| Source and rigged models | `public/stage-lab/` | no |
| The library's shelf | `public/stage-lab/figures/<id>/` | no |
| The library page | `app/dev/assets/` | yes |
| Sets and stagings | `packages/stage/src/sets`, `stagings` | yes |
| Skills this follows | `.agents/skills/game-dev-character-model`, `build-rigged-game-assets`, `workflow-score-to-target`, `3d-wood-lighting-scorecard` | yes |

## Known faults

- The 6,000 triangle copy has a tear across the face and crumpled armour up close. It holds at a room's distance only.
- Figures read darker than the cards beside them in the stage. They are not lit as cards are.
- The walk is on the spot and has not been scored by anyone but its author.
- Fourteen figures at 59,000 triangles each drop the high tier from 60 to 40 frames a second on an M3. At 6,000 they cost nothing.

## Not built

- Joints found from the picture, so step 2 needs no hand.
- One command that runs steps 1 to 5.
- Sheets for characters outside `welcome-to-kordavos`.
- An attack, a fall and a talk clip.
- Detail levels swapped by distance in the stage.
- Blind scoring of looks and movement (`workflow-score-to-target`).
- A home for shipped figures. About 5 MB a character is too heavy for git at 120 characters.
- Props, monsters, and an isometric view of outdoor sets.
