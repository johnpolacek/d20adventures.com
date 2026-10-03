# Desktop Stageview integration

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop direction](desktop-local-play.md)

Status: Implemented locally, 2026-10-02. Owner requested the 3D interface in the desktop app connected to the real turn flow. Branch `feature/desktop-stage-play` includes the committed GM core branch. No merge into main or deployment.

## Scope

Build `apps/desktop` using the extracted GM core and the existing Stageview renderer and cinematic components. Start with the authored March of Davos adventure and the Kordavos gate set. Local CLI generation must drive replies, roll requirements, dice resolution, NPC turns, and advancement. Preserve real state between launches. Render later encounters honestly when no authored 3D set exists. Keep the web demo and spike intact.

Use an isolated worktree based on main plus the committed GM core branch. No production mutations, shared auth changes, push, or merge into main. Reuse the tested local CLI adapters. Do not create new scripted gameplay outcomes.

## Implementation

- Extract the unchanged renderer to `packages/stage` for both web and desktop consumers.
- Add the desktop workspace, native bridge, bundled authored content, and local persistence.
- Wire GM core ports and turn commands with serialized operations, retry/error handling, and resumable state.
- Port the 3D HUD, journal, camera controls, character focus, and dice to real state.
- Verify deterministic turn/store boundaries, browser UI, native build, and a live CLI turn.
- Record actual results and limits, then commit locally.

## Validation

Use two Rust build jobs because this Mac has 8 GB RAM. Check types, scoped lint, local state and transition tests, frontend build, native build, and the running native webview. Confirm actions and dice update saved state and survive restart. Do not claim that all adventures have 3D sets or that this is a signed distribution.

## Results

- Added `apps/desktop`, `pnpm desktop:dev`, and `pnpm desktop:build`. The bundle carries local content, renderer assets, fonts, and the Node runtime. Node 24+ and an installed, signed-in AI CLI remain external requirements.
- Shared `packages/stage` serves web and desktop. Same-origin image loading works in WKWebView. The desktop uses real turn order, narration, action input, dice, journal, character focus, cameras, and clamped action movement. Later encounters use story view with the same turn controls.
- SQLite commits accepted milestones, holds a process lease, rejects stale input and illegal transitions, and saves a natural die before generation. Failed inference returns the durable checkpoint. Strict nested world-state validation uses the tested CLI adapters.
- Three integration tests cover start/reopen, cross-instance ownership, duplicate/stale input, dice retry retention, and core advancement with durable summary/discoveries. Root, desktop, and renderer TypeScript checks passed. Scoped Biome, Rust formatting/Clippy, renderer content checks, frontend build, and a macOS release bundle passed. The Next production build passed with the existing missing SendGrid configuration warning.
- In the packaged native app, Claude generated a Persuasion DC 13 check for Branka's fee-waiver request. A natural 2 failed and stayed saved. Yeva paid the group fee, Milos waited, Garlan responded, and Cassia explained her business. The real core advanced to The Harvest Festival with its authored NPC roster. Reopening restored that turn. Native renderer reporting recorded ready state with no JavaScript errors.
- Browser verification covered renderer loading, with no browser console errors. Game commands require native IPC, so the browser check was not a gameplay test. The native test above covered the actual bridge and local save.
- The native test save was preserved as `~/Library/Application Support/com.d20adventures.desktop/validation-desktop-stage-2026-10-02.sqlite`. The app was returned to a fresh starting screen. Movement waits for completed actions and leaves failed checks in place.

## Character-state follow-up, 2026-10-03

Owner authorized applying recorded character changes. Continue in this clean integration worktree. Scope is the desktop host and reusable schema definitions, with no production deployment or web state migration.

- Define typed item add/remove, effect set/remove, and spell-use changes. Keep historical descriptive patches readable, but require explicit operations for new desktop patches. Reject unknown character/item/spell references and malformed changes without committing a partial turn.
- Apply health, status, equipment, effects, and spell usage atomically with the new turn. Preserve live state instead of reloading premade defaults on encounter changes. Remember NPC state when they leave the roster. Clear old roll flags, expire timed effects once per round, and retain the existing rule that spells recharge on encounter changes.
- Supply current character state to local GM requests and show it in character cards. Derive open cards from live state so they update after a save.
- Test add/remove/transfer, effect replacement/removal/expiry, spell use/reset, same-encounter rounds, encounter transitions, NPC return, save/reopen, duplicate/stale retries, and atomic rejection. Run shared-core regression checks, typechecks, scoped lint, desktop build, and native UI verification.
- Do not reinterpret historical free-text inventory/effect notes or rewrite old turn snapshots. Existing saves continue from their current stored character values.

