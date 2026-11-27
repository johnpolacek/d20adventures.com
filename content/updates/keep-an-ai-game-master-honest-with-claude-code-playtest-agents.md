---
title: "Keep an AI Game Master Honest with Claude Code Playtest Agents"
date: 2026-11-27
description: "D20 Adventures uses an agent loop in Claude Code to catch an AI game master going off script: subagents play the heroes, another agent judges each round, and each fix gets tested along the way."
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keep-an-ai-game-master-honest-with-claude-code-playtest-agents/final-confrontation.webp"
header: /images/updates/keep-an-ai-game-master-honest-with-claude-code-playtest-agents.webp
---

<!-- Pictures not made: a terminal capture of a probe and the agents' progress bars (shown as code and a table instead), Silverhand before and after (no saved probe transcripts), the drake story card and Vesk's stall (need the desktop app, which was off limits, and Vesk has no portrait or figure yet), the Covert Cargo tug sight line (item cut for length) and the owlbear sneak on the stage (the probe itself instead). -->

An AI game master in [D20 Adventures](https://d20adventures.com) breaks in ways a real DM at a table would catch right away. A dead NPC chimes in, a character who’s supposed to stay silent starts talking, or a player claims a dragon is on the roof and the GM just buys it.

So I have Claude Code agents playtest the game for me. Subagents play the heroes, a fresh Claude session judges every round against the encounter notes, and every fix turns into something we can test. (The 5E rules engine itself has [its own post](https://d20adventures.com/updates/training-an-ai-game-master-on-5e-rules).)

### A Headless Playtest

To test one encounter without playing a whole adventure, I run a [scene probe](https://github.com/johnpolacek/d20adventures.com/blob/main/apps/desktop/scripts/scene-probe.ts). A script starts a fresh game right at that scene, copies the last few turns from a real save for context, feeds the player’s hero scripted replies that push on the scene’s exits, and rolls the dice. Claude plays the GM, every NPC, and the rest of the party.

Once a run finishes, a separate Claude session judges each round against the encounter as written:

*apps/desktop/scripts/scene-judge.ts*

```ts
verdict: z.enum(["on", "off"]),
findings: z.array(z.object({
  kind: z.enum(["invented-exit", "against-notes"]),
  quote: z.string(),
  pushedBy: z.enum(["gm", "player", "ai-hero"]),
  why: z.string(),
})),
contentGap: z.string().nullable(),
```

The judge is a model too, so it gets an improvement loop just like the GM. When it flags something that wasn’t wrong, the judge gets the fix, and the saved rounds get judged again.

### Agents in Parallel

I had Claude Code run probes across all of [Welcome to Kordavos](https://d20adventures.com/settings/realm-of-myr/welcome-to-kordavos):

> use agents to do playtesting loops and agents to fix all in parallel. watch for system performance degradation though and don’t use all the system memory

Four agents each took an act, touching only their own act’s files so they wouldn’t step on each other, while a fifth worked on the GM code. We capped it at four probes running at once (`--runs 1 --jobs 2`, judging two rounds in parallel per probe) with a memory watchdog set to pause if free memory dropped below 22%. It never dipped under 30%.

Here’s what the baseline probes flagged as off-script rounds:

| Act | Off-script rounds per probe |
|---|---|
| 1 | 1/18, 2/14, 3/16 |
| 2 | 1/13, 1/11, 3/13 |
| 3 | 2/11, 1/12, 2/11 |

### NPCs Who Should Be Silent

Claude kept making characters talk when the notes said they shouldn’t. At the end of one round, the GM gave a line to an NPC that was dead. Another NPC whose notes say he “says nothing”, talks anyway.

Burying those rules inside prose notes wasn’t enough, so we put them right in the encounter frontmatter: `silent: true` for NPCs who never speak, and a `limits` list for hard constraints:

*content/settings/realm-of-myr/adventures/welcome-to-kordavos/encounters/a-relic-of-old-valkara.md*

```yaml
- id: "silverhand"
  silent: true
  behavior: "Watches from behind his representative and lets him bid. His stare warns off rivals."
```

*content/settings/realm-of-myr/adventures/welcome-to-kordavos/encounters/arrival-at-the-docks.md*

```yaml
- id: "loric-windrider"
  side: "none"
  behavior: "Gruff but fair. He’s a hard worker and expects the same from others. Deeply loyal to his friends."
  limits:
    - "Never sends the party away from the docks or toward the Lower Districts."
```

Now [code](https://github.com/johnpolacek/d20adventures.com/blob/main/packages/gm-core/src/story/clean.ts) enforces silence directly: any spoken line given to a `silent` NPC gets dropped, and dead characters can’t get spoken lines either. [The limits helper](https://github.com/johnpolacek/d20adventures.com/blob/main/packages/gm-core/src/story/limits.ts) passes each NPC’s `limits` straight into its turn, roll outcomes, and round ends. Silence is guaranteed in code now, though behavioral `limits` still rely on Claude following the prompt.

### The GM Believing the Player

In one playtest, a player wrote an action that a forest drake was up on a roof when it never was, and the GM just went along with it. In another, Mara the urchin’s theft is supposed to always succeed unless a hero spots her, yet the GM rolled for her anyway and she failed.

Two prompt rules took care of both:

*packages/gm-core/src/services/adventure-roll-result-service.ts*

```
A position, state or fact the player's action assumes, such as where someone is, holds only if the story shows it.
```

*packages/gm-core/src/services/roll-requirement-service.ts*

```
When the encounter instructions say what this NPC does here always happens or works, or that only a hero's check or choice can stop it, choose no roll: the NPC does not roll against an outcome the notes fix.
```

### Give a Background NPC a Sheet

In the Black Market, the GM kept turning Grendar (a different merchant there) into the oily vendor selling stolen elven goods, because that vendor wasn’t in the cast. Now he’s [Vesk the Fence](https://github.com/johnpolacek/d20adventures.com/blob/main/content/settings/realm-of-myr/npcs/vesk-the-fence.md), with his own sheet and a line in the scene’s cast:

*content/settings/realm-of-myr/adventures/welcome-to-kordavos/encounters/labyrinthine-stalls.md*

```yaml
- id: "vesk-the-fence"
  behavior: "The oily vendor of the stolen elven goods, at a shadowy corner stall..."
  limits:
    - "Never seen or heard before a hero passes the Perception check that finds the stall."
```

### Every Seat, Start to Finish

We also had an agent play the whole adventure start to finish as a hosted game: two players running two heroes each, plus Thalbern on AI. The playthrough ran 67 rounds across 33 encounters and took about six hours.

Playing it all the way through turned up bugs no single-scene probe would hit, like an old roll result carrying over into the next round. The agent’s own test script even messed up once and sent one hero’s reply under another hero’s name, so it caught that and added a check for it too.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keep-an-ai-game-master-honest-with-claude-code-playtest-agents/final-confrontation.webp" alt="Final Confrontation at round 65: Joran bound before the altar, the party portraits along the top, the city map in the corner and Adventure complete" width="1372" height="870" />

### Replace a Failed Session

At round 26 of that playthrough, every GM turn started failing with “Check its sign-in or usage limit.” The host was stuck on a broken Claude session. Now when a session fails, [the host replaces it](https://github.com/johnpolacek/d20adventures.com/blob/main/apps/desktop/runtime/llm.ts) and retries the request. The last 40 rounds finished with no GM failures.

Weeks later, that same error popped back up on [Covert Cargo](https://d20adventures.com/settings/realm-of-myr/covert-cargo).

> i don’t see any usage limit.

Turns out it wasn’t a usage limit at all. The CLI was failing its startup check in under a second, and each retry was waiting out a 2-minute timeout. Now the error shows the real reason:

*apps/desktop/runtime/llm.ts*

```ts
if (attempt > 0) throw new Error(`${provider} could not finish this request${reason}. Check its sign-in or usage limit, then retry.`)
```

### One Map for the Whole City

The GM also kept making up directions around the city. So agents pulled 463 spatial claims out of the adventure files, I ruled on the conflicts, and now every landmark in the city layout cites its source lines. Each scene hands the GM where it sits, what’s nearby, and where every exit leads.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keep-an-ai-game-master-honest-with-claude-code-playtest-agents/city-map.webp" alt="The in-game map of the Asterian Quarter, with the Blackthorn Mansion, the Drain Grate and the underground route to the Forgotten Temple" width="1372" height="870" />

### Rerun on the Last Commit

We also have a [check probe](https://github.com/johnpolacek/d20adventures.com/blob/main/apps/desktop/scripts/check-probes.json) where Thalbern tries to sneak past the owlbear and we grade the check Claude picks. Right after new rules code went in, it failed 5 out of 5 runs. Rerunning it on the previous commit failed the exact same way with an identical prompt, so the new code wasn’t the cause. The probe’s scene text never actually showed Thalbern hidden, so the fix went there:

*apps/desktop/scripts/check-probes.json*

```json
"narrative": "Thalbern is quicker than the beast. Before its eyes find him he has dropped behind a bank of brambles, hidden from it."
```

### Human Playtesting

Would you like to try the game and help with playtesting? You can [become a playtester](https://d20adventures.com/playtest) and host a game for friends with the same setup the agents played, all at [d20adventures.com](https://d20adventures.com). The code and playtest scripts are [on Github](https://github.com/johnpolacek/d20adventures.com).
