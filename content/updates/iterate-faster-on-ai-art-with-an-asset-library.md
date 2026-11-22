---
title: "Iterate Faster on Your Game’s AI Art with an Asset Library"
date: 2026-11-22
description: "How an asset library made iterating on AI-generated characters and places faster: the same pictures every time, a blind judge, and one card for every version."
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/library.webp"
draft: true
---

AI art comes in piles. Every new try at a character is another model, another set of textures, another folder. Thalbern, the ranger in [The Midnight Summons](https://d20adventures.com), had eight 3D figures before I could tell you which one was in the game.

So I built an [asset library](https://d20adventures.com/settings/realm-of-myr/assets). Every character, painting and place in the Realm of Myr is on one page, over 150 characters and 34 places, with the places in the order the story reaches them.

You can’t tell if a change helped when every screenshot is from a different angle. So the library takes the same fifteen pictures of a figure every time, from the same points, set from the figure’s own height. Front, back, side, the face up close, a bow shot and a sword cut.

Here’s Thalbern three ways: the model that shipped first, a new one from a different generator, and the new one with the gloss turned down and his face painted on.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/thalbern-before-after.webp" alt="Thalbern’s figure three ways, side by side from the same points: face, three-quarter, front, back and a sword cut" width="1600" height="3536" />

Then a fresh agent scores the pictures, told nothing about what changed. It scores likeness, face, build and hands, materials and poses, 0 to 2 each, and names every fault it sees.

Thalbern went 4, 4, 4, then 5 out of 10. Judges differ by about a point, so that’s not much. The useful part is the list of faults. Every judge put the eyes and the hair in its worst three, on both models. Neither generator makes eyes or hair that hold up close, so that’s not something more tries will fix.

The places get the same treatment. The city gates in isometric went from 3 to 5 on the wide view and 5 to 6 up close, judged against games like Baldur’s Gate 3. The scorecards are all [on Github](https://github.com/johnpolacek/d20adventures.com/tree/main/asset-library/scorecards).

Each character gets one card. Open it and you see the current version, the earlier ones and the trials, with who made the model, who rigged it and when. Here’s [Thalbern](https://d20adventures.com/settings/realm-of-myr/assets?id=thalbern).

Places are built right in the browser. Switch between the game’s stage and an isometric look, and fly the camera around with W A S D.

A sync uploads what changed and the library shows it within a minute, no deploy. So a link to the library always shows the latest.

The figures themselves are in [From 2D Art to Rigged Animated 3D Figures](https://d20adventures.com/updates/2d-art-to-3d-rigged-animated-3d-figures). Everything else is in the [asset library](https://d20adventures.com/settings/realm-of-myr/assets).
