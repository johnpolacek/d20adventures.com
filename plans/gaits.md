# Gaits

A figure moves at the pace the story gives it, and its legs move with the ground under it: a sneak looks like sneaking, a hurry like running, and no foot skates.

Begun 2026-11-24, from `pnpm assets:legs` (`asset-library/pipeline/legcheck.ts`, see `asset-library/README.md`, The legs measured).

## Where it stands

- The story gives a pace: `walk` 1.2 m/s, `hurry` 2.4, `sneak` 0.8, and a staging's `stroll` 0.6 (`PACE` and `STROLL` in `apps/desktop/src/stage-play.tsx`, `PACES` in `packages/gm-core/src/story/beats.ts`). A beat's `move` gives a speed of its own, 0.3 to 4 (`packages/stage/src/beats.ts`).
- The stage is told the speed alone (`moveCast` in `packages/stage/src/stage.ts`, `c.gait`), never the pace.
- Every figure has one walk. The game plays it as a stride of 1.2 m/s (`STRIDE` in `packages/stage/src/figures/models.ts`), sped up or slowed to the speed, from 0.4 to 2.2 times. A hurry is the walk at twice its rate, a sneak the walk at two thirds.
- No walk is 1.2. Measured on the fourteen figures on disk they go 0.75 to 1.02, Poppen's 0.38 and the owlbear's 0.35. So every foot skates, 11 to 65 cm a step.

## What is wanted

1. Each figure's walk plays at its own stride: `motion.gaits` in its `figure.json`, measured by the build with legcheck's measure.
2. More gaits than the walk: a sneak, a run and a sprint, each a clip in the figure with its own stride.
3. The stage is told the pace as well as the speed. A sneak is the sneak clip whatever its speed, since a stroll (0.6) is slower than a sneak (0.8). Otherwise the clip is chosen by speed, and between two gaits the two are blended, each played at the rate that keeps its feet on the ground.
4. The steps' sounds (`stepSeconds`) follow the gait that plays.

## The trial

`thalbern-hi3d-gaits`, Thalbern's own model and rig with every free gait clip, at `/settings/realm-of-myr/assets?id=thalbern-hi3d-gaits`. Its rig was copied from `thalbern-hi3d`, so it cost nothing. The clips' speeds, by legcheck:

| Clip | From | Speed m/s |
|---|---|---|
| Walk | `ual1:Walk_Loop`, the walk every figure plays now | 0.87 |
| Walk m2m | `m2m/walk` | 0.72 |
| Walk relaxed | `m2m/walk-relaxed` | 0.84 |
| Walk cautious | `m2m/walk-cautious` | 0.39 |
| Sneak stealth | `m2m/walk-stealth` | 0.76 |
| Sneak run | `m2m/run-stealth` | 8.58 |
| Sneak crouch | `ual1:Crouch_Fwd_Loop` | 0.43 |
| Sneak crouch m2m | `m2m/crouch-walk` | 0.33 |
| Run jog | `ual1:Jog_Fwd_Loop` | 5.77 |
| Run jog m2m | `m2m/jog` | 4.56 |
| Sprint | `ual1:Sprint_Loop` | 8.79 |
| Sprint m2m | `m2m/sprint` | 6.27 |

- The runs are too fast to play at a hurry's 2.4 without slowing to half speed. The figure would then hang in the air between steps. Traced by hand, the jog's planted foot goes 54 cm back in 0.09 s: it is on the ground a short while and sweeps back fast. So the measure is right, and the clip was made for a speed the story never asks.
- What to decide by eye on the trial: which sneak, which run and which sprint read best on this body. A gait that is slowed or sped past about half or one and a half times reads wrong, so a run may be better let skate a little than slowed to match.

## Next

- [ ] The owner chooses the sneak, the run and the sprint on the trial.
- [ ] `motion.gaits` written by the build: each gait's clip and its speed.
- [ ] `models.ts` plays the gait for a pace and a speed, blending by speed.
- [ ] `moveCast` takes the pace. The desktop app and beats pass it.
- [ ] The gaits borrowed by every shipped figure, each rebuilt (free), and the owner runs `pnpm assets:sync <id>` and `pnpm assets:archive <id>`.
- [ ] A beast keeps its one hunched walk, at its own stride.
