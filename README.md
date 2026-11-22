# D20 Adventures

[D20 Adventures](https://d20adventures.com) is an open source platform for building and playing 5e fantasy adventures with an AI Game Master, solo or multiplayer.

## Agent Prompts

Paste one of these into Claude Code, Codex or another coding agent.

Host a game on your computer with the desktop app, with friends joining from the web:

```text
Help me host a game in D20 Adventures on this computer, with friends joining from the web.

Follow https://d20adventures.com/host.md. Fetch the raw file so you read all of it.
```

Set up local development:

```text
Clone https://github.com/johnpolacek/d20adventures.com and read README.md and AGENTS.md. Set it up for local development of the website and the desktop app. Check that Node.js 24 or newer, pnpm and Rust are installed, and tell me what is missing before installing anything. Run pnpm install. Copy .env.example to .env.local and walk me through the required section: run npx convex dev to create a Convex dev project, generate STORE_SERVER_SECRET and set it in Convex too, then Clerk and Gemini keys. Ask me for each secret instead of guessing. Then run pnpm dev, which starts Convex, the website and the desktop app. Confirm http://localhost:3000 loads, I can sign in, and the app opens.
```

Understand how it works:

```text
Clone https://github.com/johnpolacek/d20adventures.com and read README.md and AGENTS.md. Explain the architecture, then follow one player turn from the moment an action is submitted to the narration that comes back, through packages/gm-core and the website or desktop app. Point me to the files that matter at each step.
```

Create your own adventure:

```text
Clone https://github.com/johnpolacek/d20adventures.com and read README.md and AGENTS.md. Walk me through creating my own adventure, one step at a time. Use the adventures under content/settings as examples. Start with the story and encounters in markdown and validate them with lib/wiki-adventures. Then explain what the art and 3D stage for each encounter involve, and ask me how far I want to go before starting on them.
```

## How It Works

Adventures are written in markdown and compiled into encounters. A game master core runs each turn: it orders the party and NPCs, decides when a roll is needed, applies the SRD 5.2.1 rules, and narrates the result with an LLM. Encounters play out on a painted 3D stage with a top-down floor plan.

The same core runs in two places: the website, backed by Convex, and a Tauri desktop app, backed by SQLite.

## Stack

- Next.js 16, React 19, Tailwind 4
- Convex for data, Clerk for auth
- Vercel AI SDK with Gemini and OpenAI models
- Three.js for the encounter stage
- Tauri 2 with a bundled Node runtime for the desktop app
- pnpm workspaces, Playwright

## Layout

| Path | What it is |
| --- | --- |
| `packages/gm-core` | The game master: turn flow, NPC turns, rolls, narrative. No framework imports. It reaches the outside through `src/ports.ts`. |
| `packages/srd` | SRD 5.2.1 as typed data |
| `packages/stage` | Stageview, the 3D encounter stage, plus its sets, stagings and generated floor plans |
| `lib/gm-server` | Binds the core to the website |
| `lib/wiki-adventures` | Compiles and validates markdown adventures |
| `content/settings` | Settings and adventures in markdown |
| `app` | The Next.js site. Server actions live in `app/_actions`. |
| `packages/ui` | `@d20/ui`: shared UI for site and desktop, including the stage HUD, dice and journal |
| `convex` | Database schema and functions |
| `apps/desktop` | The Tauri desktop app. `apps/desktop/runtime` is its Node game runtime. |

## Development

```sh
pnpm install
pnpm dev          # Convex, the website and the desktop app
pnpm dev:web      # Convex and the website only
pnpm dev:app      # Desktop app only
pnpm dev:fresh    # Kill ports first, then dev
```

Copy `.env.example` to `.env.local` and fill in the required keys: Convex, Clerk, a shared store secret and Gemini.

## Checks

```sh
pnpm --filter @d20/gm-core test     # Game master tests
pnpm test:srd                       # SRD data checks
pnpm stage:plans:check              # Fails on a stale floor plan
pnpm test                           # Build plus Playwright
```

Run `pnpm stage:plans` after changing a set or a staging.

## License

Code is MIT. See `LICENSE`.

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
