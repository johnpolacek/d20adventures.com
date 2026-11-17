# Asset library

The workspace for the game's 3D assets: every character's files, the pipeline that makes them, the clips they play and the isometric looks of the places they stand in. The page that shows it all is `/dev/assets` in the workspace and `/settings/<setting>/assets` on the site.

Written 2026-11-14, brought up to date 2026-11-15, the second time after The Midnight Summons got its looks and its two figures, and on 2026-11-16 when The Midnight Summons began to play in them. The game's own sets, stagings and paintings are untouched by anything here: a look the game plays in changes a copy of its set as it is built (Played in the game, below).

## Where things are

| What | Where | In git? |
|---|---|---|
| A character, all of it | `asset-library/characters/<id>/` | the small files |
| The pipeline | `asset-library/pipeline/` | yes |
| The clips every figure plays | `packages/stage/src/figures/clips.ts`, re-exported by `asset-library/clips.ts` | yes |
| The isometric look of a set | `asset-library/looks.ts` | yes |
| What a figure holds | `packages/stage/src/figures/props.ts`, re-exported by `asset-library/props.ts` | yes |
| A look played in the game | `asset-library/play.ts`, the figures it ships in `shipped.ts` | yes |
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

A clip can be held and walked through a frame at a time, to catch the moment a fault shows. The Time row has a step back, Pause, a step forward, a slider through the clip and PNG, which saves the frame as it stands under the figure, the clip and the moment. K or Space holds and lets go. The arrows, or comma and full stop, step one frame of thirty a second, and ten with Shift. A held moment is in the address, `at=2.9` in seconds, so a fault can be sent as a link.

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
- That arm is bent to it each frame, after the clip has moved the figure: the wrist is sent out and forward of the shoulder at chest height, the elbow found under it from the arm's two lengths, and the fist turned at the wrist until the staff runs through it, thumb uppermost.
- Where the hand goes is most of whether it looks held. Close in front of the shoulder the arm folds like a wing, and the owner called it "completely unnatural". Lower and farther out, with the forearm level, it is an arm stuck out sideways. Right is where her card has it: the hand at the chest, the elbow hanging at her side, the forearm rising to the hand.
- **What works: a hand modelled round a rod.** `"rod": true` in `holds`, with `"thick"` in centimetres, as wide as the prop. The sheet paints that hand closed round a short rod in flat pure blue, a colour nothing else on a figure is. The generator then models real fingers and a thumb round something. `rig.py` takes out every face the texture colours blue, which leaves the hand with a way through it, and keeps the rod's line, middle and width on the skeleton (`tunnel`). `props.ts` builds the staff that wide from foot to eye and turns the hand the least that brings the rod's line to the staff's. Nothing is guessed, bent or cut. Wollandora's third model is made so, after everything below was tried on her second and the owner turned each down.
- The image tool paints a rod thinner than asked. Asked for 5 cm it gave 3.7. Asked for "very thick, as a drinks can" it gave 5.3, and the model came out at 6.3. Measure the blue on the sheet (`widthCm`), and take the model's own width for the prop.
- The blue gets into the light on the hand: the skin about the rod came out lilac. The rig brings the blue under the green on what lies close about the rod's line, since skin is never bluer than it is green.
- Such a hand holds as the sheet had it: arm let down and a little out, hand at the hip, staff planted beside her. The hand keeps nearly the angle to the forearm it was modelled at. Held up at the chest, that wrist would be bent back on itself.
- Before that: the hand was modelled closed on nothing. `"fist": true` in `holds` has the sheet paint that hand as a fist, knuckles forward, and the staff stands through its middle, drawn in narrow where the fist comes. The first try bent an open hand's mesh shut, and the owner's answer was "her hand on the staff does not look right": from her own side the fingers lay flat like a fan. A hand is one bone, and bending its mesh is not a grip.
- A generator makes a fist as it makes the open hand beside it: palm in toward the thigh, thumb to the front, whatever the sheet asked. Three guesses at the fist's palm, from its shape and from the sheet, were each a quarter or a half turn wrong, and the owner said so each time. What settled it: hide the staff (`figure.getObjectByName("prop:staff").visible = false`) and look at the bare hand from above and from each side, large. Do that first for any held prop. `"palm": "front"` or `"back"` in `holds` is for a model that comes otherwise.
- A fist with a pole through it reads as a fist. The owner: "you seem to be trying to make it like a fist but it needs to be holding the staff". `wrap` in `props.ts` moves the hand's skin off the line the staff takes through it, out to the staff's width, so the fingers and thumb lie round it and none of the staff shows through.
- Even so the staff ran through skin, in at the top of the hand and out under it, and the owner saw it at once: "the staff is going through the hand". Two things answer it. The staff is drawn in to three centimetres across where it is held (`GRIP`), the width a hand closes on, so the hand is not swollen round it. And the skin that lay across the staff's way is taken out, at the hollow between thumb and first finger and under the little finger, so the staff comes out of openings and not through a surface. The staff is pinched at the hand as a result, like a thing worn thin by holding.
- Look at a held thing from low and behind and from low in front, close: those are the views that show it going through.
- The staff stands inside the curl of the fingers, six tenths of the way along the hand. The middle of the fist is nearer the wrist, and a staff set there stands against the heel of the hand.
- The roll that brings the thumb up is read off the fist's turn and shared: most on the forearm, some at the wrist. Found by comparing two directions it spun from frame to frame, and all of it on the one forearm bone wrung the sleeve at the elbow.
- The staff stays planted and turns on its foot as the hand sways, so Idle, Walk and Hit all hold it with nothing written for it.
- `rig.py` reads `holds` from the brief and leaves it on the skeleton. After changing it, run `--redo=rig`.
- The staff is built, not modelled from her card, so it is a plainer staff than the painted one. The thumb does not wrap.

