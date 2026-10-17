# Stage art spikes

[Home](../index.md) · [Plans](index.md) · [Stage engine](../stage-engine.md) · [Stage set authoring](../stage-authoring.md)

Status: decided 2026-10-17. (a) built into the engine as [painted backdrop](stage-backdrop.md). (b) and (c) not adopted. A test directory only. Nothing here changes `packages/stage` or the desktop app until the owner decides.

## Why

The owner asked whether a shared workflow fits our 3D: block out a scene, have an image model paint over a render of it, project that painting back onto the blocks, and animate characters with a video model. Three parts may help us. Each was tried in `lab/stage-art/` and judged against our current renders.

## Spikes

| Spike | Test | Result |
|---|---|---|
| (a) Painted backdrop | The Old Standing Stones. Its three `mountain` objects are replaced by a painted, keyed strip on a far cylinder. | Works from every shot that faces it. Valley and moon read like the art. Recommended for the engine. |
| (b) Paint-over and projection | The stones shot, painted over by Gemini 3 Pro Image and GPT Image 2 with the encounter art as style. Edge drift scored, then projected from the stones camera and seen from every shot. | GPT keeps edges: 76% within 2 px against 42% by chance. Gemini 53%. Projection is superb from its own camera and breaks elsewhere: painted sky on far trees, smears on grazing surfaces, ghost crowns, fixed light. Not a scene method. |
| (c) Animated standee | Thalbern's front on green, animated with the same first and last frame, keyed, packed as colour beside alpha in one H.264 video, played on his card. | Minimax H3 cut away mid-clip. Veo 3.1 Fast held green for 8 s and loops. Matches the still in colour. Not yet checked in the desktop app. |

Details, numbers and how to run it: [lab/stage-art/README.md](../../lab/stage-art/README.md). Comparison images: `lab/stage-art/results/`.

## Lessons

- Paint a backdrop on a key colour, and expect the model to tint nearby paint toward it. Unmix the key colour rather than only cutting it.
- A painting enters the scene before AgX tone mapping. Lift or lower it by eye, per set.
- Of the two image models, GPT Image 2 is the one to use for a paint-over that must line up.
- A video model can cut to a new scene mid-clip. Say "one shot, no cuts", and check every frame's background.
- A video texture's colour space was not decoded on upload. Decode sRGB in the shader.

## Layout

- `lab/stage-art/`: generation scripts, the lab viewer, the browser-side changes, and results.
- `app/dev/stage-lab/page.tsx`: a dev-only route that loads the lab viewer.
- `public/stage-lab/`: generated assets the viewer loads, ignored by git.

## Decision

Open. Recommended: build (a) into the set spec as a `backdrop`, check (c) in the desktop app before building it, and keep (b) only as a paint-over reference for set review.

Owner review, 2026-10-17: (a) is a definite improvement. (c) looked good, but the owner does not want to pay for video generation. (b) had good parts and bad parts. Decision: build (a) only.

Veo 3.1 Fast list price, Gemini API, 2026-10-17: $0.10 a second at 720p, $0.12 at 1080p, charged only on success. An 8 second 1080p idle costs $0.96. Veo 3.1 Lite: $0.08 a second at 1080p.
