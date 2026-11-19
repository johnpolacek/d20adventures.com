# D20 Adventures

D20 Adventures is an open source platform for building and playing 5e fantasy adventures with an AI Game Master, solo or multiplayer.

Play at [d20adventures.com](https://d20adventures.com).

## How It Works

Adventures are written in markdown and compiled into encounters. A game master core runs each turn: it orders the party and NPCs, decides when a roll is needed, applies the SRD 5.2.1 rules, and narrates the result with an LLM. Encounters play out on a painted 3D stage with a top-down floor plan.

The same core runs in two places: the website, backed by Convex, and a Tauri desktop app, backed by SQLite.

## Stack

- Next.js 16, React 19, Tailwind 4
- Convex for data, Clerk for auth
- Vercel AI SDK with Gemini and OpenAI models
- Three.js for the encounter stage
- Tauri 2 with a bundled Node runtime for the desktop app
- pnpm workspaces, Biome, Playwright

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
| `components/stage` | HUD, dice and journal around the stage, shared by site and desktop |
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

You need a Convex project, Clerk keys and LLM API keys in `.env.local`.

## Checks

```sh
pnpm check                          # Biome lint and format
pnpm --filter @d20/gm-core test     # Game master tests
pnpm test:srd                       # SRD data checks
pnpm stage:plans:check              # Fails on a stale floor plan
pnpm test                           # Build plus Playwright
```

Run `pnpm stage:plans` after changing a set or a staging.

## License

Code is MIT. See `LICENSE`.

This work includes material from the System Reference Document 5.2.1 ("SRD 5.2.1") by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.
