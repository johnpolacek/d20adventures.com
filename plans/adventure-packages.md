# Adventure Packages

Goal: an adventure is one package, its story and everything its stage needs, that the app loads at runtime. Ours first, then ones people make on their own machines. Opened 2026-11-22.

## Owner decisions, 2026-11-22

- People will make their own adventures, and their own assets on their own systems.
- Keeping models in the workspace does not scale: 100 or 1,000 figures must not grow the repo, the workspace or the app.
- Design the package format now and move our own adventures into it first. Opening the asset pipeline to players comes later.

## The package

One folder, or one archive of it, named by the adventure's id:

```
<adventure>/
  package.json        id, version, title, setting, what it needs (figures, sets) by id and hash
  story/              the compiled story pack, as packs.json holds it today
  stage/
    sets/*.json       the sets it stands on
    stagings/*.json   where everyone starts, per encounter
    plans/*.json      the generated floor plans
    looks.json        the played looks: which figure stands for which cast member
  files/              textures and art the sets name
```

- Figures are not copied into each package. A package names them by id and hash, and they are fetched from one shelf, shared across adventures.
- A figure is its folder as the library already publishes it: `lod0/1/2.glb`, `thumb.webp`, `figure.json`. How it moves is `motion` in its `figure.json`.
- Addresses inside a package are relative. The app resolves them against the package's folder or its download address, through `served()`.

## Phases

1. Done 2026-11-22. Who plays whom is data: each adventure's `figures.json` beside its stagings, and `motion` in each `figure.json`, fetched at play. A look's own `figures` stays in `looks.ts` and moves with the looks in phase 2.
2. Done 2026-11-22. `pnpm packages:build [adventure]` writes `build/adventures/<id>/` (`scripts/adventure-packages.ts`), and `pnpm packages:check` fails on a set, figure or file named but missing. The same content gives the same version.
   - Sizes: Welcome to Kordavos 106 MB, The Road to Kordavos 32 MB, The Midnight Summons 17 MB, Covert Cargo 7 MB.
   - Files come from every `/stage/…` path its story, sets, stagings and looks name, plus by where they are kept: `stage/fixtures/<id>`, `stage/art/<id>`, `stage/covers/<id>`, and each NPC's `stage/portraits/<cast id>.webp`.
   - The kit stays the app's: `stage/textures`, `sounds`, `crowd`, `trees`, `realm`, `heroes`, `photoreal.json`.
3. Done 2026-11-22. The desktop app plays its stage from its packages.
   - Scenes: the table in `apps/desktop/src/scenes.ts` is each adventure's `scenes.json`. All 69 scenes built from data match the old table, in the same order.
   - The desktop build copies each bundled package's `stage/` to `/adventures/<id>/stage` for the window and to resources for the runtime. The window loads it before it renders (`src/stage-data.ts`), and the runtime when it starts (`runtime/scenes-node.ts`).
   - Floor plans: the runtime reads them from the packages (`runtime/floor.ts`). All 69 match the compiled ones.
   - Looks and figures: `asset-library/play.ts` plays the packages' `looks.json` and `figures.json` in the app (`playFrom`), and the repo's own elsewhere.
   - Portraits: `stage/portraits.json` in each package, cards from `stagings/<adventure>/portraits.json` and each character's painted one. `npc-portraits.ts` is gone. The site reads `packages/stage/src/portraits.json`, which `scripts/stage-encounter-art.ts` writes.
   - The website and its dev pages load the same scenes from the repo's stage (`useScenes("repo")`), and scripts through `scripts/repo-scenes.ts`.
   - Still code: `PREMADE_FIGURES` and hero art (`apps/desktop/src/figures.ts`), and the setting's city maps (`lib/citymap`), which the story pack carries.
4. Done 2026-11-22. An adventure's art and figures download as it is played, into the data folder's `files/` (`apps/desktop/runtime/files.ts`), from the asset host, each checked against its hash.
   - Owner, 2026-11-22: download the whole adventure when it starts, but let play begin once the opening scene's files are in, with the rest behind it. A loading pulse, and a progress bar only when the wait looks longer than a few seconds.
   - Each package lists what every scene needs (`needs` in `package.json`): its set, staging and look files, its art, its cast's portraits, and its figures at the detail the scene stands them in. Opening scenes need 3 to 37 MB.
   - The window waits on the scene's own files (`src/files.ts`, `useSceneFiles`), then fetches the rest a few MB at a time, behind play. Downloads skip the game lock (`files_command`).
   - The built app's window reads every stage file from its own file server on 127.0.0.1 (`src-tauri/src/files.rs`): the downloads, then the copy bundled with the window. Not a custom scheme: WebKit gives a custom scheme's images no CORS answer, and WebGL refused them as "The operation is insecure". Development reads the repo's files from the dev server's own origin (`vite.config.mjs`).
   - The title screen's scene fetches its own files alone. The rest of an adventure follows in the background only once it is played.
   - The app bundles what shows before any download: the kit, covers, maps, premade heroes' art and the title screen's scene (`bundled.json`). Its stage files and figures fell from about 313 MB to 117 MB.
   - Tried in a release build, 2026-11-22: the title screen's stage up with no errors at 30 to 51 fps, downloads served, a missing file 404.
5. Done 2026-11-22. A creator's packages in the app's data folder, `creator/<id>/`, play beside the bundled ones, unsigned. One with a bundled adventure's id takes its place.
   - `pnpm packages:creator <id> [--as <new-id>] [--to <data folder>]` builds an adventure's package with its files and puts it there. `--as` copies it under a new id, as a start on another adventure.
   - The runtime reads their stories, scenes and floor plans (`apps/desktop/runtime/creator.ts`, `scenes-node.ts` `useCreator`). The window reads their stages and looks through the app's file server, which serves their files ahead of the downloads and lists them at `/creator/index.json`. A package's figures still download from the shelf.
   - Tried in a release build: `my-road`, a copy of The Road to Kordavos, listed and its stage loaded with no errors.
   - Encounter ids must be unique across every adventure played: scenes and floor plans are found by encounter id. A copy under a new id shares its original's.
   - There is no switch for a creator mode yet: the folder alone turns it on.
6. Later: publish a creator's package to the site, and the pipeline running on the player's machine with their own keys.

## Open questions

- Where the shared figure shelf lives for a creator's own figures: their disk only, or uploaded to our bucket. Uploads mean accounts, size limits and moderation.
- Whether a set can be shared across packages, as figures are, or each package carries its own.
- How the site's own GM, which plays the demo, reads a package: the same loader, or the compiled source until phase 3 lands there too.
- Package signing: whether the app trusts only our packages outside creator mode.
