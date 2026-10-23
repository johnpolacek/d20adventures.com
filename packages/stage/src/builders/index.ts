import { awning, bannerHanging, bannerPole, barrier, brazier, cart, ledgerTable, pennantPole, ropeLine } from "./checkpoint"
import { bush, fern, lightShaft, log, mistBank, trail, tree } from "./forest"
import { archScreen, curtainWall, dome, drumTower, gatehouse, roundTower, skyline, squareTower } from "./fortifications"
import { bollard, cage, crane, galleon, skiff, warehouse } from "./harbour"
import { group, row, scatter } from "./layouts"
import { archHead, armchair, bookcase, candleStand, column, cupola, desk, gallery, globe, panel, vault } from "./library"
import { barrelProp, basketProp, bunting, crateProp, farTown, goodsPile, gourds, house, lanternProp, potProp, prizeWheel, sackProp, sail, sheaf, spearRack, stall, standard } from "./market"
import { anchor, serpent, shipWheel } from "./nautical"
import { beamPrim, boxPrim, conePrim, cylinderPrim, extrudePrim, groundDisc, heightfieldPrim, lathePrim, openingPrim, spherePrim, torusPrim } from "./primitives"
import { chainLine, hangingRope, pier, riverboat, ship, strongbox } from "./river"
import { bar, bench, chair, chandelier, dragonSkull, hearth, stairs, stool, table, wall } from "./tavern"
import type { BuilderDef } from "./types"
import { flagstones, grassPatch, mountain, rock, standingStone } from "./wilds"

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
  heightfield: heightfieldPrim,
  mist: mistBank,
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
  prizeWheel,
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
  lightShaft,
  flagstones,
  grass: grassPatch,
  mountain,
  standingStone,
  // rivers and harbours
  riverboat,
  strongbox,
  rope: hangingRope,
  chain: chainLine,
  pier,
  ship,
  galleon,
  cage,
  crane,
  warehouse,
  skiff,
  bollard,
  // taverns and rooms
  wall,
  hearth,
  bar,
  table,
  bench,
  stool,
  chair,
  stairs,
  chandelier,
  dragonSkull,
  // libraries and halls
  panel,
  archHead,
  bookcase,
  vault,
  cupola,
  gallery,
  column,
  desk,
  armchair,
  globe,
  candleStand,
  // sailors' taverns
  serpent,
  shipWheel,
  anchor,
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
