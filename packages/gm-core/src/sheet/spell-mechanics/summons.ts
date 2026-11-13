import type { DamageTypeId } from "@d20/srd"
import { monsters } from "@d20/srd/monsters"
import type { Master } from "../../types/character"
import { isDead } from "../../utils/turn-actors"
import { blockOf, ownBlockOf, summonedBlockId } from "../blocks"
import { deriveSheet } from "../derive"
import type { CastContext, SpellRules, Summon } from "../spell-rules"

/**
 * Spells that call creatures into the encounter on their caster's side (../spell-rules `summons`, ../summoned). Each
 * creature is an NPC with the stat block the spell prints, built at the slot with its caster's numbers (../blocks), and
 * bound to its caster (`master`). Its turn is written as an NPC's is, told that it obeys its caster and what it does
 * with no command (`idle`). It is gone when the spell ends (../masters) and when it drops to 0 Hit Points, which is an
 * NPC's death: the dead leave play as the round ends.
 */

type Bound = { master?: Master; fled?: true; statBlock?: string }

// The caster's Proficiency Bonus, which a summoned block's "PB equals your Proficiency Bonus" takes.
const proficiencyOf = (cast: CastContext): number => (cast.caster.sheet ? deriveSheet(cast.caster.sheet).proficiencyBonus : (blockOf(cast.caster)?.pb ?? 2))

// The id of the block a spell prints, at this cast's slot, with the caster's numbers and choice.
const blockFor = (cast: CastContext, choice = cast.choice) =>
  summonedBlockId({ spell: cast.spell.id, slot: cast.slot, attackBonus: cast.casting.attackBonus, saveDc: cast.casting.saveDc, proficiency: proficiencyOf(cast), ...(choice ? { choice } : {}) })

// What the creatures "If you don't issue any [commands]" do, in the words of the summoning spells.
const DODGES = "it takes the Dodge action and uses its movement to avoid danger"

/**
 * Summon Dragon: "It manifests in an unoccupied space that you can see within range and uses the Draconic Spirit stat
 * block. ... In combat, the creature shares your Initiative count, but it takes its turn immediately after yours. It
 * obeys your verbal commands". Shared Resistances: "choose one of its Resistances. You have Resistance to the chosen
 * damage type until the spell ends", and its Breath Weapon deals "damage of a type this spirit has Resistance to (your
 * choice when you cast the spell)": one choice for both. Its space is beside its caster.
 */
export const summonDragon: SpellRules = {
  spells: ["summon-dragon"],
  choice: { values: ["acid", "cold", "fire", "lightning", "poison"], field: "damageType", words: "the Resistance its spirit shares with the caster, and its breath's damage type" },
  held: { byCaster: true, resistances: (effect) => (effect.choice ? [effect.choice as DamageTypeId] : []) },
  summons: (cast) => [{ statBlock: blockFor(cast), name: "Draconic Spirit", initiative: "after" }],
  idle: DODGES,
}

/**
 * Giant Insect: "You summon a giant centipede, spider, or wasp (chosen when you cast the spell). ... In combat, the
 * creature shares your Initiative count, but it takes its turn immediately after yours. It obeys your verbal commands".
 */
export const giantInsect: SpellRules = {
  spells: ["giant-insect"],
  choice: { values: ["spider", "centipede", "wasp"], field: "spellChoice", words: "the insect it calls" },
  held: { byCaster: true },
  summons: (cast) => [{ statBlock: blockFor(cast), name: `Giant ${(cast.choice ?? "spider")[0].toUpperCase()}${(cast.choice ?? "spider").slice(1)}`, initiative: "after" }],
  idle: DODGES,
}

/**
 * Animate Objects: "The maximum number of objects is equal to your spellcasting ability modifier", each a Construct
 * with the Animated Object stat block that "shares your Initiative count and takes its turn immediately after yours".
 * The engine animates Medium or smaller objects, one each.
 */
export const animateObjects: SpellRules = {
  spells: ["animate-objects"],
  held: { byCaster: true },
  summons: (cast) => Array.from({ length: Math.max(1, cast.casting.modifier) }, (_, index): Summon => ({ statBlock: blockFor(cast), name: `Animated Object ${index + 1}`, initiative: "after" })),
  idle: "it takes the Dodge action and moves only to avoid harm",
}

