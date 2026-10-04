# Harvest Festival desktop handoff

[Home](../index.md) · [Plans](index.md) · [Desktop integration](zzz-completed/feature-desktop-stage-play.md) · [Stage engine](../stage-engine.md)

Status: resumed and implemented later on 2026-10-03. Owner decisions and results are in [the integration plan](zzz-completed/feature-desktop-stage-play.md#festival-results). This page is kept as the handoff record.

Prepared 2026-10-03. Owner stopped implementation and requested a handoff. No festival scene, staging, runtime, or UI code was written. No new validation or native build was run. Only planning and handoff documents changed.

## Resume here

Worktree: `/Users/johnpolacek/Projects/d20adventures.com.worktrees/feature-desktop-stage-play`

Branch: `feature/desktop-stage-play`. Implementation HEAD when this handoff was prepared: `5a719ed`, desktop title font weights and Play button. Preserve that commit. Earlier commits are `2de01ec`, durable character updates, and `32db430`, desktop Stageview with real turns. Main is separate. Do not recreate the worktree, merge, push, deploy Convex, or rewrite user saves as part of this task.

Read `AGENTS.md`, `wiki/index.md`, and the Harvest Festival section of `wiki/plans/zzz-completed/feature-desktop-stage-play.md` first. Follow the existing Three.js skill and native/browser verification workflows as needed. This Mac has 8 GB RAM. Use two Rust build jobs and avoid redundant dev servers.

## Intended outcome

The party leaves the gate and enters a distinct 3D Harvest Festival square. The real GM core determines the transition. The festival has its authored vendors and performers, useful camera shots, named movement destinations, and the same action, dice, NPC, journal, and character-card controls. Movement persists through rounds and reopening. Encounters without a set retain story view.

This scope does not include New Game/Continue controls, multiple save slots, character creation, multiplayer, or later encounter scenes. Those follow separately.

## Source content

- `content/settings/realm-of-myr/adventures/march-of-davos/encounters/the-harvest-festival.md`
- `content/settings/realm-of-myr/art-direction.md`
- `content/settings/realm-of-myr/npcs/<npc-id>.md` and `.json`

The intro describes streets lined with craft, food, and drink stalls, street performers, Madam Zephyra's fortune-telling stall, and a central music stage with dancing. Valkaran harvest dressing uses sheaves, gourds, orange and green cloth. Timber-framed houses, cobbles, pennants, and lanterns are already supported by the renderer kit.

| NPC ID | Character and role |
|---|---|
| `karim-the-jewel-merchant` | Karim, human jewel merchant. Embroidered tunic and gemstones. Favors the Blackthorns. |
| `madam-zephyra` | Tall, slender elven fortune teller. Green eyes, colorful symbolic robes, a veil, and crystal ball. |
| `finnian-the-fire-eater` | Nimble adult halfling performer. Leather vest and bandana. |
| `liora-the-spice-merchant` | Short, stout human woman with braided hair and beard in the authored sheet. Earthy clothes and spice jars. Do not silently change her to a dwarf. |
| `merrick-the-musician` | Half-elf musician. Long hair, patchwork clothes, and lute. |

After the party explores stalls, the authored transition is `clan-conflict`. Do not force that transition in the renderer or invent scripted GM outcomes.

## Existing code and changes to make

| File or area | Current behavior and next work |
|---|---|
| `packages/stage/src/sets/realm-of-myr/kordavos-south-gate.json` | Reference set. Create a separate festival JSON set. |
| `packages/stage/src/stagings/march-of-davos/the-gates-of-kordavos.json` | Reference cast, art, and shots. Add festival staging with the four existing PCs and five authored NPCs. |
| `packages/stage/src/sets/index.ts` | Registers only the gate set and staging. Register the festival so the dev viewer and `stage:check` discover it. |
| `packages/stage/src/builders/market.ts` | Existing house, stall, sail, bunting, sheaf, gourds, lantern, goods, and market prop builders. Compose them before adding new builders. |
| `packages/stage/src/spec/set.ts`, `spec/staging.ts`, `spec/resolve.ts` | JSON schemas, cast placement, and camera resolution. Validate all marks and shot references. |
| `apps/desktop/src/play.tsx` | Hardcodes gate specs, `atGate`, gate-only portraits, and opening shot `gate`. Replace with encounter-based scene selection and scene-specific opening shot, location, and portraits. Preserve story fallback. |
| `apps/desktop/src/movement.ts` | Movement context, collision/speed clamping, and position snapshots. `stageId(name)` currently uses the first lowercase word. Madam Zephyra maps to `madam`. Use consistent IDs or replace this with an explicit mapping. |
| `apps/desktop/runtime/game.ts` | `content.spatialContext` currently knows only the gate. Supply festival locations and current positions to the real GM. |
| `apps/desktop/runtime/store.ts` | Already clears `positions` atomically when encounter changes, and retains them on same-encounter rounds. Preserve and test this. No separate position schema is required merely to prevent gate coordinates leaking. |
| `components/stage/use-stage.ts` | Creates and disposes a renderer when specs change. Review scene-switch races and cleanup, including stale errors and `window.__stage`. |
| `apps/desktop/scripts/build-runtime.ts` | Already copies all of `public/stage` into the desktop bundle. New checked-in assets there need no separate copy rule. |
| `apps/desktop/runtime/*.test.ts` | Eight existing tests for game/store and character persistence. Extend with festival transition, position, and scene-selection coverage. |

Use a small shared scene registry if it prevents duplicated encounter-to-set mappings. Keep the browser and native packages independent of Next server code. No new dependency is expected.

## Scene authoring considerations

- Give merchants clear walkable approaches. Stall builders emit solid footprints wider than their visible counters. Place NPCs and destinations outside those footprints.
- Keep the party entry, vendor approaches, performance space, and paths open. Put ambient crowds around them rather than on top of the named cast.
- The movement engine follows a straight segment and stops at the first footprint or speed limit. It does not route around obstacles. Test intended routes with `reach` before calling them usable.
- Cast placement currently uses ground-plane x/z coordinates. A raised stage needs a deliberate solution for performer elevation. Do not leave a standee sunk through a platform.
- Reuse the four PC standees and portraits. Ensure all five NPCs can be focused and opened in character cards, including names whose first word differs from their canonical ID.
- Opening and overview cameras should establish a festival square distinct from the gate. Include the party, jewel stall, spice stall, fortune teller, and performers.
- Scene switches must not let a disposed renderer restore positions or finish an old movement write against the next turn. The store rejects stale turn IDs, but UI lifecycle still needs review.
- Preserve saved positions on reopen without replaying already applied movements. Keep failed dice-check movement stationary.
- Consider a visible loading state while switching sets. Keep input from using the previous scene's movement context.

## Character art already generated, not integrated

Five built-in image generation requests were launched before the owner interrupted. All had completed by the cancellation check. No request remains in that run. The images were not inspected, copied into the repository, or referenced by code. They are optional drafts, not accepted game assets. No 3D geometry was generated.

Directory: `/Users/johnpolacek/.codex/generated_images/01a0f8d7-0fb1-7010-b561-ffbb44e5c37c/`

| Character | Generated file |
|---|---|
| Karim | `exec-da99371f-c317-4c6f-9a88-1e21564e5d62.png` |
| Madam Zephyra | `exec-e4cb195f-1a82-4178-b185-d9a791c678bd.png` |
| Finnian | `exec-deaef0ba-327f-4a23-8504-6f7d76f08c5e.png` |
| Liora | `exec-3bb175e4-6f00-4339-881a-2eb9eaf04e10.png` |
| Merrick | `exec-f68893c2-9a03-4acb-9a77-11f01e462f68.png` |

Method: built-in `image_gen`, `transparent_background: true`, one request per character. No CLI fallback. No reference images supplied. These are front-view drafts only. They have not been checked against the existing NPC portraits. The renderer supports an optional back image. Inspect existing standee loading before deciding on back art and portrait extraction.

Each exact prompt was the following template with the corresponding subject inserted:

```text
Use case: stylized-concept. Asset type: transparent full-body character standee for an existing painterly medieval fantasy 3D game. Subject: {subject} Style: detailed hand-painted fantasy book illustration, warm natural colors, visible soft brushwork and believable anatomy, softly modeled dimensional form. Framing: ONE single person, full body including both feet, front view facing directly toward camera, eye-level perspective, centered, tall portrait composition with small clear margins. Body occupies almost all image height, feet aligned on a level baseline. Clean silhouette, soft neutral daylight. Background: completely transparent alpha, no environment, no floor, no shadow beneath feet, no base, no text, no border, no other people. No photographic rendering or cartoon outlines. Preserve all held objects in frame.
```

Exact subjects:

- Karim: `Karim the jewel merchant, middle-aged human man, neatly trimmed black beard, olive skin, embroidered burgundy tunic set with gemstones, gold belt and rings, holding a small velvet tray of jewels. Shrewd welcoming expression.`
- Madam Zephyra: `Madam Zephyra, tall slender elven fortune teller woman, piercing green eyes, long dark hair partly under a fine violet veil, layered flowing plum and teal robes with subtle mystical embroidery, one hand offering a tarot card, mysterious wise expression.`
- Finnian: `Finnian the fire eater, adult male halfling, short nimble proportions, mischievous grin, leather vest and red bandana, bare forearms, cropped trousers and leather shoes, holding an unlit fire eating torch out to one side. Feet firmly grounded, confident relaxed stance.`
- Liora: `Liora the spice merchant, short stout human woman with braided hair and a braided beard, earthy ochre and moss green clothes, an apron and belt hung with small spice jars, holding a small bowl of saffron, warm expressive face.`
- Merrick: `Merrick the musician, lithe half-elf man with pointed ears and long flowing chestnut hair, colorful russet teal and ochre patchwork clothes, cradling and strumming a lute, soulful welcoming expression.`

Do not run further generation from this handoff alone. The current owner request is to hand off, not implement.

## Validation when implementation resumes

1. Run `pnpm stage:check` for both scenes. Verify assets exist, cast IDs match the real roster, all marks are outside solid footprints, and routes reach the intended approaches.
2. Add meaningful tests covering a real core gate-to-festival advance, position reset, same-encounter position retention, save/reopen, stale movement rejection, and story fallback for an unimplemented encounter.
3. Run `pnpm --filter @d20/desktop test`, desktop/stage typechecks, root TypeScript, and scoped Biome. Run shared-core regression checks if changing its contracts.
4. Build with `CARGO_BUILD_JOBS=2 pnpm desktop:build`. Verify the packaged native app, including its scene switch, NPC focus/cards, real action input, movement, and reopening.
5. Use an isolated test save, or back up and safely restore the user's current save after verifying it has not changed. Do not assume it is still empty.
6. Inspect every authored camera. Existing renderer budgets are at most 300 draw calls and 2.5M triangles per shot. Record what was actually measured, separately from old gate numbers.
7. Update the integration plan, stage reference, index, roadmap, and log with actual results and remaining limits. Commit locally when confident. Ask before pushing.

The dev viewer supports `?staging=march-of-davos/the-harvest-festival` once registered. `scripts/stage-verify.ts` supports a staging argument, but expects a running web dev viewer. A browser renderer check alone does not validate native IPC or gameplay.

## Saves and native app

App bundle: `apps/desktop/src-tauri/target/release/bundle/macos/D20 Adventures.app` under this worktree.

User save: `~/Library/Application Support/com.d20adventures.desktop/adventure.sqlite`.

Earlier isolated validation saves beside it:

- `validation-desktop-stage-2026-10-02.sqlite`, a real Claude gate-to-festival playthrough.
- `validation-character-state-2026-10-03.sqlite`, a deterministic character-card fixture.

The current save and running-app state were not inspected during this handoff. Do not substitute these fixtures for the user's save without preserving current data.

Desktop still requires Node 24+ and an installed, signed-in supported AI CLI. It has one local save and four premade player-controlled characters. It is not a signed distribution. No production or all-provider coverage is implied by past tests.
