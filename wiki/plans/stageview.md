# Stageview

[Plans](index.md) · [Wiki Home](../index.md) · [Roadmap](../roadmap.md) · [Architecture](../Architecture.md)

Status: **assessment + proposed plan** (2026-09-29) · working name "Stageview" is a proposal · no code changed yet

## Decision (2026-09-29)

Owner evaluated the standalone demo `~/Projects/d20-graphics-test-2/kordavos-v4.html` ("Arrival at the Gates", March of Davos encounter 1) and **prefers it decisively**. The existing 3D stack may be **removed entirely** and rebuilt on the demo's approach. There is no requirement to preserve or migrate the r3f encounter diorama, scene-kit, scene-sets, standees, or Hunyuan minis.

## What the demo is

- It is a single 2.49 MB offline HTML file built with esbuild from `src/v4/*`: about 2,400 LOC of plain imperative three.js 0.180.
  - Of the 2.49 MB, 1.8 MB is the CC0 MakeHuman head mesh stored as JSON floats.
  - The rest is about 0.7 MB of code, including three.js.
  - There are no textures and no downloaded models.
- It is a near-literal staging of `content/settings/realm-of-myr/adventures/march-of-davos/encounters/the-gates-of-kordavos.md`. Each part of the encounter file maps to something in the demo:

| Encounter file | Demo |
|---|---|
| Intro | Banners, the queue, "Next!" / "State your business" / the three-mark fee |
| `npcs[]` (Garlan) | Named figure with a character card |
| GM Notes | The **hold** prompt: "each player: who are you…" |
| Transitions | "Let them through" → the Harvest Festival street, already built beyond the arch |

| Module | LOC | Role |
|---|---|---|
| `lib.js` | 127 | Seeded RNG, `Batch` (merge-by-material with metre-scale surface UVs), `Frame`, and primitives: box, cyl, lathe, beam, shape, arch |
| `materials.js` | 246 | Height fog on every material, patched into three's global fog chunks. GPU procedural ashlar via `masonry()`. Wind cloth via a `sway` attribute. Tatters alpha. Canvas heraldry (Asterian, Valkaran, city crest) |
| `sky.js` | 48 | Painted cumulus sky; its horizon colour is shared with the fog |
| `paint.js` | 140 | Structure tensor → blur → anisotropic Kuwahara (8 sectors) → brush grain along strokes, canvas weave, umber grade, vignette |
| `crowd.js` | 205 | 9 figure kinds as 5-zone merged geometry. One `InstancedMesh` per kind, with per-instance colours, phase and walk. The walk and sway cycle runs in the vertex shader |
| `heroes.js` | 274 | Named figures: rigid per-joint rigs, 13-zone material, MakeHuman head with clipped hair and beard, beckon and talk gestures |
| `checkpoint.js` | 213 | Queue path, barrier and table, plus `Director`: a state machine of arrive → question → cue timeline → hold → next, with the coin arc and crowd recycling |
| `architecture.js`, `market.js`, `festival.js`, `life.js` | 612 | The set itself: gate, towers, city, stalls, bunting, birds, dust, land |
| `main.js` | 338 | Renderer, lights, composer, camera presets with 2.2 s eased transitions, bubbles, cards, pick, quality tiers, capture |

## Measurements (2026-09-29)

All figures below were taken on an Apple M3 (ANGLE Metal) in Chrome 154 at a 1440×900 viewport. Screenshots are in [stageview/](stageview/).

| | Demo v4 | Current scene-kit gates set | Current in-play diorama |
|---|---|---|---|
| Draw calls | **226–251** | 3,203 | n/m |
| Triangles rendered | 4.70–4.75M (about 2.3M scene, plus the shadow pass) | 1.14M | n/m |
| FPS, DPR 1 | **60** (vsync cap) on every shot | 30–36 | n/m |
| FPS, DPR 2 (paint off / on) | 37 / **15** | — | — |
| FPS, DPR 2.5 (paint off / on) | 27 / 8 | — | — |
| Ready | 1.5 s warm; about 5.7 s first cold load | about 5–8 s in dev on this run (memory note: 1–3 min earlier) | — |
| Payload | 2.49 MB total | 24 MB standee PNGs + 20 MB GLB props | same props plus minis |
| People | 1,600 (153 walking), animated | about 120 static standees | a few pawns |

