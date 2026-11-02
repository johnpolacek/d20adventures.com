# Stage fidelity spikes

[Home](../index.md) · [Plans](index.md) · [Stage engine](../stage-engine.md) · [Stage art spikes](stage-art-spikes.md)

Status: environment spike run and reviewed 2026-11-10. The owner chose painted, photoreal for environments. A second round the same day tested coverage, camera moves, figure shadows and an interior, with paintings made on the owner's ChatGPT subscription. Character spike run the same day: one 3D Garlan stands at the gate. Open: an owner decision on how the camera behaves over paintings, and on going ahead with 3D characters.

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
- GPT Image 2's API price for a 2880×1920 painting was not metered. The second round moved painting to the ChatGPT subscription instead.

## Second round, 2026-11-10

Owner: paint through the local CLI on the ChatGPT subscription, not the metered API. `repaint.ts --cli` runs the Codex CLI's own image tool with the desktop app's locked-down command and the plate attached.

| Question | Result |
|---|---|
| Does the CLI paint as well as the API? | Yes for layout: 82% of the gate's edges within 2 px, against 91% for the API and 42% by chance. It returns 1536×1024, not 2880×1920, in 82 to 104 seconds, with no API charge. |
| Can paintings cover cameras that follow characters? | Partly. A second painting, made with the first already projected, completed the reverse two-shot. A third completed the party shot. A camera away from all three still shows bare wall and hard joins. |
| Do paintings of one place agree? | Mostly. The second painting kept the first one's grey paving as a separate slab beside its own red cobbles, so the join reads as a change of paving. |
| What does a camera move look like? | Rough for the half second it lasts: bare patches and jagged joins mid-glide. A cut or a dissolve would hide it. |
| What stays exact? | Turning and zooming from the point a painting was made. A zoom on Garlan from the checkpoint camera fit perfectly. |
| Can figures shadow painted ground? | Yes. With the set's own shadow casting off, the sun's shadow map holds only figures, and it darkens the paint. Flat cards throw slivers. A solid stand-in threw a full shadow. At 55% it is faint on busy cobbles and wants tuning with a real 3D figure. |
| Does an interior work? | Yes. The Dragonbone Inn's common room at night came out well, with live hearth and candle flames over it. Its edge match was lower: 72% within 2 px. |

- Where several paintings see a surface, the lab takes the one that saw it closest and most squarely, and fades each toward the edge of its own frame.
- A plate leaves out flames and smoke, so they stay live over the painting.
- Not measured: how many pictures the ChatGPT plan allows in a day.

## Open decision: the camera

Two ways to use paintings, for the owner to choose between:

- Free cameras. Character shots stay as they are, and each play area gets enough paintings to cover them: 5 to 8 by this round's evidence, with patchy edges left over. About 410 paintings for 41 sets.
- Tripod cameras. The camera stands only where a painting was made, and frames characters by turning and zooming. Every frame is exact, and the 204 fixed shots already are those points.

Close zooms from a tripod, tested 2026-11-10: zooming 2× into the CLI's 1536 px checkpoint painting goes soft on the ground and the barrier. A second painting from the same point with a 24 degree lens, made by `repaint.ts --sharpen` from a plate of the first one enlarged, fixes it: sharper at native pixels than the API's 2880 px painting, 82% of edges within 2 px, 55 seconds, and no join shows in the wide view. So a tripod point wants its wide painting plus a sharpen pass for each close framing, or about four to tile the whole frame.

## Character spike, 2026-11-10

Garlan Ironfist, from his standee to a rigged 3D figure at the gate. Commands: [lab/stage-art/README.md](../../lab/stage-art/README.md).

1. `character.ts sheet`: the Codex CLI, on the owner's ChatGPT subscription, redrew his front and back standees as a photoreal A-pose sheet on grey. 112 seconds, no charge. Outfit, emblems and beard carried over.
2. `character.ts model`: Meshy 7.1 on fal turned the sheet's front view into a textured mesh with a rig, an idle, a walk and a run. One call, $1.52, about 10 minutes.
3. `&figure=garlan:garlan-idle` stands the model at his mark, at his height and facing, in place of the card.

| Question | Result |
|---|---|
| Does he hold up beside the painted set? | Yes at the checkpoint's distance and in the zoom: real armour with depth, a readable face, and he sits in the photoreal set better than the painted cards around him. |
| The face up close? | Clean and usable, but a different man: darker, shorter hair and a generic game face. The likeness drifted between the sheet and the mesh. |
| Animation? | The rig and all three clips play. Meshy's idle preset 0 swings him well away from his facing, so a frame can catch his back. A calmer idle is needed. |
| Cost to draw? | 61,909 triangles. 33 frames a second at the checkpoint with him in, the same as without. |
| Size? | 18 MB per clip file, since each repeats the mesh and textures. The armature-only clips are 0.1 MB, so one mesh plus those is the way to pack it. |
| His shadow on the paint? | Not confirmed. No clear cast shadow shows under him in the captures. |

Not done: a second generator for comparison, the back view as input, Blender (not installed), a calmer idle, a talk or attack clip, a monster, a second character to check the crowd of cards against.

Prices, 2026-11-10: Meshy 7.1 on fal is $1.20 for a textured model, $0.20 for a rig and $0.12 an animation call. About 120 named characters would be about $180.
