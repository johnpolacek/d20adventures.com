# Desktop heroes

[Plans](index.md) · [Wiki Home](../index.md) · [Desktop direction](desktop-local-play.md) · [Desktop Stageview](zzz-completed/feature-desktop-stage-play.md)

Status: Implemented locally, 2026-10-04. Branch `feature/desktop-heroes`. No merge into main or deployment.

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

## Results

### Runtime

- All four Myr adventures are bundled. New game takes a party of `{ id, ai }` choices. Without one, the suggested party plays as before, so existing saves and tests are unchanged.
- `partyFor` checks the player range, duplicate heroes, at least one hero played by the player, premade-only adventures, and each adventure's races and classes. The Road to Kordavos allows 5 races and 4 classes, March of Davos 7 and 12.
- The roster is a `heroes` table in the save file. A new game copies hero sheets into the save with their figure ids, so deleting a hero never changes a running adventure.
- `heroDraft` makes one call through the gm-core generator with race, class, name, gender, the idea, and the chosen adventure's teaser. The player's name, race and class always win over the model's.
- AI heroes use the core's existing companion path. Continue now plays an AI hero who leads a round, and the player cannot reply for one.

### Scenes and art

- Each authored scene names its party slots and spare spots. `partyScene` keeps a premade in its own slot, gives other heroes the free slots and then spare spots, drops unused slots, and renames shots and the gate queue to match. The authored party gets the authored staging back unchanged. The GM's map staging uses the same mapping.
- A created hero never takes a premade's slot by sharing a first name. Story view shows a created hero's own figure, never a premade's.
- `scripts/stage-standees.ts` checks in the standee pipeline from the stage prototype: `gemini-3.1-flash-image` fronts on green conditioned on Yeva's finished standee and the world style reference, backs from fronts, a distance-from-green key, and portraits cropped from fronts.
- Fourteen stock figures, seven races in two builds, dressed for travel with no class gear. The first gnome held a cog and a magnifier and was regenerated with empty hands. Wrenna, Ilya, Lyra and Poppen were painted from their web portraits.

### Painting through a CLI

- Paint, on a roster hero, asks the Game Master's CLI when it is Codex or Grok, else Grok, then Codex. One image holds the front and the back. It reuses the spike's locked-down image command, now in `apps/desktop-spike/harness/image-cli.mjs`.
- Keying is pure JavaScript with pngjs, so it bundles into the runtime. It floods in from the border through colours near the backdrop, and through enclosed pockets of green screen. Olive and green clothing survive. A 3 px band around the cut is despilled. Front and back are split at the emptiest column, and the portrait is cropped from the front.
- Art is stored as PNG files beside the save, by hero id. The webview receives data URLs and turns them into blob URLs. Staging art now accepts page blob URLs, still not other hosts.
- Trial on Hilde: Grok took 27 s and gave a 373×665 front. Codex took 53 s and gave 462×976. Both read as the same painted world. Codex left a green fringe in the hair before the despill band was added.

### Checks

- 23 desktop tests pass, 9 of them new: drafting and roster changes, party rules, created and AI heroes through a turn, an encounter change and a reopen, slot mapping, spare spots clear of solid footprints, keying, stored art, and painted figures.
- Desktop, stage and root TypeScript, scoped Biome, and `stage:check` pass.
- Browser check through a dev bridge that runs the real runtime per request, with live Claude: the setup screen for each adventure, a hero drafted in 22 s and saved, a second hero, and The Road to Kordavos played to its ending. Hilde rolled a natural 1 on Persuasion. Bram, played by the AI, made his own Persuasion check, 12 against 12, and the round took 33 s. Continue moved to The Gates Ahead in 21 s, the final encounter.
- March of Davos with Branka, Hilde and Bram: both created heroes stand at the gate in Cassia's and Yeva's slots with their stock art, and Continue offered "Continue Bram's turn".
- Release build with two Rust jobs passed with no Rust warnings. The app bundle is 53 MB.
- Packaged app on an isolated save, driven through macOS accessibility because cmux computer use was not set up on this Mac. The packaged runtime, run with the app's stripped environment, painted Hilde through Grok in 16 s. The app then opened on a March of Davos game with Hilde, Bram and Branka. The render report was ready with no JavaScript errors. Hilde stood at the gate as her painted standee, and her painted portrait showed in the turn order and on her roster card. Continue Bram's turn ran live Claude: Bram and Branka, both played by the AI, paid the gate fee, Garlan answered, and the turn passed to Hilde in 17 s. Garlan called her "the soot-aproned dwarf".
- The user save was restored with an unchanged SHA-256. The test save and its art are kept in `validation-heroes-2026-10-04/` beside it.
- Not covered natively: drafting a hero and pressing Paint from the app's own buttons. Both ran through the same runtime in the browser check and through the packaged runtime above.
- Found, not changed: the gate's Party view sits under the merchant canopy with the authored party too, because the desktop starts the party at the head of the line. Recorded in [maintenance](maintenance.md).

## Progress

- [x] Runtime: packs, roster, party start, AI turns
- [x] Setup and creation screens
- [x] 3D party slots and figures
- [x] Stock and premade art
- [x] Paint hero through Codex or Grok
- [x] Build and packaged-app check
- [x] Wiki and log
