import { type SpellRules, useSpellMechanics } from "../spell-rules"
import { acidArrow } from "./acid-arrow"
import { attackRiders } from "./attack-riders"
import { blindnessDeafness } from "./blindness-deafness"
import { boons } from "./boons"
import { sacredFlame, sorcerousBurst } from "./cantrips"
import { chromaticOrb, enhanceAbility, hex, protectionFromEnergy } from "./choices"
import { counts } from "./counts"
import { charmMonster, dominations, hideousLaughter } from "./damage-saves"
import { heroism, invisibility, mirrorImageRules, shield } from "./defences"
import { animalFriendship, charmPerson, endOnDamage, holdPerson } from "./enchantments"
import { dispelMagic, lesserRestoration, removeCurse } from "./endings"
import { ensnaringStrike } from "./ensnaring-strike"
import { haste, slow } from "./haste-slow"
import { heatMetal } from "./heat-metal"
import { areaDrifts, areaTurnEnds, areaTurnStarts, lastingAreas } from "./lasting-areas"
import { phantasmalKiller, vitriolicSphere } from "./later-harm"
import { marks } from "./marks"
import { phantasmalForce } from "./phantasmal-force"
import { fear, repeatedSaves } from "./repeated-saves"
import { disintegrate, greaterRestoration, harm, heal, massHeal, powerWordHeal, raiseDead, regenerateSpell, resurrection, revivifyDust, spareTheDying, trueResurrection } from "./restoration"
import { revivify } from "./revivify"
import { contagion, fleshToStone } from "./save-tallies"
import { chainLightning, meteorSwarm } from "./shapes"
import { shatter } from "./shatter"
import { sleep } from "./sleep"
import { spiritGuardians } from "./spirit-guardians"
import { spiritualWeapon } from "./spiritual-weapon"
import { divineWord, powerWordKill, powerWordStun } from "./thresholds"
import { turnBurns } from "./turn-burns"
import { arcaneSword, flameBlade, flamingSphere, produceFlame, sunbeam } from "./used-again"
import { vampiricTouch } from "./vampiric-touch"
import { walls } from "./walls"
import { deathWard, dispelEvilAndGood, fireShield, foresight, freedomOfMovement, heroesFeast, mindBlank, protectionFromEvilAndGood, protectionFromPoison, stoneskin, wardingBond } from "./wards"
import { shillelagh } from "./weapon-spells"

/**
 * Every spell mechanism file's rules (../spell-rules). A new mechanism adds its file here, and edits no other shared
 * place. Rules that act as a round turns run in this order, each for every character, so the first eight keep theirs: a
 * save repeated at a turn's end, Sleep's second save, a burn as a turn starts, Acid Arrow's later burn, Spirit Guardians,
 * and the areas on the floor as every turn ends, as they drift, and as every turn starts. A new file goes at the end. It is a function, read as play needs it, since the files read
 * the shared code that reads this list, and it is handed to ../spell-rules as this module loads.
 */
export const spellMechanics = (): readonly SpellRules[] => [
  repeatedSaves,
  sleep,
  turnBurns,
  acidArrow,
  spiritGuardians,
  areaTurnEnds,
  areaDrifts,
  areaTurnStarts,
  fear,
  ...counts,
  holdPerson,
  charmPerson,
  animalFriendship,
  endOnDamage,
  sacredFlame,
  sorcerousBurst,
  heatMetal,
  blindnessDeafness,
  shatter,
  phantasmalForce,
  vampiricTouch,
  spiritualWeapon,
  revivify,
  lesserRestoration,
  removeCurse,
  dispelMagic,
  ...attackRiders,
  haste,
  slow,
  ...boons,
  marks,
  shield,
  heroism,
  invisibility,
  mirrorImageRules,
  meteorSwarm,
  chainLightning,
  chromaticOrb,
  protectionFromEnergy,
  enhanceAbility,
  hex,
  phantasmalKiller,
  vitriolicSphere,
  fleshToStone,
  contagion,
  hideousLaughter,
  ...dominations,
  charmMonster,
  flameBlade,
  produceFlame,
  arcaneSword,
  sunbeam,
  flamingSphere,
  stoneskin,
  protectionFromPoison,
  mindBlank,
  heroesFeast,
  foresight,
  fireShield,
  protectionFromEvilAndGood,
  dispelEvilAndGood,
  freedomOfMovement,
  deathWard,
  wardingBond,
  powerWordKill,
  powerWordStun,
  divineWord,
  heal,
  massHeal,
  powerWordHeal,
  greaterRestoration,
  harm,
  spareTheDying,
  regenerateSpell,
  disintegrate,
  raiseDead,
  resurrection,
  trueResurrection,
  revivifyDust,
  shillelagh,
  ensnaringStrike,
  ...lastingAreas,
  ...walls,
]

useSpellMechanics(spellMechanics)
