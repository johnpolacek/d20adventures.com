# Adventure Packages

Goal: an adventure is one package, its story and everything its stage needs, that the app loads at runtime. Ours first, then ones people make on their own machines. Opened 2026-11-22.

## Owner decisions, 2026-11-22

- People will make their own adventures, and their own assets on their own systems.
- Keeping models in the workspace does not scale: 100 or 1,000 figures must not grow the repo, the workspace or the app.
- Design the package format now and move our own adventures into it first. Opening the asset pipeline to players comes later.

## Today

- The story already travels as a pack: `packs.json` is bundled, and owned adventures download a versioned, hashed pack (`apps/desktop/runtime/packs.ts`, `@d20/gm-core/packs`).
- The stage does not. Sets, stagings and plans are source in `packages/stage/src`, compiled into the app.
- Set textures and art are `public/stage`, 186 MB, copied whole into every build.
- Who plays whom was code until phase 1. A look's `figures` still is (`looks.ts`).
- Figures are copied into the build, lod0 and lod1 of every shipped one (`build-runtime.ts`), about 14 MB each.

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
2. Write `pnpm packages:build <adventure>`: gathers the story pack, the sets, stagings, plans and files it uses into the folder above, with hashes. A check fails on a file a set names that the package lacks.
3. Teach the app to load stage data from a package, not from compiled source. Bundled adventures become bundled packages.
4. Fetch figures and files per package on first play into the app data folder, keyed by hash. Stop copying `public/stage` and figures into the build. This settles the app's size at any number of figures.
5. Load a package from a local folder, unsigned, in a creator mode. This is where a person's own adventure first plays.
6. Later: publish a creator's package to the site, and the pipeline running on the player's machine with their own keys.

## Open questions

- Where the shared figure shelf lives for a creator's own figures: their disk only, or uploaded to our bucket. Uploads mean accounts, size limits and moderation.
- Whether a set can be shared across packages, as figures are, or each package carries its own.
- How the site's own GM, which plays the demo, reads a package: the same loader, or the compiled source until phase 3 lands there too.
- Package signing: whether the app trusts only our packages outside creator mode.
