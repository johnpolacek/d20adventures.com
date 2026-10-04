# Desktop heroes

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop direction](desktop-local-play.md) · [Desktop Stageview](zzz-completed/feature-desktop-stage-play.md)

Status: Active, 2026-10-03. Branch `feature/desktop-heroes`. No merge into main or deployment.

## Owner decisions, 2026-10-03

- Custom hero art: stock figures first, so every player gets a hero whatever CLI they use. Art painted through Codex or Grok is an upgrade.
- Party control: at setup the player picks You or AI for each hero. AI is the default.
- Creation: race, class, name and a one-line idea. One AI call fills in the rest, then the player reviews and edits.
- Also: bundle all four Myr adventures, add a premade picker, and keep heroes in a local roster reusable across adventures.

## Scope

- Bundle Covert Cargo and The Road to Kordavos beside March of Davos and The Midnight Summons.
- New game setup: adventure, party, who plays each hero, Game Master.
  - The party comes from the adventure's premades and eligible roster heroes, within its player range.
  - Premade-only adventures list premades only. Roster heroes must match the adventure's races and classes.
  - The first hero defaults to You and the rest to AI. At least one hero is played by You.
- Hero creation: race, class, name, gender and a one-line idea. One CLI call through the existing gm-core generator. The player reviews and edits every field, picks a figure, and saves.
- Roster: a `heroes` table in the local SQLite file, added with `CREATE TABLE IF NOT EXISTS`. Heroes can be deleted from setup. A new game copies sheets into the save, so later roster changes never alter a running adventure.
- AI party members use the core's existing AI companion path. Their turns run with the NPCs after a player acts, or through Continue when an AI hero leads the round.
- 3D party: each scene names its party slots. A premade keeps its own slot, other heroes take free slots, and any extra hero gets a spare spot. Shots, the gate queue and the GM's map staging follow the same mapping.
- Stock figures: 14 standees, seven races in two builds, painted with the existing standee pipeline. Asterian heroes use the Human figures. Premades without stage art (Wrenna, Ilya, Lyra, Poppen) get their own standees, painted from their web portraits.
- Upgrade: when Codex or Grok is installed, Paint hero makes a portrait and front and back through that CLI. It reuses the spike's image harness and local background removal. The art is stored with the hero.

## Out of scope

- Experience, levels, or items carried between adventures.
- Multiplayer and web character sync.
- New 3D sets for Covert Cargo or The Road to Kordavos. They play in story view.

## Validation

- Desktop tests: all four packs load, party rules, roster create, update and delete, hero generation with a scripted model, a start with custom and AI heroes, an AI turn and an advance through the real core, slot mapping, spare spots clear of solids, and reopening a save.
- Typechecks, scoped Biome, `stage:check`, and a release build with two Rust jobs.
- Packaged app with live Claude on an isolated save: create a hero, start The Road to Kordavos with an AI companion, and play to an encounter change. Start March of Davos with a custom hero and check the gate.

## Progress

- [ ] Runtime: packs, roster, party start, AI turns
- [ ] Setup and creation screens
- [ ] 3D party slots and figures
- [ ] Stock and premade art
- [ ] Paint hero through Codex or Grok
- [ ] Build and packaged-app check
- [ ] Wiki and log
