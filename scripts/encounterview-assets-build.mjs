// Curate KayKit GLBs into public/models/encounter/{characters,props}/
// Characters: keep rig + Idle + Death_A_Pose clips (static minis posed at runtime),
// drop unused weapon-variant meshes, weld+quantize. Props: pack to self-contained GLB.
//
// One-time build tool, committed for reproducibility when the prop catalog grows
// (lib/encounterview/asset-catalog.ts is append-only, like the mapview piece catalog).
// Setup: clone the KayKit repos named below from github.com/KayKit-Game-Assets into a
// work dir, `npm i @gltf-transform/core @gltf-transform/functions @gltf-transform/extensions`
// there, update the S/OUT constants, then `node encounterview-assets-build.mjs`.
// Sizes: characters ~250KB each, props 18-100KB, total ~3MB for 9 characters + 27 props.
import { NodeIO } from "@gltf-transform/core"
import { ALL_EXTENSIONS } from "@gltf-transform/extensions"
import { prune, dedup, resample, weld, quantize } from "@gltf-transform/functions"
import { mkdirSync, statSync } from "node:fs"
import { execSync } from "node:child_process"

const S = "/private/tmp/claude-501/-Users-johnpolacek-Projects-d20adventures-com/e0f88758-a35c-4956-ac65-375b4aa7b6c4/scratchpad"
const OUT = "/Users/johnpolacek/Projects/d20adventures.com/public/models/encounter"

const ADV = `${S}/KayKit-Character-Pack-Adventures-1.0/addons/kaykit_character_pack_adventures/Characters/gltf`
const SKEL = `${S}/KayKit-Character-Pack-Skeletons-1.0/addons/kaykit_character_pack_skeletons/Characters/gltf`
const dir = (repo, file) => execSync(`dirname "$(find ${S}/${repo} -name '${file}' | head -1)"`).toString().trim()
const DUN = dir("KayKit-Dungeon-Remastered-1.0", "barrel_large.gltf.glb")
const HEXN = dir("KayKit-Medieval-Hexagon-Pack-1.0", "tree_single_A.gltf")
const HEXP = dir("KayKit-Medieval-Hexagon-Pack-1.0", "tent.gltf")
const HEXB = dir("KayKit-Medieval-Hexagon-Pack-1.0", "fence_wood_straight.gltf")
const HAL = dir("KayKit-Halloween-Bits-1.0", "gravestone.gltf")

const KEEP_CLIPS = new Set(["Idle", "Death_A_Pose"])

const characters = {
  "knight.glb": { src: `${ADV}/Knight.glb`, dropNodes: ["1H_Sword_Offhand", "Rectangle_Shield", "Round_Shield", "Spike_Shield", "2H_Sword"] },
  "barbarian.glb": { src: `${ADV}/Barbarian.glb`, dropNodes: ["1H_Axe_Offhand", "Barbarian_Round_Shield", "1H_Axe", "Mug"] },
  "mage.glb": { src: `${ADV}/Mage.glb`, dropNodes: ["Spellbook", "Spellbook_open", "1H_Wand"] },
  "rogue.glb": { src: `${ADV}/Rogue.glb`, dropNodes: ["Knife_Offhand", "1H_Crossbow", "2H_Crossbow", "Throwable"] },
  "rogue-hooded.glb": { src: `${ADV}/Rogue_Hooded.glb`, dropNodes: ["Knife_Offhand", "1H_Crossbow", "2H_Crossbow", "Throwable"] },
  "skeleton-warrior.glb": { src: `${SKEL}/Skeleton_Warrior.glb`, dropNodes: [] },
  "skeleton-mage.glb": { src: `${SKEL}/Skeleton_Mage.glb`, dropNodes: [] },
  "skeleton-rogue.glb": { src: `${SKEL}/Skeleton_Rogue.glb`, dropNodes: [] },
  "skeleton-minion.glb": { src: `${SKEL}/Skeleton_Minion.glb`, dropNodes: [] },
}

