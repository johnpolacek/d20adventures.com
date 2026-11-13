import { type SpellRules, useSpellMechanics } from "../spell-rules"
import { acidArrow } from "./acid-arrow"
import { areas } from "./areas"
import { attackRiders } from "./attack-riders"
import { blindnessDeafness } from "./blindness-deafness"
import { boons } from "./boons"
import { sacredFlame, sorcerousBurst } from "./cantrips"
import { chromaticOrb, enhanceAbility, hex, protectionFromEnergy } from "./choices"
import { counts } from "./counts"
import { heroism, invisibility, mirrorImageRules, shield } from "./defences"
import { animalFriendship, charmPerson, endOnDamage, holdPerson } from "./enchantments"
import { dispelMagic, lesserRestoration, removeCurse } from "./endings"
import { haste, slow } from "./haste-slow"
import { heatMetal } from "./heat-metal"
import { marks } from "./marks"
import { phantasmalForce } from "./phantasmal-force"
import { fear, repeatedSaves } from "./repeated-saves"
import { revivify } from "./revivify"
import { chainLightning, meteorSwarm } from "./shapes"
import { shatter } from "./shatter"
import { sleep } from "./sleep"
import { spiritGuardians } from "./spirit-guardians"
import { spiritualWeapon } from "./spiritual-weapon"
import { turnBurns } from "./turn-burns"
import { vampiricTouch } from "./vampiric-touch"

/**
 * Every spell mechanism file's rules (../spell-rules). A new mechanism adds its file here, and edits no other shared
 * place. Rules that act as a round turns run in this order, each for every character, so the first six keep theirs: a
 * save repeated at a turn's end, Sleep's second save, a burn as a turn starts, Acid Arrow's later burn, Spirit Guardians,
 * and the areas on the floor. A new file goes at the end. It is a function, read as play needs it, since the files read
 * the shared code that reads this list, and it is handed to ../spell-rules as this module loads.
 */
export const spellMechanics = (): readonly SpellRules[] => [
  repeatedSaves,
  sleep,
  turnBurns,
  acidArrow,
  spiritGuardians,
  areas,
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
]

useSpellMechanics(spellMechanics)
