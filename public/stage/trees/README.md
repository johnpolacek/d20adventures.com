# Trees

Modelled trees for the asset library's looks (`asset-library/trees.ts`): an oak, a dead oak, a pine and a birch, each in three weights, `<kind>-lod0.glb` the heaviest. They stand where a set's own trees are built, in a look that asks for them. The game itself does not use them.

| Kind | Triangles, lod0 / 1 / 2 | Made from |
|---|---|---|
| `oak` | 22,566 / 9,240 / 5,364 | ez-tree, preset Oak Large |
| `deadoak` | 8,658 / 2,808 / 1,860 | ez-tree, Oak Large with no leaves, more gnarl and twist |
| `pine` | 19,392 / 7,648 / 3,012 | ez-tree, preset Pine Large |
| `birch` | 13,668 / 5,368 / 2,686 | ez-tree, preset Aspen Large, with birch bark |

Made 2026-11-15 with ez-tree v2 from its GitHub source (github.com/dgreenheck/ez-tree), run in Node. npm had 1.1.0, without the weights. A tree's pivot is the foot of its trunk and its size is arbitrary: whoever stands one scales it to a height. Bark and leaves are separate meshes and materials. Leaves are cards cut out by alpha, each a photograph of a leafy twig.

## Where it came from

- ez-tree, its code and its leaf pictures: MIT, © 2024 Daniel Greenheck. The notice is `LICENSE-ez-tree.txt`, here. MIT asks that the notice go with copies, so a credits page on the site should carry it. The repo does not say who photographed the leaves.
- Oak bark: Poly Haven `bark_brown_02`, CC0.
- Dead oak bark: Poly Haven `bark_willow_02`, CC0.
- Pine bark: texturecan.com/details/588, CC0.
- Birch bark: texturecan.com/details/221, CC0.

## What was turned down

- Poly Haven's scanned trees, the most real CC0 trees there are: film assets with leaves as geometry, 0.3 to 17 million triangles each.
- Quaternius and Kenney nature packs: CC0, and low-poly by design.
- Anything on Sketchfab, which wants an account, and anything paid.

Run `pnpm stage:sync public/stage/trees` after changing a file here.
