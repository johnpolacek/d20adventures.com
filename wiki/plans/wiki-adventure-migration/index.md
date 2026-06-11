# Wiki Adventure Migration

[All plans](../index.md) · [Wiki Home](../../index.md)

A staged plan that produced the implementation plan for a D20 Adventures wiki-adventure relaunch: S3-backed markdown adventure wikis as source of truth, required frontmatter plus pattern-guided loose markdown, Convex for realtime session sync, and AI-assisted authoring/editing. The feature worktree has since merged; current work is tracked in the post-merge review.

## Summary

- **Status:** implemented on main; production cutover pending
- **Shape:** historical multi-stage planning program with stage/unit pages
- **Current unit:** Post-merge review and hardening tracked in the [implementation review](../wiki-adventure-implementation-review.md)
- **Next action:** Resolve review findings before production cutover or old-surface removal.
- **Blockers:** `pnpm check` fails on Biome diagnostics; source-write and S3 fallback hardening remain.
- **Validation:** Focused wiki tests, TypeScript, and build pass after merge; repository-wide Biome check fails.

## Locked Planning Decisions

- **Canonical source:** S3 stores wiki markdown files and assets.
- **Markdown model:** Required frontmatter, then flexible pattern-guided sections and wiki links.
- **Authoring model:** AI-assisted generation and editing replaces the current form-first editor.
- **Migration posture:** Complete relaunch path is allowed after post-merge hardening gates pass.

## Target Direction To Validate

The target architecture flows authored content into a runtime projection that feeds gameplay synced through Convex:

- AI Authoring produces both S3 Wiki Files and Myr Templates.
- S3 Wiki Files and Myr Templates compile into a Wiki Index.
- The Wiki Index feeds LLM Context.
- The Wiki Index also drives Convex State (live session state).
- LLM Context and Convex State together power the Gameplay UI.

## Stages And Unit Pages

- **Stage 1 — [Discovery And Current-State Map](stage-01-current-state.md):** Inventory JSON plan dependencies and classify content, runtime state, and derived metadata.
- **Stage 2 — [Product Intent And Principles](stage-02-product-principles.md):** Define the relaunch thesis, non-goals, and what "adventure wiki" means.
- **Stage 3 — [Wiki Content Model](stage-03-content-model.md):** Locked folder structure, frontmatter, markdown conventions, and `encounter`-first gameplay content unit. See also the [representative Myr skeleton](stage-03-myr-skeleton.md).
- **Stage 4 — [Runtime Projection](stage-04-runtime-projection.md):** Specify derived index, validation modes, publish compilation, S3 layout, and session version-pinning.
- **Stage 5 — [LLM And Gameplay Flow](stage-05-llm-gameplay.md):** Design retrieval, prompt assembly, transitions, turn loop compatibility, and realtime state.
- **Stage 6 — [Authoring And Admin](stage-06-authoring-admin.md):** Plan the AI-assisted wiki editor, validation preview, draft/publish flow, and editor replacement.
- **Stage 7 — [Relaunch Migration](stage-07-relaunch-migration.md):** Plan the nuke-and-rebuild worktree strategy and Myr JSON-to-wiki template migration.
- **Stage 8 — [Final Plan Assembly](stage-08-final-plan.md)** (current): Decision-complete implementation plan, tests, acceptance gates, and risk controls are assembled.

## Program Contract

| Rule | Decision | Why It Matters |
| --- | --- | --- |
| Historical planning | This page records the plan that guided the now-merged implementation. | Use the post-merge review for current work instead of treating this page as the active implementation handoff. |
| Complete relaunch allowed | Old JSON AdventurePlan runtime/editor surfaces can be removed after hardening gates pass. | The merged implementation still keeps legacy JSON paths for listing, title, party-size, and compatibility routes. |
| Source of truth | S3-backed wiki files are canonical authored adventure content. | Convex should synchronize live session state, not own authored adventure truth. |
| Markdown governance | Required frontmatter establishes stable handles; body stays pattern-guided and human-writable. | Prevents unbounded prompt chaos without rebuilding rigid JSON. |
| Author experience | AI-assisted generation/editing is a core product surface, not a later enhancement. | The final implementation plan must include editor UX, validation feedback, and controlled publish flow. |

## Next-Agent Prompt

Use this when handing the planning program to another agent:

> Use project-html-wiki. The Wiki Adventure Migration implementation has merged to main; read wiki/plans/index.md, wiki/plans/wiki-adventure-implementation-review.md, and wiki/plans/wiki-adventure-migration/index.html first. Current work is post-merge hardening: fix repository-wide Biome diagnostics, validate admin canonical S3 source writes before mutation, make remote wiki source fallback complete-manifest aware, normalize admin plan routes, and run authenticated migrated-adventure playthrough coverage. Preserve existing user characters, keep S3 wiki source canonical for authored content, keep Convex as live session state, and do not test with production S3 writes unless explicitly approved.