### Faces

The owner, 2026-11-15: "her face is not good". It was the middle detail level, 20,000 triangles and a 1024 texture, seen from a metre. Two things changed, both free:

- A scene with three figures or fewer stands them at full detail.
- Full detail keeps the generator's own 4096 colour. Figures rigged before 2026-11-15 have 2048: `--redo=rig` on each brings them up, then `pnpm assets:thumbs` and `pnpm assets:sync`.

Then the face is taken from the sheet. A generator makes its figure from the sheet's front view and paints it again from memory: a face that was sharp on the sheet comes back soft, with muddy eyes. A second model of Wollandora, made from a better sheet, had worse eyes than the first. The model is the sheet's shape seen from in front, so `rig.py` lays the sheet's own pixels back onto whatever of the head looks forward:

- `"face": "sheet"` in the brief asks for it. It is free, and `--redo=rig` does it on a model already made.
- `"sheet": "front"` paints the front view alone, upright, 1024 by 1536. A face gets half as many pixels again as on the sheet of two views. The back view was only ever a reference: the model is made from the front.
- The sheet is lined up with the head by the top of the figure and the middle of its crown. On Wollandora it landed true. If eyes come out doubled, the head is off the sheet: look at `faceFromSheet` in `rig.json`.
- It fades out where the head turns away from the sheet, so cheeks seen from the side keep the generator's paint, and the join can show as a faint patch.
- Every figure of a person has had it, on the model each already had, for nothing: Thalbern first, then Branka, Garlan, Lyra, Milos and Poppen, 2026-11-15. All had been waxy, with pale or muddy eyes. The owlbear has not: it would want a beast's face found, which the face model may not do.
- A scene with more than three figures stands them at the middle level, whose texture is 1024. The face is on it too, but a quarter as sharp. The Gates' party of six is such a scene.

`"face": "close"` goes further, and is what Wollandora has. The owner, of the sheet's face on the model: "could we make the face even better?" The sheet's face is 130 pixels across, and it showed.

