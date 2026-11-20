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

- Round 1's judge no longer names the seam down the nose. The face stays at 0.5 for its eyes, "black slits with no iris, white or catchlight", and for patches of another tone on the cheek and a line on the neck in the three-quarter view. A mended fault that leaves the number where it was: the eyes outweigh it.
- Its three worst: the leather's finish, the eyes, the hair. All three are the model's.

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

## The light, tried and not kept

The review room's key at 1.5 from 2.4, the fill at 0.9, the room's reflection at 0.3 and the exposure at 0.8, with the relief at 0.7 as the game has it: the figure is darker and the skin less pale. The copper edges and the lumps stay. Its roughness map is rough already (0.75 at the mean, no metal), so the shine is paint and relief the generator made, not a material to turn down. `views.ts --do=` tries such a thing on a few views.

## Where it stops, and why

Seven of the nine faults are the model's own shape or paint. Mending the face painting and the scene's light is what this model has left. Hair, eyes, studs, arrows and the painted-in light want another model: Hi3D's v3.0 with its de-shading is the one not yet tried. fal has it (`hitem3d/hi3d/v3.0/multi-view-to-3d`, listed 2026-11-19): front, back, left and right each given by name, so a front and a back alone can be sent, `shading` for the de-shading, no fewer than 100,000 faces, and $2.10 a model at `2048quality` with texture and PBR, $9.10 at `2048master`. Hi3D's own site prices the same model at 45 of a free account's 100 credits.

## How to take the pictures

```sh
pnpm assets:views thalbern-rodin --out=$HOME/Desktop/thalbern-before-after/after-2 --moves=Shoot@1.4,Swing@0.4
node --import tsx lab/stage-art/capture.ts --name=thalbern --tier=high "--q=staging=the-midnight-summons/the-owlbear-prowls&look=play"
```
