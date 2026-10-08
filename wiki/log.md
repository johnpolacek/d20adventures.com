# Decision history

[Home](index.md) · [Sources](Sources.md) · [Plans](plans/index.md) · [Roadmap](roadmap.md) · [Architecture](Architecture.md)

This log retains durable decisions and dated evidence. Git owns detailed implementation history. Past validation does not establish current production health.

## 2026-10-08, alpha store scope and desktop linking

Owner set the store work as alpha: web checkout waits until at least beta, and testers get adventures as grants. Implemented on `feature/adventure-store`: the catalog and entitlements, and linking the desktop app to a website account with a code approved on the website, the token in the Keychain. Not merged or deployed. See the [Adventure store plan](plans/feature-adventure-store.md).

## 2026-10-07, selling adventures

Owner chose to make money by selling adventures rather than a host subscription. First-party adventures sell first, and a creator marketplace with a revenue cut comes later. Solo play and host mode are free. Host mode lets one player's app run the GM through their CLI while friends join from a browser. This replaces the 2026-10-01 server-GM token subscription for multiplayer. Estimated relay and asset cost is 1 to 5 cents per hosted game. A paid host subscription would have charged for a feature powered by the host's AI subscription. See [Desktop local play](plans/desktop-local-play.md#owner-decisions) and the [Adventure store plan](plans/feature-adventure-store.md).

Found while planning: the token ledger's Convex mutations are public and accept any user id. Recorded in [Maintenance](plans/maintenance.md).

## 2026-10-05, dice sounds

Owner chose a dice sound as the die lands. Rolls now clatter, land with a tock and end on a short cue for the verdict, all made in Web Audio. Scene settings has a sound switch. See [the plan](plans/roll-results.md).

## 2026-10-05, dice rolls as the hero of the narration

Owner wanted better graphics for roll results: "This is D20 adventures so the dice rolls are the hero." A roll in the narration was one sentence of numbers. It now shows the roller, a 3D d20 that tumbles and lands on the roll, the total against the DC, and a stamped verdict, with natural 20s and 1s called out as criticals. See [the plan](plans/roll-results.md).

## 2026-10-05, saloon wood and windows

Owner found the wood short of the paintings' detail and chose windows with depth. Four wood textures were painted from the interior paintings, and the saloon's windows became real openings with one-sided glass: warm from outside with the room showing through, clear from inside onto the night. See [the stage engine record](stage-engine.md#saloon-wood-and-windows-2026-10-05).

## 2026-10-05, the saloon raised to the art

Owner found the boat's interior below the quality bar. Against the crate, battle and fake paintings it was evenly lit, with flat blue window panels, striped thin timbers and box lanterns. Sets can now declare rooms that dim the sky's light and switch to their own lamps while the camera is inside. The saloon was rebuilt with upright red-brown boards, ribs, deep beams and knee braces, framed and shuttered windows, iron-bound posts, ship's lanterns, a studded porthole door, a chart table and gauges. See [the stage engine record](stage-engine.md#rooms-and-the-saloons-finish-2026-10-05).

## 2026-10-05, Covert Cargo's meeting inside the boat

Owner asked to check the 3D against the adventure's source and art. The source's later encounters put everyone in the cabin, while The Shipment's intro left the escorts on the pier and Poppen in reeds. Owner chose the logical staging: the whole meeting in one larger saloon, the elves guarding the deck, Poppen in the bushes at the treeline, and four intro lines edited to match. Every boat encounter now plays in that saloon, and walks route through its door. See [the plan](plans/covert-cargo-boat-meeting.md).

## 2026-10-04, the crate inside the tug

Owner pointed out that Covert Cargo's crate belongs inside the boat, as in the original art. The tug's saloon is now a room with an open door. Lyra opens the adventure inside it with the crate before her, and the camera looks over the crate at her. Aelar is offstage until the narration opens the cabin door, then walks out of it. See [the stage engine record](stage-engine.md#covert-cargos-crate-inside-the-tug-2026-10-04).

## 2026-10-04, speech bubbles for every speaker

Owner asked why some characters got speech bubbles and others not. A bubble needed a paragraph that named exactly one character. Speakers now come from the speech tag beside each quote, including pronouns and unnamed descriptions such as "the elf", so every quoted line in Covert Cargo's opening gets its speaker's bubble and plate. See [the stage engine record](stage-engine.md#narration-shots-2026-10-04).

## 2026-10-04, narration follows who each paragraph is about

Owner found the camera stayed wide on a paragraph about Lyra and the Continue and Skip buttons wrapping. Narration views now read names and pronouns across paragraphs, so a paragraph about Lyra frames Lyra, and a newcomer introduced without a name is not mistaken for the last character. The buttons keep to one line with drawn arrows, and long narrations get smaller progress dots. See [the stage engine record](stage-engine.md#narration-shots-2026-10-04).

## 2026-10-04, covers edge to edge, the camera follows the narration

Owner asked for covers with the art edge to edge and less text, reported the Lyra view blocked, and expected Continue to change the view with the story. Covers now carry only the title and the player count. Each paragraph of narration picks a view from the people it names or the place it describes. Named character shots swing clear of cabins, and characters turn toward a camera that had to swing round them. Poppen's reed shot looks over his shoulder at the pier. See [the plan](plans/desktop-module-covers.md#owner-feedback-same-day).

## 2026-10-04, module covers for the desktop New game screen

Owner asked for adventure art that feels like a D&D module. Each bundled adventure now has a painted portrait cover in the manner of a classic module, framed in our own trade dress with a module code, colour band, title and player count, beside the party setup. Covers come from the checked-in `scripts/adventure-covers.ts`. See [the plan](plans/desktop-module-covers.md).

## 2026-10-04, desktop heroes and Covert Cargo merged into main

Owner merged `feature/desktop-heroes` into main as `5baadf7` with `wt:finish`. It brings hero creation, the local roster and AI companions, all four Myr adventures in the desktop app, and Covert Cargo in 3D with painted textures, leaf cards, water reflections and character shots that swing clear of walls. Both plans are archived under [plans/zzz-completed](plans/zzz-completed/feature-desktop-heroes.md). The worktree's Convex project still needs deleting in the dashboard.

## 2026-10-04, Covert Cargo release check

Release builds passed with no warnings. In the packaged app the play view ran at a median 51 to 52 fps on the pier and 58 in the cabin and on the riverfront, balanced tier, with the machine swapping. The check found turn cameras inside the tug's saloon and behind the cabin wall. Character shots now swing round the character until the view is clear, and the cabin walls are solid. A rebuilt app showed both turns framed cleanly. See [the plan](plans/zzz-completed/covert-cargo-3d.md#release-check-2026-10-04).

## 2026-10-04, Covert Cargo speed pass

Owner asked to bring the river scenes back up. A frame bench found leaf drawing, leaf shadows in a 4096 map and the reflection as the main costs. Leaf cards no longer cast shadows on the pier, its shadow map is capped at 2048, leaf masses use fewer cards, painted wood is cheaper, and the reflection skips small growth. The river view went from 1.82M to 1.09M triangles. Balanced reads 66 fps and high 40 to 48 on a busy dev machine, with no visible change. See [the plan](plans/zzz-completed/covert-cargo-3d.md#speed-pass).

## 2026-10-04, Covert Cargo water reflections, rounder and wider tug

Owner picked water that reflects the boat and its windows, a rounder, taller cabin like the painting, and a wider boat. Stageview gained a tier-scaled planar reflection for water that opts in, so lit windows streak down the river as in the art. The tug is 5.6 m wide with a curved saloon bow of windows, a 3 m cabin and an overhanging upper deck. See [the plan](plans/zzz-completed/covert-cargo-3d.md#fifth-pass-reflections-a-rounder-cabin-a-wider-tug).

## 2026-10-04, Covert Cargo leaf cards, crate hold, bigger tug

Owner picked painted leaf cards, the crate hold's ropes, chains and posts, and a bigger boat. Crowns and bushes are now clusters of painted leaf cards, which cut the pier's triangles by more than half and paid for much denser woods. The cabin has knotted ropes, chains and iron-banded posts round the crate. The tug is 17 m. Within budget at 1.15M triangles. See [the plan](plans/zzz-completed/covert-cargo-3d.md#fourth-pass-leaf-cards-the-crate-hold-a-bigger-tug).

## 2026-10-04, Covert Cargo painted textures, crate, hillside and fog

Owner asked for wood like the art, a mossy wooded hillside beside the boat, a lot of fog, and a bigger, cooler boat and crate. No Blender or Godot was needed. Textures are painted from the art with the standee image model and wrapped along each board's grain. New detailed crate, a bigger tug, a heightfield hill with dense foliage and moss curtains, fog that starts 14 m out, and mist banks. Within budget at 2.42M triangles. Foliage shape and water reflections remain the main gaps. See [the plan](plans/zzz-completed/covert-cargo-3d.md#third-pass-painted-textures-props-hillside-fog).

## 2026-10-04, Covert Cargo boat and light matched to the art

Owner said the boat and lighting should match the art more exactly. The `riverboat` builder is now the painted tug with a lofted hull, lit saloon and glazed pilothouse. Sets gained static point lights. The pier is saturated blue with warm lamp light. The cabin is neutral and dim with warm lanterns and a teal door. Water reflections of the windows remain a gap. See [the plan](plans/zzz-completed/covert-cargo-3d.md#owner-feedback-second-pass).

## 2026-10-04, Covert Cargo in 3D

Owner asked for the two-player adventure as a full 3D experience from its art. On `feature/desktop-heroes`: every Covert Cargo encounter now has a scene. The Mordava pier before dawn, the riverboat's lamplit cabin, the Kordavos riverfront and an old forest path, with standees for Reinhard, Silas, Aelar and the two elven crew. New `riverboat`, `pier`, `ship`, tree moss and `ancient` tree builders. A checked-in generator writes the sets. Renders match the art's key frames and stay within budget after trimming the pier from 3.2M to 1.8M triangles. The desktop maps all nine encounters and its tests pass. The packaged-app check waits on an unlocked screen. See [the plan](plans/zzz-completed/covert-cargo-3d.md).

## 2026-10-04, desktop heroes, AI companions, and all four adventures

Owner chose stock figures first with art painted through Codex or Grok as an upgrade, You or AI per hero with AI as the default, and a short creation flow. On `feature/desktop-heroes`, unmerged: the desktop app bundles all four Myr adventures, keeps a local hero roster, drafts a hero from race, class, name and an idea in one CLI call, and starts a party of premades and roster heroes within each adventure's rules. AI heroes play through the core's companion path. Scenes map any party onto their slots. Fourteen stock standees and four premade standees were painted with the checked-in `scripts/stage-standees.ts`. Paint makes a hero's standee through the player's own Codex or Grok, keyed locally. With live Claude, The Road to Kordavos played to its end with two created heroes, one played by the AI. The packaged app showed a Grok-painted hero at the Kordavos gate and ran an AI turn. See [the plan](plans/zzz-completed/feature-desktop-heroes.md).

## 2026-10-03, desktop Stageview merged into main

Merged `feature/desktop-stage-play` into main as `e96a0de` with `wt:finish`. It brings the desktop app, the shared GM core, the stage package, both adventures' 3D sets and the Midnight Summons art. The branch plan is archived at [plans/zzz-completed](plans/zzz-completed/feature-desktop-stage-play.md). Remaining work is distribution, more 3D sets, and character creation. The worktree's Convex project still needs deleting in the dashboard.

## 2026-10-03, GM decisions see the whole round, every Midnight Summons branch played

Playing the last untested branches found that the GM's move-on decision saw only the last paragraph of the current round, so an NPC reply hid the player's action. That stalled Meeting at the Stones and explains earlier rounds held past an authored exit. The shared core now gives the decision the whole round, which also fixes web play. A live desktop run then hid from the owlbear, reached The Missing Relics, and ended in 7 rounds. Two content typos are fixed. Bleeding stays a label. See [the fix and run](plans/zzz-completed/feature-desktop-stage-play.md#gm-decision-sees-the-whole-round-2026-10-03).

## 2026-10-03, Standing Stones matched to the art, neutral night light

Owner feedback asked for neutral light, more ground detail, and stones much closer to the source art. Night sets now use a white camera fill and a neutral paint grade. New world-painted `rock`, `meadow`, `grass` and `water` materials and `flagstones`, `grass` and `mountain` builders give the ground and stones real detail. The Standing Stones were rebuilt and recomposed from measurements of the art, with the moon over the valley. Follow-up: darker night skies, a wider river, and Wollandora regenerated much closer to her art, with neutral night grading for characters too. The owner approved it, and all seven scenes rendered without errors in a release build. See [the art pass](plans/zzz-completed/feature-desktop-stage-play.md#standing-stones-art-pass-2026-10-03) and [authoring lessons](stage-authoring.md#lessons).

## 2026-10-03, first forest set and the 3D authoring pattern

Added a moonlit Valkarr forest trail for three Midnight Summons encounters, with woodland builders, a foliage material, night sky support, and standees for Thalbern, Wollandora, and the Owlbear. Recorded the authoring pattern: review on the web viewer first, then one check in the desktop app. See [Stage set authoring](stage-authoring.md).

## 2026-10-03, Midnight Summons fixes in the shared core and content

NPCs that skip or pass keep their real status instead of "skipping" or "passing". The progression rule now moves on once events satisfy a listed transition and waits only for unmade player choices. Live replays advanced after the owlbear evasion and still waited at the meeting. Wollandora's greeting fits either arrival, and a Back Home typo is fixed. Both core changes also apply to web play. See [the fixes](plans/zzz-completed/feature-desktop-stage-play.md#midnight-summons-fixes-2026-10-03).

## 2026-10-03, The Midnight Summons played to the end on desktop

The desktop app now bundles The Midnight Summons beside March of Davos, and New game picks the adventure. In the packaged app with live Claude, Thalbern finished the adventure in 7 rounds, including a three-round owlbear fight with an attack, an evasion, and Animal Handling, then the ending and starting over. The run found and fixed an end screen with no way forward. A second run had Thalbern beaten to 10% health, rescued by Wollandora, and refuse the mission, reaching the Back Home ending in 11 rounds with his wounds carried through. Open findings are an NPC status left as "passing", rounds the GM extends past an authored exit, an authored greeting that ignores the rescue, and a content typo. Fourteen desktop tests, typechecks, lint, and release builds passed. Details: [the integration plan](plans/zzz-completed/feature-desktop-stage-play.md#the-midnight-summons-2026-10-03).

## 2026-10-03, desktop New game and archive

A finished or unwanted adventure could not be replaced without deleting the save file. The desktop app now opens on a title screen with Continue and New game, and a Menu button returns to it. Starting over archives the old adventure in the same SQLite file and transaction. Twelve desktop tests, typechecks, lint, a release build, and a packaged-app check on an isolated save passed. See [the integration plan](plans/zzz-completed/feature-desktop-stage-play.md#new-game-and-archive-2026-10-03).

## 2026-10-03, Harvest Festival desktop scene

Resumed the handoff in `feature/desktop-stage-play` with owner decisions: keep four Codex drafts, regenerate Karim in Blackthorn black and gold, generate backs with the gate pipeline, keep performers on the ground in front of a low stage, and run the full native check. Added the Kordavos harvest square set and Harvest Festival staging, an encounter-to-scene map for desktop, festival map staging for the GM, and content-id cast ids so the unrelated `liora` NPC cannot collide. Engine additions are solid primitives, named stall goods, a ground `roads` flag, shared walk checks, and walk checks in `stage:check`. Native testing found and fixed a walk that stalled while the window was covered.

Eleven desktop tests, TypeScript, scoped Biome, `stage:check`, browser renderer checks at DPR 2, and two release builds passed. The packaged app with live Claude advanced from the gate to the festival on its second round, switched sets, focused and opened Madam Zephyra, saved Yeva's and Branka's walks, and reopened without replaying them. The user save was restored unchanged. Details: [the integration plan](plans/zzz-completed/feature-desktop-stage-play.md#festival-results).

## 2026-10-03, Harvest Festival handoff

Owner initially authorized the second desktop 3D scene, then stopped generation and requested a handoff. Only planning documents changed. No scene, staging, runtime, or UI code was written, and no new build or tests ran. Five character-image requests had already completed before cancellation was checked. Their paths and prompts are recorded in [the handoff](plans/harvest-festival-handoff.md). They remain unreviewed outside the repo and are not integrated. Work remains isolated on `feature/desktop-stage-play`.

## 2026-10-03, desktop character-state application

Connected structured character patches to live desktop state in `feature/desktop-stage-play`. Health, status, item transfers, effect changes, and spell use now commit with the new turn. Encounter changes preserve the party's live values instead of replacing them with premade defaults. NPC state is remembered, old roll flags clear, effects expire once per round, and spells recharge on encounter changes. Character cards show the current saved values and GM requests receive them as context.

New CLI advancement responses require explicit operations or an empty character-update list. Invalid references get one correction, then reject the turn without partial writes. Older saves remain readable, with no automatic replay of ambiguous prose notes or changes to historical turn snapshots. Shared schemas accept both historical notes and typed operations. Web application semantics remain unchanged.

Eight desktop tests, shared core/server regression checks, root/package TypeScript, scoped lint, and a native release build passed. A temporary native fixture visibly showed a new item, 65% health, a timed effect, and a used spell. The original empty save was restored. This follow-up does not establish full combat or all-provider coverage. See [the integration plan](plans/zzz-completed/feature-desktop-stage-play.md#character-state-follow-up-2026-10-03).

A separate live Claude check advanced an isolated fixture to the festival, returned an explicit add operation, and persisted the Bronze gate token in Cassia's equipment. No user save, production data, or web gameplay was changed by the check.

## 2026-10-02, desktop Stageview and real local turns

Implemented `apps/desktop` in the isolated `feature/desktop-stage-play` worktree, based on main plus the committed GM core branch. Extracted the renderer to `packages/stage` and retained the web demo. The Tauri client bundles March of Davos, stage assets, fonts, and a Node game worker. It uses the player's installed AI CLI, the shared GM core, and SQLite. Actions, dice, NPCs, authored transitions, journal, camera controls, and player movement are connected to real state. The gate has a 3D set. Later encounters use story view.

The packaged native Claude playthrough covered a failed Persuasion check, natural die persistence, no-roll replies, an NPC response, the gate-to-festival transition, and reopening the saved festival turn. The native renderer reported ready with no JavaScript errors. Three integration tests, root/package typechecks, scoped Biome, renderer content checks, frontend build, Next production build, and macOS release build passed. Details are in [the integration plan](plans/zzz-completed/feature-desktop-stage-play.md).

Local saves preserve retry checkpoints and reject stale input. The die is saved before inference. CLI errors cannot commit inherited fallback prose or silently skip a required check. World-state patches receive strict nested validation. Current core behavior still records character patches without applying inventory/effect changes. Only Claude and the social gate encounter were tested natively. One save slot, four premades, Node 24+, CLI sign-in, and unsigned distribution remain explicit limits. No production data changes, push, or merge into main.

## 2026-10-02, shared GM core extraction

Completed phase 1 locally in `feature/gm-core`, based on spike commit `7ff0b2d`. The pnpm workspace now contains `packages/gm-core`. Twenty gameplay service modules, eight character-generation operations, reply/roll/advance orchestration, shared schemas/types, and pure helpers use typed per-instance interfaces. `lib/gm-server` supplies the current model, billing, Clerk, Convex, content, and narration adapters. Existing server action and import paths remain compatible. No UI or Convex schema changes were needed. The strict-state and combined-call spike experiments were not promoted into the web runtime.

Standalone package TypeScript and browser bundling passed without Node or web dependencies. Regression checks matched every prompt, schema, and recorded write in the seven-call pre-extraction GM turn, plus nine character-generation cases. Access, companions, independent runtimes, stale/duplicate/invalid transitions, content re-pinning, completion, retries, sanitation, and billing errors passed. Root TypeScript/lint, wiki batches A through F, four adventure bridges, public flow checks, and the Next production build passed. Root lint reported only two existing informational suggestions in unrelated scripts.

All 16 Playwright tests passed against the isolated worktree after installing the matching Chromium and supplying Portless's local CA. An authenticated browser completed The Midnight Summons in seven turns on `patient-shepherd-476`, using the real `gemini-3.5-flash-lite` server adapter. The run covered failed and successful rolls, combat, NPC initiative, health changes from 100 to 80 to 60, no-roll NPC dialogue, encounter transitions, and final health 100. The ending UI and a fresh Convex read confirmed `status: completed`, an end timestamp, and `currentEncounterId: preparing-for-the-city`.

The server and test browser were stopped. No push, merge, or production deployment was performed. One live adventure does not establish multiplayer, speech generation, or desktop reliability. The desktop shell is the next implementation step. Contracts and detailed evidence are in [GM core](gm-core.md), the [extraction plan](plans/feature-gm-core.md), and [desktop phase 1](plans/desktop-local-play.md#phase-1-extract-gm-core).

## 2026-10-02, desktop state validation and pre-roll batching

Completed the authorized refinement in `spike/desktop-local-play`. Both native trial variants derive a strict nested model contract from the real adventure-patch schema and execute the real wiki commit handler over an in-memory database. Every accepted field survived in all eight runs. Invalid fields now trigger a correction in the spike instead of silently disappearing. Character updates are retained in the saved turn patch, but the existing game code does not apply them to live character fields. That remains explicit follow-up work.

Combining player formatting, roll selection, and situational modifier reduced seven CLI requests to five, with the dice result still supplied separately. Claude's full turn changed from 23.149 to 22.528 s, Codex from 40.516 to 26.114 s, and Grok from 103.632 to 86.015 s. Native dice-readiness render times changed from 8.800 to 4.297 s, 14.532 to 6.756 s, and 52.735 to 24.187 s. Initial action text did not improve for every provider. The API text baseline changed from 13.390 s with five JSON-format retries to 6.523 s with one retry. These are single paired samples, not a stable latency benchmark.

Claude and Grok saved richer state and advanced to the festival. Codex supplied summary-only patches and remained at the gate, omitting the fee waiver from its advancement summary. The API baseline invented some scene details. JSON validity and field retention therefore remain separate from narrative continuity and referential integrity. Gemini compatibility was not retested and does not block the other adapters.

Recommendation: proceed to core extraction, retain both request paths, and use Claude for the first interactive demo while keeping Codex and Grok selectable. Apply character state and add broader gameplay coverage as the desktop is built. Ten focused tests, root TypeScript, scoped Biome, Rust checks, packaged native trials, render instrumentation, and exact-prompt/saved-state replay passed. See [phase 0](plans/desktop-local-play.md#strict-state-and-fewer-requests-2026-10-02). Changes committed locally, with no web app changes, push, merge, CLI credential access, or production mutation.

## 2026-10-01, desktop persistent adapters and complete turns

Completed the follow-up in `spike/desktop-local-play`. Codex app-server and Gemini/Grok ACP adapters now launch with existing CLI homes and sign-in. User-configuration loading no longer rejects a provider. The native comparison passed both existing schemas on first answers for Claude, Codex, and Grok, using two requests in one persistent session each. Progression took 3.725 s, 11.678 s, and 20.464 s, respectively, versus 0.941 s for the API baseline. No observable model tool calls or host-operation requests occurred in the successful trials.

A complete contested-social turn ran through the real player formatting, reply, roll, NPC, and current wiki advancement services, with in-memory storage and authored source. Claude, Codex, and Grok each completed seven calls with no retries and advanced to the festival. Total times were 31.474 s, 59.437 s, and 252.396 s. The `gemini-3.5-flash-lite` text API comparison completed in 8.291 s with ten requests, including three bare-JSON correction retries. This baseline did not use the web app's provider-enforced structured-output mode.

Gemini CLI 0.60.0 initialized ACP but the provider rejected its personal-login path with error `-32000`, saying the client is no longer supported for Gemini Code Assist for individuals and directing migration to Antigravity. No GM inference occurred. No CLI credentials were inspected, copied, or migrated. This is an observed account/client failure, not the withdrawn settings gate or a universal statement about Gemini accounts.

The turn audit found a concrete schema issue: the top-level wiki response leaves `adventurePatch` as `z.unknown()`. All three CLIs supplied invalid nested transition fields and the existing service used its summary fallback, losing proposed structured world-state updates. The baseline patch parsed with some provided fields discarded. Offline replay matched every live prompt exactly and recorded the post-validation patch without new inference. No web app fix was made in this spike.

Recommendation: **go for further local-play development with the three working adapters.** Resolve Gemini compatibility, structured world-state output, and serial-call latency before broader support or release claims. Combat, AI companions, usage limits, production auth, and real persistence remain outside this turn fixture. The earlier art and native sign-in/connectivity evidence remains available. The follow-up launch was signed out, so persistent Clerk sign-in is not established.

Validation passed for five focused tests, scoped Biome, root TypeScript, Rust formatting and Clippy, a packaged Tauri build, native runs, and exact-prompt replay. Results, per-call timing, source hashes, and limits are in [phase 0](plans/desktop-local-play.md#phase-0-spike). Changes are committed locally. No push, merge, production mutation, or web app change.

## 2026-10-01, desktop isolation requirement reconsidered

The owner challenged the blanket ban on user settings, tools, and MCP as a prerequisite for local CLI support. Restrictions need a concrete basis. The earlier no-go and Claude-first recommendation is withdrawn. All four providers remain in scope.

The first spike established missing ignore-settings controls, not a gameplay failure or unavoidable unwanted action. Codex, Gemini CLI, and Grok GM modes were skipped before inference and remain untested. Their saved `blocked` statuses describe the former trial rule, not a failed provider benchmark. Claude's measured success and the image and webview results remain valid.

The [revised phase 0 basis](plans/desktop-local-play.md#revised-basis-for-restrictions-2026-10-01) calls for testing output quality, JSON validity, latency, and relevant execution controls. A documented unwanted action can justify a narrow restriction. Configuration loading alone cannot. The app must still leave CLI credentials entirely inside the installed CLI.

Updated the plan, roadmap, indexes, worktree status, and spike README. This is a documentation and interpretation correction. The existing harness still applies its original gate, and the three missing adapters and live trials remain work to do. No runtime permissions changed and no new model calls ran.

## 2026-10-01, desktop phase 0 findings

The recommendation in this entry was superseded by the reconsideration above. Measurements are unchanged.

The isolated Tauri spike is in `apps/desktop-spike/` on `spike/desktop-local-play`, created with the approved worktree script. Its empty Convex project is `d20adventures-spike-desktop-local-play`, deployment `gallant-squirrel-646`. No web app, root dependency, shared schema, billing, production data, or CLI credential changes.

Claude Code 2.1.287 ran an authored Kordavos progression fixture from the real prompt service and a separate roll-schema probe in one persistent process. Its startup reported no tools, settings-derived capabilities, skills, plugins, or MCP. Progression took 4.180 s, including 0.781 s initialization. The second request took 1.451 s. Both passed the existing zod schemas on the first answer, one inference request each. The `gemini-3.5-flash-lite` API baseline passed in 2.283 s and 0.615 s. Claude was more vivid and slightly better grounded in this one sample. A complete gameplay pipeline was not measured.

Codex app-server, Gemini ACP, and Grok ACP were detected but blocked before GM inference. Their tested versions did not provide a verified way to ignore user settings while preserving existing CLI sign-in without handling credentials. No GM latency or quality result exists for those three. Claude also needed explicit built-in plugin overrides beyond safe mode. The final locator bypasses GUI PATH wrappers by preferring known installed binaries.

Codex generated a portrait in 44.022 s and a front/back sheet in 48.073 s. Grok took 12.799 s and 13.863 s. All now have locally removed backgrounds and split standees. Three used chroma key. Codex ignored the standee's green-background instruction, so local macOS Vision supplied the mask. Visual review found usable silhouettes, some hair-edge fringing, and portrait-to-standee detail drift.

Clerk signed in the existing test account in the packaged `tauri://localhost` webview through a single-use development ticket. The Convex React WebSocket connected and the real query resolved against the empty isolated database. OAuth redirects and authenticated Convex JWT authorization remain untested. No session secrets were saved in evidence.

Recommendation: **no-go for the four-provider GM promise under the current isolation rules, conditional go for a Claude-first follow-up if the owner accepts narrower support.** The four-provider execution requirement remains unmet. This does not change the owner's product scope or authorize a web migration. The [phase 0 results](plans/desktop-local-play.md#phase-0-spike) contain metrics, source and artifact links, limitations, and the next gates.

Validation passed for three focused tests, scoped Biome, root TypeScript, Vite production build, Rust formatting and Clippy, a packaged debug Tauri app, native UI trials, and local segmentation. Changes are committed locally. Nothing was pushed or merged. The worktree and isolated Convex project remain for review.

## 2026-10-01, stage-first turn page demo merged

The scripted gate-scene mock (`feature/stage-turn-mock`, 2026-09-29 to 10-01) is merged and public at `/demo/kordavos` for feedback. It makes no model calls and is noindexed. Owner decisions made along the way are recorded in [Stageview](plans/stageview.md#product-decisions):
- Mapview is for larger maps.
- Turns work like Baldur's Gate 3, with movement as game state, coming from the written action.
- The narration stays as text, stepping through by default.
- Intros are staged and belong to the adventure plan.
- Rolls can interrupt a resolution, as contests.
- The scene is played as written: the party meets in line, then faces the sergeant.

Evidence:
- The narrative-to-movement eval scored 8/8 on the gate scene with `gemini-3.5-flash-lite`.
- Full step-throughs of both pickpocket outcomes ran with no console errors.

Details: [Stage-first turn mock](plans/feature-stage-turn-mock.md).

## 2026-10-01, desktop local play direction

Owner proposed a Tauri desktop app that becomes the only game client. Web play is deprecated once it ships. Solo play is free and runs the GM through the player's own installed AI CLI and subscription, including Claude Code, Codex, Gemini CLI, and Grok. Multiplayer keeps the server GM and is paid by a subscription granting tokens at roughly current pricing. Narration is an optional player-supplied voice provider. Players generate characters or use premades. The audience is AI-savvy tabletop players, and requiring a CLI is acceptable. Distribution is a notarized direct download. Local content is authored adventures with pre-baked art.

Anthropic's Claude Code legal page, read the same day, permits an end user signing in to the unmodified Claude Code binary with their own subscription. The app must not touch credentials, intermediate usage, or use the Agent SDK for subscription play. The owner accepts the terms risk for the other CLIs.

Game logic moves into a shared TypeScript package for the server and desktop. Stageview's stage-first turn page will be built in the desktop app, not the web app. Local players supply art and narration through their own CLIs or keys, with no tokens. Voice provider is TBD. Authoring moves into the desktop app, and admin stays on the web. Phones are TBD, and focus is desktop. No code was written. See [Desktop local play](plans/desktop-local-play.md).

## 2026-10-01, wiki reconciliation

- Audited plans against local main and Git history. Rebuilt the dashboard around active Stageview work, maintenance, and reference guides.
- Removed 26 completed planning documents and seven obsolete comparison images. Preserved engine details in [Stage engine](stage-engine.md), current narration behavior in [Storyview](storyview.md), and content contracts in [Wiki adventures](wiki-adventures.md).
- Rewrote Stageview to separate merged engine work from remaining staging, integration, and coverage. Corrected Mapview storage and integration status.
- Updated the testing runbook, architecture, roadmap, source briefs, and agent-guide filenames. Condensed old log entries whose detailed implementation history is already in Git.
- Carried unresolved checks and cleanup into [maintenance](plans/maintenance.md), including Storyview validation, the test wrapper, editor clearing, and remote resources.
- Corrected older content-pinning claims. Current live adventures compile current source and re-pin provenance on advance. The rollback test covers separate artifact modules.
- Recorded Storyview's implemented automatic split charging and paragraph reuse, which supersede the original on-demand-only plan.
- Verification passed for 144 local links and heading anchors across 21 documents, documented pnpm scripts and explicit source paths, stale-reference searches, and diff whitespace. Routes were checked against the source tree. No app build, browser playthrough, deployment, or remote cleanup was performed.

## 2026-09-29, Stageview direction and engine

Owner chose Stageview as the future primary play screen, with docked text/input, complete readable narrative, phone landscape play, and text fallback. Community sets must be declarative data interpreted by trusted code.

The old r3f encounter stack was removed in merge `b06a42b`. The map-only panel replaced its map surface. Paid standee/mini products were removed while historical ledger data and legacy schema fields were retained. No player purchase migration was required.

The v5 engine port merged in `384a622`: plain three.js, scoped atmosphere, painterly post-processing, instanced front/back crowd cards, standees, bounded set/staging specs, Kordavos gate, and a development preview. Named characters use detailed front/back art. Earlier procedural-only and overlay directions were superseded.

Recorded validation: TypeScript, lint, build, set checks, and GPU verification passed. Every tested shot fit 300 draw calls and 2.5M triangles. Ultra at DPR 2 ran 21 to 28 fps, high at DPR 1.5 ran 52 to 54 fps with motion disabled, and steady-state JS heap was 42 MB. Mobile tier results came from the desktop, not a phone. See [engine details](stage-engine.md).

Removal checks covered the extracted map panel on a fixture, not a real adventure turn. Fifteen production-compatible Playwright cases passed. The admin test passed separately in development, while production redirected to the missing sign-in route.

Convex production deployment to `marvelous-mink-850` shipped the ledger argument change and removed old visit indexes. The separate prototype repo/site was published. This does not establish deployment of later frontend commits.

Old local branches `2d-maps`, `minimap-claude`, and `claude/competent-moore-d09a8e`, plus remote `origin/claude/stoic-gates`, were retired. Remote asset and temporary-project cleanup remained separate work.

## 2026-09-15, static homepage

The homepage became a static public shell with personalized welcome and token data loaded through private APIs. It bypasses Clerk middleware. Clerk's cookie-only cache action was verified separately.

Recorded validation: production build, TypeScript, lint, 15 production-compatible Playwright cases, and authenticated browser checks on an isolated Convex project. Public responses had cache hits and no Clerk auth headers. Temporary test adventures were removed.

The feature merged in `46a0cfc`. No production deployment occurred in that session. The temporary Convex project still had a deletion reminder.

## 2026-08-31, public rendering

Removed request-wide visit tracking, root-layout request reads, and broad Clerk matching. Public content routes became static. The homepage remained dynamic at this point and was subsequently changed on September 15.

Recorded validation: build, TypeScript, lint, eight Playwright cases, and cache/header checks passed. The top-level test wrapper still waited on unused TCP port 4000.

## 2026-08-25, adventure listing

Explicitly included Realm of Myr source files in Next.js output traces. Replaced positional adventure curation with one grid and independent loading, so one invalid adventure does not hide the others.

Recorded production S3 audit: three adventures lacked source, and March of Davos had incomplete source. All four used repo fallback. The focused production build carried 201 source files, and browser verification showed four working adventure cards.

## 2026-07-06, live content changes

Changed live turn advancement to re-pin content provenance when the authored source changes. Current turn/encounter guards still reject concurrent stale advances. This superseded the earlier strict content-hash rejection.

## 2026-07-05, layout and narration

Merged the responsive character/narrative/right-rail layout and Storyview v1. Narration used stable voices, cached audio, and generation claims. The original browser check covered playback, replay, and concurrent requests. Later code added automatic generation, shared charging, and incremental paragraph reuse.

## 2026-07-03, Mapview

Merged Mapview v1, including the SVG catalog, admin generation, stored per-encounter maps, and player fullscreen view. Recorded a fresh-player Midnight Summons playthrough covering its seven encounters.

Visual guarantees such as connected paths and tree density belong in code. The model prompt alone was insufficient. NPC staging must match the intro, with explicit `startNear` and stored token replacement after changes.

## 2026-06-12, wiki cutover and worktrees

Completed the registered-adventure discovery and gameplay cutover. Kept legacy remote plan JSON as a fallback instead of deleting it. Reconciled richer March of Davos production source into the repo, then cleared its adventure source prefix so runtime used the complete repo source. Setting-level residue was recorded for later review.

Cutover deployment was recorded for Convex production and frontend main `3857148`. Immutable artifact rollback was tested in memory. Live content re-pinning later changed the gameplay behavior, as recorded above.

Added the [worktree workflow](plans/parallel-dev-worktrees.md): one isolated Convex project per branch, Portless URLs, shared S3/Clerk, and no-ff merges.

## 2026-06-11, release hardening

Implemented pre-write validation for admin source changes, complete-source fallback, canonical admin routes, and formatting cleanup for that baseline.

Authenticated Midnight Summons playthrough reached completion, including rolls and encounter transitions. Covert Cargo reached a live transition in practice mode, not a full recorded completion. Browser testing exposed and fixed legacy-plan reads and solo redirect handling that bridge tests missed.

Converted the maintained wiki from HTML to Markdown.

## 2026-05, wiki foundations

Established authored markdown encounters, JSON character sheets, compiled runtime artifacts, Convex live adventure state, validated change sets, revision restore, and AI-assisted editing.

Migrated all four Myr adventures and replaced the legacy plan editor with chat and key-field editing. Chat changes apply directly through validated canonical writes. New community-adventure creation remained deferred.