- `face.py crop` cuts the head from the sheet and enlarges it four times. The image tool paints that again as a sharp photograph of the same head (`face.png`), free.
- It is another picture, with its eyes a little elsewhere, and the model is the sheet's shape. `face.py warp` finds the same 468 points on both faces and pulls the close head onto the sheet's, triangle by triangle. `apose-face.png` is the sheet's head at four times the size with the close head's detail.
- `rig.py` paints the head from that. Under the face it also smooths the generator's own relief and shine, which were a second face a little out of place: eyelids that glinted, a second lip line.
- A model is not quite the sheet's shape. Wollandora's nose stood 5 mm to one side of the sheet's, and a nose painted beside a nose is two noses (the owner: "a weird double image of the nose"). The tip of the model's nose is the point of its face farthest forward, and `face.py` records the sheet's. The paint is moved by the difference, and `rig.json` says how far (`noseSlipMm`). Over 15 mm it is left alone as a wrong point.
- Inside the face everything on its front is painted, however it is turned. The underside of the nose looks down, and left to the generator it kept a second pair of nostrils.
- Even that is not enough when the model's head is not where the sheet's is. The third Wollandora's was two centimetres off: two brows, a smeared nose. So the rig draws the model's own face out flat, as the sheet sees it (`head-own.png`), `face.py fit` finds the same points on it and pulls the close head onto them (`apose-face-fit.png`), and the rig runs again and paints from that. `build.ts` does both passes. `rig.json` says `fitted`. Look at `head-own.png` beside `apose-face-fit.png`: the eyes should be in the same place.
- `--redo=face` paints the close head again, which makes another face. To fit and rig again with the one there is: `face.py warp <folder>`, then `--redo=rig`. Neither costs anything.
- Look at `head-crop.png`, `face.png` and `apose-face.png` side by side first. If the close head is another person, paint it again.

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

### A fight

The owner, 2026-11-16, of the owlbear fight: Thalbern should use his sword or bow, or roll out of the way. The moves are in the same file: Swing, Shoot, Dodge, Claw and Roar, and every rigged figure carries all five.

- The game plays them (`packages/stage/src/figures/models.ts`, `act`). When the story's action has an `arrow`, the attacker plays its ranged move. A `slash` or an `impact` plays its melee move. It turns to face the target, and the effect starts as the move lands (`STRIKE` in `clips.ts`). A figure that the attack misses plays its dodge. `stage.act(id, "Roar")` plays any move by name. Nothing calls Roar on its own yet.
- Which move a character makes is in `asset-library/shipped.ts` (`MOVES`): Thalbern cuts, shoots and dodges, the owlbear claws, and Wollandora dodges.
- His weapons are part of his mesh, a bow slung on his back and blades in their sheaths, and cannot be drawn. So `weapons.ts` builds a sword and a bow in code and puts them in his hand only while Swing or Shoot plays. The ones on his back stay where they are.
- Turns written per bone did not hold a bow up or bring a hand to the jaw: the bow lay along the arm and the drawing hand went above the head. So, as with Wollandora's staff, the arms in Shoot and Swing are solved to points after the clip. In Shoot the bow arm reaches straight out at the target and the drawing hand comes to the jaw. In Swing the hand goes over and behind the shoulder, then forward and down. The bow is stood upright in the world and the blade pointed, whatever the hand is doing. The rest of the body, the legs, the twist and the lunge, is the clip's.
- The hands are not closed on the sword or the bow. They were modelled open.
- A hand made round a rod holds the bow for real, as Wollandora's holds her staff. The owner, 2026-11-16, chose Thalbern's bow hand for it, at $0.60. His brief has `"holds": { "what": "bow", "hand": "L", "rod": true }`, no bow on his back, and the front sheet. `heldBow` and `weaponIn` (`weapons.ts`) put the bow through the way the rig cuts in that hand, as thick as the rod was, and keep it there at all times, in the game and on this page. A hand made round a rod as one holds a staff has the rod nearly along the forearm. So to aim, the hand is turned by the least amount that brings the bow broadside on to the target, canted up to 30 degrees to the side (`bowAim`). The wrist still bends. This was checked on Wollandora's rod hand with a bow put through it, not yet on Thalbern, whose new model is not built.
- The dodge is a duck behind raised arms, not a roll.
- `models.pose(id, clip, seconds, toward)` holds a move at one moment, for captures.
- The weapons and the arms are done in one place, `packages/stage/src/figures/fight.ts`, which the game's figures and the library's character page both use, so the page shows a move as the game plays it. The page offers every move as a clip for any rigged figure.
- A bow can be in either hand: Shoot reaches out with whichever hand holds it. The clip still turns the body for a bow in the left.
- The owner, 2026-11-16, of the new Thalbern drawing: "he does some weird warping". Drawn to the jaw with the body turned side on, as an archer stands, the drawing shoulder is behind the chin. The arm then rose to 126 degrees from hanging, the elbow 17 cm over the shoulder, folded to 37 degrees. A mesh modelled with its arms 40 degrees down crumples at the shoulder and the elbow at that. Now the body turns half as far and the string is drawn to under the chin: 83 to 90 degrees, the elbow at or under the shoulder, through the whole shot. The hand also no longer flies back after the loose, which raised the arm again.

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

