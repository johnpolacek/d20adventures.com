# Stageview

[Plans](index.md) · [Wiki Home](../index.md) · [Stage engine](../stage-engine.md) · [Roadmap](../roadmap.md)

Status: Active. Reviewed 2026-10-01 against local main.

The old 3D stack and engine port are complete. Stageview currently runs at `/dev/stage`. The player turn page still uses text, Storyview narration, and optional 2D maps.

## Product decisions

Owner decisions recorded on 2026-09-29:

- Stageview becomes the primary play screen. Narrative, reply composer, dice, chat, and turn history dock over the stage. This replaces the earlier encounter-overlay proposal.
- Keep the complete narrative readable. Gameview remains the text layer and fallback.
- Phones play in landscape, with a rotate prompt in portrait. Platform fullscreen and orientation support need device validation.
- The goal is custom sets generated during adventure authoring. Hand-built and generic sets can cover the first release.
- Sets are bounded, declarative JSON interpreted by trusted builders. Community-authored sets must never execute arbitrary JavaScript on player devices.
- Use illustrated front/back standees for named characters, portrait plates for dialogue, and instanced illustrated crowds with coarse procedural figures at distance or steep viewing angles.
- No old mini purchases or assets require migration. At removal, the owner confirmed there were only test accounts.

## Implemented

| Work | Evidence |
|---|---|
| Old r3f encounter, scene-kit, mini generation, and dormant 3D map removed | Merge `b06a42b`, 2026-09-29. Mapview extracted into `components/mapview/map-panel.tsx`. |
| Plain three.js engine, rendering, crowd cards, standees, lifecycle, quality tiers | Merge `384a622`, 2026-09-29. See [Stage engine](../stage-engine.md). |
| Declarative set and minimal staging specs | `lib/stage/spec/`, bounded schemas and trusted builders. |
| Kordavos south gate and development cast | `lib/stage/sets/realm-of-myr/kordavos-south-gate.json` and `lib/stage/stagings/march-of-davos/the-gates-of-kordavos.json`. |
| Myr crowd library | 16 front/back variants under `public/stage/crowd/realm-of-myr/`. |
| Development preview and verification | `/dev/stage`, `pnpm stage:check`, `pnpm stage:verify`. |

## Remaining phases

### Phase 3, staging and the next set

- Generalize the prototype queue director into set loops and staging scripts. The current gate queue is static.
- Build the Harvest Festival street as its own set.
- Add time-of-day and weather controls.
- Keep set, staging, and character identities stable so later beats can reference them.

### Phase 4, stage-first gameplay

- Render Stageview across the turn-page viewport and dock the complete text turn UI over it.
- Settle the dock layout. Current proposal is a side panel in landscape and a bottom sheet on portrait tablets.
- Add a server-side character-art pipeline from portrait to world-style front/back standees. Restore server-side chroma keying, store art in S3, and decide token pricing. Premades can be prepared ahead of time.
- Generate validated per-turn beats from resolved narrative. Proposed vocabulary is shots, movement to marks/paths, gestures, quoted dialogue, and effects.
- Persist deterministic beats and starting/end poses so replay and multiplayer stay consistent. Positions remain visual only.
- Bind waiting-for-input holds, portrait plates, head-anchored dialogue, and character cards.
- Synchronize beats and shots with [Storyview](../storyview.md) paragraphs.
- Add the phone portrait gate, WebGL/performance fallback, and reduced-motion behavior.
- Decide Mapview's role, either a toggleable inset or retirement. Do not expand maps speculatively before that decision.

### Phase 5, encounter coverage

Coverage is required for the stage-first release, even if custom sets for every encounter come later.

- Build generic sets for forest road, clearing, tavern interior, docks, and crypt.
- Generate default staging from encounter kind, NPC refs, and `startNear`. Missing authored staging must not block play.
- Cover The Midnight Summons, Covert Cargo, The Road to Kordavos, and the 45 March of Davos encounters.
- Add an authoring loop from brief to set spec, schema/build checks, rendered screenshots, human review, and publication.

## Architecture to extend

| Layer | Current | Planned |
|---|---|---|
| Set | Repo-local JSON, materials, builders, marks, paths, crowd groups, shots, ambient life | Reusable location assets, toggles, loops, authoring and publication. |
| Staging | Repo-local cast at marks, opening shot, relative character shots | Per-encounter storage, scripts, dressing, party entry, ambient behavior. |
| Beats | Not implemented | Per-turn validated commands, persistence, replay, hold and narration binding. |

## Validation and open decisions

The [engine measurements](../stage-engine.md#recorded-validation) are from an M3 in a development build on 2026-09-29. They do not establish production or phone performance.

- Preserve the verified draw-call and triangle ceilings of 300 and 2.5 million per rendered shot.
- The original 60 fps at DPR 2 goal is unmet. Recorded ultra performance was 21 to 28 fps. Set the release performance floor and default tier from device measurements.
- Measure mid-range phones, memory, production load time, and paint stability during movement.
- Review visible crowd repetition and abrupt pawn/card swaps.
- Evaluate beats generation against the set vocabulary before relying on it in gameplay.
- Verify full turn input, dice, narration, transitions, completion, keyboard access, reduced motion, and fallback behavior in the integrated page.
- Keep cleanup of retired remote assets separate from implementation. See [maintenance](maintenance.md#environment-cleanup).

The prototype source is `~/Projects/d20-graphics-test-2/src/v5/`. Earlier experiments and rejected approaches are preserved in Git history.