Why the demo is faster despite 4× the triangles: 1,600 people cost 12 instanced draws, and statics are merged per material. The current set pays one mesh and one material per standee card. The scene-kit `crowd.ts` instancing builder exists but is unused.

- **Triangle hotspot:** crowd geometry is about 1.74M triangles (about 1,100 per figure), before shadows. There is no LOD.
- **Paint cost:** Kuwahara radius = `brush × internalHeight / 190`, and samples grow with radius². Total cost therefore scales with roughly internalHeight⁴. That is why DPR 2 drops from 37 to 15 fps, and why the demo caps DPR at 1.25.

## Experiments

1. **The demo's paint pass applied to current-game screenshots** (`current-set*.jpg` vs the painted versions, run in-page; no repo change).
   - It softens standee die-cut edges and adds cohesion.
   - It does **not** fix the underlying problems: low-poly generated trees and hay, blown bloom, the void beyond the gate, scale mismatches, and the diorama table.
   - Conclusion: the paint pass is a finisher. The improvement comes from the whole recipe below.
2. **An illustrated standee (`npc-garlan-ironfist.png`) placed into the demo world** (`hybrid-standee.jpg`).
   - It clashes badly with the procedural figures, even when painted.
   - Conclusion: use **one character vocabulary**. Portraits stay in the 2D UI (cards, turn strip); in-world figures are procedural.

## Why it works (the recipe to preserve)

1. **One art vocabulary.** Every surface comes from the same shader family and palette; no assets are mixed from different sources.
2. **World scale.** A 26 m arch, towers over 110 m, and 1.75 m people. The scale reads as the painting does.
3. **GPU procedural materials.** Surface UVs are in metres, so blocks keep a constant size. Grime, streaks, soot, sun-bleached tops and analytic relief normals come from the shader. There are no CPU bakes, and load time is near zero.
4. **Atmosphere.** Height fog that warms toward the sun, a sky with the same horizon colour, a PMREM environment from that sky, and AgX tone mapping.
5. **Density through instancing.** Crowds are cheap, so they are everywhere.
6. **Life.** The director loop, walkers, wind cloth, birds and dust keep the scene moving.
7. **Painterly unification.** The Kuwahara pass plus grade hides the geometric simplicity.
8. **Diegetic UI.** Speech bubbles are anchored to heads, cards come from clicking figures, and the GM prompt appears at the hold.

## Demo weaknesses to fix in the port

- **Close-up fidelity.** Rigid lathe bodies with mitten hands look toy-like at conversation distance.
  - Mitigation: shot discipline (mid and long framing), and a CC0 MakeHuman-derived skinned body for named figures later.
  - Owner rejected "kid show" minis on 2026-07-04. The demo figures are realistically proportioned but still blocky.
- **Paint pass cost and detail loss.**
  - Run Kuwahara at a **fixed internal height** (about 540–720 px) regardless of DPR, and restore grain at full resolution.
  - The pass erases birds and distant figures, and smears the crowd in the ramparts shot. Add a depth- or ID-aware radius so named figures and near faces keep detail.
- **Aliasing.** `antialias:false` and no MSAA on the composer target produce stair-stepped silhouettes, which the 0.6 paint scale amplifies. Use a MSAA HalfFloat target (scene-kit already does this).
- **Screen-fixed grain.** The grain and weave are in screen space ("shower door" while the camera moves). This is acceptable for a painted look; review in motion.
- **Global shader patch.** `installAtmosphere()` rewrites three's global `ShaderChunk` fog. Scope it to Stage materials (via `onBeforeCompile`) or accept it only because three.js loads on the Stage route alone.
- **Scripted director.** It is encounter-specific; generalize it (see Architecture).
- **Other fixes:**
  - Convert the head mesh to a quantized GLB.
  - The JS heap is 234 MB, from merged geometry retained in JS. Drop CPU arrays after upload.
  - Use `preserveDrawingBuffer` only when capturing.
  - The ramparts camera clips the hoarding.
  - Mobile is **unmeasured**.

## Architecture (proposed)

Plain imperative three.js under `lib/stage/`, with **no r3f**. It is hosted in one client component loaded through `next/dynamic` only on the encounter overlay route.

The work splits into three layers:

