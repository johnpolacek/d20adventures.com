# Stage fidelity spikes

[Home](../index.md) · [Plans](index.md) · [Stage engine](../stage-engine.md) · [Stage art spikes](stage-art-spikes.md)

Status: environment spike run and reviewed 2026-11-10. The owner chose painted, photoreal for environments. Open: how paintings cover cameras that follow characters. Character spike not started. A test directory only: nothing here changes `packages/stage` or the desktop app.

## Why

The owner asked for a new attempt at The Gates of Kordavos, free of the current approach, as a before and after. Owner decisions, 2026-11-10:

- Spike the environment first, then characters.
- Try a painted track and a generated-world track side by side, each in a painterly and a photoreal style.
- Characters should become real 3D, without standees, if a spike shows it can hold up.

## Environment spike

Run in `lab/stage-art/` on the gate set, ultra tier, 1350×900 CSS at DPR 2. Details and commands: [lab/stage-art/README.md](../../lab/stage-art/README.md).

| Track | How | Result |
|---|---|---|
| Painted shot | GPT Image 2 repaints a clean plate of one shot at 2880×1920. The lab projects it onto the set from that shot's camera, with a painted sky dome. | The sharpest result. Layout holds at the gate and the checkpoint. It covers only what its camera saw: a shot facing the other way shows bare set and stretched paint. |
| Splat world | The set is rendered as a 360 colour panorama, GPT Image 2 repaints it, and World Labs' Marble 1.1 turns it into gaussian splats. Spark draws them in place of the set. | One world held for every play camera near its origin: the checkpoint, the reverse two-shot and Garlan's close-up. Softer than a painting, with streaks, floating rope posts and a lost awning. From the opening shot, 71 m away, it falls apart. |

- Photoreal and painterly both work on both tracks. The style is only the prompt. A painterly world made on the market road kept the gold light and the brushwork on the stone.
- Figures read cold against a painterly world: the engine lights them, and the painting lights the scenery.
- Marble's own depth-to-panorama call was tried first and dropped: it lost the gate's turrets, added street lamps and ignored the painterly brief.
- A splat world's size comes from its own ground: the lab scales it so its panorama point sits at the height it was captured from. Marble's metric estimate was 0.55 of ours.
- Light is baked into both. A dawn or night variant of a set is another painting or another world.
- Frames a second on an M3 at DPR 2, dev build, checkpoint shot: 28 as built, 33 with the painting and no brush filter, 18 in the 1.9 million splat world.
- Sizes: a painted shot is 0.8 to 1.5 MB as WebP at quality 85. A Marble 1.1 world is 30 MB. A 500k splat version also comes back and was not tried.

Prices, 2026-11-10: a Marble 1.1 world is 1,500 credits ($1.20), a draft 150 ($0.12), depth-to-panorama 80. GPT Image 2 was not metered: the OpenAI balance ran out after six large images.

## Not shown yet

- Shadows from figures onto painted or splat ground. The lab hides the set in a splat world, so nothing receives them.
- The desktop app's WKWebView. Everything ran in Chrome.
- A painterly checkpoint, painted or splat: the OpenAI balance ran out first.
- Painted close-ups. A close-up follows its character and has no fixed camera to paint for.
- The 500k splat world on lower tiers.

## Decision

Owner, 2026-11-10: painted, photoreal is the way to go for the environment.

What that leaves open, counted from the specs on 2026-11-10:

- 41 sets (32 places and 9 variants) hold 204 fixed shots, 5 a set. Each is one painting.
- 68 stagings hold 218 more shots. 8 are fixed. 80 frame a group and 130 follow one character, so they have no fixed camera to paint for.
- A painting replaces the engine's light where it lands, so a figure's live shadow cannot show on it.
- The camera eases between shots. Mid-move it looks from places no painting was made for.
- Only an outdoor day set was tried. No interior, no night.
- GPT Image 2's price for a 2880×1920 painting was not metered. `gptEdit` drops the token usage the API returns.

## Character spike

Next. Take Garlan from his front and back art through image-to-3D, rig him, give him an idle and a walk, and stand him at the gate beside his standee.
