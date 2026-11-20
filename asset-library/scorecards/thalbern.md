# Thalbern, the figure: scorecard

Date: 2026-11-19 · Target: his card and the sheet his model was made from · Benchmark: a character in a shipping fantasy CRPG seen from the same distance · Judged by: one blind judge a round, a fresh agent shown the target and one set of pictures, told nothing of what changed
Evidence: `~/Desktop/thalbern-before-after/`. `target/` is the card and the sheet, `before/` and `after-<round>/` the same fifteen pictures each time (`pnpm assets:views`), and `judge/` inside each the copies a judge is shown.

## Rubric (0 to 2 points each, by halves, total out of 10)

| Criterion | 0 | 1 | 2 |
|---|---|---|---|
| Likeness | another man or outfit | the same man, with clear differences | the man on the card and sheet |
| Face | waxy, smeared, doubled or dead-eyed | a face, with faults a player would notice | holds up in a close-up |
| Build and hands | misshapen | a person, with faults a player would notice | right from every side |
| Materials and surface | clay, plastic or blur | the right kind of surface, with flaws | reads as leather, cloth, metal, skin and hair |
| Poses | broken | reads as the move, with visible faults | the bow shot and the sword cut are clean |

Beside the total, In the scene (0 to 2): lit, grounded and readable in two frames of the owlbear scene as the player sees him.

Judges differ by a point (`gates-look.md`). Read every number as give or take one.

## Scores

| Round | Likeness | Face | Build | Materials | Poses | Total | Scene |
|---|---:|---:|---:|---:|---:|---:|---:|
| Before: `thalbern-rodin` as shipped 2026-11-17 | 1 | 0.5 | 1 | 0.5 | 1 | **4** | 1 |
| 1: the face painted whole | 1 | 0.5 | 1 | 0.5 | 1 | **4** | 1 |
| 2: `thalbern-hi3d`, Hi3D's model as it came | 1 | 0.5 | 1 | 0.5 | 1 | **4** | 1 |
| 3: the same, its gloss halved and the sheet's face painted on | 1.5 | 0.5 | 1 | 1 | 1 | **5** | 1 |

- Round 1's judge no longer names the seam down the nose. The face stays at 0.5 for its eyes, "black slits with no iris, white or catchlight", and for patches of another tone on the cheek and a line on the neck in the three-quarter view. A mended fault that leaves the number where it was: the eyes outweigh it.
- Its three worst: the leather's finish, the eyes, the hair. All three are the model's.
- Round 2, another model and the same number. Its judge credits what Rodin's lacked, "the outfit and gear match the sheet closely", and names other faults: eyes "pale grey-chrome smears with no clear iris, pupil or white", hair "one glossy moulded mass", the cuirass "a wet lacquer shine", hands "too large", skin "pale pink and poreless".
- Round 3 is one point up, within what two judges differ by. Likeness 1.5: "the outfit and gear match the sheet closely". Materials 1: "leather reads as leather from a distance". The face stays at 0.5: the eyes are still "milky grey smears with no pupil", and the hair, hairline and ear are "soft and waxy at native pixels". Its three worst: the eyes, the hair and hairline, the skin's tone and wax with the hands.
- Every judge puts the eyes and the hair in its worst three, on both models. Neither generator makes an eye or hair a close-up holds.

## What the first judge named, worst first

| Fault | Whose | Free to mend? |
|---|---|---|
| A ragged seam down the nose, and the half of the face beside it a blur | the face painting | Yes. Mended in round 1, below. |
| Eyes are dark slits: no iris, no white, no lid edge | the model's shape, lids modelled shut | No. A new model. |
| One wet shine over leather, trousers and boots, with copper edges on every strap | the model's texture: light painted into its colour | No. See the light, below. |
| Hair is one faceted lump with a hard edge at the forehead | the model's shape | No. |
| Mid-brown where the sheet is near-black leather | the model's texture | Partly: a colour could be matched to the sheet. |
| Quilting and studs melted to soft lumps, arrows one fused lump | the model's shape | No. |
| The sword's hilt stays in the scabbard while he swings a sword | the model, a hilt made as part of the body | No. |
| Pauldron flattened in the shot and stretched in the cut | the one skin (README, the shoulder) | No. |
| In the scene: a near-black shape from behind, lit grey from in front where the ground is teal | the scene's light | Yes. Not begun. |

## Rounds

