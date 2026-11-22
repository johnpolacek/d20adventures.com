---
title: "Iterate Faster on Your Game’s AI Art with an Asset Library"
date: 2026-11-22
description: "How an asset library made iterating on AI-generated characters and places faster: every version on one card, the same pictures every time, a blind judge, and every place built live in the browser."
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/gates-arrival.webp"
draft: true
---

AI art comes in piles. Every new try at a character is another model, another set of textures, another folder. Thalbern, the ranger in [The Midnight Summons](https://d20adventures.com), had eight 3D figures before I could tell you which one was in the game.

So I built an [asset library](https://d20adventures.com/settings/realm-of-myr/assets) for the Realm of Myr, the world all the adventures happen in. It has 13 figures in 3D, 149 characters, 34 places and 226 images, and anyone can open it.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/places.webp" alt="The asset library’s places, grouped by adventure and chapter: the Gates of Kordavos, the Harvest Festival, the Dragonbone Inn, the Old Grand Library, the Silver Serpent Tavern and the Kordavos Docks" width="1120" height="757" />

Places come in the order the story reaches them, a chapter at a time. Click one and it gets built right there in your browser. This is [the Gates of Kordavos](https://d20adventures.com/settings/realm-of-myr/assets?env=kordavos-south-gate&view=iso&scene=welcome-to-kordavos/the-gates-of-kordavos), where Welcome to Kordavos opens:

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/gates-arrival.webp" alt="The Gates of Kordavos from the market square: two red brick towers with blue banners over a portcullis, a crowd and market stalls in front" width="1400" height="757" />

Drag to turn, scroll to zoom, and fly around with W A S D. Each place has the camera views the game uses, plus a few of its own. Here’s the same gate from above:

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/gates-wide.webp" alt="The Gates of Kordavos from high above, the towers, the square full of market stalls and the town’s roofs around it" width="1400" height="757" />

That’s the part that makes iterating fast. A new set or a new look shows up in the place, with the cast standing where the encounter starts. No playing through the adventure to get there.

A few more: [a quiet pier on the Mordava](https://d20adventures.com/settings/realm-of-myr/assets?env=mordava-river-pier&view=iso&scene=covert-cargo/the-shipment) from Covert Cargo, and [the Valkarr woods](https://d20adventures.com/settings/realm-of-myr/assets?env=valkarr-forest-trail&view=iso&scene=the-midnight-summons/owlbear-confrontation) at night, where the owlbear is waiting.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/mordava-pier.webp" alt="A river tug moored at a wooden pier under willows, its cabin windows lit, lanterns reflected in the dark water" width="1400" height="757" />

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/valkarr-woods.webp" alt="The Valkarr woods at night under a full moon, tall trees and ferns, the owlbear standing in the clearing" width="1400" height="757" />

Each character gets one card. The [figures in 3D](https://d20adventures.com/settings/realm-of-myr/assets?tab=characters&only=1) so far, by adventure:

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/figures.webp" alt="Thirteen character cards marked 3D: Branka, Milos and Garlan from Welcome to Kordavos, Thalbern, the Owlbear and Wollandora from The Midnight Summons, and seven from Covert Cargo" width="720" height="555" />

Open one and you get the figure to turn around, every clip it plays, and a list of every version: who made the model, who rigged it, when, and which one is in the game. Here’s [the owlbear](https://d20adventures.com/settings/realm-of-myr/assets?id=owlbear):

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/owlbear-card.webp" alt="The owlbear’s card: the figure on a turntable, its detail levels and clips on the left, and its three versions listed on the right with Hi3D marked In the Game" width="1400" height="757" />

It went through three generators in four days. [Tripo](https://d20adventures.com/settings/realm-of-myr/assets?id=owlbear&v=owlbear) on November 15, [Rodin](https://d20adventures.com/settings/realm-of-myr/assets?id=owlbear&v=owlbear-rodin) on the 17th, and [Hi3D](https://d20adventures.com/settings/realm-of-myr/assets?id=owlbear&v=owlbear-hi3d), the one in the game, on the 19th. All three are still there to compare:

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/owlbear-versions.webp" alt="The owlbear three ways side by side: Tripo’s, Rodin’s and Hi3D’s" width="1380" height="690" />

You can’t tell if a change helped when every screenshot is from a different angle. So the library takes the same fifteen pictures of a figure every time, from points set by the figure’s own height. Front, back, side, the face up close, a bow shot and a sword cut. Here’s Thalbern’s first figure, the new one, and the new one with the gloss turned down and his face painted on:

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/thalbern-before-after.webp" alt="Thalbern’s figure three ways, side by side from the same points: face, three-quarter, front, back and a sword cut" width="1600" height="3536" />

Then a fresh agent scores them, told nothing about what changed. Likeness, face, build and hands, materials and poses, 0 to 2 each, plus every fault it can name. Thalbern went 4, 4, 4, then 5 out of 10, and judges differ by about a point. The list of faults is the useful part. Every judge put the eyes and the hair in its worst three, on both models, so that’s a generator problem, not something another try will fix. The scorecards are [on Github](https://github.com/johnpolacek/d20adventures.com/tree/main/asset-library/scorecards).

Every [painting](https://d20adventures.com/settings/realm-of-myr/assets?tab=images) is in there too: the setting, the adventure covers, 66 pieces of scene art, 61 portraits, 73 set paintings and the maps.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/paintings.webp" alt="The asset library’s images: paintings of the Realm of Myr, Kordavos, the Valkarr Forest and Hammerdeep, and the four adventure covers" width="1120" height="690" />

A sync shows up in the library within a minute, with no deploy, so a link to it always shows the latest. How the figures get made is in [From 2D Art to Rigged Animated 3D Figures](https://d20adventures.com/updates/2d-art-to-3d-rigged-animated-3d-figures).

Go fly around [the asset library](https://d20adventures.com/settings/realm-of-myr/assets).
