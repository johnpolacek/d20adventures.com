# Discovery And Current-State Map

[Migration index](index.md) · [All plans](../index.md) · [Wiki Home](../../index.md)

**Stage 1.** Before designing the relaunch, trace how the current JSON AdventurePlan model flows through authoring, storage, gameplay, prompts, reports, maps, and tests.

**Reader goal:** After 2 minutes, know what must be inventoried before any wiki architecture decision is considered ready.

## Unit 01 — AdventurePlan dependency inventory

Status: Current

Search for AdventurePlan, encounter, scene, setting, NPC, character template, map, and plan editor dependencies across `app/`, `components/`, `lib/`, `convex/`, `types/`, and `tests/`. Classify each dependency as delete, replace with wiki source, replace with derived index, or preserve as live state.

**Verification:** Record exact search commands and a coverage table. No implementation changes.

## Unit 02 — Lifecycle flow map

Status: Draft

Map current flows from authoring plan JSON to S3 storage, adventure creation, lobby/start, turn reply, roll, NPC turns, advance turn, reports, and admin practice runs.

**Verification:** Flow diagram names every runtime boundary and confirms whether each boundary reads authored content, live state, or derived metadata.

## Unit 03 — Data classification

Status: Draft

Separate authored truth, derived index/cache, live session state, player state, generated narrative history, AI prompt support, and reporting artifacts.

**Verification:** Classification table is reviewed against `convex/schema.ts`, `types/adventure-plan.ts`, and primary action/service files.

## Stage Deliverables

| Deliverable | Output | Done When |
| --- | --- | --- |
| Dependency list | Table or report under this plan folder | All high-confidence AdventurePlan consumers are classified. |
| Current-state architecture map | HTML diagram/report | Authoring, storage, runtime, prompt, and reporting boundaries are visible. |
| Content/runtime classification | Decision table | Future stages know what belongs in S3 wiki files vs Convex realtime state. |