1. **Set.** A location, authored once and reused across encounters and adventures.
   - A TS module `lib/stage/sets/<settingId>/<locationId>.ts`, keyed to the wiki **location entity**. Mapview already titles maps by location entity.
   - It provides geometry, materials, an atmosphere preset, time-of-day and weather toggles, named **marks**, **paths** (queue, patrol, exit), crowd **zones** (density and kinds), named **shots**, and ambient **loops**.
2. **Staging.** Per encounter, authored at authoring time and reviewable before publish, like Mapview.
   - Contents: the set and its toggles; cast (NPC id → figure recipe plus start mark, honouring `startNear`); party entry formation; establishing shot; ambient script (for example, the queue cycle); dressing toggles.
   - Stored per encounter in S3, next to maps.
3. **Beats.** Per turn, generated at play time with a cheap flash model, replacing the 20×20 diorama JSON.
   - The model maps the resolved turn narrative into the set's vocabulary: `shot`, `move {who, to: mark|path}`, `gesture {who, beckon|talk|point|draw|kneel|fall}`, `line {who, text}` (quotes from the narrative), and `fx` (coin, fire, spell).
   - Output is validated and clamped. Beats are deterministic data, so every player sees the same sequence.
   - Each turn's beats start from the previous turn's end poses. Replay from encounter start, or store the end state.
   - Positions stay **visual only**. There is no positional game state, which matches Mapview.

Runtime behaviour:

- **Turn loop mapping.**
  - The ambient loop runs while players read.
  - Beats play once when a turn resolves.
  - **Hold** plays while awaiting player input; the GM prompt card is the demo's hold.
  - A transition plays when an encounter changes.
  - The caption ticker becomes head-anchored bubbles.
  - Storyview paragraphs drive shots and beats in sync with the TTS narration.
- **Characters.** Each character has a **figure recipe** JSON: build, height, skin, hair and beard, headgear, garment kind and colours, mantle, armour, weapon, shield colours and device.
  - It is derived once from the character sheet and portrait description by an LLM or rules, and is editable.
  - This replaces standee (500 tokens) and Hunyuan mini (2,000 tokens) generation. There are no per-character image or 3D costs.
- **Quality tiers.**

| Tier | DPR | Shadows | Crowd | Paint internal res | Other |
|---|---|---|---|---|---|
| High | ≤ 1.5 | 4096 | full | 720p | — |
| Balanced | 1 | 2048 | ×0.5 | 540p | no bloom |
| Mobile | 1 | 1024 | ×0.25 plus impostors | 480p | — |

- **Rendering lifecycle.** Pause rendering when the overlay is hidden or the tab is hidden. The current r3f view ticks forever.
- **Budgets:**
  - ≤ 300 draw calls.
  - ≤ 2.5M rendered triangles, including shadows. This needs crowd LOD at about 150 triangles per figure for far figures.
  - ≤ 3 s to first frame on a warm cache.
  - 60 fps on M-series at DPR 2 with fixed-res paint; 30 fps on mid-range mobile.
- **Verification.** Port `verify-v4.mjs` into `scripts/stage-verify.ts`. It checks that shaders compile, stats stay within budget, population, a screenshot per shot, and offline loading. A dev preview lives at `/dev/stage?set=&staging=`.

## Removal inventory (clean slate)

All 3D dependencies are imported only by these modules (verified via grep on 2026-09-29).

- **Code:**
  - `components/encounterview/*` (2,431 LOC) and `lib/encounterview/*` (1,263)
  - `lib/scene-kit/*` (about 4,900), `lib/scene-sets/*`, `lib/scene-pipeline/*` and `scripts/scene-pipeline/*`
  - `scripts/encounterview-assets-build.mjs`
  - `app/dev/set-preview`, `app/dev/scene-preview`, `public/dev-fixtures`
  - `app/_actions/generate-encounter-scene.ts`, `app/_actions/generate-character-mini.ts`, `types/encounter-scene-3d.ts`
  - The dormant `components/adventure/miniatures-map.tsx` (2,448) and `app/_actions/generate-encounter-map.ts`
  - The 3D-only parts of `lib/map-utils.ts`. Keep `inferEncounterSceneKit`, `findEncounterById` and the other helpers Mapview uses.