## Played in the game

The owner, 2026-11-16: The Midnight Summons is played entirely in the new 3D pipeline, on the site and in the desktop app, hosted and joined. No painted sets and no card figures.

- A look with `play: true` (`looks.ts`) is the one the game plays its set in. The three places of The Midnight Summons have it.
- `components/stage/use-stage.ts` is where both the site and the app make their stage. For a played look it builds the set from the look (`play.ts`, `builtPlay`): paintings left out, the look's materials, sky, haze, cleared ground and part edits, then its light (`iso.ts` with `keepCamera`) and its modelled trees once built.
- The camera stays the game's: its shots, the story's aims and its walls. The library's free camera, rings and views stay in the library. The light's direction is taken from the look's `wide` shot.
- Each cast member whose id is in `SHIPPED` (`shipped.ts`), or named in the look's `figures`, gets a `figure` in the staging and the stage's `figures` flag is on. That is the game's own figures path, `packages/stage/src/figures/models.ts`. A rigged figure with no clips plays the written ones, blends Walk in while its cast member walks, holds what its skeleton says, flashes when struck and is tipped over when down. `figenv` sets how much of a lit room it reflects. Three or fewer figures stand at full detail.
- One with no figure shows as its card, and the console says who. In The Midnight Summons there is none: its cast is Thalbern, Wollandora and the owlbear, and a hosted game of it seats only Thalbern, since it takes no guest's own hero.
- The site serves figures from the public bucket at `/asset-library/characters/<id>/`. The desktop app bundles `SHIPPED` at the same path: `apps/desktop/scripts/build-runtime.ts` copies the library's own files when they are on the machine, else fetches the published ones (`D20_FIGURES_FROM` names another site) and keeps them in `node_modules/.cache/d20-figures`. A figure added to a played look goes into `SHIPPED`, and is synced (`pnpm assets:sync`) before it is played.
- Staging asset URLs now take `/asset-library/characters/...` beside `/stage/...`.

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
- Wollandora is her third model, the one with a hand made round a rod. The first and second are kept at `~/Desktop/d20-asset-library/wollandora-first/` and `wollandora-second/`, on the owner's Mac alone: each sync wrote the next over the last in both buckets.
- Her left arm stands out from her side, held off by the wide sleeve this sheet gave her, and a thin strip of that sleeve sticks out stiff. Her skirt stretches between her legs as they part, and her 1.86 m is measured to the top of her wreath.
- Her rig's report says 512 bones on a point, where 4 is the most there can be. The copies carry 18 joints and move rightly, so it is the count that is wrong, and nobody has found why.
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

Owner, 2026-11-16: a second Thalbern, his bow hand made round a rod, for $0.60. It is built on the owner's Mac, with the steps under Rebuilding Thalbern.

Owner, 2026-11-15: for The Midnight Summons, Wollandora and the owlbear are made in 3D as well, one model each at $0.60. A second try at either needs a new yes. Both were built that day, each on its first model. The owner then cleared a second Wollandora, for her face and her grip on the staff, and a third, with her hand modelled round a rod: $2.40 in all.

- All five were built on 2026-11-14 for $0.60 each, and each rig's report was clean on its first run. Idle, Walk and Hit play on all of them unchanged.
- At the Gates the scene's own party is Branka, Cassia, Yeva and Milos. The Gates' look (`looks.ts`) stands Lyra where Cassia is and Poppen where Yeva is, and adds Thalbern beside them. The staging itself is unchanged.

## Rebuilding Thalbern

On the Mac, from the repository. The free steps first, and stop before the model:

```sh
cp -R asset-library/characters/thalbern ~/Desktop/d20-asset-library/thalbern-first
pnpm assets thalbern --redo=sheet,joints,face,model
```

`model` is named so the run stops there, saying what it costs. Without it the old model would be rigged again with the new joints, and the figures on disk overwritten. Look at `sheet.png`: the left hand closed round a flat blue rod, no bow on his back. Then look at `joints.jpg`, and at `head-crop.png`, `face.png` and `apose-face.png` side by side. Then pay:

```sh
pnpm assets thalbern --redo=model --pay
pnpm assets:thumbs thalbern
pnpm assets:sync
```

