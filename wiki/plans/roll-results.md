# Roll results in the narration

[Plans](index.md) · [Stage engine](../stage-engine.md)

Started and implemented 2026-10-05 at owner request: "we could use better graphics than this on the dice roll results. This is D20 adventures so the dice rolls are the hero."

## Current state

- A roll in a turn's narrative (`[DiceRoll: ...]`) reaches the desktop narration panel as one sentence: "Lyra Silvanus · Identify Check: 6 + 4 = 10, DC 12. Failure."
- The roll card already has a real 3D d20 (`D20Solid`) that tumbles and shows the number on its face.

## Plan

- A `RollResult` in `components/stage/roll-result.tsx`, shown by the narration panel in place of the sentence when the paragraph is a roll.
- The d20 tumbles and lands on the natural roll, the modifier and the total follow against the DC, and the verdict stamps in: success, failure, or a critical on a natural 20 or 1. A line says by how much it made or missed the DC.
- The roller's portrait and name, and the check, head it. The sentence stays for screen readers and for the camera, which still frames the roller.
- Reduced motion shows the result at once. Autoplay waits for the roll to finish.

## Validation

- Desktop typecheck, scoped Biome, desktop tests.
- Success, failure and both criticals rendered in the app.

## Results

- `RollResult` shows the roller's portrait and the check, a 112 px d20 that tumbles while its number flickers and lands on the natural roll, then `natural + modifier = total` beside a DC chip, and a stamped verdict with how much the roll made or missed the DC by.
- Colours follow the roll card: sage green for success, salmon for failure. A natural 20 that succeeds is a gold critical success with rays turning behind the die; a natural 1 that fails is an ember critical failure.
- Numbers use the serif face: the display face draws a 1 like a Roman I.
- The narration keeps the roll's sentence for screen readers and for the camera, and autoplay holds a roll for its animation plus a beat.
- Checked in the app on a copy of the owner's save (Poppen's natural 1 on Stealth) and on a temporary lab page for success, failure and both criticals. Desktop and web typechecks, scoped Biome and 25 desktop tests pass.
- Follow-up the same day, at owner request: on a critical the die itself changes as it lands. `D20Solid` takes a `tone`: burnished gold with a dark number on a natural 20, charred near-black with embers glowing through and an ember number on a natural 1. Checked on a temporary lab page; desktop typecheck, scoped Biome and 25 desktop tests pass.
- Dice sounds, the same day at owner request, made in Web Audio in `components/stage/dice-sound.ts` (nothing recorded or licensed): a clatter on wood that slows as the die settles, a tock as it lands, and a verdict cue (a rising chime, a low falling tone, a bright arpeggio with a shimmer for a natural 20, a dull thud for a natural 1). The narration's roll result and the roll card's dice play them. "Sound on/off" in Scene settings, kept in local storage. Rendered offline to check levels: the dice peak near 0.2 of full scale and the cues below them, with no clipping.