/**
 * Find Steed: "This creature uses the Otherworldly Steed stat block. If you already have a steed from this spell, the
 * steed is replaced by the new one. ... choose the steed's creature type: Celestial, Fey, or Fiend". "In combat, it
 * shares your Initiative count". "The steed disappears if it drops to 0 Hit Points or if you die."
 */
export const findSteed: SpellRules = {
  spells: ["find-steed"],
  choice: { values: ["celestial", "fey", "fiend"], field: "spellChoice", words: "the steed's creature type" },
  summons: (cast) => {
    for (const steed of cast.everyone())
      if ((steed as Bound).master?.summoned && (steed as Bound).master?.spell === cast.spell.id && (steed as Bound).master?.id === cast.caster.id) cast.put({ ...steed, fled: true })
    return [{ statBlock: blockFor(cast), name: "Otherworldly Steed", initiative: "after" }]
  },
  // The steed is gone once its caster dies.
  round: (round, was) => {
    const master = (was as Bound).master
    if (!master?.summoned || master.spell !== "find-steed" || (was as Bound).fled) return
    const rider = round.find(master.id)
    if (rider && !isDead(rider)) return
    round.put({ ...was, fled: true } as typeof was)
    round.tell(was.id, "Find Steed", `${was.name} disappears: the one who called it is dead.`)
  },
}

// The forms a familiar may take: "Bat, Cat, Frog, Hawk, Lizard, Octopus, Owl, Rat, Raven, Spider, Weasel, or another
// Beast that has a Challenge Rating of 0", each a Celestial, a Fey or a Fiend. Read from the data alone.
const FAMILIAR_FORMS = monsters.filter((monster) => monster.type === "beast" && monster.cr === 0).flatMap((monster) => ["celestial", "fey", "fiend"].map((kind) => `${monster.id}-${kind}`))

/**
 * Find Familiar: "a spirit that takes an animal form you choose ... the familiar has the statistics of the chosen form,
 * though it is a Celestial, Fey, or Fiend (your choice) instead of a Beast. Your familiar acts independently of you, but
 * it obeys your commands. ... It rolls its own Initiative and acts on its own turn. A familiar can't attack". "If you
 * cast this spell while you have a familiar, you instead cause it to adopt a new eligible form." Its block leaves its
 * attacks out (../blocks). Its casting of an hour is never made in a fight.
 */
export const findFamiliar: SpellRules = {
  spells: ["find-familiar"],
  choice: { values: FAMILIAR_FORMS, field: "spellChoice", words: "the familiar's form and creature type, as form-type" },
  summons: (cast) => {
    const had = cast
      .everyone()
      .find((other) => (other as Bound).master?.summoned && (other as Bound).master?.spell === cast.spell.id && (other as Bound).master?.id === cast.caster.id && !(other as Bound).fled)
    if (!had) return [{ statBlock: blockFor(cast), name: `${cast.caster.name}'s Familiar`, initiative: "own" }]
    cast.put({ ...had, statBlock: blockFor(cast) } as typeof had)
    cast.facts.push(`${had.name} takes a new form.`)
    return []
  },
  idle: "it acts as it likes, keeping out of harm's way",
}

/**
 * Finger of Death: "A Humanoid killed by this spell rises at the start of your next turn as a Zombie (see "Monsters")
 * that follows your verbal orders." The Zombie stands where the body fell and takes its first turn in the next round,
 * on its own Initiative.
 */
export const fingerOfDeath: SpellRules = {
  spells: ["finger-of-death"],
  summons: (cast) =>
    cast.targets.flatMap((id): Summon[] => {
      const fallen = cast.find(id)
      return fallen && isDead(fallen) && (fallen.sheet ? true : ownBlockOf(fallen)?.type === "humanoid")
        ? [{ statBlock: "zombie", name: `Zombie of ${fallen.name}`, initiative: "own", waits: true, beside: id }]
        : []
    }),
}

export const summons: SpellRules[] = [summonDragon, giantInsect, animateObjects, findSteed, findFamiliar, fingerOfDeath]
