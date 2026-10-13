# D20 Adventures

**Home** · [Plans](plans/index.md) · [Roadmap](roadmap.md) · [Architecture](Architecture.md) · [Sources](Sources.md) · [Log](log.md)

D20 Adventures is a narrative RPG with an AI Game Master, authored adventures, D20 checks, and live turn state in Convex.

Desktop integration updated on 2026-10-03 in `feature/desktop-stage-play`, including durable character-state application and the Harvest Festival 3D scene. This worktree includes the committed GM core extraction. Main and production remain separate.

| Area | Current state |
|---|---|
| Gameplay | Text turn UI with Storyview audio and optional 2D Mapview. |
| Content | Four Realm of Myr adventures use the wiki runtime. Production cutover completed in June 2026. |
| Current priority | Desktop Stageview is connected to the local GM flow in this worktree. Extend authored set coverage and finish distribution. |
| Latest recorded renderer validation | 2026-09-29, engine build/typecheck/lint and GPU checks. Every tested shot stayed within 300 draw calls and 2.5M triangles. Phone performance remains unmeasured. |
| Latest gameplay validation | 2026-10-03, native Claude playthrough of The Midnight Summons start to finish, including a fight, the ending, and starting over. Also a native gate-to-festival advance into the new festival set, with NPC focus and cards, saved walks, and reopen without replay. 2026-10-02, native Claude gate playthrough with dice and reopen persistence. The isolated GM core worktree also completed Midnight Summons in seven turns and passed 16 Playwright tests. No production deployment. |

## Work and references

- [Plans](plans/index.md): Stageview delivery and maintenance backlog.
- [Harvest Festival handoff](plans/harvest-festival-handoff.md): handoff record. The festival scene was resumed and implemented on 2026-10-03.
- [Stageview](plans/stageview.md): owner decisions, remaining phases, release questions.
- [Desktop local play](plans/desktop-local-play.md): core extraction, native client, local saves, and character-state application implemented locally. Further sets, provider coverage, and distribution remain open. Free solo play through the player's own AI CLI. Multiplayer through a host's app, free. Revenue from selling adventures, decided 2026-10-07.
- [Desktop site style](plans/desktop-site-style.md): moves the desktop app's UI to the website's look. The screens around the game are done and the HUD is recoloured, merged into main 2026-10-10. The owner's HUD review is next, and the rest continues on main.
- [Concise narration](plans/concise-narration.md): the GM's round-end narrative has a length rule and tells nothing twice, for all four Myr adventures. NPC turns and action rewrites are tightened too. The Midnight Summons text is trimmed. On main 2026-10-13. Two live replays with Claude: 52% fewer words a turn.
- [Adventure premise](plans/adventure-premise.md): who knows whom. A rule in every prompt, and an authored `## Premise` per adventure. On main 2026-10-11.
- [Antigravity replaces the Gemini CLI](plans/antigravity-cli.md): the fourth GM is Google's `agy`, run with no tools on Gemini Flash at medium effort. On main 2026-10-13.
- [Game Master picker shows the model](plans/gm-model-picker.md): party setup names the model each installed CLI runs and its effort, read from the CLI without a prompt. Claude runs at medium effort, set by the app. On main 2026-10-13.
- [Skip a hero's turn](plans/skip-turn.md): a text button left of Send ends the hero's turn with nothing written and no AI. Local play and hosted games, on main 2026-10-11.
- [Suggested replies](plans/turn-suggestions.md): on a hero's turn the GM card offers three replies that fill the reply box. Local play and hosted games, on main 2026-10-11.
- [The lead-in to March of Davos](plans/adventure-lead-in.md): The Midnight Summons, Covert Cargo and The Road to Kordavos lead into the featured adventure. Story stitched 2026-10-13: one elven name, the Blackthorn seal, the Oath Stone in March of Davos, a road rumor, and endings that point on. Carry-over built the same day: the app's ending offers the next adventure with the heroes who can go on, and Lyra, Poppen and Thalbern can be played in March of Davos. Story memory too: continuing hands the next adventure's GM a chapter for each one finished, and a hero keeps their gear.
- [Covert Cargo: three heroes](plans/covert-cargo-three-heroes.md): Thalbern is a third hero, hidden apart from Poppen. Each learns of the other only by a Perception check, and the elves leave when paid. The boat fight most often ends with Lyra overboard and the tug gone. Replaces the rescue, 2026-10-13.
- [Covert Cargo rescue](plans/covert-cargo-rescue.md): superseded 2026-10-13. No player deaths stays. Thalbern's rescue at half health is removed from the adventure, and the engine keeps the `rescue` rule, `flee`, falls and staging exits.
- [Adventure store](plans/feature-adventure-store.md): buying adventures on the website, linking the desktop app, and pack downloads.
- [Desktop Stageview integration](plans/zzz-completed/feature-desktop-stage-play.md): native game client, local saves, live turn flow, validation, and limits.
- [Stage engine](stage-engine.md): implemented runtime, set/staging specs, measured limits.
- [Stage set authoring](stage-authoring.md): the pattern for new 3D locations, web review first, then the desktop app.
- [Wiki adventures](wiki-adventures.md): authoring, compilation, source selection, and live content updates.
- [GM core](gm-core.md): portable game runtime, typed interfaces, server adapters, and extraction checks.
- [Gameplay flows](gameplay-flows.md): creation, turns, dice, NPCs, and completion.
- [Mapview](plans/mapview.md): stored 2D maps, generation, and token placement.
- [Storyview](storyview.md): narration, caching, automatic generation, and charging.
- [Testing runbook](plans/testing-runbook.md): commands, routes, and coverage limits.
- [Worktree guide](plans/parallel-dev-worktrees.md): retired 2026-10-08. Since 2026-10-10 work happens directly on main while the project is in alpha. Worktrees return at beta.
- [Wiki maintenance guide](AGENTS.md): documentation rules.

## Product context

[Product](sources/prd.md) · [Technical](sources/technical-brief.md) · [Design](sources/design-brief.md) · [Marketing](sources/marketing-brief.md)

Git preserves completed implementation history. Current contracts live in reference pages, and unfinished work lives in active plans. Commits are allowed when confident. Pushes and long-running operations require confirmation under the repository policy.
