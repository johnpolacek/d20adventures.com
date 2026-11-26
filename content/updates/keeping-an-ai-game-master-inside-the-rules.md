---
title: "Trying to Train an AI Game Master on 5E Rules"
date: 2026-11-26
description: "How D20 Adventures splits a game of D&D between Claude as the game master and a 5E rules engine, part by part, and what we’re still figuring out."
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keeping-an-ai-game-master-inside-the-rules/owlbear.webp"
header: /images/updates/keeping-an-ai-game-master-inside-the-rules.webp
draft: true
---

[D20 Adventures](https://d20adventures.com) runs D&D with Claude as the game master with a 5E rules engine. We have an adventure plan file, turn-based encounters, and an open system that encourages an open roleplaying style of play. It is an open source work in progress, all [on Github](https://github.com/johnpolacek/d20adventures.com).

In the [desktop app](https://d20adventures.com/desktop) Claude runs through your own Claude login, and I play on Opus 5.5 at medium effort.

### The Adventure Plan

An adventure is markdown, one file per encounter. Each one names its place, its NPCs and how each behaves, a staged intro, notes for the GM, and exits to the next encounters. There are 4 adventures and 71 encounters so far.

Here’s a trimmed piece of The Owlbear Prowls:

*content/settings/realm-of-myr/adventures/the-midnight-summons/encounters/the-owlbear-prowls.md*

```
npcs:
  - id: "owlbear"
    behavior: "Hunts what it heard on the trail. While Thalbern is hidden from it, it gives its first turn to searching for him..."
## GM Notes
Moving off past it without being noticed is a medium Stealth check, DC 15. If he shows himself, a hard Animal Handling check, DC 20, calms it and it wanders away.
## Transitions
- To [[encounter:meeting-at-the-stones]] when the Owlbear moves on without finding Thalbern...
- To [[encounter:timely-rescue]] when Thalbern falls to 0 hit points: Wollandora appears and drives off the Owlbear.
```

Code reads the structure: who is here, their stat blocks, where they stand. Claude reads the prose: the behavior, the notes, and whether an exit has been met.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keeping-an-ai-game-master-inside-the-rules/owlbear.webp" alt="The owlbear stepping out of the trees into the clearing" width="1440" height="900" />

When to move on is still Claude’s call, and it doesn’t always get it right. One talk with Wollandora took seven turns because an exit fired on a question. So the compiler now warns about exits like that.

### One Turn

Every call to Claude comes back in a fixed shape, never free numbers. Here’s one real turn from a playtest of that encounter:

- Thalbern’s player types “hide in the ferns”.
- Claude reads it as the Hide action. (AI)
- The engine checks for cover, rolls Stealth and keeps the total, 19. (code)
- Claude tells Thalbern sinking into the ferns. (AI)
- The owlbear’s Passive Perception is 15, so it hasn’t noticed him. (code)
- Its behavior says search. Claude picks Search. (AI)
- The engine rolls d20+5 for 13. A miss. (code)
- Next turn it walks off. Claude judges the exit met. (AI)

With a Stealth total of 15, its Passive Perception meets it, and it attacks with no roll at all.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keeping-an-ai-game-master-inside-the-rules/one-turn.webp" alt="One turn in The Owlbear Prowls, eight steps each marked Player, AI or Code, from typing hide in the ferns to Claude judging the exit met" width="1600" height="728" />

Claude can still pick the wrong action, or judge an exit too early. We’re watching for both.

### Open Roleplaying

You can type anything. Most of it rolls nothing: talking, looking around, making a plan. Claude decides whether a move needs a roll at all, and answers “none” when it doesn’t. When it does, it becomes a rule from a fixed menu, and the engine takes over.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keeping-an-ai-game-master-inside-the-rules/gm-thinking.webp" alt="The GM card while Claude writes: The GM, Weighing what you said" width="1152" height="292" />

Claude can still call for a roll that isn’t needed, or skip one that is.

### The Rules as Data

The [SRD 5.2.1](https://www.dndbeyond.com/srd) is typed data in [packages/srd](https://github.com/johnpolacek/d20adventures.com/tree/main/packages/srd): 339 spells, 330 monsters, 258 magic items, 15 conditions and 17 feats. It started from [5e-database](https://github.com/5e-bits/5e-database) and gets checked against [Open5e](https://open5e.com).

Both of those had a bunch of errors. So the official SRD text is in the repo and settles every disagreement.

### Checks

Claude picks the skill and the DC, plus Advantage or Disadvantage when something in the scene clearly helps or hurts. The engine adds the bonus and decides.

To see how Claude rules, there are 211 [check probes](https://github.com/johnpolacek/d20adventures.com/blob/main/apps/desktop/scripts/check-probes.json). Each one is a scene, a player’s line, and the answers that count as right:

*apps/desktop/scripts/check-probes.json*

```json
{
  "narrative": "The owlbear has its head down in a deer carcass, tearing at it, its back to Thalbern. Rain hammers the leaves and drowns every other sound.",
  "action": "I creep past behind it while it feeds.",
  "checks": ["stealth"],
  "dcs": [10, 15],
  "mode": "advantage"
}
```

Claude passes if it picks Stealth, an easy or medium DC, and Advantage from the feeding and the rain. The grade is a plain comparison, with no second model judging.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keeping-an-ai-game-master-inside-the-rules/check-card.webp" alt="A check card: Thalbern, Stealth with Advantage because it’s feeding with its back turned and rain drowns sound, two d20s, roll 10 or higher against DC 15" width="1152" height="754" />

Tools aren’t typed yet, so picking a lock is still a bare Dexterity check.

### Combat

The player only rolls d20s. The engine rolls the damage, and it’s the only thing that changes hit points. Claude never invents a number.

NPCs show a wound word, never a number: Unhurt, Hurt, Bloodied or Dead.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keeping-an-ai-game-master-inside-the-rules/attack-roll.webp" alt="An attack roll card: Lyra’s Fire Bolt at the Owlbear, roll 8 or higher to hit against AC 13" width="1046" height="586" />

Blinded and Deafened failing sight and hearing checks is still left to Claude.

### Spells

Real spell slots and concentration. Every one of the 339 spells is one of three kinds:

- Run, 80: the engine resolves it, like Fire Bolt or Fireball.
- Partly run, 88: the engine does what its rules hold, like Sleep.
- Told, 171: the engine checks the cast and spends the slot, Claude tells it.

Speak with Animals is a told spell. Claude suggested my ranger cast it on an owlbear. Owlbears aren’t Beasts. So the spell did nothing, it cost Thalbern one of his two slots, and then the owlbear hit him for 15 and knocked him out.

> why is it even suggesting it? the ranger should be presented with actions that work for his or her class for that encounter

That’s how it works in Baldur’s Gate 3, which is the bar. Now before Claude suggests anything, the engine checks the hero’s spells against the creatures in the scene and tells Claude which have no valid target. I ran the suggestions on that scene 4 times. None of the 12 used Speak with Animals.

If you type it yourself anyway, the reply card holds it first.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keeping-an-ai-game-master-inside-the-rules/speak-with-animals.webp" alt="The reply card holding a Speak with Animals cast, with Edit Reply and Send Anyway buttons" width="734" height="489" />

Half the spells are still told. The ones that change a fight are next.

### Hiding and Cover

Thalbern hid in the ferns, and the owlbear wandered off without ever rolling. Claude made that call from the encounter notes, because the engine had no rule for finding anyone.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keeping-an-ai-game-master-inside-the-rules/thalbern-ferns.webp" alt="Thalbern crouched low in the ferns at night" width="1440" height="900" />

> should the owlbear be able to make a check after thalbern passed his check or is that like double jeapardy?

Claude Code suggested a gentler house rule. I went with full book rules, to be like BG3. That’s the turn above.

Full rules also meant you need somewhere to hide.

> Then I was expecting him to move or actually hide or something but he still just stands in the middle of the clearing.

There’s no grid. Positions are in feet, read from the 3D sets, with cover from their solid things. Now typing “hide” walks you to thick growth or cover, out of every enemy’s sight. With none in reach there’s no roll, and the story says “No Cover”.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keeping-an-ai-game-master-inside-the-rules/thalbern-hidden.webp" alt="Thalbern down on one knee on the forest trail in the hidden pose" width="1500" height="937" />

Book rules cost something: 23 of 70 encounters refuse a Hide from the starting spot. Hide doesn’t account for light yet, and there’s no elevation.

### Reactions

A reaction is something a hero does on someone else’s turn, like an Opportunity Attack or casting Shield. At a table the DM just asks you. Here the game asks too, but in a party game the others are waiting, so nothing ever blocks. The round waits 20 seconds, then follows the hero’s standing order.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keeping-an-ai-game-master-inside-the-rules/reaction.webp" alt="A reaction offer: Lyra may take an Opportunity Attack, with a countdown bar, Let It Pass and Take It" width="1046" height="370" />

The default orders take every Opportunity Attack and cast Shield when it turns a hit into a miss. NPCs react by the same orders, with no wait.

### Still Figuring It Out

The biggest open questions:

- When a scene should move on.
- Half the spells are still Claude’s to tell.
- How well Claude reads prose into rules beyond the 211 probes.

Where the line goes between Claude and code is based on feel, and it gets better every time we improve it.

Play [The Midnight Summons](https://d20adventures.com/settings/realm-of-myr/the-midnight-summons), owlbear and all, in the [desktop app](https://d20adventures.com/desktop), and tell me where the GM broke the rules. The [Vision](https://d20adventures.com/vision) page tracks how far along each part is, and all of it is [on Github](https://github.com/johnpolacek/d20adventures.com).
