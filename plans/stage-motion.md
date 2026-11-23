# Stage Motion

Owner decision, 2026-11-21: the stage UI gets the full Animaxxing treatment. Every part of it comes in, rests and leaves under GSAP. The website keeps its CSS motion. The brand stays as it is: the `animaxxing` skill is used, not `style-animaxxing`.

The skills are in `.agents/skills`: `animaxxing` for the effects, `gsap-nextjs` for the lifecycle, and the official `gsap-*` set for the API.

## How It Works

- `@d20/ui/motion` registers GSAP once and holds `prefersReducedMotion()`. Import GSAP from there.
- A part still says how it moves with a class: `enter-rise`, `exit-fade`, `plate-in`. On the website those are CSS animations in `components/theme.css`.
- `StageHud` marks its root `data-stage-motion`, which switches those animations off inside it, and starts `stageMotion` (`packages/ui/src/stage/stage-motion.ts`). That one controller plays each class with GSAP as it appears, and announces each end as an `animationend`, so `Presence`, `Swap` and `useLeaving` are the same under both engines.
- A part told to leave goes from wherever it is. Told to come back, it returns from wherever it got to.
- Durations, the stagger step and the two curves are read from the CSS tokens (`--motion-in`, `--motion-out`, `--motion-step`, `--ease-snap`, `--ease-in-snap`). The moves are in the `ARRIVE` and `LEAVE` tables.
- The movement is written as the part's own `transform`. Tailwind's `translate`, `scale` and `rotate` are separate properties and are left alone.
- The dice roll is its own timeline in `roll-result.tsx`. It plays in full for the roll that opens an encounter and 1.75 times faster after (`roll-pace.ts`), and a tap cuts it short.

## The Feel

Quiet under play. Parts are set down like cards and tokens: short, close, and settled at once. A few moments carry the drama and may run longer: the roll, a Critical Hit, the start of an encounter, a new turn, a level gained.

## Done

- The motion module, and reduced motion guards for every stage keyframe.
- The roll timeline, with its pace and its tap.
- The controller, for the six `enter-*` and `exit-*` pairs, `plate-in`, `gm-musing-in`, `gm-musing-out` and `die-land`.
- Rays behind a Critical Hit turn for five seconds and stop.

## To Do

- A fight played in the desktop app's WebKit view, 2026-11-23: The Midnight Summons, Broken Silence into the Owlbear and Timely Rescue, narrator on. Seen working: the Owlbear's entrance and walk, the arrow's hit, the attack rolls in full and quick, the turn order's turn changes, the narration swap, the HUD hiding for the encounter's opening. Not seen: a Critical Hit, the initiative reveal, a spell's effect, a level gained. The Owlbear downs Thalbern in one round, so a longer fight needs another adventure.
  - Fixed: the turn order showed the end of the turn while it was read, so Thalbern read Dying while his arrow was still in the air. Each character now stands as the last turn left them until the paragraph that touches them.
  - Fixed: the Continue button's timer fill spilled past its rounded ends in WebKit.
  - Fixed: a glide ran straight through the Owlbear on its way to the next view. A glide that would pass through someone standing now cuts (`throughSomeone` in `stage.ts`).
  - Fixed: a hero dying or Stable never lay down. They now fall on the paragraph that drops them, and lie there after.
  - Fixed: a turn that opens a new encounter tells the old one's end first, so the new place's opening never got its establishing shot (`moments.ts`).
  - Open: the frame rate drops to 1 to 4 fps for a few seconds while a scene builds, with frames of 1 to 3.5 s. It holds 52 to 60 in play.
- Narration: the paragraph swap is timers and CSS transitions (`narration.tsx`).
- The HUD hiding and showing, the turn order's changes and its health bars are CSS transitions.
- The order parts come in when a stage first appears.
- The moments: the Critical Hit verdict, an encounter's title, the initiative reveal, a level gained.
- Ambient loops still in CSS: `roll-pulse`, `animate-pulse`, the rotate gate's spin.
- No in-app setting for reduced motion. The system's is followed.

## Checking It

`/dev/turn` is the stage with its HUD, and `/dev/dice` has every roll, with a Quick toggle. Drive Chrome over CDP and sample a part's opacity and transform each frame. A part at rest has no inline style left from its move.
