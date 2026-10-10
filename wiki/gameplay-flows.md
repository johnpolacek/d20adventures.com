# Gameplay flows

[Home](index.md) · [Architecture](Architecture.md) · [Wiki adventures](wiki-adventures.md) · [Testing](plans/testing-runbook.md)

GM core references updated in `feature/gm-core` on 2026-10-02. Other sections last reviewed against local main on 2026-10-01.

## Create, join, and start

1. Character selection calls `createAdventure`. Convex stores the adventure, participants, and content provenance.
2. Eligible solo adventures auto-start. Multiplayer runs use the lobby and join/start controls.
3. Join resolves the user's character and updates player assignments.
4. Start loads content through `loadAdventurePlanForRuntime`, assembles PCs and encounter NPCs, and writes the first turn.
5. Practice mode restricts access to the managing user and allows that user to control the chosen party.

Primary actions are under `app/_actions/create-adventure.ts`, `join-adventure.ts`, and `start-adventure.ts`.

The [shared GM core](gm-core.md) now owns reply, roll, NPC, companion, and advance orchestration. Server adapters preserve the current storage, model, auth, and narration behavior.

## Turn progression

1. A player submits narrative input through the adventure action.
2. Roll evaluation determines whether a check is required.
3. Required rolls are stored and resolved before completing the action.
4. Narrative and character-state updates are applied.
5. NPC turns resolve as needed.
6. Turn advance loads current content, validates encounter progression, and commits the next turn and story patch. An adventure's [safety rules](wiki-adventures.md#safety-rules) can keep player characters alive and send a badly hurt party to a rescue encounter.
7. Terminal wiki encounters set completed status and an end timestamp.

The live commit rejects changed current turns/encounters and duplicate turn order. Authored content can change during a run. The commit updates its content provenance rather than loading the original immutable version.

## State and presentation

Convex stores gameplay state. Client contexts and existing SSE/stream paths deliver updates. Realtime consolidation is still an audit topic.

Narrative strings retain dice and original-reply markers for parsing and display. Maps supply visual staging only. Storyview caches generated narration separately from the turn narrative.

The current turn page renders text, optional [Mapview](plans/mapview.md), [Storyview](storyview.md), and chat where applicable. [Stageview](plans/stageview.md) gameplay is planned, not part of the current turn loop.

## Costs and reports

AI helpers and flow-specific services meter generation through the token ledger. Charging and failure behavior vary by flow. Storyview's on-demand and automatic cost rules are documented in its reference page.

Practice reports use wiki-backed plan context, store typed findings, and appear in turn and player views. Report checks, membership checks, and billing cases are in the [testing runbook](plans/testing-runbook.md).
