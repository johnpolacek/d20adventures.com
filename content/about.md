---
title: About
description: The story of D20 Adventures, an open source 5E RPG with an AI Game Master, and how to play, host or create your own adventures.
image: /stage/realm/realm-of-myr/realm.jpg
---

D20 Adventures is a fantasy 5E-rules-based RPG, inspired by Baldur's Gate 3. It is open source, self-hosted and free. 

Beyond that, I want it to be a platform for people to create their own adventures. Anyone can send a prompt their own agent to build an adventure plan, populated with characters, settings, encounters, maps and 3D assets.

![The Realm of Myr, a river town and its cathedral at sunrise, below the mountains.](/stage/realm/realm-of-myr/realm.jpg)

I started working on D20 Adventures in January 2024. The original concept was a narrative-based rpg for play-by-post adventures with light rules (just roll a D20). I actually finished it and had a completely working version. It was a fun project but it wasn't super fun to play when compared to something like Baldur's Gate 3.

![The narrative version: City of Shadows, with the party in turn order and a halfling who needs to roll.](/stage/gates/narrative.webp)

### What do we really want? 

As a creator, I want to be able to craft my own adventures then play them out with a group of friends and family, like Baldur's Gate 3 as a platform. Maybe someday a huge game studio will be able to create something like that for us.

Then Anthropic released Fable, and everything changed. 

I saw indie devs one-shotting games with gorgeous 3D graphics. I tried my own graphics tests for the opening scene of my main adventure, the Gates of Kordavos.

![The reference painting for every test: the great gate of Kordavos, its towers above a crowded market.](/stage/gates/reference.webp)

### Early Attempts

**A Tabletop Gate.** March 11, 2026. GPT-5.4.

![Two stone towers on a tabletop, with market stalls and pawns for the crowd.](/stage/gates/tabletop.webp)

**A Gate of Real Models.** August 27, 2026. Fable 5.

![A stone gate arch in a city wall, timber houses, and a queue of figures waiting.](/stage/gates/models.webp)

### The Fable Difference

September 1, 2026. Made with Fable 5.1. Drag to look around, scroll to zoom, and move with W-A-S-D. [Explore the 3D Environment](/stage/gates/1.html)

![The first try: a warm, close gate with a queue, a covered wagon and the checkpoint.](/stage/gates/1.webp)

### Then Came Astra

September 5, 2026. Made with Codex, running GPT-6 Astra. [Explore the 3D Environment](/stage/gates/3.html)

![The forecourt: a roped queue, wagons and horses before the closed gate.](/stage/gates/3.webp)

### Finally Opus 5.5

September 29, 2026. Made with Claude Opus 5.5. [Explore the 3D Environment](/stage/gates/6.html?closeup=standee)

![The same gate, with painted cards for the heroes and the crowd.](/stage/gates/6.webp)

Painted cards for the heroes and the crowd. This one became the prototype for the stage in the game.

### Where We Are Now

That Opus prototype grew into the stage the game plays on today. The camera picks a shot for each turn, a narrator reads the story aloud, and the heroes and monsters are turning into rigged 3D figures. There’s sound too, footsteps that match the floor and an Owlbear that growls.

The rules are real 5E now, with attacks, spells, conditions and hiding all work by the book, and the GM has to follow them.

There are four adventures so far, all set in the Realm of Myr. Welcome to Kordavos is the big one, 49 encounters. The other three are short intro adventures, each one leading into the next and on to Kordavos.

**The Midnight Summons.** A short solo intro. A ranger heads into the Valkarr forest to answer a druid’s call. Fully ready.

![The Owlbear looms out of the dark of the Valkarr forest.](/stage/art/the-midnight-summons/owlbear-confrontation.webp)

**Covert Cargo.** A short intro for three players. A secret shipment on a river boat bound for Kordavos. Every character is in 3D, and it’s next up for testing.

![A river boat with lit windows moored at a pier on a quiet fork of the Mordava.](/stage/art/covert-cargo/the-shipment.webp)

**The Road to Kordavos.** A short intro where you make your own hero and meet travelers on the road. This one waits on the hero creator, which is being rebuilt on the new rules.

![A traveler with a white beard rides a horse through the pines, a pack horse behind.](/stage/art/the-road-to-kordavos/well-met.webp)

**Welcome to Kordavos.** The main adventure, for three to five players. The party arrives at the Gates of Kordavos during the Harvest Festival, and the city pulls them in from there. Every scene is built, but most of its 111 characters are still painted standees.

![The great gate of Kordavos over a crowded market of bright awnings.](/stage/art/welcome-to-kordavos/the-gates-of-kordavos.webp)

You can play [The Midnight Summons](/), a short demo solo adventure without having to download anything. The other adventures run in the [desktop app](https://github.com/johnpolacek/d20adventures.com/releases/latest), where the Game Master is Claude or Codex running on your own machine. The host sends an invite link, and friends join from their browser with a premade hero or one of their own.

The easiest way to get started is to let your AI help. Paste these into Claude Code or Codex.

To learn what D20 Adventures is and how it works:

```prompt Learn
Tell me about D20 Adventures and explain how it works.

Read https://d20adventures.com/about and the README at https://github.com/johnpolacek/d20adventures.com. Explain what the game is, how the AI Game Master runs it, what adventures there are, and how playing solo differs from playing with friends. Then answer my questions.
```

To run an adventure on your own computer, solo or with friends:

```prompt Play
Help me run an adventure in D20 Adventures on this computer.

Follow https://d20adventures.com/host.md. Fetch the raw file so you read all of it. First ask whether I want to play solo or host friends who join from their browser.
```


### The 3D Asset Pipeline

Until this month, every character was a flat painted standee. Now they come out of a pipeline. A short brief, a painted pose sheet front and back, a model from Hi3D, a rig from Hyper3D, free animation clips, then a cleanup pass in headless Blender. About $2.30 and fifteen minutes a figure, most of it waiting.

I wrote up the whole thing, every prompt included: [Turn Your Character Art into Animated 3D Figures with Hi3D and Blender](/updates/turn-your-character-art-into-animated-3d-figures-with-hi3d-and-blender).

Every character, place and 3D figure lives in the [asset library](/settings/realm-of-myr/assets). Each figure has one card with every version of it, and you can open any place and fly around it.

[![The asset library’s character cards marked 3D, grouped by adventure.](https://d20-public.s3.us-east-1.amazonaws.com/images/updates/asset-library/figures.webp)](/settings/realm-of-myr/assets)

### Making Your Own Adventures

We're not quite there yet. Right now an adventure is a folder of markdown files in the [repo on Github](https://github.com/johnpolacek/d20adventures.com), its story, encounters, characters and maps. 

The way I am creating the adventure data and assets is still changing. Once I have a functioning big adventure, with roleplaying, combat, spells and a fully realized plot, I'll be able to set up a process so other people can do the same, then publish to the site for others to play.

Still in alpha, with plenty to build and fix. Check out the latest [gameplay clips](/updates), or [become a playtester](/playtest) and try it yourself!
