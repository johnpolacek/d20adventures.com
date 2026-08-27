# Encounter View 3D Assets — Licenses

All models in this directory are **CC0 1.0 Universal** (public domain — no attribution required; provided here anyway). Files were repacked for the web with [glTF Transform](https://gltf-transform.dev): converted to self-contained GLB, unused weapon-variant meshes and animation clips removed (characters keep `Idle` and `Death_A_Pose`), geometry welded and quantized.

| Directory / files | Pack | Author | Source |
|---|---|---|---|
| `characters/knight,barbarian,mage,rogue,rogue-hooded` | KayKit Character Pack: Adventurers 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 |
| `characters/skeleton-*` | KayKit Character Pack: Skeletons 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 |
| `props/barrel,crate,chest,table,torch,pillar,wall-stone,wall-broken,banner,coins,rubble` | KayKit Dungeon Remastered 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 |
| `props/tree-oak,tree-pine,thicket,stump,boulder,rocks,tent,cart,fence-wood` | KayKit Medieval Hexagon Pack 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 |
| `props/tree-dead,gravestone,crypt,bones,coffin,shrine,lantern` | KayKit Halloween Bits 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0 |
| `props/market-stall,building-facade,chair,beast-cage,staircase,bookshelf,gate-arch,door-heavy,door-arcane,boat,pier,bar-counter,desk,candelabra,chandelier,dais,altar,brazier,iron-gate,hedge,balustrade,gatehouse,city-wall,traveler,merchant,hooded-wanderer,town-guard,horse,wagon` | asset-pipeline generated set (`d8f3b13`) | machine-generated — see below | `~/Projects/asset-pipeline` (local repo, no remote) @ `d8f3b13` |

## Generated props — not CC0

The 29 props in the row above are **not CC0** and are not from a KayKit pack. They were
machine-generated: a concept plate per prop from `fal-ai/flux/schnell`, then image-to-3D
through `fal-ai/hunyuan3d-v3 on fal.ai (image-to-3D)`, then post-processed in the `asset-pipeline` repo
(`blender/to_prop.py` for decimation, flat shading, 0.92 m normalisation and matte material
normalisation; `tools/emit-dist.mjs` for the glTF Transform / `optimizeGlb` web chain) at
commit `d8f3b13`. Art direction is `docs/style-lock.md` in that repo; per-prop
derivations, gate verdicts and scale overrides are in `dist/emission.json`.

They are used here under fal.ai's terms for commercial use of model outputs.

**License verification (2026-08-27):** fal.ai lists `fal-ai/hunyuan3d-v3/image-to-3d`
with a **Commercial use** badge, and fal's FAQ states most models are commercially usable
with each model carrying its own license. The concept plates came from `fal-ai/flux/schnell`
(FLUX.1 [schnell]), which is **Apache 2.0** — outputs unrestricted. One residual note:
Tencent's *open-weights* Hunyuan community licenses carry territory exclusions (EU/UK/
South Korea) and a 100M-MAU clause, but those govern deploying the model weights, not the
assets a hosted API produces; we access v3 only through fal's hosted, commercially-badged
endpoint and redistribute no model. Assessed low risk for shipping these GLBs as game
content. If distribution to EU users ever becomes a legal review topic, this is the
paragraph to hand the reviewer.
