# Readable adventure operations

[Home](../index.md) · [Sources](../Sources.md) · [Plans](../plans/index.md) · [Roadmap](../roadmap.md) · [Architecture](../Architecture.md)

**Design source brief.** The UI must support repeated RPG session work: scanning state, reading narrative, entering replies, resolving rolls, and managing authored content without losing story atmosphere.

**Status:** Last reviewed 2026-05-20. Evidence basis: repo UI tree, README, technical docs. Confidence: medium.

## Interface principles

Prioritize turn state clarity, narrative readability, action affordances, and durable context over decorative fantasy styling.

## Expected surfaces

Landing/public pages, adventure lobby, active turn view, chat, character state, roll UI, admin adventure-plan authoring, roadmap, account/billing, uploads.

## Interaction expectations

Realtime updates should be trustworthy, action states should be explicit, and game mutations should prevent accidental or unauthorized cross-player actions.

## Accessibility expectations

Long narrative text, controls, dialogs, forms, and status lists need semantic structure, keyboard access, visible focus, and clear loading/error states.

## Wiki-First Authoring Direction

The planned relaunch makes AI-assisted wiki authoring a core product surface. Future UI planning should assume a markdown/wiki editor with file tree, AI command panel, validation drawer, preview, context graph, and draft/publish controls replacing the current Adventure Plan editor.

## Authoring Workbench Requirements

The wiki editor should be a dense operational workbench, not a landing page or wizard-first flow. The first editor screen should expose source files, selected markdown/JSON content, validation status, AI change-set diffs, graph/compiled preview, and publish state. Validation and publish blockers must remain visible across desktop and mobile task layouts.

## Design Unknowns

No formal design system source was found beyond component structure and UI libraries. The detailed wiki editor interaction model remains a planning deliverable, not an implementation decision.
