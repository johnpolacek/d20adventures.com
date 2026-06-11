# Architecture

[Home](index.md) · [Sources](Sources.md) · [Plans](plans/index.md) · [Roadmap](roadmap.md) · **Architecture**

The application combines Next.js UI and server actions, Convex persistence and realtime, S3 and repo-local wiki source, legacy JSON content, and AI SDK generation into a turn-based RPG orchestration system.

**Reader goal:** after two minutes, know the major runtime boundaries and where post-merge wiki-adventure hardening should begin.

## Runtime flow

- **Client UI** → **Server Actions** and **API Routes**.
- Server Actions / API Routes → **Convex DB**, **Wiki / S3 Source**, **AI SDK**, and **Stripe / Email**.
- Convex DB, Wiki/S3 Source, and AI SDK feed the **Adventure Turn Loop**, which drives generation and writes guarded state back through Convex.

## Boundaries

- **Primary trust boundary** — authenticated user to server action / API route, then onward to Convex, S3, and AI providers. Authorization must be enforced before returning or mutating adventure, character, token, and content data.
- **Realtime boundary** — Convex owns live session state for adventures, turns, current encounters, content refs, and generated history. Older duplicated polling/SSE risks still need separate verification before realtime refactors.
- **Content boundary** — legacy S3 JSON remains for settings and plan metadata. Registered Realm of Myr adventures now compile markdown/JSON wiki source from repo-local fallback or canonical S3 source.

## Risk map

| Area | Risk from imported evidence | Next planning action |
|---|---|---|
| Adventure access | Prior docs flagged missing membership/ownership checks in routes and actions. | Audit current code and create a maintenance plan if findings remain. |
| Turn mutation | Prior docs flagged insufficient per-character control checks. | Plan centralized access helpers and tests. |
| Convex functions | Prior docs flagged lack of in-function auth checks. | Evaluate the Convex auth model and migration path. |
| Query/schema design | Prior docs flagged collect/filter hotspots and loose validators. | Plan index and validator hardening after authorization scope is clear. |
| Admin source writes | Chat and key-field edits write canonical S3 wiki source before blocking validation gates. | Add pre-write validation or draft-only staging before canonical mutation. |
| Remote source fallback | Any S3 wiki source presence overrides local fallback for a registered adventure. | Require complete manifest coverage before preferring S3 source. |
| Admin route naming | Canonical list URL, redirect URLs, and editor URL mix `adventure-plans`, `adventures-plans`, and `wiki-adventures` names. | Pick one canonical admin route family and align nav state with it. |
| Repository validation | `pnpm check` fails with current Biome import-sorting and formatting diagnostics. | Run a Biome cleanup pass before release cutover. |
