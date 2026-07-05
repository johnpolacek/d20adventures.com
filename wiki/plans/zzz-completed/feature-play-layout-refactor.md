# feature/play-layout-refactor

[Plans](index.md) · [Wiki Home](../index.md)

Status: Active (2026-07-03)

## Goal

Big layout refactor of the adventure play screen ([turn.tsx](../../components/adventure/turn.tsx)). Use more of the full viewport width with a three-column layout:

- **Left rail** — character list (`turn-character-list.tsx`)
- **Center** — narrative (`turn-narrative.tsx`), the primary reading column
- **Right rail (new)** — mini view of the map (`miniatures-map.tsx`) on top, then the chat (`game-chat.tsx`) below it; both the map and the chat can be expanded from their mini state

Today the character list and narrative sit in a flex row constrained by page padding, and the chat floats as a fixed widget in the top-right (`turn.tsx:23-30`). The map is not part of the play layout yet.

## Progress

- [x] Widen the play-screen container to use more of the full width (max 1536px, narrative max-w-3xl centered)
- [x] Move character list into a dedicated left rail (sticky, scrollable, badges unclipped via pl-6/-ml-6)
- [x] Create right rail hosting mini map + chat (sticky, chat fills remaining height)
- [x] Mini map view with expand affordance (`MapRailPanel` → shared fullscreen `MapOverlay`, portaled to body to escape the sticky stacking context)
- [x] Chat docked in right rail with expand affordance (`GameChat variant="rail"` — always streaming; expand opens the existing large dialog)
- [x] Responsive: three columns at xl+, two columns (list + narrative) with floating map/chat buttons at lg, stacked with floating buttons below lg
- [x] Verified in browser at 375 / 1120 / 1280 / 1600 widths; map expand, chat expand, and SSE chat send all exercised

## Map titles are locations

The map panel is titled by the place it depicts (e.g. "Valkarr Forest"), not the encounter title. The wiki model already supported this end-to-end — it was just unauthored and dropped at the plan-view seam:

- Encounter frontmatter `location: "<id>"` → `RuntimeEncounter.locationId` (compiler already parsed it)
- Location entity pages (`type: "location"`, in `locations/` of the adventure source) → `artifacts.entities.locations` (already indexed; they also feed GM retrieval records)
- New: `AdventureEncounter.location` (optional display name) resolved in `plan-view.ts`; `turn.tsx` titles the map `encounter.location || encounter.title`
- New: map generation prompt gets a `- Location:` context line
- Authored for The Midnight Summons: `valkarr-forest`, `old-standing-stones`, `thalberns-forest-home` across all 7 encounters

## Narration ↔ battle map consistency

Narration prompts (wiki + legacy) now receive a battle-map staging summary — token starting positions, nearest labels, party↔NPC distances in cells/feet (`lib/mapview/spatial-summary.ts`) — with an instruction to keep described distances/movement consistent. Encounter NPC refs accept `startNear` (`"party"` | `"distant"` | zone/label name), honored by `placeTokens`; the owlbear in the-midnight-summons now starts ~10 ft from the party (stored maps re-placed via `scripts/mapview-replace-tokens.ts`; S3 maps are shared, pre-change copies in session scratchpad `maps-backup/`). Authoring rule added to AGENTS.md.

Note: editing owlbear-confrontation.md changed the plan's content hash again — adventures started before commit a5f6cc5 will fail turn advance with "Stale turn advance"; start fresh ones.

Follow-ups: author locations for covert-cargo and the-road-to-kordavos (no stored maps yet, so no UI impact); consider a Location field in the admin module editor (raw-file saves already round-trip the key); legacy S3 plans simply fall back to the encounter title.

Notes:
- `GameChat` default ("floating") variant is unchanged for the lobby and mobile; unseen-count badge logic only runs for it.
- Character cards are now `w-full max-w-[320px]` (was fixed `sm:w-[320px]`) so rail columns control their width.
- One test chat message ("Testing the new rail chat layout") remains in the worktree's isolated Convex DB (adventure jh77x05rkff2qjp8napzppn8r188hep9) — DB is disposable at finish.

Finished: 2026-07-05 (merged to main, policy: merge)