Implemented and validated locally. Eight desktop tests cover the cases above, including real core transitions and SQLite reopen. Shared core/server regression checks passed, including unchanged web prompt/schema/write fixtures. Root and package typechecks, scoped Biome, and the native release build passed. The packaged app displayed Cassia at 65% health with a new gate token, a two-round effect, and a used spell from a deterministic test fixture. The original empty save was restored, and the fixture was preserved as `validation-character-state-2026-10-03.sqlite` beside it.

An additional live Claude advancement used an isolated temporary save with a resolved token handoff in its narrative. Claude returned an explicit `inventoryChanges` add operation for `Bronze gate token`, and the real core committed it to Cassia's equipment in The Harvest Festival. This validates the new model contract and application path for that item event. It is not a full playthrough or live validation of every effect/spell operation.

## Harvest Festival follow-up, 2026-10-03

Owner initially authorized the festival scene, gate transition, and native validation, then stopped implementation and requested a handoff. No festival scene or runtime code changed. Continue from [the Harvest Festival handoff](harvest-festival-handoff.md) when implementation is requested again.

- Author a separate Kordavos festival square with market stalls, a performance area, harvest dressing, walkable approaches, named destinations, ambient crowds, and camera views. Reuse the existing kit and authored five-NPC roster.
- Add festival staging and local character art. Register both sets for the development viewer. Select desktop scenes by encounter, with the correct opening shot, portraits, and spatial context.
- Keep the existing position reset when encounters change. Restore saved positions within an encounter and on reopen. Guard scene changes so stale renderers and pending movement cannot write into the next encounter.
- Validate set/staging references, cast placement, destination reachability, core transitions, persisted movement, and unknown-scene fallback. Check types and scoped lint. Build with two Rust jobs and inspect the native scene and interactions using an isolated test save.
- Record actual checks and limits. Commit locally when verified. No production content mutation, push, or merge.

Resumed 2026-10-03 after review of the handoff. Owner decisions:

- Art: keep the Zephyra, Finnian, Liora, and Merrick drafts as fronts. Regenerate Karim in Blackthorn black and gold from his web portrait, without the turban. Generate every back with the gate's back pipeline (`gemini-3.1-flash-image`, 2K 9:16, green screen, world style reference) and crop portraits from the fronts.
- Performers stand on the cobbles in front of a low music stage. No elevated cast placement.
- Full run, including `CARGO_BUILD_JOBS=2 pnpm desktop:build` and packaged-app validation on an isolated save.
- Festival cast ids are the content character ids (`karim-the-jewel-merchant`), so the unrelated `liora` assassin NPC cannot collide. The gate keeps its short ids, matched by first name, so existing saves keep their positions.

### Festival results

