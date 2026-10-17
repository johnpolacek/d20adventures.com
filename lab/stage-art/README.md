# Stage art lab

Spikes run on 2026-10-17 to test a shared workflow: block out a scene, have an image model paint over a render, project the painting back onto the 3D, and animate characters with a video model. Plan and decision: [wiki/plans/stage-art-spikes.md](../../wiki/plans/stage-art-spikes.md). Nothing here changes `packages/stage`.

All tests use The Midnight Summons, Meeting at the Stones, at the high tier (DPR 1.5, 1350x900 CSS).

## Results

| Spike | Result | Evidence |
|---|---|---|
| (a) Painted backdrop | Works from every shot that faces it. The valley and moon read like the encounter art. Worth adopting. | `results/a-backdrop.jpg`: our render left, backdrop right, four shots. |
| (b) Paint-over | GPT Image 2 keeps the layout. Gemini 3 Pro Image paints closer to the art but moves things. | `results/b-paintover.jpg`: plate, art, Gemini, GPT, then each painting with the render's edges in red. |
| (b) Projection | Superb from the projector's own camera and nearby. Breaks from other shots. Not a scene method for us. | `results/b-projection.jpg`: our render left, projected GPT painting right. Rows: stones, Wollandora, meeting, river, then Gemini projected and stretched paint. |
| (c) Animated standee | Veo 3.1 Fast made a clean 8 second loop. Looks alive and matches the still. Promising. | `results/c-idle.mp4`: still, Minimax H3, Veo. `results/c-idle-meeting.mp4`: in a wider shot. |
| All three | The closest render to the encounter art so far, from the stones camera. | `results/all-three-stones.jpg` |

### (a) Painted backdrop

- Gemini 3 Pro Image painted a 21:9 valley panorama on magenta, at 6336x2688. Gemini Flash's was less like the art.
- It hangs on a far cylinder, 130 degrees wide, replacing the set's three mountain cones. One draw call, a 640 KB WebP.
- Placement matters. The painting's own forest band must sit below the horizon, or it reads as giant trees.
- A magenta key bleeds into the painting. The model tinted one ridge lavender. The key unmixes magenta and holds red to green.
- AgX tone mapping brightens it. Gain 0.6 and haze 0.3 toward the fog colour, tuned by eye.
- Shots that look away from the valley, like Thalbern's close-up, are unchanged.

### (b) Paint-over and projection

- Edge drift, as the share of the render's edges with a painted edge nearby:

| Painting | Within 2 px | Within 8 px |
|---|---|---|
| GPT Image 2 | 76% | 98% |
| Gemini 3 Pro Image | 53% | 86% |
| Unrelated image, chance | 42% | 75% |

- From the stones camera, the projected GPT painting looks like the art: mossy painted stones, painted grass.
- Wollandora's close-up looks the same way, so the stone faces gain a lot.
- Other shots show the method's limits:
  - Far trees pick up painted sky and mist, as cyan patches.
  - Grazing surfaces, like flagstones and the river, smear unless they fade back to their own material.
  - Leafy crowns carry painted sky across their gaps, a pale ghost crown over the moon.
  - Painted moonlight is fixed. It does not follow our lamps or a moving camera.
- Gemini's painting, projected, misses our geometry. Its moved stones paint onto trees behind them.

### (c) Animated standee

- The still front goes on green. The model gets it as the first and the last frame, so the clip loops.
- Minimax H3 cut to a moonlit landscape with a cape mid-clip. Frames 0 to 34 and 112 to 122 stayed green. They make a 3.75 second back-and-forth loop.
- A retry failed: the fal account ran out of balance.
- Veo 3.1 Fast held the green screen for all 8 seconds. Breath, a hand to the chest, a glance.
- Frames are keyed like a standee and packed colour beside alpha in one H.264 video. WebKit plays H.264, VP9 alpha it does not.
- The video texture needed an explicit sRGB decode in the shader. Without it the figure washed out grey.
- Cost per animated front: a 6 MB file at CRF 18, about 14 MB of GPU memory, one video decode.
- Not checked: the desktop app, frame rate, the back view, walking.

## Running it

```sh
pnpm exec next dev -p 3057
# Chrome with --remote-debugging-port=9478 --force-device-scale-factor=2, as in scripts/stage-verify.ts
open "http://localhost:3057/dev/stage-lab?backdrop=stones-backdrop.webp&project=stones-paint-gpt&animate=thalbern"
```

Toggles in the panel switch each spike. `?clip=thalbern-h3-idle` plays the H3 loop. `&fade=0` shows stretched paint.

| Script | Does |
|---|---|
| `backdrop.ts` | Paints and keys the panorama. |
| `paintover.ts` | Paints over a plate, and scores edge drift. |
| `animate.ts` | Puts a standee on green, animates it with H3 or Veo, keys and packs it. |
| `capture.ts` | Captures and records lab views over CDP. |
| `lab.ts`, `viewer.tsx` | The three changes, applied to a running Stage, and the lab page at `app/dev/stage-lab`. |

Generated assets in `public/stage-lab/` and raw outputs in `raw/` are not committed. The scripts regenerate them, with new model output each time.