- **Assets:** `public/standees/` (24 MB) and `public/models/encounter/` (20 MB, including KayKit and generated props).
- **Dependencies:** `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing` (which brings `postprocessing` and `n8ao`), and `@gltf-transform/*`. Also `sharp` if nothing else needs it; recheck. Keep `three`.
- **Re-home first.** `EncounterRailPanel` / `EncounterPanel` also host the 2D Mapview rail and its fullscreen view (`components/adventure/turn.tsx:70,82`). Extract a map-only panel before deleting.
- **Keep:** the Convex `usage_encounter_asset` literal, while ledger rows exist.
- **Branches to retire:** `minimap-claude`, `claude/competent-moore-d09a8e`, and `origin/claude/stoic-gates`. `2d-maps` is already salvaged into Mapview.
- **S3 prefixes to retire once replaced:** `scenes3d/`, `images/minis/`, `images/minis3d/`, `images/scene-previews/`.
- **External repo no longer needed:** `~/Projects/asset-pipeline`.

## Phases

1. **Clean slate** (feature worktree).
   - Extract the map-only encounter panel, delete the inventory above, and drop the standee and mini token products.
   - Validation: build, TypeScript, lint, Playwright; the turn page still shows the map rail and fullscreen map.
2. **Engine port.**
   - `lib/stage/` TS port of the demo kit with the fixes above: fixed-res paint, MSAA, scoped fog, tiers, pause, dispose, head GLB, LOD.
   - Add `/dev/stage` and the verify script.
3. **First set and staging.**
   - Port the v4 gate as `realm-of-myr/kordavos-south-gate`, with staging for `march-of-davos/the-gates-of-kordavos`.
   - The festival street becomes the `the-harvest-festival` set.
   - Generalize `Director` into set loops plus staging scripts.
4. **Play integration.**
   - The encounter overlay hosts Stage when a staging exists.
   - Add per-turn beats generation and hold binding, plus NPC and PC cards.
   - Add a rail still (captured frame) and Storyview sync.
   - Generate figure recipes for PCs.
5. **Coverage.**
   - Build generic parametric sets for forest road, clearing, tavern interior, docks and crypt, to cover Midnight Summons, Covert Cargo and Road to Kordavos.
   - Build an agent authoring loop: brief → set module against the kit → verify screenshots → review in `/dev/stage` → publish.

## Owner decisions (2026-09-29)

1. **Mode.** The encounter overlay is removed, and Stageview replaces it.
2. **Coverage.** The goal is AI-built custom sets for every encounter, generated during adventure-plan creation. This is not required for v1.
   - Consequence: any author, including community authors, can create a set. A set is therefore untrusted input and must not be arbitrary JS run on player clients.
   - Design the kit so a set is a **declarative spec** (JSON) that the kit interprets through parametric builders and primitives.
   - The hand-built v1 sets should already use that spec wherever possible, so they act as few-shot exemplars for generation.
3. **Removal timing.** Remove the old stack now. There are no real players, only test accounts.
4. **Paid minis.** Not a concern. Only test accounts have made standee or mini purchases.

## Open: close-ups of player characters

The owner is not confident that procedural figures can make convincing close-ups, and suggested something like standees. Evidence so far:

- An illustrated standee placed in the demo world clashes (`hybrid-standee.jpg`).
- Procedural figures read well at mid and long range but look toy-like up close.

Options to prototype in the standalone demo before committing:

- **A. Portrait moments (recommended).**
  - In-world figures stay procedural and never get a close-up.
  - When a character speaks or acts, their painted portrait or full-body art slides in as a UI plate beside the head-anchored bubble. This is the classic CRPG split used by Baldur's Gate, Pillars and Disco Elysium.
  - The figure recipe echoes the portrait's colours and gear, so the link between plate and figure reads.
  - This keeps character-art generation (avatar → full-body painted plate), but as 2D UI rather than as in-world cards.
- **B. Style-matched in-world standees.**
  - Generate full-body cards conditioned on the avatar and on the world's flat painted style, then relight them in-scene (a normal or depth map from the image), grade them to the set palette, remove the die-cut outline, and apply the paint pass.
  - Risks: cards still read as flat when the camera orbits, and a detailed hero among blocky crowd figures makes the crowd look worse.
- **C. Both.** Use B at mid range for named characters only, and A for close-ups.

## Unknowns

- Who or what authored the demo, and at what cost. This sets the per-location authoring budget. The demo's set-specific code is about 1,050 LOC (architecture, checkpoint, market, festival, heroes).
- Mobile GPU performance and memory.
- How well beats generation follows the set vocabulary. This needs an eval like Mapview's generation loop.
- Temporal stability of the paint pass during camera moves, which has only been reviewed in stills.