- New set `realm-of-myr/kordavos-harvest-square` and staging `march-of-davos/the-harvest-festival`, registered for `/dev/stage` and `stage:check`. A timber-framed square with a street north to temple domes and one south to the gate. A low music stage with a canopy, Valkaran banners, and crowd musicians on it, Merrick in front. Finnian by a brazier inside a ring of onlookers. Karim's black and gold jewel stall beside an Asterian banner, Liora's green spice stall beside a Valkaran one, Madam Zephyra's plum tent with a crystal ball, a game-of-chance stall, food and craft stalls, bunting, sheaves, gourds, lanterns, and about 450 people.
- Ten labelled places for movement and the GM: each NPC's stall or spot, the stage front, the dancing, the food stalls, the middle of the square, and the street back to the gate. Three set views (square, music stage, overview) and five staging views (party, jewel stall, spice stall, fortune teller, fire-eater). The crowd keeps off the cast, the labelled places, and the camera lines of those views and of character focus.
- Engine additions: `solid` boxes and cylinders, `jewels`, `spices`, and `none` stall goods, and a ground `roads` flag. The gate's road ruts were baked into every ground and drew a seam down the square. A shared `walk.ts` replaces three copies of the footprint test. `stage:check` now checks staging art, fails on cast starting inside something solid, and reports blocked walks.
- Desktop: `src/scenes.ts` maps encounters to scenes, cast ids, portraits, the HUD place name, and the GM's map staging (named places and where everyone in the turn stands). `play.tsx` uses the staging's opening shot and pauses every loop. Speed comes from race. Scene changes reset `useStage`'s error and status, clear `window.__stage`, and ignore restores or position writes from a replaced renderer. The prompt card waits while the next scene loads, so an action is never read against the old one. Disposing a stage resolves its walks.
- Native testing found that a walk stalled while the window was covered, because frames stop. A walk now also ends on a timer at its expected arrival.
- Art: Karim's front and every back came from `gemini-3.1-flash-image` (2K, 9:16, green screen, keyed). Karim was conditioned on his web portrait, Liora's finished draft, and the world style reference. Backs were conditioned on each front and the style reference. Finnian's first back held the torch in the wrong hand and was regenerated once. His back hair reads redder than his front. Liora keeps the authored braided beard, which her web portrait does not show. Fronts are 1.5–2K px tall, which is about 1:1 at the close shot.
- Checks: eleven desktop tests pass. The three new ones cover a real core gate-to-festival advance with every festival character on its own figure and portrait, the gate's first-name figures, Clan Conflict falling back to story view, position reset, retention through a festival round and reopening, stale and unknown position writes, and the festival map staging in the GM prompt. Desktop, stage, and root TypeScript, scoped Biome, and `stage:check` pass. Browser renderer results are in [the stage engine reference](../stage-engine.md#recorded-checks-2026-10-03-kordavos-harvest-square). The release build passed with no Rust warnings. Vite reports one main chunk of 932 kB, mostly three.js.
- Native, packaged release app with live Claude, on an isolated save: the 2026-10-02 playthrough rolled back to its completed gate round. The first Continue kept the party at the gate for a second round, which the core allows. Four real actions and Garlan's turn followed, and the second Continue advanced to The Harvest Festival with its five NPCs. The window switched from the gate set to the festival square, with the festival place name, eight views, and NPC portraits in turn order.
- Pressing Madam Zephyra once framed her at her tent. Pressing again opened her card. Yeva's action became a walk toward the fortune tent facing Zephyra, clamped to 7.5 m and saved with its movement key. After relaunch on the rebuilt app, the festival returned on Branka's turn, the render report was ready with no errors, and saved positions were byte-identical after load, so nothing replayed. Branka's action then walked her toward Karim's stall and saved while cmux covered the window. Before the timer fix, a covered window held Milos's gate walk until the window came back.
- Replies took 18 s to 1 min, except one Milos reply at about 8.5 minutes. The first launch's render report read not ready because the window was hidden 20 s after launch.
- The user save was backed up, swapped out, and restored with an identical SHA-256. The test save is kept as `validation-harvest-festival-2026-10-03.sqlite` beside it. Not covered natively: a festival dice check, the live move to Clan Conflict (tested with the real core in Node), and other providers.

## New game and archive, 2026-10-03

Owner chose basic save management next. Before this, a saved adventure could not be replaced, so a finished game stayed on "Adventure complete" until the save file was deleted by hand.

- The title screen opens on launch. With a save it offers Continue and New game. A Menu button in the game returns to it.
- New game asks for confirmation and the Game Master, then starts March of Davos fresh.
- The replaced adventure moves to an `archive` table in the same SQLite file, in the same transaction as the new save. Nothing is deleted. There is no archive browser yet.
- Test start-over with a saved and a completed adventure, the archive contents, reopening, and that a plain start still refuses to overwrite. Check the packaged app on an isolated save.

Implemented. Twelve desktop tests pass, including start-over from a completed adventure, the archived save's contents, a second archive entry, and reopening. Desktop and root TypeScript, scoped Biome, and a release build with no Rust warnings passed. In the packaged app, a copy of the festival test save opened on the title screen showing "Round 3 · The Harvest Festival". Continue entered the game, Menu returned to the title, and New game asked for confirmation over the festival scene. Start new game began round 1 at the gate and switched the 3D set. The archive held the festival adventure. The user save was restored with an unchanged SHA-256. No model requests were needed.

## The Midnight Summons, 2026-10-03

Owner chose to add The Midnight Summons and play it start to finish before a full March of Davos run. It has 7 encounters, one premade hero (Thalbern), fights, and a recorded web completion with the same core. March of Davos has 45 encounters and four heroes per round.

- Bundle both adventures' packs. New game picks the adventure. The save records which one, and the core, store transitions, and titles follow it. The two adventures share no encounter ids.
- Bundle portraits for Thalbern, Wollandora, and the Owlbear from their web images, since the app only loads local images. The adventure has no 3D sets and plays in story view.
- Test starting each adventure and walking Midnight Summons' authored graph to completion with the real core. Then play it in the packaged app with live Claude on an isolated save, fix what breaks, and record the run.

Implemented. The runtime bundles `packs.json` with both adventures. New game has an Adventure picker, and the save's plan drives the core, titles, and starting heroes. Fourteen desktop tests pass. The two new ones check that both adventures load with their own heroes and that an unknown one leaves the save untouched. They also walk the real core through the owlbear to Midnight Summons' ending, then reopen it. Desktop and root TypeScript, scoped Biome, `stage:check`, and release builds with no Rust warnings passed.