const props = {
  "tree-oak.glb": `${HEXN}/tree_single_A.gltf`,
  "tree-pine.glb": `${HEXN}/tree_single_B.gltf`,
  "tree-dead.glb": `${HAL}/tree_dead_large.gltf`,
  "thicket.glb": `${HEXN}/trees_A_small.gltf`,
  "stump.glb": `${HEXN}/tree_single_A_cut.gltf`,
  "boulder.glb": `${HEXN}/rock_single_C.gltf`,
  "rocks.glb": `${HEXN}/rock_single_A.gltf`,
  "tent.glb": `${HEXP}/tent.gltf`,
  "cart.glb": `${HEXP}/wheelbarrow.gltf`,
  "fence-wood.glb": `${HEXB}/fence_wood_straight.gltf`,
  "barrel.glb": `${DUN}/barrel_large.gltf.glb`,
  "crate.glb": `${DUN}/box_stacked.gltf.glb`,
  "chest.glb": `${DUN}/chest.glb`,
  "table.glb": `${DUN}/table_long.gltf.glb`,
  "torch.glb": `${DUN}/torch_lit.gltf.glb`,
  "pillar.glb": `${DUN}/pillar.gltf.glb`,
  "wall-stone.glb": `${DUN}/wall.gltf.glb`,
  "wall-broken.glb": `${DUN}/wall_broken.gltf.glb`,
  "banner.glb": `${DUN}/banner_patternA_red.gltf.glb`,
  "coins.glb": `${DUN}/coin_stack_large.gltf.glb`,
  "rubble.glb": `${DUN}/rubble_large.gltf.glb`,
  "gravestone.glb": `${HAL}/gravestone.gltf`,
  "crypt.glb": `${HAL}/crypt.gltf`,
  "bones.glb": `${HAL}/ribcage.gltf`,
  "coffin.glb": `${HAL}/coffin.gltf`,
  "shrine.glb": `${HAL}/shrine_candles.gltf`,
  "lantern.glb": `${HAL}/lantern_standing.gltf`,
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
mkdirSync(`${OUT}/characters`, { recursive: true })
mkdirSync(`${OUT}/props`, { recursive: true })

async function processCharacter(src, dest, dropNodes) {
  const doc = await io.read(src)
  const root = doc.getRoot()
  for (const node of root.listNodes()) {
    if (dropNodes.includes(node.getName())) node.dispose()
  }
  for (const anim of root.listAnimations()) {
    if (!KEEP_CLIPS.has(anim.getName())) {
      for (const channel of anim.listChannels()) channel.dispose()
      for (const sampler of anim.listSamplers()) sampler.dispose()
      anim.dispose()
    }
  }
  await doc.transform(resample(), dedup(), weld(), quantize(), prune())
  // Orphaned sampler accessors only become prunable after a write/read round trip.
  await io.write(dest, doc)
  const doc2 = await io.read(dest)
  await doc2.transform(prune(), dedup())
  await io.write(dest, doc2)
  return statSync(dest).size
}

async function processProp(src, dest) {
  const doc = await io.read(src)
  await doc.transform(dedup(), weld(), quantize(), prune())
  await io.write(dest, doc)
  return statSync(dest).size
}

let total = 0
for (const [name, { src, dropNodes }] of Object.entries(characters)) {
  const bytes = await processCharacter(src, `${OUT}/characters/${name}`, dropNodes)
  total += bytes
  console.log(`characters/${name}  ${Math.round(bytes / 1024)}KB`)
}
for (const [name, src] of Object.entries(props)) {
  const bytes = await processProp(src, `${OUT}/props/${name}`)
  total += bytes
  console.log(`props/${name}  ${Math.round(bytes / 1024)}KB`)
}
console.log(`TOTAL: ${(total / 1048576).toFixed(1)}MB`)
