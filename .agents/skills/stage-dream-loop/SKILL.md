---
name: stage-dream-loop
description: Raise a built stage set's look toward a painted target, round by round. An image model paints one of the set's own shots as the finished game would draw it, the set is built toward that picture, and a fresh judge scores the live frame against it until it reaches the bar or stalls. Use when asked for a "dream loop", to make a set look much better, to "get this set to 8", or to close the gap between a set and a picture of it.
---

# Stage dream loop

A picture of the finished set is the target. Build toward it, have someone who did not build it score the gap, and go again.

The idea is from [achimala/dream-loop](https://github.com/achimala/dream-loop), fitted to sets built in `packages/stage`. The scoring habits are `workflow-score-to-target`, beside this skill. Read `packages/stage/AGENTS.md` first.

Not for a set with a `painted` section. There the painting is the set: see “Painted sets” in `lab/stage-art/README.md`.

## What outranks the target

- The target says how things look, never where they stand. Walls, doors, rails, cover and the cast's spots stay where the set and its stagings put them.
- After a change to a set or a staging: `pnpm stage:plans`, then `pnpm stage:check`, `pnpm stage:plans:check` and `pnpm stage:director`. A round that fails them is not scored.
- Each shot stays inside 300 draw calls and 2.5 million triangles (`scripts/stage-verify.ts`). `capture.ts --fps` prints both.
- Frames are judged at device scale 2, whole and as native-pixel crops. A whole frame shown small hides blocky models.
- Measure what can be measured: drift, frame rate, calls, triangles. The judge scores only the rest.

## Setup

```sh
pnpm exec next dev -p 3057
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --user-data-dir=<scratchpad>/chrome-profile --remote-debugging-port=9478 --force-device-scale-factor=2 --disable-features=CalculateNativeWinOcclusion --disable-backgrounding-occluded-windows --disable-renderer-backgrounding
export STAGE_ART_DESKTOP=~/Desktop/<set>-dream
S="staging=<adventure>/<encounter>"
```

Stop the server and that Chrome when the loop ends.

## 1. Pick the shots

One to three of the staging's own shots, the ones the set is played from. Every round captures the same shots at the same tier and size.

## 2. Capture round 0 and paint the target

```sh
node --import tsx lab/stage-art/capture.ts --name=<set>-r0 --tier=ultra --camera --fps "--q=$S&cast=off" --shots=<shot>,<shot>
node --import tsx lab/stage-art/repaint.ts <set>-r0-<shot> target --cli --as=<set>-target-<shot> "--place=<what the shot shows>" "--detail=<its materials and its light>"
node --import tsx lab/stage-art/repaint.ts drift <set>-r0-<shot> <set>-target-<shot>
```

- The plate is the build as it stands, with nobody in it. The target is that frame as the finished game would draw it, not a film still or concept art.
- `--cli` paints on the owner's ChatGPT subscription. Without it the call is paid, so ask first.
- `--detail` names real materials and the light, as `GATE.detail` in `repaint.ts` does. Never ask for flat or simple art.
- Drift is how well the painter kept the plate's edges. Chance is 75% within 8 px, and GPT Image 2 scored 98%. Paint again when a target falls well short, or adds, moves or drops anything.
- The target lands in `public/stage-lab/` and in the Desktop folder. Send it to the owner, then start. Stop and ask only if it reads as a different place or style than the adventure's art.
- The target does not change during the loop.

## 3. A round

1. Build toward the target: models, materials, textures, light, dressing. Sets are in `packages/stage/src/sets`, their parts in `builders`, `kit` and `materials`. Look for textures, models and skies on Poly Haven first, as `packages/stage/AGENTS.md` says. For a model worth generating, see “Asset library” in `lab/stage-art/README.md`.
2. Run the checks above.
3. Capture again as `--name=<set>-r<n>`, with the same flags.
4. Cut three crops per shot, the same rectangles from the live frame and the target: the nearest surface, the main prop, a light. Check the two pictures are the same size first.
5. Hand them to the judge.
6. Fix what the judge named, the lowest line first.

```sh
node -e 'const s=require("sharp");const [,src,out,l,t]=process.argv;s(src).extract({left:+l,top:+t,width:900,height:600}).toFile(out)' <picture> <crop>.png <left> <top>
```

Live frames are `lab/stage-art/raw/captures/<set>-r<n>-<shot>.png`. Copy each round's frames to the Desktop folder.

## The judge

A fresh subagent each round, never a fork. Give it the file paths and this prompt. Do not give it earlier scores or what you changed.

> You are judging a 3D game set against a target picture of the same frame. You did not build it. Judge only what you see.
>
> For each shot you have the target, the live frame, and crops of both at native pixels, cut from the same rectangles. Open every file before scoring.
>
> Where things stand is fixed by the game's rules. Judge how they look, not where they are. The target was enlarged, so it is softer than the live frame up close. Never ask for blur.
>
> Score each shot, 0 to 2 points a line, fractions allowed, 10 in all:
>
> 1. Shape: each thing has the target's form and outline, with no blocky or missing parts.
> 2. Materials: each surface has the target's texture, wear and roughness. Nothing flat, plastic or tiled.
> 3. Light: palette, exposure, contrast, shadows, haze and glow match the target.
> 4. Detail: the small things the target shows are there, such as trim, fittings, joints, clutter and ground cover.
> 5. Close up: the live crops hold at native pixels, with no stair steps and no stretched or smeared texture.
>
> A 10 could be mistaken for the target. An 8 is close, with small gaps only. A 6 is the same place, plainly rougher. A 4 or less is a blockout.
>
> For each shot give the five scores and the total, then every gap that costs points, worst first. Name the thing, what is wrong with it, and what would fix it. “The mast looks fake” is no use. “The mast is one smooth cylinder: give it grain, iron bands and a taper” is.
>
> Say so when a model or the lighting needs rebuilding, not tuning. Do not round up. Say what you could not judge.

## When to stop

- Done: every shot scores 8 or the bar the owner named, the checks pass and the budget holds.
- Stalling: the best total has not risen a full point in two rounds, or the judge named the same gap twice. Stop tuning and make one large change: rebuild the model, relight the set, replace the textures.
- Stalled: the large change did not raise the score. Stop and show the owner the target, the best frame and the gaps.
- Five rounds short of the bar, unless the owner set another limit: stop and report.
- A higher score never pays for a failed check or a broken budget.

Past the bar, if the owner wants more, paint a new target from the current plate and loop again.

## Report

For each shot: the score by round, such as “5.5 → 7 → 8.5”, the target beside the first and last frames, what is still short and why, and which numbers were measured and which judged.
