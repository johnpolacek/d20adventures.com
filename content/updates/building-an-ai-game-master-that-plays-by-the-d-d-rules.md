---
title: "Building an AI Game Master That Plays by the D&D Rules"
date: 2026-11-25
description: "How D20 Adventures keeps an AI game master inside the D&D rules: what the model decides, what an SRD 5.2.1 rules engine checks, and three playtests where they drifted apart."
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/updates/building-an-ai-game-master-that-plays-by-the-d-d-rules/owlbear-enters-clearing.webp"
draft: true
---

<!--
Still missing:
- A clip of Thalbern walking into the ferns and dropping to one knee, then the Owlbear walking in. Record it from /dev/stage-play?step=1 through 7 (dev server running), or from a new Midnight Summons game in the desktop app, typing "hide".
- A screenshot of the Owlbear's Search roll card, "Thalbern is hidden" or "Thalbern is found". Play The Owlbear Prowls in the desktop app until its first turn.
- A screenshot of a "No Cover" story entry. Type "hide" in the open square of Clan Conflict.
- A before and after of the Wollandora conversation at the stones: the old save had 7 turns, a new game should show the talk in fewer. Needs a fresh playthrough in the desktop app.
- The owlbear-enters-clearing.webp file shows the Owlbear walking into the clearing, not searching. Rename it if that matters.
-->

My AI game master told my ranger to cast Speak with Animals on an owlbear. Owlbears aren’t Beasts.

