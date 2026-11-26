---
title: "Keep an AI Game Master Honest with Claude Code Playtest Agents"
date: 2026-11-26
description: "The loop D20 Adventures uses to catch an AI game master going off script: Claude Code agents play every seat, a second Claude judges each round, and each fix is a rule we can test."
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keep-an-ai-game-master-honest-with-claude-code-playtest-agents/final-confrontation.webp"
header: /images/updates/keep-an-ai-game-master-honest-with-claude-code-playtest-agents.webp
draft: true
---

<!-- Pictures not made: a terminal capture of a probe and the agents' progress bars (shown as code and a table instead), Silverhand before and after (no saved probe transcripts), the drake story card and Vesk's stall (need the desktop app, which was off limits, and Vesk has no portrait or figure yet), the Covert Cargo tug sight line (item cut for length) and the owlbear sneak on the stage (the probe itself instead). -->

An AI game master breaks in ways a person at the table would catch at once. A dead NPC speaks. A silent one talks. A player says the drake is on the roof, and the GM believes it.

So Claude Code agents play [D20 Adventures](https://d20adventures.com), a second Claude judges every round, and each fix becomes a rule we can test. The rules engine has [its own post](https://d20adventures.com/updates/training-an-ai-game-master-on-5e-rules).

### A Headless Playtest

A [scene probe](https://github.com/johnpolacek/d20adventures.com/blob/main/apps/desktop/scripts/scene-probe.ts) starts a fresh game at one encounter. Code copies the last turns from a real save, feeds the player’s hero scripted replies that push at the scene’s exits, and rolls the dice. Claude plays the GM, every NPC and the AI heroes.

Then a fresh Claude session judges each round against the scene as written:

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

The judge is a model too, so it gets the same loop as the GM. When it flags something that wasn’t wrong, the judge gets the fix, and the saved rounds get judged again.

### Agents in Parallel

> use agents to do playtesting loops and agents to fix all in parallel. watch for system performance degradation though and don’t use all the system memory

Four agents each took one act of [Welcome to Kordavos](https://d20adventures.com/settings/realm-of-myr/welcome-to-kordavos). Each fixed only its own act’s files, so no two edited the same one. A fifth fixed the GM. At most four probes ran at once, each one run with two rounds judged together (`--runs 1 --jobs 2`), under a watchdog that stopped work below 22% free memory. It never got below 30%.

| Act | Off-script rounds per probe |
|---|---|
| 1 | 1/18, 2/14, 3/16 |
| 2 | 1/13, 1/11, 3/13 |
| 3 | 2/11, 1/12, 2/11 |

One run is noisy. Act 1’s recheck rose from 3 to 4 of 16.

### NPCs Who Should Be Silent

A round end put a line under dead Thaddeus’s name. Silverhand, who “says nothing”, answered a hero. Loric said “move along”, though he never sends the party away. So [code](https://github.com/johnpolacek/d20adventures.com/blob/main/packages/gm-core/src/story/limits.ts) finds each sentence that starts with an NPC’s name and holds one of these words, and restates it on that NPC’s turn:

*packages/gm-core/src/story/limits.ts*

```ts
const ABSOLUTE = /\b(?:never|nothing|no one|silent|wordless)\b/i
```

The first Act 1 replay after this and four content fixes went 0 of 16 rounds off the rails. A rule phrased any other way still relies on Claude reading the notes.

### The GM Believing the Player

The drake was never on a roof. Mara the urchin’s theft always works unless a hero spots it, yet the GM rolled for her and she failed. Two prompt rules fixed both:

*packages/gm-core/src/services/adventure-roll-result-service.ts*

```
A position, state or fact the player's action assumes, such as where someone is, holds only if the story shows it.
```

*packages/gm-core/src/services/roll-requirement-service.ts*

```
When the encounter instructions say what this NPC does here always happens or works, or that only a hero's check or choice can stop it, choose no roll: the NPC does not roll against an outcome the notes fix.
```

### Give a Background NPC a Sheet

The GM kept playing Grendar as the oily vendor of stolen elven goods, because the vendor wasn’t in the cast. Now he is [Vesk the Fence](https://github.com/johnpolacek/d20adventures.com/blob/main/content/settings/realm-of-myr/npcs/vesk-the-fence.md), with his own sheet and a line in the scene’s cast:

*content/settings/realm-of-myr/adventures/welcome-to-kordavos/encounters/labyrinthine-stalls.md*

```
- id: "vesk-the-fence"
  behavior: "...Never seen or heard before a hero passes the Perception check that finds the stall."
```

### Every Seat, Start to Finish

An agent played the whole adventure as a hosted game, two players with two heroes each, plus Thalbern on AI. It took 67 rounds over 33 encounters and about six hours. It found bugs no single scene showed, like an old roll result carried into the next round. The agent’s driver once sent Branka’s text as Milos, so the agent added an actor check.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keep-an-ai-game-master-honest-with-claude-code-playtest-agents/final-confrontation.webp" alt="Final Confrontation at round 65: Joran bound before the altar, the party portraits along the top, the city map in the corner and Adventure complete" width="1372" height="870" />

### Replace a Failed Session

At round 26 every GM turn failed with “Check its sign-in or usage limit.” The host was holding a broken Claude session. Now a [failed session is replaced](https://github.com/johnpolacek/d20adventures.com/blob/main/apps/desktop/runtime/llm.ts) and the request tried once more. The last 40 rounds had no GM failures.

Weeks later the message came back on [Covert Cargo](https://d20adventures.com/settings/realm-of-myr/covert-cargo).

> i don’t see any usage limit.

The CLI was failing its startup check in under a second, and each retry waited out a 2-minute timeout. Now the error gives the real reason:

*apps/desktop/runtime/llm.ts*

```ts
if (attempt > 0) throw new Error(`${provider} could not finish this request${reason}. Check its sign-in or usage limit, then retry.`)
```

### One Map for the Whole City

The GM made up directions. Agents pulled 463 spatial claims from the adventures, I ruled on the conflicts, and every landmark in the city layout cites its source lines. The GM now gets each scene’s place, what’s near and where each exit leads.

<img src="https://d20-public.s3.us-east-1.amazonaws.com/images/updates/keep-an-ai-game-master-honest-with-claude-code-playtest-agents/city-map.webp" alt="The in-game map of the Asterian Quarter, with the Blackthorn Mansion, the Drain Grate and the underground route to the Forgotten Temple" width="1372" height="870" />

Whether it cut made-up directions is untested.

### Rerun on the Last Commit

A [check probe](https://github.com/johnpolacek/d20adventures.com/blob/main/apps/desktop/scripts/check-probes.json) has Thalbern sneak past the owlbear and grades the check Claude picks. After new rules code landed, it failed 5 of 5 runs. The commit before failed the same way, with an identical prompt, so the new code wasn’t the cause. The scene never showed the hero hidden, so the fix went there:

*apps/desktop/scripts/check-probes.json*

```json
"narrative": "Thalbern is quicker than the beast. Before its eyes find him he has dropped behind a bank of brambles, hidden from it."
```

### Play It Yourself

[Become a playtester](https://d20adventures.com/playtest) and host a game for friends, the same setup the agents played. All of it is [on Github](https://github.com/johnpolacek/d20adventures.com).
