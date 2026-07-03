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

- [ ] Widen the play-screen container to use more of the full width
- [ ] Move character list into a dedicated left rail
- [ ] Create right rail component hosting mini map + chat
- [ ] Mini map view with expand affordance (full-size overlay or grown-in-place)
- [ ] Chat docked in right rail with expand affordance (replace fixed floating widget)
- [ ] Responsive behavior: collapse rails sensibly on smaller screens
- [ ] Verify in browser at the worktree URL