[D20 Adventures](https://d20adventures.com) is a D&D game where an AI runs the table. On the website, turns run on Gemini 3.5 Flash-Lite, since it’s fast and cheap. In the desktop app, it runs on whatever AI CLI you have, and I play with Claude Opus 5.5 at medium effort. Either way the model tells the story, and a rules engine built on [SRD 5.2.1](https://www.dndbeyond.com/srd) decides what actually happens: rolls, damage, spell slots, conditions.

Most of the work is deciding which parts the model gets to decide and which parts the engine checks. Here are three playtests where the two drifted apart.

### The Impossible Spell

I was playing [The Midnight Summons](https://d20adventures.com/settings/realm-of-myr/the-midnight-summons) as Thalbern, a ranger. The owlbear showed up and the game suggested Speak with Animals. I tried it:

> i tried to do speak with animals as thalbern there was no dice roll and seemingly no effect (just ignored)

The engine actually got it right. Speak with Animals works on Beasts, and an owlbear is a Monstrosity. So the spell did nothing, it cost 1 of Thalbern’s 2 spell slots, and then the owlbear hit him for 15 damage and knocked him out. The only explanation was buried in the story: “The owlbear’s squawk stays raw noise, with no meaning behind it for the spell to catch.”

The agent offered to add a warning before casting. My question was a different one:

> why is it even suggesting it? the ranger should be presented with actions that work for his or her class for that encounter

Turns out the engine already knew creature types and which spells only work on Beasts or Humanoids. It just only checked after the cast. The model writing suggestions never saw any of it.

So now the engine checks first. Before the model picks suggestions, the game compares the hero’s spells against who is in the scene and hands the prompt a plain line: “Speak with Animals works only on Beasts, and none is here.” It covers 7 spells, Speak with Animals, Animal Friendship, Animal Messenger and Dominate Beast for Beasts, and Charm Person, Hold Person and Dominate Person for Humanoids. Put a wolf in the scene and Speak with Animals comes back. AI-controlled companions get the same line, so they don’t waste slots either. The check is [about 40 lines](https://github.com/johnpolacek/d20adventures.com/blob/main/packages/gm-core/src/sheet/creature-gated-spells.ts).

A player can still type the spell themselves, so the reply card catches that too. It holds the reply and asks, with no AI call, so it shows up instantly:

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/building-an-ai-game-master-that-plays-by-the-d-d-rules/spell-warning.webp" alt="The reply card holding “Thalbern casts Speak with Animals and murmurs to the owlbear” with a note that Speak with Animals works only on Beasts, and Edit Reply and Send Anyway buttons" width="734" height="489" />

Running the real suggestions on that owlbear scene 4 times, none of the 12 suggestions used Speak with Animals. They were ranger moves: back away, take cover, shoot, climb a tree.

### The Owlbear Never Rolled

A couple days before that, on the trail to the stones, I had Thalbern hide in the ferns.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/building-an-ai-game-master-that-plays-by-the-d-d-rules/thalbern-hidden-in-ferns.webp" alt="Thalbern, a ranger, crouched in the ferns on a dark forest trail" width="1440" height="900" />

My Hide roll was a 10 on the die, +5, for 15 against DC 15. Just made it. Then the owlbear sniffed around for two turns and walked off. Nice, but did it ever actually try to find me? I asked, and the answer was no. The only roll in the whole scene was mine. The engine only knew one way to stop being hidden, your own attack or spell. So the model just decided the owlbear left, because the encounter notes said it moves on “if nothing gives him away”.

That raised a real D&D question for me:

> should the owlbear be able to make a check after thalbern passed his check or is that like double jeapardy?

It isn’t, by the rules. Your Stealth total is the number a searcher has to beat. The owlbear rolls d20+5 to beat 15, about 55% per search, and two searches would find you 80% of the time. The agent recommended a gentler house rule, one visible search, and another only if you make noise. It flagged that full book rules, with Passive Perception, would have spotted my bare 15 at once. I went with “b full book rules”.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/building-an-ai-game-master-that-plays-by-the-d-d-rules/owlbear-enters-clearing.webp" alt="The Owlbear stepping out of the trees into a moonlit clearing" width="1440" height="900" />

So the [finding rules](https://github.com/johnpolacek/d20adventures.com/blob/main/packages/gm-core/src/sheet/hiding.ts) are the engine’s now, for every creature, heroes and enemies alike. A Hide keeps its Stealth total. An enemy whose Passive Perception meets it notices you with no roll. Otherwise it can spend its turn on a Search, a Perception check with its own roll card. Making noise louder than a whisper gives you away. The owlbear isn’t told where a hidden hero is standing, so it can’t walk straight to him by accident.

Full book rules also meant you need something to hide behind. You can only hide in thick growth, like those ferns, or behind cover at least half your height, out of every enemy’s sight. With none in reach, there’s no roll and the story says “No Cover”. 23 of 70 encounters refuse a Hide from the hero’s starting spot if every NPC is watching.

The headless plays showed it working. A Hide of 15 was noticed the moment the owlbear arrived. A 16 got searched four times, three misses and one natural 20 that found him. A 19 was searched, missed, and the owlbear left.

### Seven Turns for One Talk

The last one wasn’t a rule, it was pacing:

> playing through midnight summons there were too many steps and text for simple things. how can we avoid and improve for all adventures going forward

The save had 7 turns, 6 replies and about 1,330 words for one fight and one talk. Only 2 replies were real choices: the owlbear, and saying yes to the quest. The talk with Wollandora was split across three encounters, so asking “what do the relics look like?” cost a whole turn just to move scenes. She also said “Listen closely, and I will tell you.” instead of telling me, then asked if I would take the task after I had already said yes.

The fixes went in for every adventure, not just this one. The Missing Relics folded into Meeting at the Stones, so Wollandora answers where she’s asked. The adventure compiler now warns when a scene change fires on a question, since a question should be answered in the scene and a scene change should come from a decision. NPCs answer now instead of promising to, and never re-ask something already answered, even when the script says to. When a hero agrees and asks in the same reply, the agreement decides where the story goes. When a turn ends on an NPC’s question, the GM adds no closing narration, since the player is up next anyway.

Those are prompt changes, so I still need a fresh playthrough to see the talk get shorter.

You can play The Midnight Summons at [d20adventures.com](https://d20adventures.com), and the whole engine is [on GitHub](https://github.com/johnpolacek/d20adventures.com).
