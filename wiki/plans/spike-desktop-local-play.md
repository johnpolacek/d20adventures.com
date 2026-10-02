# Desktop local play spike worktree

[Plans](index.md) · [Wiki Home](../index.md)

Status: State and request-count refinement committed locally (2026-10-02). Eight native trials preserve accepted state. Three CLI variants reduce seven requests to five. Gemini compatibility remains separate. Worktree retained for review.

## Goal

Execute [desktop local play phase 0](desktop-local-play.md#phase-0-spike). Keep implementation in `apps/desktop-spike/` and record all results in that plan. This page is the worktree lifecycle pointer.

## Progress

- [x] Create isolated worktree and Convex project.
- [x] Build and run the native spike, record initial evidence.
- [x] Correct the unsupported no-go recommendation after owner review.
- [x] Implement and launch the three missing persistent adapters. Codex and Grok passed, Gemini reached ACP but failed provider authentication.
- [x] Measure a complete service-level turn for working providers and the API baseline, including strict patch validation through offline replay.
- [x] Compare strict state and combined pre-roll requests, measure native milestones, and replay exact prompts/saved state.
- [x] Record narrative continuity and unapplied character-state limits.
- [x] Commit. Push requires approval.

Cleanup after worktree finish: delete Convex project `d20adventures-spike-desktop-local-play` in its dashboard. Do not delete it while this spike remains active.
