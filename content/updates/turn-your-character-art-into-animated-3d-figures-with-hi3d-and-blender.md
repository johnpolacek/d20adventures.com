---
title: "Turn Your Character Art into Animated 3D Figures with Hi3D and Blender"
date: 2026-11-21
description: "How I turned painted character cards into rigged, animated 3D figures for about $2.30 each, with the prompts, the tools and everything that went wrong."
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/updates/gameplay-11-21.webp"
---

Until this week, characters in [The Midnight Summons](https://d20adventures.com) and other adventures were flat painted standee art. 

<iframe src="https://www.youtube-nocookie.com/embed/kOnKwsX0O0U" title="D20 Adventures gameplay with the new 3D figures" style="width: 100%; aspect-ratio: 16 / 9; border: 0; border-radius: 0.5rem;" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>

I researched what other people were doing, experimented myself and now I’m writing up the whole pipeline that I landed on. Everything here is in the [repo on Github](https://github.com/johnpolacek/d20adventures.com), and the full notes are in [asset-library/README.md](https://github.com/johnpolacek/d20adventures.com/blob/main/asset-library/README.md). Steal whatever is useful. Or by all means, tell me how I can do it better.

### The Short Version

A figure now costs $2.30 and about fifteen minutes, most of it waiting:

| # | Step | Cost |
| --- | --- | ---: |
| 1 | Write a short brief for the character. | Free |
| 2 | Have the [Codex CLI](https://github.com/openai/codex) image tool paint a pose sheet, front and back. | Free |
| 3 | Find the joints on the sheet with [MediaPipe](https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker). | Free |
| 4 | Send the front and back to [Hi3D v3.0 on fal](https://fal.ai/models/hitem3d/hi3d/v3.0/multi-view-to-3d) for the model. | $2.10 |
| 5 | Rig it with [Hyper3D](https://hyper3d.ai) to a human skeleton with fingers. | $0.20 |
| 6 | Copy free animation clips onto it from [Quaternius](https://quaternius.com) and [Mesh2Motion](https://mesh2motion.org). | Free |
| 7 | Clean it up in headless Blender, make three detail levels, and judge it blind. | Free |
| | **Total** | **$2.30** |

The only steps that cost money are the model and the rig. Every answer gets saved, so nothing is paid for twice and every later rebuild is free.

### The Pose Sheet Decides Everything

The 3D generator only knows what the picture shows it. So the most important step is free.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/pose-sheet.webp" alt="Thalbern’s pose sheet, standing with arms out and hands open on a flat grey background" width="900" height="1200" />

What makes a good sheet: arms held away from the body with background showing between them, hands empty and open, the face lit and in focus, flat grey behind, and a back view of the same person in the same clothes. Anything held in the hands gets fused into the arm, so weapons come off the sheet and the game puts them back in later. If the back view is missing, the generator makes one up. Wollandora’s leafy mantle came back as a plain dark cloak.

This is the prompt that paints the sheet, with the character’s front and back cards attached:

```prompt Pose Sheet Prompt
The attached images are the front and the back of a painted game character: [WHO THEY ARE]. Make one landscape reference sheet of the SAME person as a photorealistic costume photograph, for building a 3D model.

Two full-body views side by side at the same scale, each filling the frame's height from the top of the head to the soles: on the left the front view, on the right the back view from directly behind with no face visible.

Pose, in both views: standing straight, feet a little apart, both arms held out from the body at about 40 degrees with a clear gap of background between each arm and the body, hands open with fingers apart, palms toward the thighs. Nothing in the hands. [WHERE THE WEAPONS GO, FOR EXAMPLE: THE SWORD IS SHEATHED AT THE HIP AND THE BOW IS LEFT OUT.] Neutral face, mouth closed, looking straight ahead.

Keep this person's face, hair, build and proportions, and every piece of the outfit: its shapes, colours, emblems and layers. Render it as real materials: worn metal, woven cloth, mail, oiled leather, real skin and hair.

Lighting: soft, even, shadowless studio light from the front, the same in both views, with no rim light and no cast shadow. Background: flat, plain mid-grey, edge to edge. No text, no labels, no props, no floor line.
```

For a beast like the owlbear, ask for “a photorealistic studio photograph of a living animal” standing on its hind legs, so you don’t get a person in a costume.

### Painting the Sheet

The sheets come from the image tool built into the Codex CLI. It runs on my ChatGPT sign-in, so a sheet costs nothing extra.

The build flattens both cards onto the same mid-grey, shrinks them to 1536 pixels, and attaches them to a headless Codex run with every tool but image generation switched off:

```sh Codex Command
codex --ask-for-approval never --sandbox read-only \
  -c features.image_generation=true -c features.shell_tool=false -c 'web_search="disabled"' \
  exec --image front.jpg --image back.jpg --ephemeral --skip-git-repo-check --json - < prompt.txt
```

The pose sheet prompt goes in after one line that keeps Codex on task:

```prompt Codex Wrapper Prompt
Use only your built-in image generation tool exactly once to generate one landscape 3:2 image at the largest size it offers, working from the attached images. Do not use any other tools or write files yourself. Then stop.
```

Codex saves the picture under `~/.codex/generated_images/`. The build cuts it down the middle into the front and the back that go to Hi3D.

After five or six pictures in a few minutes it refuses with `429 Too Many Requests`. Nothing is lost. Run it again four minutes later and it picks up from the step that failed.

### Trying Every Generator

I didn’t know which generator to use, so I tried a bunch of them on Thalbern. Tripo H3.1 first, then Rodin Gen-2.5, then Rodin’s model rigged by Meshy with Meshy’s own moves, then Hyper3D’s shell skinning (which was far worse), and finally Hi3D.

To keep myself honest, every round gets judged blind. A fresh agent is shown the character’s card, the pose sheet and the same fifteen pictures of the figure each time, and told nothing about what changed. Judges differ by about a point, so a one point gain is noise. What the judge is really good for is a list of faults by name, which tells you what to fix next.

```prompt Blind Judge Prompt
You are judging a 3D game character against its target. Attached are the target (the character's card and the pose sheet the model was made from) and fifteen pictures of the figure: face close-ups, front, back, three-quarter views and two action poses. You have not seen any earlier version. Do not guess what changed.

Score each from 0 to 2, in halves, for a total out of 10:
- Likeness: 0 another person or outfit, 1 the same person with clear differences, 2 the person on the card.
- Face: 0 waxy, smeared, doubled or dead-eyed, 1 a face with faults a player would notice, 2 holds up in a close-up.
- Build and hands: 0 misshapen, 1 a person with faults a player would notice, 2 right from every side.
- Materials: 0 clay, plastic or blur, 1 the right kind of surface with flaws, 2 reads as leather, cloth, metal, skin and hair.
- Poses: 0 broken, 1 reads as the move with visible faults, 2 clean.

Benchmark: a character in a shipping fantasy RPG seen from the same distance. Then list every fault you see, worst first, each with where it is on the figure.
```

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/rodin-vs-hi3d-2.webp" alt="Thalbern’s face and chest three ways: Rodin as shipped, Hi3D as made, and Hi3D with the gloss turned down and his face painted on" width="1600" height="1108" />

Rodin scored a 4. Hi3D as it came also scored a 4, but for different reasons. Its outfit and gear match the sheet much more closely, and the studs, buckles and straps are actual things instead of melted lumps. Two free fixes got it to a 5:

- Turn the gloss down on anything that isn’t metal. Hi3D’s leather looked wet.
- Paint the pose sheet’s face back onto the model. Generators repaint the face from memory and it comes back softer.

For the face, the build crops the head off the sheet, makes it bigger and sharper, then lays those pixels back onto the front of the model’s head and fades them out toward the ears:

```prompt Face Upscale Prompt
The attached image is a small, soft crop of a studio photograph: one person's head, seen from directly in front on a grey background. Make one square image that is the SAME photograph of the SAME head at far higher resolution, as if the original had been taken with a much better camera.

Keep everything where it is: the same framing and crop, the head the same size and in the same place, the same face, expression, eyes, brows, nose, mouth, ears, hair and whatever is worn in the hair, the same soft even light, the same grey background. Change no proportion and move no feature.

Add only what a sharper photograph would show: skin texture and pores, freckles, eyelashes, the detail of the irises with a small catch light, the lines of the lips, single hairs. Natural skin, not retouched, not shiny. Mouth closed. No text.
```

One catch: if the model’s nose sits a few millimetres away from the sheet’s, you get two noses. The build finds the tip of the model’s nose and moves the paint to match.

Every judge put the eyes and the hair in its worst three, on both models. Neither generator makes eyes that hold up in a close-up yet.

### Hands Are the Hard Part

Generated hands come out stubby or garbled, and a hand that holds something is worse. At one point I typed “why are you stuck on this?!”

Wollandora carries a staff on her card. The trick that finally gave her real fingers around it was weird. The pose sheet paints her hand closed around a short rod in flat pure blue (#0000ff), a color nothing else on the figure is. The generator models real fingers and a thumb around it, the rig cuts out everything blue, and the staff goes through the hole. It worked, but the figures in the game now go a simpler way. The game puts the staff, sword and bow in their hands.

The other hand matters too. The build lays the fingers around a grip, hangs the empty hand at ease, and never lets an elbow go straight.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/hands.webp" alt="A dwarf fighter’s hands before and after the hand fix" width="1000" height="1200" />

### Borrowed Moves

The clips are borrowed from free libraries and copied onto each figure’s own skeleton. That mostly works, but a clip made for one body does strange things on another. Arms go through faces and shoulders flatten. So the build gives the shoulder and the forearm an extra bone each to share the twist, and for the bow shot and the sword cut it solves the arms to points instead of trusting the clip.

The [sword cut](https://d20adventures.com/settings/realm-of-myr/assets?id=thalbern&clip=Swing) was its own saga. I tried eight different cuts and had them ranked blind. The new swing was lame, and so was the new thrust. The one in the game now just stops where the blow lands instead of finishing in a crouch with the blade in the floor.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/sword-cuts.webp" alt="Three of the eight sword cuts tried on Thalbern, frame by frame" width="1600" height="883" />

### The Asset Library

All of this lives in the [asset library](https://d20adventures.com/settings/realm-of-myr/assets), and it’s live. It has over 150 characters and 34 places from the Realm of Myr. Click a character with a figure and you can turn it around, play its clips and step through them a frame at a time. Places are built right in your browser, and you can fly the camera around with W A S D. Here’s [the owlbear fight in the Valkarr woods](https://d20adventures.com/settings/realm-of-myr/assets?env=valkarr-forest-trail&scene=the-midnight-summons/owlbear-confrontation&view=stage).

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/library.webp" alt="The asset library’s character tab, with the party and the other characters made in 3D" width="1600" height="772" />

With so many tries it got hard to tell which figure was the real one. Thalbern alone had eight. So each character gets one card, and opening it shows the current version, the earlier ones and the trials, with who made the model, who rigged it and when.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/library-versions.webp" alt="Thalbern in the asset library, with his current version, two earlier versions and five trials listed beside the figure" width="1600" height="1035" />

Since the pipeline worked on Thalbern, the characters for Covert Cargo, the next adventure, are already in the library.

### Try It Yourself

I built all of this with Claude Code. If you want to build something like it, hand your coding agent this:

```prompt Agent Prompt
Read asset-library/README.md in https://github.com/johnpolacek/d20adventures.com. It describes a pipeline that turns a painted character card into a rigged, animated 3D figure: a pose sheet from an image model, joints found with MediaPipe, a model from Hi3D v3.0 on fal, a rig from Hyper3D, clips borrowed from free libraries, cleanup in headless Blender, and a blind judge.

Build the smallest version of it for my project. Start with one character and the free steps only: the brief, the pose sheet and the joints. Show me the sheet before anything that costs money runs. Save every paid answer so it is never paid for twice.
```

And if you just want to look around the code:

```prompt Code Tour Prompt
Clone https://github.com/johnpolacek/d20adventures.com and walk me through how asset-library/pipeline/build.ts and pilot.ts make a 3D figure, step by step, with what each step costs.
```

Other stuff that landed this week:

- Sound, with combat cues and night ambience in the Valkarr woods.
- Hiding. Slip into thick growth and watch the owlbear come out.
- A ring on the ground marks whose turn it is.
- Speech is painted into the scene instead of sitting in bubbles.
- Narration is set in Literata, with drop caps.

The whole thing is open source on [Github](https://github.com/johnpolacek/d20adventures.com).

Want to run a game on your own Mac and help shape it? [Become a playtester](/playtest).

[Play The Midnight Summons](https://d20adventures.com)
