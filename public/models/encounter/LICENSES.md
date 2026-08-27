# Encounter View 3D Assets — Licenses

All models in this directory are **CC0 1.0 Universal** (public domain — no attribution required; provided here anyway). Files were repacked for the web with [glTF Transform](https://gltf-transform.dev): converted to self-contained GLB, unused weapon-variant meshes and animation clips removed (characters keep `Idle` and `Death_A_Pose`), geometry welded and quantized.

| Directory / files | Pack | Author | Source |
|---|---|---|---|
| `characters/knight,barbarian,mage,rogue,rogue-hooded` | KayKit Character Pack: Adventurers 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 |
| `characters/skeleton-*` | KayKit Character Pack: Skeletons 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Skeletons-1.0 |
| `props/barrel,crate,chest,table,torch,pillar,wall-stone,wall-broken,banner,coins,rubble` | KayKit Dungeon Remastered 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered-1.0 |
| `props/tree-oak,tree-pine,thicket,stump,boulder,rocks,tent,cart,fence-wood` | KayKit Medieval Hexagon Pack 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0 |
| `props/tree-dead,gravestone,crypt,bones,coffin,shrine,lantern` | KayKit Halloween Bits 1.0 | Kay Lousberg | https://github.com/KayKit-Game-Assets/KayKit-Halloween-Bits-1.0 |
| `props/market-stall,building-facade,chair,beast-cage,staircase,bookshelf,gate-arch,door-heavy,door-arcane,boat,pier,bar-counter,desk,candelabra,chandelier,dais,altar,brazier,iron-gate,hedge,balustrade,gatehouse,city-wall,traveler,merchant,hooded-wanderer,town-guard` | asset-pipeline generated set (`d8f3b13`) | machine-generated — see below | `~/Projects/asset-pipeline` (local repo, no remote) @ `d8f3b13` |

## Generated props — not CC0

The 27 props in the row above are **not CC0** and are not from a KayKit pack. They were
machine-generated: a concept plate per prop from `fal-ai/flux/schnell`, then image-to-3D
through `fal-ai/hunyuan3d-v3 on fal.ai (image-to-3D)`, then post-processed in the `asset-pipeline` repo
(`blender/to_prop.py` for decimation, flat shading, 0.92 m normalisation and matte material
normalisation; `tools/emit-dist.mjs` for the glTF Transform / `optimizeGlb` web chain) at
commit `d8f3b13`. Art direction is `docs/style-lock.md` in that repo; per-prop
derivations, gate verdicts and scale overrides are in `dist/emission.json`.

They are used here under fal.ai's terms for commercial use of model outputs.

> **Flagged for the owner:** the per-vendor terms (fal.ai's output-ownership and commercial-use
> clauses for `flux/schnell` and `hunyuan3d-v3`, and the upstream model licences those wrap)
> were **not re-verified** at emission time. Confirm them before this ships publicly, and
> replace this paragraph with the specific licence names and dates once you have.
