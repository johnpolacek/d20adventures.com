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

## Built, 2026-11-24

- The owner chose a run that skates a little over one slowed to match the ground: slowed to a hurry's 2.4, the jog hangs in the air between steps.
- `asset-library/pipeline/gait.ts` measures each gait. `pnpm assets:pilot` writes `motion.gaits` into `figure.json`: for each of `sneak`, `walk`, `run` and `sprint` the figure has, its clip (`Sneak`, `Walk`, `Run`, `Sprint` in the brief's `borrowed`) and its speed.
- `packages/stage/src/figures/gaits.ts` chooses. A pace of `sneak` is the sneak, when the figure has one. Otherwise speed: walk to 1.8 m/s, run to 3.6, sprint past it, each pair blended over half a metre a second. A walk or a sneak plays at the rate that holds its feet, 0.4 to 2.2 times its own. A run or a sprint plays at 0.7 to 1.3 times its own, so a hurry's run is played at 0.7 and skates.
- A gait coming in takes up the stride where the one going out has it.
- `moveCast` takes a `pace`. The desktop app passes `sneak` for an entrance, an exit or a staging's walk the story calls a sneak. A beat's `move` has a speed alone.
- A figure with no `motion.gaits` walks as before, its walk taken to be made for 1.2 m/s.
- Thalbern (`thalbern-hi3d`) has them, with the clips chosen for now: Sneak `m2m/walk-stealth`, Run `ual1:Jog_Fwd_Loop`, Sprint `ual1:Sprint_Loop`. At its own speed his walk slips 8.7 cm a step, from 20.8 at 1.2. The sneak slips 20 cm at its own: its foot rolls heel to toe, and the measure follows the middle of the foot.
- Not yet seen on the stage.

## The owner's picks, 2026-11-24

- Walk and Walk m2m good: `ual1:Walk_Loop` stays. Walk relaxed, Walk cautious, Sneak stealth and Sneak run bad.
- Sneak crouch (`ual1:Crouch_Fwd_Loop`) is the sneak, with the head lifted to look ahead: `"chin": { "Sneak": 40 }`. It looked 39° under level.
- Both jogs bad, Quaternius's "too bouncy". On the trial, Run calm and Run calmer are that jog with the hips' rise and fall kept to a half and to three tenths (`"bob"` in a brief, `bob` in `pilot.ts`).
- Sprint m2m good, Sprint ok: `m2m/sprint` is the sprint.
- The run is Run calmer: Quaternius's jog with its hips kept to three tenths of their rise and fall, `"bob": { "Run": 0.3 }`.
- Every person in the game has the four gaits, rebuilt free: Thalbern, Lyra, Poppen, Reinhard, Silas, Aelar, the two elves and Wollandora. The owlbear keeps its one walk, measured at 0.35 m/s (`measureGaits` takes a figure's walk by its own name).
- Poppen's sneak measures 0.09 m/s, a quarter of his walk where everyone else's is about half: the halfling's short legs in a deep crouch, or the measure missing his steps. At a sneak's 0.8 it plays at its most, 2.2 times, and skates.

## Next

- [ ] The owner syncs and archives the rebuilt figures, and watches them sneak, walk and hurry in the app.
- [ ] Poppen's sneak looked at.
- [ ] Sprint is in no pace yet: only a beat's `move` faster than 3.3 m/s reaches it.
