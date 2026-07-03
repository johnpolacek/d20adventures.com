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

Notes:
- `GameChat` default ("floating") variant is unchanged for the lobby and mobile; unseen-count badge logic only runs for it.
- Character cards are now `w-full max-w-[320px]` (was fixed `sm:w-[320px]`) so rail columns control their width.
- One test chat message ("Testing the new rail chat layout") remains in the worktree's isolated Convex DB (adventure jh77x05rkff2qjp8napzppn8r188hep9) — DB is disposable at finish.
