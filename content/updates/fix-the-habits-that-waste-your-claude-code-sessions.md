---
title: "Fix the Habits That Waste Your Claude Code Sessions"
date: 2026-11-26
description: "How reading back my Claude Code transcripts found hundreds of tool calls that silently failed, and the prompt, .zshrc line and short rules that stopped them repeating."
image: "https://d20-public.s3.us-east-1.amazonaws.com/images/updates/fix-the-habits-that-waste-your-claude-code-sessions.webp"
header: /images/updates/fix-the-habits-that-waste-your-claude-code-sessions.webp
draft: true
---

Claude Code saves every session as a transcript in `~/.claude/projects`, subagents included. Every tool call and what came back. Nobody reads them, so nobody sees the calls that failed without a word.

So I had Claude read its own. The fixes all went into the [AGENTS.md](https://github.com/johnpolacek/d20adventures.com/blob/main/AGENTS.md) for D20 Adventures, plus a few global rules.

### How It Works

You paste one prompt:

```
Read my session transcripts in ~/.claude/projects. Find tool calls that failed, came back empty, or hid an error in normal output. Group the waste by cause, and suggest CLAUDE.md lines to prevent it.
```

Claude scans the transcripts, throws out calls that only look like failures, groups the real waste by cause and proposes lines for CLAUDE.md or AGENTS.md. You pick which lines to keep, and it commits them.

Claude makes every call in that loop: what counts as waste, which group, what rule. The transcripts and the written rules are the only fixed parts. The first run covered 30 days: 392 transcripts and 46,342 tool calls, about 600 of which truly failed. Image reads and ToolSearch looked empty but had worked, so it took them out.

Because it’s judgment, two runs can count differently.

### What the First Prompt Missed

The first version asked only for failed or empty calls, plus files that took many searches to find. It counted 24 zsh failures. The real count was about 714, and only 39 of those showed an error. `grep --include=*.ts … | head` dies, `head` still succeeds, and the command just returns nothing. So the prompt now asks for errors hidden in normal output.

The file-hunt part got dropped. Only 20 searches came back empty out of 36,000 Bash calls.

### zsh and Unquoted Globs

My last 176 sessions ran 23,461 searches, and 717 of them never ran. zsh rejects an unquoted `grep --include=*.ts` before grep even starts.

A line in AGENTS.md saying to quote globs didn’t stop it. This in `~/.zshrc` did. It only applies inside Claude Code. It passes a glob with no match through to grep unchanged, and splits unquoted variables the way bash does:

*~/.zshrc*

```bash
[[ -n $CLAUDECODE ]] && setopt no_nomatch sh_word_split
```

Nobody has checked yet whether `sh_word_split` breaks anything else.

### Where to Look

I wanted pointers so agents wouldn’t have to search. Claude pushed back on a full folder map, since maps go stale and load into every session. The few long hunts ended in a handful of files, so a short Where to Look section points straight at them. Three of its lines:

```
- What a player's action rolls: `packages/gm-core/src/services/roll-requirement-service.ts`.
- SRD rules text: `packages/srd/sources/official/srd-5.2.1.txt`.
- The asset library is `asset-library/` at the repo root, not under `public/`.
```

The test for a pointer: the name differs from what you’d search for, or two places look right and only one is.

The last line came from the second audit, which found 20 searches for the asset library under `public/`.

### Auto Mode Blocks

43 calls were deploy commands that auto mode blocks. AGENTS.md now lists them and says to ask me to run them with `!`, which runs a command in my own shell from the Claude Code prompt:

```
Auto mode blocks `pnpm convex:deploy`, `pnpm deploy:site`, `vercel env` and `pnpm assets:sync`. Ask John to run them with `!`.
```

### Blank Chrome Tabs

Chrome tools kept acting on a blank tab, 57 times in the first 30 days. 14 screenshots caught an error page because the dev server wasn’t up yet. Two rules I keep for every project:

```
Chrome: navigate a new tab to a real URL before any screenshot, click or JavaScript.
Before a screenshot, curl the page and confirm it answers 200.
```

The curl rule still failed 3 times, so a hook might be next.

### git grep and rm

These are model habits, so any Claude Code user can hit them:

```
In git grep, put flags such as -A, -B and -C before the pattern. After it, git reads them as revisions.
Run rm only on literal paths. A variable or glob is blocked by the safety check.
```

`git grep -n "x" -A25 -- path` fails with “unable to resolve revision: -A25”, 13 times so far. Both rules went in today, so no after numbers yet.

### Repo Gotchas

Some waste only makes sense in this repo. Agents kept reaching for paths that are gone (14) and packages that aren’t installed (9 imports of plain `playwright`). A line naming what isn’t there stops that:

```
There is no `wiki/`, `tailwind.config.ts`, ESLint, Prettier or Biome.
```

Newest line: a check failing in a file you didn’t change may be another session’s half-done edit. Several sessions had each chased the same compiler error.

### Run It Again

Five days later I ran it again on this project only, 266 sessions and 35,561 tool calls, split at the first round of fixes:

| Cause | Before | After |
|---|---|---|
| zsh glob with no match | 387 | 7 |
| Chrome lost tab | 80 | 2 |
| Missing tools like `fd` | 18 | 0 |
| `sleep` blocked | 7 | 0 |

The ones that didn’t hold, like curl before a screenshot, are still failing. The audit now runs on its own every Monday.

The other build posts are on [d20adventures.com/updates](https://d20adventures.com/updates). The game itself runs in [the desktop app](https://d20adventures.com/desktop) on your own Claude, or try the demo at [d20adventures.com](https://d20adventures.com). Every line the audits added is in [AGENTS.md](https://github.com/johnpolacek/d20adventures.com/blob/main/AGENTS.md).
