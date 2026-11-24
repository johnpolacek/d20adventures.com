# Four-Legged Beasts

Owner decision, 2026-11-23: give the pipeline a way to make a beast that walks on four legs, borrowing from AnyMachine's quadruped (`github.com/apekshik/anymachine`, `quadruped/`, MIT). Today every figure stands on rig.py's person skeleton, and `asset-library/README.md` (A beast) says a beast on four legs "has no way through yet".

No adventure has a four-legged beast yet. The first one wanted is the test: a wolf is the likely pick, since the SRD has Wolf and Dire Wolf and most low-level roads have them.

## What AnyMachine Shows

Its quadruped is a robot of rigid parts on 13 bones, with no skin. What carries over is the method, not the mesh work.

- Measure the legs off the generated mesh. Its `probe.py` reads hip, knee and foot from the side profile of each leg, and checks left against right: they agreed within 1 to 7 mm, so the reading is real. Then it averages the two sides into one leg.
- Pose the legs by solving where each foot goes, not by turning bones by hand. Each leg is a hip that swings out, a hip that swings forward and a knee, solved exactly in the rig's own bone conventions. What is keyed is what Blender shows, to 0.00001 degrees.
- A trot moves diagonal pairs together (front left with hind right), each foot on the ground 55% of the cycle. The body bobs 6 mm and rocks a degree or two. Every number is a parameter: stride, step height, body height, speed.
- A foot on the ground stays put. A round foot rolls, a flat pad is pinned. Its trot slips 0.014 mm a step.
- Check by machine before anyone looks: sweep every joint to its limits, play every clip, measure foot slip and the lowest point that is not a foot, then load the exported GLB and confirm the feet land where the planner said.
- Front and hind legs on one side can touch, about 6% of random poses. Joint limits cannot stop it, so the check samples poses and the stride stays short of where they meet.
- What it rebuilt: every leg, since the generator fused each one into a single blob. We cannot rebuild fur as slabs, so we weight the generated skin instead, as rig.py already does.

## The Plan

1. A beast skeleton in `figure.ts` and `rig.py`, beside the person's: root, hips, spine, chest, neck, head, tail in two or three bones, and four legs of upper, lower, foot. Every bone square to the world at rest, as the person's are, so written clips play on every beast. A brief says `"body": "four"`.
2. The sheet asks for the beast side on and from the front, standing square, legs apart and straight under it, mouth shut, tail out. Our sheet is a front painting. A beast is read from the side.
3. Joints from the side view: hips, knees, hocks, feet, shoulder, head and tail tip, placed by hand at first, as the owlbear's were. A port of `probe.py` checks them against the mesh and reports left against right.
4. Weights by rig.py's stand-in heat solve, as now. Fur between the legs is where it will go wrong: look at the belly and the inside of each thigh.
5. The gait in TypeScript, in `packages/stage/src/figures`, not baked in Blender. Port `gait.py`'s two-bone leg solve and its trot timing. Solved live, the walk's stride and speed follow a move beat's distance, and the feet stay planted on any ground, as the arms in Shoot are solved to points after their clip (`fight.ts`). A walk, a trot, an idle and a crouch first. Then a bite, a lunge, a fall and a howl.
6. The checks as a script: foot slip a step, no foot under the ground, the lowest point that is not a foot, and leg against leg over every clip. It fails the build past set numbers.
7. One wolf through end to end, judged as other figures are (`scorecards/`), then stood in a staging with `look=play`.

## Open

- Whether Hi3D gives four separate legs. AnyMachine's generators fused them, and gave a spider six legs when it was asked for eight.
- Whether a stock rigger on fal rigs a four-legged body. Meshy's and Hyper3D's riggers are a person's, as far as we have used them. Ask fal before building our own skeleton. If one does, it may come with clips.
- Whether the free clip libraries hold a wolf, and whether one retargets onto our skeleton. A written gait needs no library.
- A beast that walks on four legs and rears on two, as a bear does. Not in this plan.

## Done

Nothing yet.
