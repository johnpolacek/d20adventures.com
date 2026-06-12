# Roadmap

[Home](index.md) · [Sources](Sources.md) · [Plans](plans/index.md) · **Roadmap** · [Architecture](Architecture.md)

## Experience Modes

Three distinct ways to experience the same adventure. All modes share the same game state and adventure content — players can switch freely between them mid-adventure.

### Gameview (current)
The default experience. Text-driven, turn-by-turn play with the AI Game Master. Players read encounter narrative, make choices, and roll dice. The foundation all other views build on.

### Storyview
A cinematic, immersive mode. Encounter narrative is presented one paragraph at a time, with each paragraph read aloud via AI-generated text-to-speech. The player taps to advance between paragraphs. Decision points and dice rolls still occur — they are narrated just like the story text. Feels like an interactive audiobook.

### Mapview
A tabletop-inspired visual layer. A realistic 3D tile map — detailed terrain and character models evoking painted miniatures on a physical table — serves as a visual backdrop to the adventure. The narrative and choices remain the primary interface; the map shows where you are in the world.

## Adventure Creation

Players can create and share their own settings and adventure plans. The wiki-adventure runtime provides the foundation — adventures are authored as structured markdown files that compile into a playable runtime. The creation surface exposes this authoring model to players directly, with tools for building encounters, NPCs, and branching narratives without touching the underlying files.

### Setting Builder
Create a new world: define its name, lore, factions, and visual identity. Settings are the container for adventures — a setting can hold many adventures sharing the same NPCs, locations, and history.

### Adventure Planner
Build an adventure within a setting: write encounters, define transitions, place NPCs, and set branching conditions. The planner compiles and validates in real time, surfacing errors before publish.

### Community Library
Browse, fork, and play adventures created by other players. Adventures can be published privately (invite-only), unlisted (link-share), or publicly (searchable in the library).

## Technical Architecture

- **Security Audit** — review adventure access control, per-character turn mutation, and Convex in-function auth checks.
- **Realtime Audit** — verify Convex realtime subscriptions are correctly scoped; remove duplicated polling/SSE paths.
- **Convex Audit** — index, validator, and query hardening (collect/filter hotspots, loose validators).

---

## Closed

- ✅ **Release readiness** (2026-06-11) — `pnpm check` green, admin S3 writes validated, complete-manifest fallback, admin routes normalized, Midnight Summons end-to-end playthrough. Full detail: [Production Cutover](plans/production-cutover.md).
- ✅ **Production cutover** (2026-06-12) — entire discovery + gameplay path on wiki runtime, legacy editor removed, March of Davos reconciled, prod S3 audit + rollback verified, deployed to production.
