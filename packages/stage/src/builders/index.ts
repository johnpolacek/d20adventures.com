import { awning, bannerHanging, bannerPole, barrier, brazier, cart, ledgerTable, pennantPole, ropeLine } from "./checkpoint"
import { bush, fern, log, rock, trail, tree } from "./forest"
import { archScreen, curtainWall, dome, drumTower, gatehouse, roundTower, skyline, squareTower } from "./fortifications"
import { group, row, scatter } from "./layouts"
import { barrelProp, basketProp, bunting, crateProp, farTown, goodsPile, gourds, house, lanternProp, potProp, sackProp, sail, sheaf, spearRack, stall, standard } from "./market"
import { beamPrim, boxPrim, conePrim, cylinderPrim, extrudePrim, groundDisc, lathePrim, openingPrim, spherePrim, torusPrim } from "./primitives"
import type { BuilderDef } from "./types"

// Every object `type` a set spec may use. The spec is data; only these builders run.
export const BUILDERS: Record<string, BuilderDef> = {
  // layouts
  group,
  row,
  scatter,
  // primitives
  box: boxPrim,
  cylinder: cylinderPrim,
  cone: conePrim,
  sphere: spherePrim,
  torus: torusPrim,
  lathe: lathePrim,
  beam: beamPrim,
  extrude: extrudePrim,
  opening: openingPrim,
  groundDisc,
  // fortifications
  gatehouse,
  drumTower,
  curtainWall,
  roundTower,
  squareTower,
  archScreen,
  skyline,
  dome,
  // town and market
  house,
  farTown,
  stall,
  sail,
  spearRack,
  standard,
  crate: crateProp,
  barrel: barrelProp,
  sack: sackProp,
  pot: potProp,
  basket: basketProp,
  lantern: lanternProp,
  goodsPile,
  // festival
  bunting,
  sheaf,
  gourds,
  // woodland
  tree,
  fern,
  bush,
  rock,
  log,
  trail,
  // checkpoint and dressing
  barrier,
  ropeLine,
  brazier,
  ledgerTable,
  cart,
  awning,
  bannerPole,
  banner: bannerHanging,
  pennant: pennantPole,
}
