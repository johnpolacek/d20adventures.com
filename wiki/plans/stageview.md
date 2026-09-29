# Stageview

[Plans](index.md) · [Wiki Home](../index.md) · [Roadmap](../roadmap.md) · [Architecture](../Architecture.md)

Status: **phase 2 engine port merged to main (2026-09-29); next: phase 3** · working name "Stageview" is a proposal · old 3D stack removed and merged to main (see [plan](zzz-completed/feature-remove-3d-stack.md)) · engine plan and results: [feature-stageview-engine](zzz-completed/feature-stageview-engine.md)

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

Port status (phase 2): fixed-height paint, depth-scaled radius, MSAA, scoped fog, JS heap (42 MB steady state), capture without `preserveDrawingBuffer` and the ramparts clip are done. The head mesh is moot because hero rigs were not ported. Mobile is still unmeasured, and temporal paint stability still needs review in motion.

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
   - A **JSON spec** (`d20.stage.set` v1, zod-validated and bounded) keyed to the wiki **location entity**. Mapview already titles maps by location entity. Phase 2 keeps specs repo-local under `lib/stage/sets/<settingId>/`.
   - The kit interprets it through parametric builders (fortifications, town, market, festival, checkpoint, primitives and layouts), so a set never runs code on player clients. See [feature-stageview-engine](zzz-completed/feature-stageview-engine.md#set-spec-v1-d20stageset) for the format.
   - It provides materials, objects, an atmosphere preset, named **marks**, **paths** (queue, exit), crowd **groups** (scatter with density rects, ranks, points, queues along paths, walkers, anchors), named **shots** and ambient life. Time-of-day and weather toggles and ambient **loops** come in phase 3.
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
- **Characters (decided by the v5 prototype, 2026-09-29).**
  - **Named characters (PCs and staged NPCs):** in-world **world-style standees** with front and back art.
    - Generated once per character from the portrait plus the setting's style reference (`gemini-3.1-flash-image`, 2K, green screen, keyed on distance from green).
    - In the scene each card is alpha-tested and lit through normals derived from the alpha. It casts and receives shadows, and the character mask keeps it at about 20% paint.
    - The card leans toward the camera within ±60° of the character's facing, and switches from front to back beyond 90° with a dithered crossfade.
  - **Portrait plates:** carry dialogue and the hold prompt.
  - **Crowd:**
    - Instanced illustrated cards drawn from a per-setting **crowd library** of about 16–24 variants with fronts and backs, in one `DataArrayTexture` atlas.
    - Card detail is masked at about 50% paint.
    - **Hybrid LOD:** cards within 60 m at eye level; procedural pawns for far or steep views.
  - The earlier "figure recipe" idea is superseded.
  - Cost: two generations per character (front and back) and two per crowd variant. A token price is still to be set, and generation needs server-side keying again (`sharp` was removed in phase 1).
- **Quality tiers (measured on an M3 at Retina, party view).**

| Tier | DPR | Paint internal height | AA | AO | Bloom | Measured |
|---|---|---|---|---|---|---|
| Balanced | 1 | 540 | none | off | off | 60 fps (vsync) |
| High | 1.5 | 720 | FXAA | ¼ res | off | about 43–46 fps (party view; about 37 in the gate view) |
| Ultra | 2 | 900 | 4× MSAA | ¼ res | on | about 21 fps |

  A mobile tier is still unmeasured: DPR 1, 1024 shadows, fewer cards, and paint at 480.

- **Rendering lifecycle.** Pause rendering when the overlay is hidden or the tab is hidden. The current r3f view ticks forever.
- **Budgets:**
  - ≤ 300 draw calls.
  - ≤ 2.5M rendered triangles, including shadows. This needs crowd LOD at about 150 triangles per figure for far figures.
  - ≤ 3 s to first frame on a warm cache.
  - 60 fps on M-series at DPR 2 with fixed-res paint; 30 fps on mid-range mobile.
- **Verification.** Port `verify-v4.mjs` into `scripts/stage-verify.ts`. It checks that shaders compile, stats stay within budget, population, a screenshot per shot, and offline loading. A dev preview lives at `/dev/stage?set=&staging=`.

## Removal inventory (clean slate)

**Done and merged to main (2026-09-29).** Details, validation and leftovers are in [feature-remove-3d-stack](zzz-completed/feature-remove-3d-stack.md). The list below is kept as the record of what was removed, with the deviations noted inline.

All 3D dependencies were imported only by these modules (verified via grep on 2026-09-29).

- **Code (removed):**
  - `components/encounterview/*` (2,431 LOC) and `lib/encounterview/*` (1,263)
  - `lib/scene-kit/*` (about 4,900), `lib/scene-sets/*`, `lib/scene-pipeline/*` and `scripts/scene-pipeline/*`
  - `scripts/encounterview-assets-build.mjs`
  - `app/dev/set-preview`, `app/dev/scene-preview`, `public/dev-fixtures`
  - `app/_actions/generate-encounter-scene.ts`, `app/_actions/generate-character-mini.ts`, `types/encounter-scene-3d.ts`
  - Also removed: `app/_actions/scene-preview.ts` (rail snapshot upload) and the unreferenced `lib/map-preview-tokens.ts`.
  - The dormant `components/adventure/miniatures-map.tsx` (2,448) and `app/_actions/generate-encounter-map.ts`
  - The 3D-only parts of `lib/map-utils.ts`. Keep `inferEncounterSceneKit`, `findEncounterById` and the other helpers Mapview uses.
- **Assets (removed):** `public/standees/` (24 MB) and `public/models/encounter/` (20 MB, including KayKit and generated props).
- **Dependencies (removed):** `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `@gltf-transform/core|extensions|functions`, `n8ao` (a direct dependency with no imports; `postprocessing` was transitive) and `sharp` (nothing else used it). `three` and `@types/three` are kept.
- **Re-homed first (done).** The 2D Mapview rail card, fullscreen view and below-xl button now live in `components/mapview/map-panel.tsx` (`MapRailPanel`, `MapPanel`), mounted from `components/adventure/turn.tsx`.
- **Kept:** the Convex `usage_encounter_asset` literal in the ledger schema, while ledger rows exist. The standee and mini token costs and charge paths are gone.
- **Branches retired (done 2026-09-29):** local `2d-maps`, `minimap-claude` and `claude/competent-moore-d09a8e`, and remote `origin/claude/stoic-gates`. Last commits, for restoring: `2d-maps` 6cfc22b, `minimap-claude` 4eb03bb, `claude/competent-moore-d09a8e` 0a91c6f.
- **S3 prefixes to retire (not done; remote data):** `settings/<settingId>/scenes3d/`, `images/minis/`, `images/minis3d/`, `images/scene-previews/`.
- **External repo no longer needed:** `~/Projects/asset-pipeline`.

## Phases

1. **Clean slate** (feature worktree). **Done 2026-09-29 on `feature/remove-3d-stack`.**
   - Extract the map-only encounter panel, delete the inventory above, and drop the standee and mini token products.
   - Validation: build, TypeScript, lint, Playwright pass; the map rail and fullscreen map were checked on a fixture page. The real turn page was not rendered because the worktree database is empty.
2. **Engine port.** **Done 2026-09-29; merged to main** ([plan and results](zzz-completed/feature-stageview-engine.md)): every shot is within budget, and at DPR 2 the frames match the prototype and faces hold up in native-pixel crops. The Kordavos gate is also ported as the first JSON set (pulled forward from phase 3), with a static queue.
   The source is the **v5 prototype** (`~/Projects/d20-graphics-test-2/src/v5/`), not v4.
   - Port into `lib/stage/` as plain three.js TypeScript. Carry over:
     - the kit (`lib`, `materials` including `wood()`, `sky`)
     - `paint` (fixed internal height, depth-scaled radius, 4-tap prefilter, mask-aware final pass)
     - `mask` (depth-tested character mask)
     - `cards` (instanced front/back crowd cards with hybrid LOD)
     - `closeups` (hero standees and plates)
     - AO (GTAO at quarter resolution with separable blur), and MSAA/FXAA
     - `flags` and tiers
   - Scope the global fog chunk patch to Stage materials. Add pause-when-hidden and dispose.
   - Add `/dev/stage` and a verify script (shaders compile, stats within budget, a screenshot per shot at DPR 2).
   - Design the set format as a declarative spec from the start (decision 2).
3. **First set and staging.**
   - Port the v4/v5 gate as `realm-of-myr/kordavos-south-gate`, with staging for `march-of-davos/the-gates-of-kordavos`. The set spec and a minimal dev staging (cast at marks, framed shots) landed in phase 2; staging scripts remain.
   - The festival street becomes the `the-harvest-festival` set.
   - Generalize `Director` into set loops plus staging scripts.
   - Port the crowd library (the prototype's 16 variants, fronts and backs) as the Realm of Myr crowd library.
4. **Character art pipeline and play integration.**
   - Add a server-side generator: portrait → world-style front and back standee (reinstate keying with `sharp`). Store it per character in S3, and set a token price.
   - The encounter overlay hosts Stage when a staging exists.
   - Add per-turn beats generation and hold binding, portrait plates, and NPC and PC cards.
   - Add a rail still (captured frame) and Storyview sync.
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

### Prototype result (2026-09-29)

The prototype is `~/Projects/d20-graphics-test-2/kordavos-v5-closeups.html`, built from `src/v5/` (uncommitted in that repo).
- Select a mode with `?closeup=procedural|portrait|standee`.
- The party is recast as the March of Davos premades Branka, Cassia, Yeva and Milos.
- Screenshots are in that repo's `previews/v5-*.png`.

Findings:
- **Procedural at 2.5 m** confirms the concern: Garlan has a blank face and mitten hands.
- **A (portrait plates)** reads well as UI, but it avoids the problem rather than solving it. In-world figures stay generic, and the camera has to stop at about 5 m. The dark, dusk-lit portraits against the daylight world show that the plates are a UI layer.
- **B (restyled standees)** works, unlike the earlier drop-in test.
  - The generated art uses flat painted forms and a muted palette, conditioned on the portrait plus a screenshot of the world.
  - In the scene the cards are lit through a normal map derived from the alpha, cast real shadows, lean toward the camera, and go through the paint pass.
  - With that treatment the five named characters read as part of the painting at two-shot distance, and Garlan holds up at 2.5 m.
  - At about 115° off-axis the card narrows but still reads as a turned figure.
  - Where it breaks:
    - behind the figure, because there is no back art yet
    - at grazing angles
    - when the rig's gestures are needed, because the cards have none
  - The original, unrestyled Garlan PNG is visibly shinier and more detailed than the world.
- **Cost and performance:** 5 image generations (`gemini-3.1-flash-image`, one per character, no retries). Standee mode runs about 70 fewer draw calls than procedural.
- **Recommendation: C.**
  - Named characters, meaning PCs and staged NPCs, use restyled standees in the world, with back art.
  - Keep the camera within about 100° of each card's facing.
  - Portrait plates carry dialogue and the hold prompt.
  - The crowd stays procedural.
- **Detail follow-up (same day).** On a Retina screen the owner found the standees too flat. Causes:
  - rendering capped at 1× DPR
  - Kuwahara running at about 0.3 of physical pixels
  - a "simple/flat" generation prompt
  - 1024 px art

  Fixes applied:
  - DPR up to 2
  - Kuwahara at a fixed internal height (540/720/900) with a 4-tap prefilter
  - a depth-tested **character mask** so named characters keep about 20% of the paint (mask pass cost ≈0 ms)
  - detailed-art prompt at 2K (`gemini-3.1-flash-image` with `imageSize` 2K → 1536×2752, keyed to 2048 tall; 5 generations)

  Results:
  - Faces and costume now read at native pixels.
  - **New tension:** the characters are now clearly higher-fidelity than the blocky world, and Garlan's armour is more saturated and metallic than the palette.
  - **Cost:** at DPR 2 on an M3, high quality drops from 60 to 26–33 fps. The 4× scene pixels are most of the cost; Kuwahara at 720p is about 10 ms.
  - **For the port:** lift the world rather than dull the characters. That means MSAA, more world surface detail, and tier tuning (for example, DPR 1.5 at high).
- **World pass (same day).** The owner chose to lift the world in the prototype rather than dull the characters. Screenshots are in the demo repo as `previews/v5w-{before,after}-*.png`.
  - **Illustrated crowd cards.** 16 variants were generated in the hero style, at 2K, then packed into an atlas.
    - They render as one `InstancedMesh`: the shader turns each card toward the camera within a limit, derives normals from the alpha, casts shadows, and joins the mask at 50% paint.
    - **Hybrid LOD:** cards within 60 m and at eye level; procedural pawns for steep views.
    - The cards unify the party, two-shot and gate shots into one painting, and they are cheaper than pawns (2 triangles against about 1,100).
  - **Other changes:**
    - 4× MSAA with a resolved DepthTexture (it works in r180)
    - Kuwahara radius scaled by depth, 40% near to 100% far
    - a `wood()` shader for props
    - quarter-resolution GTAO, about 1.2 ms
    - a hero grade of about −13% saturation
  - **Tiers on the M3 at Retina:**

    | Tier | Settings | Result |
    |---|---|---|
    | Balanced | DPR 1 | 60 fps |
    | High | DPR 1.5, FXAA, no bloom | about 43–46 fps (party view); about 37 fps in the gate view |
    | Ultra | DPR 2, MSAA | about 21 fps |

    MSAA costs about 5.5 ms at 1.5.
  - **Remaining gaps:**
    - The art is front-only, so crowds face the camera even from behind the queue. This needs back art.
    - 16 variants repeat in dense areas.
    - The pawn/card swap pops with no crossfade.
    - Paving, canopies and tower silhouettes are still flat or blocky.
- **Back views (same day).** The owner asked for front and back.
  - Generated a back view for each of the 16 crowd types and the 5 heroes, conditioned on each figure's own front art: 24 generations, including 3 retries for gear on the wrong hand.
  - Crowd backs go in atlas layers 16–31. In the shader the card shows its back beyond 90° off the figure's facing, the camera-facing clamp re-centres on the facing plus 180°, and a colour dither across 80–100° hides the switch.
  - Heroes and the character mask use the same logic.
  - Cost: the same draw calls; the card texture memory doubles to about 64 MB; the HTML grows to 8.8 MB.
  - A queue seen from behind now shows backs.
  - Across the four prototype rounds (heroes, detailed heroes, crowd, backs) that is about 50 generations. For the production pipeline, budget one front plus one back generation per character and per crowd type.
- This brings back the avatar → full-body pipeline removed in phase 1 (`lib/encounterview/standee.ts` at `52ebdb9`, chroma key via `sharp`), retargeted to the world style. The prototype's `scripts/gen-standees.mjs` keys on distance from the green screen so that green cloaks survive. That script borrows `sharp` from this checkout, which phase 1 removed, so it will break after the next `pnpm install`.

## Unknowns

- Who or what authored the demo, and at what cost. This sets the per-location authoring budget. The demo's set-specific code is about 1,050 LOC (architecture, checkpoint, market, festival, heroes).
- Mobile GPU performance and memory.
- How well beats generation follows the set vocabulary. This needs an eval like Mapview's generation loop.
- Temporal stability of the paint pass during camera moves, which has only been reviewed in stills.
