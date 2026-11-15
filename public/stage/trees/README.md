# Trees

Modelled trees for the asset library's looks (`asset-library/trees.ts`): twenty shapes of six kinds, each in three weights, `<shape>-lod0.glb` the heaviest. They stand where a set's own trees are built, in a look that asks for them. The game itself does not use them.

`trees.json` lists every shape: its kind, whose bark and leaves it wears, its files, its triangles and its proportions. The files hold geometry alone, a `bark` mesh and a `leaves` mesh. The pictures are in `textures/`, one set to a species, so sixty files share five barks and four leaf cards.

| Shape | Kind | What it is | Triangles, lod0 / 1 / 2 | Width to height | Crown starts at |
|---|---|---|---|---|---|
| `oak1` | oak | big old forest oak | 16590 / 6594 / 1518 | 0.6 | 0.4 |
| `oak2` | oak | big old oak, few heavy crooked limbs | 13134 / 5192 / 1199 | 0.75 | 0.33 |
| `oak3` | oak | forked trunk, two leaders | 7920 / 3148 / 696 | 0.44 | 0.39 |
| `oak4` | oak | leaning, crown pulled to one side | 11192 / 4344 / 1012 | 0.62 | 0.46 |
| `oak5` | oak | open-grown wide oak for clearings | 15208 / 4602 / 2040 | 0.99 | 0.16 |
| `pine1` | pine | tall spruce, bare lower trunk | 10048 / 3528 / 1032 | 0.35 | 0.41 |
| `pine2` | pine | tall Scots-pine form: long bare trunk, small upswept crown | 8124 / 3468 / 1174 | 0.45 | 0.5 |
| `pine3` | pine | ragged old spruce: gaps, broken limbs, crooked top | 5332 / 2004 / 642 | 0.31 | 0.36 |
| `pine4` | pine | young spruce, branches to the ground | 5528 / 2072 / 614 | 0.61 | 0.07 |
| `ash1` | ash | tall forest ash | 16270 / 6498 / 1494 | 0.53 | 0.43 |
| `ash2` | ash | ash with one-sided crown (grew toward a gap) | 10422 / 4118 / 960 | 0.56 | 0.37 |
| `ash3` | ash | slim ash, slight lean, thin airy crown | 12628 / 4840 / 1096 | 0.49 | 0.47 |
| `aspen1` | aspen | tall slender birch-barked aspen | 13052 / 4900 / 1812 | 0.34 | 0.45 |
| `aspen2` | aspen | crooked leaning birch, drooping limbs | 12436 / 4592 / 1736 | 0.59 | 0.38 |
| `dead1` | dead | bare gnarled dead oak | 2815 / 794 / 357 | 0.49 | 0.29 |
| `dead2` | dead | snag with broken top and a few stubs | 565 / 180 / 92 | 0.23 | 0.43 |
| `dead3` | dead | half-dead oak: bare dead limbs, thin crown | 9387 / 3261 / 727 | 0.55 | 0.38 |
| `bush1` | bush | broadleaf shrub | 13872 / 5484 / 1020 | 1.27 | 0 |
| `bush2` | bush | loose shrub | 5288 / 2018 / 776 | 0.99 | 0 |
| `sapling1` | sapling | oak sapling, 3 to 5 m class | 6806 / 2958 / 738 | 0.67 | 0.33 |

Made 2026-11-15 with ez-tree v2 from its GitHub source (github.com/dgreenheck/ez-tree), run in Node. npm had 1.1.0, without the weights. A tree's pivot is the foot of its trunk and its size is arbitrary: whoever stands one scales it to a height.

The first four, made the same morning, were grown in the open: as wide as they were tall, and a wood of them was a roof. These are forest trees, with crowns that start a third to half way up and are about half as wide as the tree is tall. `oak5` is the one grown in the open, for a clearing or a dooryard. Variety is in the branching and not only the seed: limbs dropped or broken, a crown pulled to one side, a top snapped off, a trunk forked or leaning, a half-dead tree with leaves on some limbs.

## Where it came from

- ez-tree, its code and its leaf pictures: MIT, © 2024 Daniel Greenheck. The notice is `LICENSE-ez-tree.txt`, here. MIT asks that the notice go with copies, so a credits page on the site should carry it. The repo does not say who photographed the leaves.
- Oak bark: Poly Haven `bark_brown_02`, CC0.
- Ash bark: Poly Haven `tree_bark_03`, CC0.
- Dead bark: Poly Haven `japanese_sycamore`, CC0. It is 1024 by 2048, and the dead trees' UVs allow for it.
- Pine bark: texturecan.com/details/588, CC0.
- Aspen bark, a birch's: texturecan.com/details/221, CC0.

## Known

- The aspen's leaf card was photographed in autumn, gold. A look gives the aspens the ash's leaves (`leaves: { aspen: "ash" }`).
- The lightest weight is single flat cards, so a far crown is thin from some sides. The pines' is the sparsest.
- `pine2` is spruce twigs on a broadleaf's skeleton and may read as no tree in particular.
- Nothing sways: no wind weights were kept.
- No shape was looked at under real light before it was stood in a wood.

## What was turned down

- Poly Haven's scanned trees, the most real CC0 trees there are: film assets with leaves as geometry, 0.3 to 17 million triangles each.
- Quaternius and Kenney nature packs: CC0, and low-poly by design.
- Anything on Sketchfab, which wants an account, and anything paid.

Run `pnpm stage:sync public/stage/trees` after changing a file here.