Look at `rig.json` for `holds` and `tunnel`, and at him in the library with the Shoot clip, before the sync. The desktop app takes the new figure at its next `prepare:runtime`.

## A pilot: rigged by Meshy, moved by captured motion

The owner, 2026-11-16, of the rod-hand Thalbern drawing a bow: "now his hand looks merged into his chest". Rig.py's skeleton has 18 bones, one to a hand and none to twist an arm. A mesh weighted to it crumples when an arm is raised past level or folded. And every move here is turns written by hand, judged from screenshots. The pilot tries another way on one figure, `thalbern-pilot`, and leaves Thalbern as he is.

- `pnpm assets thalbern-pilot` paints its sheet (build.ts, free) and stops before the model. Do not give it `--pay`: that is build.ts's model and rig.
- `pnpm assets:pilot thalbern-pilot --pay` (`pipeline/pilot.ts`): Tripo H3.1 on fal, the same quality as now, turned to face as the sheet does (`orientation: "align_image"`), $0.60. Then Meshy's rigging on fal (`meshy/rigging/multi-animation`): a Mixamo skeleton with fingers, and seven clips from Meshy's library of 680, $0.20 and $0.12 a clip, $1.04. A walk comes free. The answers are kept (`pilot-model.json`, `pilot-rig.json`), so running it again costs nothing.
- Meshy sends each clip as its own model. They are merged into `lod0.glb` under the names the game plays: Idle (0), Walk, Shoot (224, Archery Shot), Swing (219, Right Hand Sword Slash), Dodge (158, Roll Dodge), Sidestep (156, Stand Dodge), Hit (178, Hit Reaction), Fall (187, Knock Down). Each plays on the spot: the hips keep their rise and fall and lose their way across the ground.
- The library page shows it at `/dev/assets?id=thalbern-pilot`, with its own clips and not the written moves. The game loads a figure with its clips inside through `models.ts` as it is, but no weapon is put in its hands yet (`fight.ts` knows rig.py's bones alone), so it shoots and cuts with nothing.
- Its face is the generator's, without the sheet's paint (rig.py), and it has one detail level.
- A second pilot, `thalbern-rodin` (`"maker": "rodin"` in its brief), is made another way again: Rodin Gen-2.5 on fal (`fal-ai/hyper3d/rodin/v2.5`) from the sheet's front and back, in an A-pose, 50,000 triangles, $0.40. Rodin takes up to five pictures in no set order, so the back can be given without a left. Hyper3D's rigging on fal (`hyper3d/rigging`), a human skeleton and up to ten of its stock clips kept on the spot, $0.20. Its stock is listed for free, and the run without `--pay` picks a clip for each of Idle, Walk, Shoot, Swing, Dodge, Hit and Fall by name and keeps them in `pilot-picks.json`, to be looked over and changed before paying. The rigging does not turn a model to face forward, so the run asks which way Rodin's faces before it pays for the rig (`pipeline/facing.ts`: the boots reach forward of the shins, as rig.py tells it). One not facing +z stops there, with the $0.20 unspent. `--facing=ok` sends it anyway.
- Hyper3D's stock, listed 2026-11-16, is 113 clips for a person: dances, guns and sports, with no bow and no sword. So the picks were made by hand: a standing idle (90), a plain walk (89), a gun fired with both arms raised for Shoot (108), a throw for Swing (64), a fall backward (68), and two more, a fighting stance (Guard, 40) and a point forward (Point, 41). They show a raised arm and a folded one. They are not moves the game could play.
- A third, `thalbern-rodin-meshy` (`"body": "thalbern-rodin"` in its brief), makes no model. The owner, 2026-11-16, of the Rodin figure: "i was expecting to see him shoot a bow and swing a sword also", and Hyper3D's stock has neither. So it takes Rodin's model and sheet from `thalbern-rodin` and pays for Meshy's rig and seven clips alone, $1.04: a figure made this way costs $1.44. `pnpm assets:pilot thalbern-rodin-meshy` says so, free.

- Made 2026-11-16, and seen in pictures from the page. Meshy took Rodin's model as it was: 50,000 triangles, the same three 2048 textures, a Mixamo skeleton of 66 bones under `mixamorig:` names, eight clips. Shoot reads as a bow drawn: the bow arm goes out straight with a closed fist, the drawing hand comes to the chin with its fingers curled, and no arm ends in the chest. Swing reads as a cut, wound up across the face and brought down, both fists closed. Worse: the chest armour flares out under both raised arms, the drawing arm's sleeve swells round at the elbow, and the face is Rodin's still, eyes near shut. Neither hand holds a weapon.

- The sheet's face on a pilot, 2026-11-16, free. Rodin's own face was the route's one weakness: eyes all but shut, bruises for scars. `"face": "close"` in the brief of the sheet (`thalbern-rodin`), then `pnpm assets thalbern-rodin` paints the close head and stops before build.ts's model, and `pnpm assets:pilot <id>` paints it on: `pipeline/paint.py` stands the rigged model where the sheet has it and runs rig.py's own painting, read out of that file, then `face.py fit`, then paints again. The textures go into `lod0.glb` as WebP, the colour 4096 wide: a file of 15 MB became 7. `--redo=face` paints again. Four things were learned on the way.
  - The face alone is painted (`ONLY_FACE`, which paint.py sets and rig.py reads). Painted as rig.py paints its own, everything above the neck that looks forward, the sheet's scarf, beard and quiver landed beside the model's: stubble on the neck, blotches on the arrows. A model from two views has gear of its own, not where the sheet has it.
  - `face.py fit --eyes=painted` keeps each eye as open as it was painted. Fitted to lids that are shut, an eye is a slit.
  - Rodin's mesh comes apart along every edge of its texture layout with a normal to each side, 63 degrees apart at the median, and was lit as flat shards: hair, ears and nose cut from card. `pilot.ts` gives every place one normal (`smooth`).
  - A clip is held over where the hips rest, not where it begins: Meshy's Knock Down begins 1.4 m behind the figure.
- How it reads: from the front the face is the sheet's, scars in place and eyes open (`Shoot-front-6.jpg`). Up close and from an angle the side of the nose is patchy, where one front picture is stretched over a surface that turns away, and the brow still hoods the eyes when the head tips down: the lids under the paint are modelled shut. Rodin's bruise shows at the edge of his right cheek.
- Meshy's clips each stand their own way: Idle, Swing and Hit with the hips turned 50 to 65 degrees, Walk and Shoot square. The game will want each clip's heading taken out.

- The owner, 2026-11-16, stepping through the clips: "the arms do weird things and the chest seems slightly concave or flat instead of more filled in". Both were the rig and the clips, not the model, and both are answered in `pilot.ts` for a figure Meshy rigs, free.
  - The chest. At rest it is as deep as Tripo's Thalbern. Meshy's Idle tips the chest 25 degrees off how the figure was modelled and its Walk 10, on a spine Meshy set with a kink in it, and a breastplate tipped forward reads as hollow. `upright` turns the chest back by one turn for the whole clip, 85% of the lean (`UPRIGHT`), at the first joint of the spine. The head and upper arms keep the way they pointed, and the breathing and the stride stay. Shoot at its start is the model as made, to judge the others by.
  - The sword cut. Meshy's Right Hand Sword Slash begins in a wide crouch with the chest 56 degrees over and the arms hung out (the owner: "this looks bad"). It crouches and rises as it goes, so one turn for the whole clip will not do: `upright` takes 55% of each frame's own lean out. The cut starts nearer upright with the chest open. The legs keep their wide bend, which is the clip's own.
  - The shoulders. The mesh is one skin, plates and sleeves together, and Meshy shares the top of each shoulder between the collarbone and the upper arm by degrees: 92% of a pauldron's points were pulled by both, and the cap went after the arm as a wing. The quiver went too. `plates` makes the share steep on top of the shoulder (`PLATE`), so the cap is the collarbone's and the lames the arm's. The cap holds its round and the quiver stays on his back. The chest plate under the cap still fans a little toward the sleeve when the arm goes far back. Taken lower, to 16 cm under the joint, the sleeve met the chest in a row of teeth.

- Clips from a free library, 2026-11-16. The owner, of Meshy's sword cuts and idles: "i don't know about any of these. let's look into other options." Quaternius's Universal Animation Library 1 and 2 (quaternius.itch.io, CC0 on every tier) are free in their Standard tier: 42 clips each beside a rest pose, as GLB, with and without root motion. `pipeline/retarget.ts` plays one on a figure Meshy rigged, and `"borrowed"` in a brief names which, each by the name it is played by. `thalbern-rodin-meshy` has ten beside Meshy's eight, under names that begin with Q, to be judged side by side on its page.
  - What the free tiers hold that the game plays: Idle_Loop, Sword_Idle, Walk_Loop, Jog_Fwd_Loop, Sprint_Loop, Roll, Hit_Chest, Hit_Head, Death01, Sword_Attack and Spell_Simple in the first. Sword_Regular_A, B and C with their recoveries, two combos, Sword_Block, Sword_Dash and Hit_Knockback in the second. No bow in either, and nothing for a beast.
  - Its skeleton is not Mixamo's: 65 bones of Unreal's names (`pelvis`, `upperarm_l`), each lying along another axis, at rest with the arms straight out. So no turn is copied bone to bone. Each of the figure's bones is turned as far as the library's has turned in the world since its rest, from a rest of the figure's own in which its arms and legs point as the library's do. The trunk is not lined up: there the two skeletons only place their joints apart.
  - How they read on Thalbern, in pictures from the page: the idle stands upright with the chest full, the walk is a walk, the sword attack winds up and lunges, the roll goes over, the death ends flat on the ground. No stoop to take out, and no wide crouch.
  - Mesh2Motion (github.com/Mesh2Motion/mesh2motion-app, its models, rigs and clips CC0 and its code MIT) has 234 clips on the same skeleton, one to a file under `static/assets/human/animations`, and among them what the free tiers lack: a bow drawn, held and loosed (`bow-pull`, `bow-pull-hold`, `bow-release`), dodges left, right and back, strafes. Its `bow` is a bow of greeting, hands together, and no shot. Its files are packed with meshopt and keep their turns as 16-bit numbers to be scaled, so they are read through a decoder and element by element: read raw, every bone span and the figure left the picture. On Thalbern the draw has the bow arm straight ahead and the other hand drawn back 90 cm from it at the shoulder, and the loose throws that arm on back. He shoots the way he faces, where Meshy's archer shoots across his body.
  - The owner, of the borrowed clips: "a little better except for the hands look garbled, the loose is a little weird looking". The hands were the copying. A finger curls about the line across its knuckles, which is the hand's own, and a hand lined up by its forearm alone had its palm a part turn off the library's: the fingers of a fist closed sideways through each other. A hand is now lined up whole, by the way its fingers run and its palm faces, and each finger by the way it points. The loose was the clip: `bow-release` is little more than where the drawing arm is thrown to, held. A borrowed clip can now be parts of clips one after another, each cut by seconds and eased into over three frames, and Q Shoot is the draw to 1.5 s and then the release.
  - Then the fists themselves: "the hands look weird on Q Walk where they look stubby and a little garbled". The library's mannequin stands and walks with its fists shut, and a generated hand's fingers are thicker and one skin with the palm, so shut as tight they sink into it. A finger now goes a fifth of the way from how the figure's own was modelled toward how the library's is held (`CURL` in `retarget.ts`): the hand hangs half open with its fingers apart. Half way was still a fist. A weapon's grip is another matter, to be set on the hand that holds it.
  - The borrowed clips play on Hyper3D's rig as well, whose 52 bones carry Mixamo's names without the prefix: `thalbern-rodin` has eight of them. So a figure need not be rigged by Meshy to move: Rodin's model at $0.40 and Hyper3D's rig at $0.20 is $0.60, where Meshy's rig cannot be bought without a clip and makes it $0.72. Which rig bends the armour better is not yet judged: `plates` is applied to Meshy's alone.
  - Another game does this at the other end (github.com/marginsystems/the-lost-storm, MIT): every body is built on Quaternius's own skeleton, so a clip wants almost no fitting, and what fitting there is is done as the clip loads (`src/render/clip-fit.ts`), as a change from the rest pose. It warns when two rests differ by over 12 degrees: it was not made for a figure that rests with its arms 40 degrees down, which is what lining the rests up first is for here. Its `ASSETS.md` also lists Quaternius's packs of animals and monsters with their clips, CC0, which is where a beast's moves might come from.
  - To fetch them: each pack's Standard zip from its itch.io page at no charge, and its `Unreal-Godot/UAL1_Standard.glb` or `UAL2_Standard.glb` put at `asset-library/moves/ual1.glb` or `ual2.glb`. Mesh2Motion's folder of clips goes at `asset-library/moves/m2m/`. They are not kept in git.

- The arms measured, 2026-11-16: `pnpm assets:arms <id> [clip,clip]` (`pipeline/armcheck.ts`). It poses the skinned mesh at every frame of every clip and reports, for each arm, how far the elbow bends, how high the arm is raised from hanging, and how far the worst hundredth of the skin's edges over the upper arm, the forearm, the hand and the shoulder is stretched and crushed. The limits are from MengTo's game-dev-combat-animation skill (github.com/MengTo/Skills, MIT), found on rigs with nothing to twist an arm: an elbow between 10 and 152 degrees, no arm past 105 degrees from hanging, skin stretched at most twice and crushed to no less than a third.
  - Forearms and hands are inside the limits in every clip, on both rigs.
  - The shoulder is where it fails, and the upper arm with it, in every move that acts: stretched 3 to 5 times where the arm meets the trunk. The mesh is one skin, armour and sleeve together, and there are no bones to twist an arm. Standing and walking pass.
  - The borrowed clips ask less of the arms than Meshy's: its Archery Shot raises the drawing arm 131 degrees and stretches the upper arm 2.8 times, where Mesh2Motion's draw raises it 86 and stretches it 2.1.
  - Hyper3D's rig and Meshy's measure alike: 22 and 24 over a limit in the same eight clips.
  - It caught a fix that made things worse. `plates` as first written held the pauldron's cap and crushed the skin under it to an eighth, in a walk. It now takes a quarter off the arm's share on top of the shoulder: a walk passes again, the quiver still stays on his back, and the cap goes a little after the arm.
  - The same skill on a bow: anchor the drawing hand under the jaw, keep that elbow 6 to 8 cm under the arrow, and stand side-on, since the hips' turn is what kept the drawing shoulder from being crushed. Mesh2Motion's draw anchors at the shoulder, 15 cm lower, and its drawing shoulder is crushed to a fifth. To try when the bow is in his hand.

- A figure no staging's cast stands for, as both pilots are, is listed on the page under Not in a Scene (`library.ts`). Before that, `/dev/assets?id=thalbern-rodin` opened nothing. A sync would publish it with the rest: leave the pilots out of one, or take their `figure.json` away first.
- Hyper3D sends its clips back under their stock names and in the stock's order, not the order asked for. They are renamed by stock name.
- `fal()` (`lab/stage-art/gen.ts`) writes each job's answer address to `lab/stage-art/raw/generations.log` as it is sent, so an answer that was paid for and lost to a dropped poll can still be fetched.
- Not tried: a model made from several views by Tripo. fal's `tripo3d/h3.1/multiview-to-3d` reads its pictures in the order front, left, back and right, so a front and a back cannot be sent without a left. Neither fal's nor Tripo's docs say whether "left" is the figure's own left. Tripo's own API (`openapi.tripo3d.com`, a separate key) takes views by name, and rigs to Mixamo, VRM, Unity or Unreal skeletons for $0.25 (`/v3/animations/rig`).
- Prices, 2026-11-16: fal's pages for each endpoint. Tripo H3.1, image or multiview: $0.20 without texture, $0.30 standard, $0.40 HD, and $0.20 more for detailed geometry, so $0.60 as the pipeline asks for it. Meshy rigging: $0.20, and $0.12 a clip. Hyper3D rigging on fal: $0.20, with beasts, but it wants the model facing +z already. fal has no Tripo rigging.
- Mixamo's own site rigs and animates for free, but has no API, and its terms forbid handing out the raw character and animation files. This library serves its models publicly, so it is not used.

## Not built

- A fall and a talk clip. A roll.
- Detail levels swapped by distance in the stage.
- Blind scoring of looks and movement (`workflow-score-to-target`).
- A home for shipped figures. About 5 MB a character is too heavy for git at 120 characters.
- Props, and monsters that do not stand as a person does. An upright beast goes through as it is (A beast). A beast on four legs has no way through yet.
- A heavy walk for a beast. Its Claw and Roar are written, but it still walks as a person does.
- Looks for the other outdoor places. 23 of the 41 sets have neither a room nor a look, so they have no Isometric view.
- The three places of The Midnight Summons joined into one wood, as the Gates join the festival square. Not done, on purpose: see below.
- Any place but The Midnight Summons in the game. The Gates and the inn have looks, not marked `play`.
- The owlbear's Roar played by the story on its own.
- Running a step from the page itself.