The packaged app with live Claude played The Midnight Summons start to finish on an isolated save in 7 rounds:

- Broken Silence: Thalbern crept toward the noise. Perception 4 against DC 8 failed, so the owlbear came.
- Owlbear Confrontation, three rounds: his arrow hit (16 against 13), leaving the owlbear at 80% and off-balance. He evaded with Acrobatics (23 against 13), then calmed it with Animal Handling (21 against 16). The owlbear missed all three of its attacks.
- Meeting at the Stones, two rounds: Wollandora explained the stolen relics, and Thalbern accepted. Preparing for the City ended the adventure. The save recorded 10 discoveries and a running summary.
- Each reply or roll took 5–45 s, and each Continue took 15–30 s. Reopening the finished save showed its ending. New game from there started March of Davos and archived the finished adventure. The user save was restored with an unchanged SHA-256, and the run is kept as `validation-midnight-summons-2026-10-03.sqlite`.

Findings:

- Fixed: the finished adventure still said "Thalbern's turn" and offered no way forward. It now shows Adventure complete and an end panel with New game and Journal.
- Twice the GM held an encounter one more round after its authored exit already applied: after the evasion, and after Thalbern promised help. Explicit actions moved it on. Not changed.
- An NPC turn set Wollandora's status to "passing", which shows on her character card. Not fixed.
- Covered by the second run below: damage to Thalbern, critical health, and the Timely Rescue and Back Home branches.
- Story view has no artwork, since the app only loads bundled images. Thalbern's web portrait is photographic, unlike the painted art elsewhere.
A second live run on an isolated save played Thalbern recklessly and took the other ending in 11 rounds:

- He shouted and charged, so the owlbear came with no check. In six rounds of melee, all six of his attacks missed (1 to 9 against 13). The owlbear hit three times, taking him from 100% to 75% with Bleeding, then 45%, then 10%.
- At 10% the core moved to Timely Rescue. Wollandora drove the owlbear off, bound the wound, and helped him to the Stones. His 10% health and Bleeding carried through every later encounter.
- At the Stones he pleaded injury, heard the request, and then refused. Back Home ended the adventure. The user save was restored unchanged, and the run is kept as `validation-midnight-summons-wounded-2026-10-03.sqlite`.
- New findings: after the rescue, Wollandora's authored greeting still thanks him for his swiftness, though she carried him there. The GM again held the meeting one round past his first refusal. Back Home's authored text has a typo, "tobe". Bleeding is a label only and never costs health.
- Still untested in this adventure: hiding from the owlbear at the start, and asking Wollandora for more, which leads to The Missing Relics.
- Test harness only: keys typed into the app while it sat behind other windows were sometimes dropped. The harness now sets the text box through accessibility and checks it before sending.

## Midnight Summons fixes, 2026-10-03

Owner approved fixing the playthrough findings. Two touch the shared GM core, so they also change web play.

- NPC status: when an NPC skips or passes, the core replaced its status with "skipping" or "passing". Nothing reads those values, and they hid real conditions like Off-balance. Keep the existing status.
- Extra rounds: the progression rule said to continue unless a condition is clearly satisfied. After Thalbern's successful evasion, the GM still held the owlbear fight a round. Reword it to transition once events satisfy a listed condition, and to continue only when none is met yet or it waits on a choice the player has not made. Re-record the rule in the core prompt fixture, then replay the held owlbear round with live Claude to see it advance. Also replay the meeting where Thalbern promised help before hearing the mission, which should still wait for his answer.
- Content: make Wollandora's Standing Stones greeting fit arriving alone or with her, and fix "tobe" in Back Home.

Implemented. `pnpm test:gm-core` passes with the one re-recorded rule line, and the fourteen desktop tests pass. Live Claude replays from the recorded save, two tries each: after the successful evasion, both moved on to Meeting at the Stones. After Thalbern promised help before hearing the mission, both stayed and waited for his answer. That is a small sample, not a guarantee. The greeting now reads "Thalbern. The forest is grateful you are here."

## Remaining scope

One local slot and four premade player-controlled characters. The gate and the Harvest Festival are the authored 3D sets. Add further sets, character creation, AI companions, save management, narration audio, and multiplayer separately. Equipment has no separate currency or quantity ledger. Native combat and the other providers were not tested in this playthrough. The five-call batching experiment remains separate. Distribution still needs Node packaging or onboarding, signing, notarization, and an updater.

The worktree's isolated Convex project is `d20adventures-feature-desktop-stage-play`, deployment `adamant-hawk-913`. Desktop gameplay does not use it. Remove that project after the worktree is retired. Runtime details and commands are in [the desktop README](../../apps/desktop/README.md).
