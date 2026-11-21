---
title: "Real Figures on the Stage"
date: 2026-11-20
description: "How Thalbern, Wollandora and the owlbear went from painted cards to rigged 3D figures, and the asset library that tracks every try."
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage.webp"
draft: true
---

Until this week, everyone in [The Midnight Summons](https://d20adventures.com) was a painted card standing in a 3D forest. They looked fine until anything had to move. Now [Thalbern](https://d20adventures.com/settings/realm-of-myr/assets?id=thalbern) walks into the scene, draws his bow and swings a sword, and [the owlbear](https://d20adventures.com/settings/realm-of-myr/assets?id=owlbear) comes crashing out of the trees.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/woods.webp" alt="Thalbern standing on a trail in the moonlit Valkarr woods" width="1600" height="900" />

Every figure starts the same way. I write a short brief for the character, an image model paints a pose sheet from it, and a pose model finds the joints. All of that is free. Then the front and back of the sheet go to a 3D generator, and that is the step that costs money.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/pose-sheet.webp" alt="Thalbern's pose sheet, standing with arms out and hands open" width="900" height="1200" />

The sheet decides the model. Arms away from the body, hands empty and open, the face lit. If the sheet is wrong it gets painted again for nothing. If the model is wrong it's another few dollars.

I didn't know which generator to use, so I tried a bunch of them on Thalbern. Tripo first, then Rodin, then Rodin's model rigged by Meshy with Meshy's moves, then Hyper3D's shell skinning (which was far worse), and finally Hi3D. The animations come from free libraries, mostly [Quaternius](https://quaternius.com) and [Mesh2Motion](https://mesh2motion.org), copied onto each figure's skeleton.

To keep myself honest, every round gets judged blind. A fresh agent is shown the character's card, the pose sheet and fifteen pictures of the figure, and told nothing about what changed. It scores likeness, face, build and hands, materials and poses, out of 10.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/rodin-vs-hi3d-2.webp" alt="Thalbern's face and chest three ways: Rodin as shipped, Hi3D as made, and Hi3D with the gloss turned down and his face painted on" width="1600" height="1108" />

Rodin scored a 4. Hi3D as it came also scored a 4, but for different reasons. Its outfit and gear match the sheet much more closely, and the studs, buckles and straps are actual things instead of melted lumps. Its leather looked wet, so the build now turns the gloss down on anything that isn't metal, and it paints the sheet's face back onto the model. That got it to a 5.

Every judge put the eyes and the hair in its worst three, on both models. Neither generator makes eyes that hold up in a close-up. Still a work in progress.

Hands were the hard part. Generated hands come out stubby or garbled, and a hand that holds something is worse. Wollandora carries a staff on her card, and her first figure didn't. The fix that finally worked was weird. The pose sheet paints her hand closed around a short rod in flat pure blue, a color nothing else on a figure is. The generator models real fingers around it, the rig cuts out everything blue, and the staff goes through the hole. It worked, but the figures in the game now go a simpler way. The game puts the staff, sword and bow in their hands.

It took a while to get there. At one point I typed "why are you stuck on this?!"

The other hand matters too. The build now lays the fingers around a grip, hangs the empty hand at ease, and never lets an elbow go straight.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/hands.webp" alt="A dwarf fighter's hands before and after the hand fix" width="1000" height="1200" />

The [sword cut](https://d20adventures.com/settings/realm-of-myr/assets?id=thalbern&clip=Swing) was its own saga. I tried eight different cuts and had them ranked blind too. The new swing was lame, and so was the new thrust. The one in the game now stops where the blow lands instead of finishing in a crouch with the blade in the floor.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/sword-cuts.webp" alt="Three of the eight sword cuts tried on Thalbern, frame by frame" width="1600" height="883" />

All of this lives in the [asset library](https://d20adventures.com/settings/realm-of-myr/assets), and it's live. It has over 150 characters and 34 places from the Realm of Myr. Click a character with a figure and you can turn it around, play its clips and step through them a frame at a time. Places are built right in your browser, and you can fly the camera around with W A S D. Here's [the owlbear fight in the Valkarr woods](https://d20adventures.com/settings/realm-of-myr/assets?env=valkarr-forest-trail&scene=the-midnight-summons/owlbear-confrontation&view=stage).

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/library.webp" alt="The asset library's character tab, with the party and the other characters made in 3D" width="1600" height="772" />

With so many tries, it got hard to tell which figure was the real one. Thalbern alone had eight. So each character now gets one card, and opening it shows the current version, the earlier ones and the trials, with who made the model, who rigged it and when.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/real-figures-on-the-stage/library-versions.webp" alt="Thalbern in the asset library, with his current version, two earlier versions and five trials listed beside the figure" width="1600" height="1035" />

Thalbern and the owlbear in the game are Hi3D's. Wollandora is still Rodin's. A figure now costs $2.30 and about fifteen minutes, most of it waiting. Since that worked, the characters for Covert Cargo, the next adventure, are already in the library.

Other stuff that landed this week:

- Sound, with combat cues and night ambience in the Valkarr woods.
- Hiding. Slip into thick growth and watch the owlbear come out.
- A ring on the ground marks whose turn it is.
- Speech is painted into the scene instead of sitting in bubbles.
- Narration is set in Literata, with drop caps.

242 commits since last Friday. The whole thing is open source on [Github](https://github.com/johnpolacek/d20adventures.com).

[Play The Midnight Summons](https://d20adventures.com)