| Round | Changed | Pictures |
|---|---|---|
| 1 | The face painted whole. A fitted head lies where the model's face is, and the paint was still held to where the sheet's figure is: his face stood 3 cm to one side, so the sheet's grey left that half unpainted (`rig.py`, `on_figure`). | `after-1/`, `before-after-round-1.jpg` |
| 2 | Another model, `thalbern-hi3d`: Hi3D v3.0 on fal from the same front and back, 200,000 faces, de-shading 0.5, $2.10, and Hyper3D's rig, $0.20. The same borrowed clips. No face painted. | `after-2/` |
| 3 | Free, on that model. Its gloss halved where it is not metal (its brief's `gloss`: leather's roughness 0.6 to 0.8, an eye's 0.2 to 0.6). The sheet's face painted on, and the paint faded out toward the ears: it used to stop whole at a depth, a ragged step on the cheek where the model's skin is lit another way (`rig.py`, `back`). | `after-3/`, `before-after-hi3d.jpg`, `before-after-hi3d-scene.jpg` |

| 4 | Not judged. The owner took `thalbern-hi3d` for the game. A bone in each forearm that rolls with the hand (`pilot.ts`, `rolls`): the cut's 103° of roll at the elbow is 0°. The pose of the cut is the clip's and is as it was (README, the pilot). | `after-4/` |

| 5 | The hands and the elbow (README, the pilot): fingers laid round the grip, the other hand hung at ease, no arm near straight under 12° of bend. Judged on the moves alone, each of 2: the cut as a move 1, its joints 1, the sword hand 1, the bow shot 1, standing and walking 1. The cut "still reads wrong", by the move itself. The eight cuts ranked blind: Cut A 5.0 of 6, the cut now 4.5, within a judge's noise. | `after-5/`, `audition/` |

## What Hi3D's model is, beside Rodin's

- Better: the eyes are open and have lids, the hair has a shape, studs, buckles, hilts and straps are each a thing, the colour has no light painted into it (the sheet's and the model's skin are the same tone within a twelfth), and metal is marked only where there is metal.
- The same: the hilt stays in the scabbard while he swings, the arrows are one lump, the hands are large.
- Its own: it comes 1 unit tall, with textures 8192 across and no normals, and the rigger gives it back with three points to every triangle, 49 MB. `pilot.ts` now sizes it to its height, makes like points one and keeps no texture wider than 4096: lod0 is 11.8 MB, 200,000 triangles, against Rodin's 5.8 MB and 50,000.
- Leather comes with a roughness of 0.6 and reads wet in the review room's light. `gloss` is the mend.

## The light, tried and not kept

The review room's key at 1.5 from 2.4, the fill at 0.9, the room's reflection at 0.3 and the exposure at 0.8, with the relief at 0.7 as the game has it: the figure is darker and the skin less pale. The copper edges and the lumps stay. Its roughness map is rough already (0.75 at the mean, no metal), so the shine is paint and relief the generator made, not a material to turn down. `views.ts --do=` tries such a thing on a few views.

## Where it stops, and why

Seven of the nine faults of Rodin's model are its own shape or paint. Hair, eyes, studs, arrows and the painted-in light wanted another model, and Hi3D's v3.0 was tried (rounds 2 and 3): studs and the painted-in light are mended, the eyes and hair are not. What is left, by what a judge says would move the number: eyes drawn in by hand where the face's landmarks put them, free. Hair and hands are the model's shape. The sheet is 768 by 1024 and its hair is a soft dark mass: a sheet twice as wide is free to make, and another model from it is $2.10. The scene's light is not begun. fal has it (`hitem3d/hi3d/v3.0/multi-view-to-3d`, listed 2026-11-19): front, back, left and right each given by name, so a front and a back alone can be sent, `shading` for the de-shading, no fewer than 100,000 faces, and $2.10 a model at `2048quality` with texture and PBR, $9.10 at `2048master`. Hi3D's own site prices the same model at 45 of a free account's 100 credits.

## How to take the pictures

```sh
pnpm assets:views thalbern-hi3d --out=$HOME/Desktop/thalbern-before-after/after-4 --moves=Shoot@1.4,Swing@0.4
node --import tsx lab/stage-art/capture.ts --name=thalbern --tier=high "--q=staging=the-midnight-summons/the-owlbear-prowls&look=play"
```

The scene stands whoever `SHIPPED` names for him (`asset-library/shipped.ts`). For `thalbern-hi3d` it was named there while the pictures were taken and put back.
