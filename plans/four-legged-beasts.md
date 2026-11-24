# Four-Legged Beasts

Owner decision, 2026-11-23: give the pipeline a way to make a beast that walks on four legs, borrowing from AnyMachine's quadruped (`github.com/apekshik/anymachine`, `quadruped/`, MIT). Today every figure stands on rig.py's person skeleton, and `asset-library/README.md` (A beast) says a beast on four legs "has no way through yet".

The first is the Forest Drake of Welcome to Kordavos (owner, 2026-11-23), in The Beast Escapes on the wrecked docks: four legs, a long tail and wings. Wings wait (see Later). Its set, `kordavos-docks-wrecked`, gets a look of its own at the same time, so the drake has somewhere to stand.

## What Changed, 2026-11-23

Hyper3D's rigger on fal, which `pilot.ts` already uses, takes a `bone_template`: `human`, `quadruped`, `bird`, `dragon`, `kaiju` or `custom`. Its stock clips come by body: `lizard` has 13 (walk, run, idle, a front-leg hit, tail swipes, charge, stunned, two deaths) and `canine` 35. Tripo's rigger on fal has `quadruped`, `avian` and `serpentine` too. Meshy's on fal is for people alone.

So the drake goes through the route a person does, Hi3D then Hyper3D, with a beast's skeleton and clips, and the skeleton and gait of our own below wait until a stock rig fails. What AnyMachine still gives the drake is the checks (step 6).

## What AnyMachine Shows

Its quadruped is a robot of rigid parts on 13 bones, with no skin. What carries over is the method, not the mesh work.

- Measure the legs off the generated mesh. Its `probe.py` reads hip, knee and foot from the side profile of each leg, and checks left against right: they agreed within 1 to 7 mm, so the reading is real. Then it averages the two sides into one leg.
- Pose the legs by solving where each foot goes, not by turning bones by hand. Each leg is a hip that swings out, a hip that swings forward and a knee, solved exactly in the rig's own bone conventions. What is keyed is what Blender shows, to 0.00001 degrees.
- A trot moves diagonal pairs together (front left with hind right), each foot on the ground 55% of the cycle. The body bobs 6 mm and rocks a degree or two. Every number is a parameter: stride, step height, body height, speed.
- A foot on the ground stays put. A round foot rolls, a flat pad is pinned. Its trot slips 0.014 mm a step.
- Check by machine before anyone looks: sweep every joint to its limits, play every clip, measure foot slip and the lowest point that is not a foot, then load the exported GLB and confirm the feet land where the planner said.
- Front and hind legs on one side can touch, about 6% of random poses. Joint limits cannot stop it, so the check samples poses and the stride stays short of where they meet.
- What it rebuilt: every leg, since the generator fused each one into a single blob. We cannot rebuild fur as slabs, so we weight the generated skin instead, as rig.py already does.

## The Drake

1. A brief, `asset-library/characters/forest-drake`, with `"stance": "four"`, `"rig": "dragon"` and `"stock": "lizard"`. The sheet paints it on all four feet, wings folded tight along its back, tail out straight behind, mouth shut.
2. A second sheet of its two sides, since a beast is read side on. Hi3D takes left and right views beside the front and the back.
3. Hi3D, then Hyper3D with the beast's skeleton and its stock clips, named as the game plays them: Idle, Walk, Rend (the front-leg hit), Tail, Hit, Stunned for a net, Fall.
4. The person's mends in `pilot.ts` (upright chest, shoulder plates, the face painted on, hands relaxed) left off a beast that stands on four feet.
5. Foot slip and leg-through-leg checks over its clips.
6. The wrecked docks' look, not marked `play` until Cassia, Yeva, Astrid and Petra have figures, or the owner says they may stand as cards.

## Our Own Skeleton, If a Stock Rig Fails

1. A beast skeleton in `figure.ts` and `rig.py`, beside the person's: root, hips, spine, chest, neck, head, tail in two or three bones, and four legs of upper, lower, foot. Every bone square to the world at rest, as the person's are, so written clips play on every beast. A brief says `"body": "four"`.
2. The sheet asks for the beast side on and from the front, standing square, legs apart and straight under it, mouth shut, tail out. Our sheet is a front painting. A beast is read from the side.
3. Joints from the side view: hips, knees, hocks, feet, shoulder, head and tail tip, placed by hand at first, as the owlbear's were. A port of `probe.py` checks them against the mesh and reports left against right.
4. Weights by rig.py's stand-in heat solve, as now. Fur between the legs is where it will go wrong: look at the belly and the inside of each thigh.
5. The gait in TypeScript, in `packages/stage/src/figures`, not baked in Blender. Port `gait.py`'s two-bone leg solve and its trot timing. Solved live, the walk's stride and speed follow a move beat's distance, and the feet stay planted on any ground, as the arms in Shoot are solved to points after their clip (`fight.ts`). A walk, a trot, an idle and a crouch first. Then a bite, a lunge, a fall and a howl.
6. The checks as a script: foot slip a step, no foot under the ground, the lowest point that is not a foot, and leg against leg over every clip. It fails the build past set numbers.
7. One beast through end to end, judged as other figures are (`scorecards/`), then stood in a staging with `look=play`.

## Open

- Which of Hyper3D's skeletons the lizard clips play on: `dragon`, `quadruped`, or `auto`.

- Whether Hi3D gives four separate legs. AnyMachine's generators fused them, and gave a spider six legs when it was asked for eight.
- Whether a stock rigger on fal rigs a four-legged body. Meshy's and Hyper3D's riggers are a person's, as far as we have used them. Ask fal before building our own skeleton. If one does, it may come with clips.
- Whether the free clip libraries hold a wolf, and whether one retargets onto our skeleton. A written gait needs no library.
- A beast that walks on four legs and rears on two, as a bear does. Not in this plan.

## Later

- The drake's wings: opened for a roar, beaten for its flight to the roofs. Bones in a `dragon` skeleton, or wings built in code as the staff is.
- Breath: no stock clip. A head thrust forward with the jaw open, written as a turn.

## Done

- 2026-11-23: the drake's brief, its two sheets (front and back, its two sides), and `pilot.ts` taught a beast on four feet. Its picks: Idle, Walk, Run, Rend, Tail, Charge, Stunned, Fall from the lizard stock. The model ($2.10) and the rig ($0.20) wait for the owner to run `pnpm assets:pilot forest-drake --pay`. The rig is held after that until the model is looked at and passed with `--facing=ok`.
- 2026-11-23: the wrecked docks' look (`looks.ts`), not played: arrival low on the quay behind the party, wide, and play. Lyra stands for Cassia and Poppen for Yeva, as at the Gates. Astrid and Petra still have no figures.
