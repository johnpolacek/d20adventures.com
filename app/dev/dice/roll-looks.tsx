"use client"

// Every look a roll and a character can have on the stage, from mock data, to check by eye: the attack on the card
// before and after the engine answers it, Hit, Miss and Critical Hit with their damage, a save that hurts and gives a
// condition, a Bardic Inspiration die, the Death Saving Throw, a class feature used, and how heroes and NPCs stand.
// And spells: a spell attack, a target's save against a spell, the dice of Bless and Bane, a spell cast with no roll,
// a Concentration save, a caster's card, and the spells that last on a character with their Temporary Hit Points.
// And reactions: an offer to the player's hero with its countdown, one for another player's hero, and standing orders.

import { conditionLabel } from "@d20/gm-core/utils/condition-label"
import { type ReactNode, useState } from "react"
import { CharacterCard } from "@/components/stage/character-card"
import { eyebrow, Pill, panel } from "@/components/stage/hud"
import { Journal, type JournalTurn } from "@/components/stage/journal"
import { Narration } from "@/components/stage/narration"
import { type CardCharacter, type CardMode, type CardRoll, PromptCard } from "@/components/stage/prompt-card"
import { ReactionCard, StandingOrders } from "@/components/stage/reaction-card"
import { heroReactions } from "@/components/stage/reaction-view"
import { FeatureEntry } from "@/components/stage/roll-parts"
import { RollResult } from "@/components/stage/roll-result"
import type { FeatureView, RollAsk, RollView } from "@/components/stage/roll-view"
import { type OrderEntry, TurnOrder } from "@/components/stage/turn-order"

const THALBERN = "/images/app/characters/default.png"
const LYRA = "Lyra Ashgrove"

const ATTACK_ASK: RollAsk = { kind: "attack", character: "Thalbern Ironfist", check: "Longsword", modifier: 5, dc: 13, target: "Owlbear", portrait: THALBERN }
const HIT: RollView = {
  ...ATTACK_ASK,
  natural: 14,
  total: 19,
  success: true,
  damage: [{ type: "Slashing", dice: [6], sides: 8, bonus: 3, total: 9 }],
}
// Resistance: the target lost less than the dice.
const HIT_RESISTED: RollView = {
  ...ATTACK_ASK,
  target: "Fire Elemental",
  dc: 13,
  natural: 16,
  dice: [16, 7],
  mode: "advantage",
  reasons: ["Owlbear Prone"],
  total: 21,
  success: true,
  damage: [
    { type: "Slashing", dice: [5], sides: 8, bonus: 3, total: 8 },
    { type: "Fire", dice: [4, 2], sides: 6, bonus: 0, total: 6 },
  ],
  taken: 10,
}
const CRITICAL: RollView = { ...ATTACK_ASK, natural: 20, total: 25, success: true, critical: true, damage: [{ type: "Slashing", dice: [7, 3], sides: 8, bonus: 3, total: 13 }] }
const MISS: RollView = { ...ATTACK_ASK, natural: 3, dice: [3, 15], mode: "disadvantage", reasons: ["Poisoned"], total: 8, success: false }
const SAVE_HARM: RollView = {
  kind: "check",
  character: "Branka Stoneveil",
  check: "Constitution Saving Throw",
  natural: 6,
  modifier: 2,
  total: 8,
  dc: 13,
  success: false,
  harm: [{ target: "Branka Stoneveil", kind: "damage", dice: [3, 5], sides: 6, bonus: 0, type: "Poison", amount: 8 }],
  conditions: [
    { target: "Branka Stoneveil", condition: "Poisoned" },
    { target: "Branka Stoneveil", condition: "Restrained", ends: true },
  ],
}
const INSPIRED: RollView = { kind: "check", character: "Yeva Softstep", check: "Stealth", natural: 9, modifier: 4, inspired: 3, total: 16, dc: 15, success: true }
const HEALED: RollView = {
  kind: "check",
  character: "Wrenna Faelendar",
  check: "Cure Wounds (Wisdom)",
  natural: 12,
  modifier: 3,
  total: 15,
  dc: 10,
  success: true,
  harm: [{ target: "Thalbern Ironfist", kind: "healing", dice: [6], sides: 8, bonus: 3, amount: 9 }],
}
const DEATH_ASK: RollAsk = { kind: "death", character: "Thalbern Ironfist", check: "Death Saving Throw", dc: 10, deathSaves: { successes: 1, failures: 1 }, portrait: THALBERN }
const DEATH_SAVED: RollView = { ...DEATH_ASK, natural: 13, total: 13, success: true, deathSaves: { successes: 2, failures: 1 } }
const DEATH_20: RollView = { ...DEATH_ASK, natural: 20, total: 20, success: true, deathSaves: undefined, fate: "revived" }
const DEATH_1: RollView = { ...DEATH_ASK, natural: 1, total: 1, success: false, deathSaves: { successes: 1, failures: 3 }, fate: "dead" }
const DEATH_EXHAUSTED: RollView = { ...DEATH_ASK, modifier: -2, natural: 11, total: 9, success: false, deathSaves: { successes: 1, failures: 2 } }

const SECOND_WIND: FeatureView = {
  character: "Thalbern Ironfist",
  name: "Second Wind",
  harm: [{ target: "Thalbern Ironfist", kind: "healing", dice: [7], sides: 10, bonus: 3, amount: 10 }],
  text: "Thalbern uses Second Wind and regains 10 hit points.",
}
const BARDIC: FeatureView = { character: "Wrenna Faelendar", name: "Bardic Inspiration", target: "Thalbern Ironfist", text: "Wrenna gives Thalbern a d6 of Bardic Inspiration." }
// Spells cast with no roll of the caster's: three darts on one target, a heal, a spell on two who then save, and a utility spell.
const dart = (die: number) => ({ target: "Reinhard Voss", kind: "damage" as const, dice: [die], sides: 4, bonus: 1, type: "force", amount: die + 1 })
const MAGIC_MISSILE: FeatureView = { character: LYRA, name: "Magic Missile", target: "Reinhard Voss", harm: [dart(3), dart(1), dart(4)], text: "Lyra Ashgrove casts Magic Missile on Reinhard Voss." }
const HEALING_WORD: FeatureView = {
  character: "Branka Stoneveil",
  name: "Healing Word",
  target: "Thalbern Ironfist",
  harm: [{ target: "Thalbern Ironfist", kind: "healing", dice: [3], sides: 4, bonus: 3, amount: 6 }],
  text: "Branka Stoneveil casts Healing Word on Thalbern Ironfist.",
}
const BURNING_HANDS: FeatureView = { character: LYRA, name: "Burning Hands", text: "Lyra Ashgrove casts Burning Hands on Owlbear and Dire Wolf." }
const LIGHT: FeatureView = { character: LYRA, name: "Light", text: "Lyra Ashgrove casts Light." }

// Spells. Lyra is a level 1 Wizard: spell attack +5, spell save DC 13.
const SPELL_ASK: RollAsk = { kind: "attack", character: LYRA, check: "Fire Bolt", spell: "Fire Bolt", modifier: 5, dc: 13, target: "Owlbear", portrait: THALBERN }
const SPELL_HIT: RollView = { ...SPELL_ASK, natural: 12, total: 17, success: true, damage: [{ type: "fire", dice: [7], sides: 10, bonus: 0, total: 7 }] }
const SPELL_CRITICAL: RollView = { ...SPELL_ASK, natural: 20, total: 25, success: true, critical: true, damage: [{ type: "fire", dice: [9, 4], sides: 10, bonus: 0, total: 13 }] }
const SPELL_MISS: RollView = { ...SPELL_ASK, natural: 4, total: 9, success: false }
// Blessed: 9 + 5 + 3 Bless = 17 against Armor Class 15.
const SPELL_BLESSED: RollView = {
  ...SPELL_ASK,
  check: "Ray of Frost",
  spell: "Ray of Frost",
  target: "Reinhard Voss",
  dc: 15,
  natural: 9,
  adds: [{ from: "Bless", amount: 3 }],
  total: 17,
  success: true,
  damage: [{ type: "cold", dice: [5], sides: 8, bonus: 0, total: 5 }],
}
// A target's saves against Lyra's spells: Charm Person with Bane on Reinhard, 11 + 1 − 2 = 10 against DC 13, and
// Burning Hands saved for half of 7.
const SAVE_CHARM: RollView = {
  kind: "check",
  character: "Reinhard Voss",
  check: "Wisdom Saving Throw",
  spell: "Charm Person",
  natural: 11,
  modifier: 1,
  adds: [{ from: "Bane", amount: -2 }],
  total: 10,
  dc: 13,
  success: false,
  conditions: [{ target: "Reinhard Voss", condition: "Charmed" }],
}
const SAVE_BURNING: RollView = {
  kind: "check",
  character: "Owlbear",
  check: "Dexterity Saving Throw",
  spell: "Burning Hands",
  natural: 14,
  modifier: 1,
  total: 15,
  dc: 13,
  success: true,
  harm: [{ target: "Owlbear", kind: "damage", dice: [4, 3], sides: 6, bonus: 0, type: "fire", amount: 3 }],
}
// Lyra's Constitution Saving Throws to hold Bless after a hit, against 10.
const CONCENTRATION_KEPT: RollView = {
  kind: "check",
  character: LYRA,
  check: "Constitution Saving Throw",
  spell: "Bless",
  concentration: true,
  natural: 13,
  modifier: 0,
  total: 13,
  dc: 10,
  success: true,
}
const CONCENTRATION_LOST: RollView = { ...CONCENTRATION_KEPT, natural: 6, total: 6, success: false }

const ROLLS: [string, RollView][] = [
  ["Hit", HIT],
  ["Hit · Resistance · Advantage", HIT_RESISTED],
  ["Critical Hit", CRITICAL],
  ["Miss · Disadvantage", MISS],
  ["Save · Harm and Conditions", SAVE_HARM],
  ["Check · Bardic Inspiration", INSPIRED],
  ["Check · Healing", HEALED],
  ["Death Save · Success", DEATH_SAVED],
  ["Death Save · Natural 20", DEATH_20],
  ["Death Save · Natural 1", DEATH_1],
  ["Death Save · Exhaustion Modifier", DEATH_EXHAUSTED],
  ["1 · Spell Attack · Hit", SPELL_HIT],
  ["1 · Spell Attack · Critical Hit", SPELL_CRITICAL],
  ["1 · Spell Attack · Miss", SPELL_MISS],
  ["2 · Save Against a Spell · Charmed", SAVE_CHARM],
  ["2 · Save Against a Spell · Half Damage", SAVE_BURNING],
  ["3 · Spell Attack · Bless", SPELL_BLESSED],
  ["5 · Concentration · Kept", CONCENTRATION_KEPT],
  ["5 · Concentration · Lost", CONCENTRATION_LOST],
]

const JOURNAL: JournalTurn[] = [
  {
    number: 1,
    title: "The Owlbear",
    paragraphs: ["The owlbear crashes through the hedge.", { feature: SECOND_WIND }, { roll: HIT }, { roll: CRITICAL }, { roll: MISS }, { roll: SAVE_HARM }, { feature: BARDIC }, { roll: INSPIRED }],
  },
  { number: 2, title: "The Owlbear", paragraphs: [{ roll: DEATH_SAVED }, { roll: DEATH_20 }, { roll: DEATH_1 }, { roll: HIT_RESISTED }] },
  {
    number: 3,
    title: "The Warehouse",
    paragraphs: [
      { roll: SPELL_HIT },
      { roll: SPELL_BLESSED },
      { feature: BURNING_HANDS },
      { roll: SAVE_BURNING },
      { roll: SAVE_CHARM },
      { feature: MAGIC_MISSILE },
      { feature: HEALING_WORD },
      { feature: LIGHT },
      { roll: CONCENTRATION_KEPT },
      { roll: CONCENTRATION_LOST },
    ],
  },
]

const ORDER: OrderEntry[] = [
  { id: "thalbern", name: "Thalbern Ironfist", portrait: THALBERN, standing: { kind: "hero", hitPoints: 9, maximum: 13, armorClass: 16 }, conditions: "Prone, Dodging" },
  { id: "branka", name: "Branka Stoneveil", standing: { kind: "dying", successes: 1, failures: 2 }, conditions: "Unconscious" },
  { id: "yeva", name: "Yeva Softstep", standing: { kind: "stable" }, conditions: "Unconscious" },
  { id: "wrenna", name: "Wrenna Faelendar", standing: { kind: "hero", hitPoints: 4, maximum: 9, armorClass: 12 }, conditions: "Stunned" },
  { id: "owlbear", name: "Owlbear", npc: true, standing: { kind: "wound", word: "Bloodied" }, conditions: "Poisoned, Vexed" },
  { id: "wolf", name: "Dire Wolf", npc: true, standing: { kind: "wound", word: "Hurt" } },
  { id: "bandit", name: "Bandit", npc: true, standing: { kind: "wound", word: "Unhurt" } },
  { id: "thug", name: "Warehouse Thug", npc: true, standing: { kind: "dead" } },
]
// Lasting spells and Temporary Hit Points, in the words conditionLabel gives them.
const SPELLS_ORDER: OrderEntry[] = [
  {
    id: "lyra",
    name: LYRA,
    portrait: THALBERN,
    standing: { kind: "hero", hitPoints: 5, maximum: 6, armorClass: 13, temporary: 4 },
    conditions: conditionLabel({ spellEffects: [{ spell: "mage-armor" }, { spell: "bless" }], concentration: { spell: "bless" } }),
  },
  { id: "thalbern", name: "Thalbern Ironfist", standing: { kind: "hero", hitPoints: 13, maximum: 13, armorClass: 16 }, conditions: conditionLabel({ spellEffects: [{ spell: "bless" }] }) },
  {
    id: "reinhard",
    name: "Reinhard Voss",
    npc: true,
    standing: { kind: "wound", word: "Hurt" },
    conditions: conditionLabel({ conditions: [{ id: "charmed" }], spellEffects: [{ spell: "hunters-mark" }, { spell: "bane" }] }),
  },
]
const LYRA_CASTING = {
  saveDc: 13,
  attackBonus: 5,
  slots: [{ level: 1, total: 2, left: 1 }],
  cantrips: ["Mage Hand", "Light", "Ray of Frost"],
  prepared: ["Detect Magic", "Fog Cloud", "Charm Person", "Magic Missile"],
  rituals: ["Identify", "Comprehend Languages"],
}
// A level 3 Cleric, for slots of two levels.
const MILOS_CASTING = {
  saveDc: 13,
  attackBonus: 5,
  slots: [
    { level: 1, total: 4, left: 1 },
    { level: 2, total: 2, left: 2 },
  ],
  cantrips: ["Guidance", "Sacred Flame", "Thaumaturgy"],
  prepared: ["Bless", "Cure Wounds", "Healing Word", "Shield of Faith", "Aid", "Spiritual Weapon"],
  rituals: [],
}

const PARTY: CardCharacter[] = [
  { id: "thalbern", name: "Thalbern Ironfist", role: "Dwarf Fighter", portrait: THALBERN, standing: { kind: "hero", hitPoints: 9, maximum: 13, armorClass: 16 } },
  { id: "branka", name: "Branka Stoneveil", role: "Dwarf Cleric", standing: { kind: "dying", successes: 1, failures: 2 } },
  { id: "yeva", name: "Yeva Softstep", role: "Halfling Rogue", standing: { kind: "stable" } },
  { id: "lyra", name: LYRA, role: "Human Wizard", standing: { kind: "hero", hitPoints: 5, maximum: 6, armorClass: 13, temporary: 4 } },
]

function Box({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className={eyebrow}>{title}</h3>
      <div className={className}>{children}</div>
    </section>
  )
}

// The roll card from its ask to the engine's answer: the player throws, the verdict reads off the dice, and the
// engine's answer arrives two seconds later with what the roll did.
function CardFlow({ roll, answer, actor }: { roll: CardRoll; answer: (dice: number[]) => RollView; actor: CardCharacter }) {
  const [made, setMade] = useState<number[] | undefined>()
  const [result, setResult] = useState<RollView | undefined>()
  const [key, setKey] = useState(0)
  const mode: CardMode = { kind: "roll", roll, made, resolving: Boolean(made && !result), ...(result ? { result } : {}) }
  return (
    <div className="relative h-[380px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink">
      <Pill
        className="absolute top-3 left-3 z-40"
        onClick={() => {
          setMade(undefined)
          setResult(undefined)
          setKey((k) => k + 1)
        }}
      >
        Again
      </Pill>
      <PromptCard
        key={key}
        mode={mode}
        actor={actor}
        party={PARTY}
        onReply={() => {}}
        onPick={() => {}}
        onRoll={(dice) => {
          setMade(dice)
          setTimeout(() => setResult(answer(dice)), 2000)
        }}
        onContinue={result ? () => setKey((k) => k + 1) : undefined}
      />
    </div>
  )
}

// Reaction offers, from now: the player's hero with 20 seconds and with 5, and another player's hero. Again starts
// the clocks over.
function ReactionLooks({ compact }: { compact: boolean }) {
  const [start, setStart] = useState(() => Date.now())
  const [said, setSaid] = useState("")
  const text = "Reinhard Voss is leaving Lyra Ashgrove's reach. Lyra Ashgrove may strike with Dagger."
  const stage = "relative h-[300px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink"
  const placed = `absolute left-1/2 z-30 -translate-x-1/2 ${compact ? "bottom-[50px] w-[min(430px,calc(100%-24px))]" : "bottom-[118px] w-[min(520px,calc(100%-40px))]"}`
  const answer = (take: boolean) => setSaid(take ? "Take It" : "Let It Pass")
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Pill
          onClick={() => {
            setStart(Date.now())
            setSaid("")
          }}
        >
          Again
        </Pill>
        {said && <span className={eyebrow}>Answered · {said}</span>}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-6">
        <Box title="11 · Reaction · Yours, 20 Seconds" className={stage}>
          <ReactionCard
            key={`a${start}`}
            reaction="opportunity-attack"
            hero={LYRA}
            expiresAt={start + 20_000}
            text={text}
            mine
            compact={compact}
            className={placed}
            onTake={() => answer(true)}
            onPass={() => answer(false)}
          />
        </Box>
        <Box title="11 · Reaction · Yours, 5 Seconds" className={stage}>
          <ReactionCard
            key={`b${start}`}
            reaction="shield"
            hero={LYRA}
            portrait={THALBERN}
            expiresAt={start + 5000}
            text="Reinhard Voss's Scimitar hits Lyra Ashgrove: 14 against Armor Class 12. Shield would make it Armor Class 17."
            mine
            compact={compact}
            className={placed}
            onTake={() => answer(true)}
            onPass={() => answer(false)}
          />
        </Box>
        <Box title="11 · Reaction · Another Player's Hero" className={stage}>
          <ReactionCard key={`c${start}`} reaction="opportunity-attack" hero={LYRA} expiresAt={start + 20_000} text={text} mine={false} compact={compact} className={placed} />
        </Box>
        <Box title="11 · Reaction · Phone Width" className="relative h-[300px] w-[360px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink">
          <ReactionCard
            key={`d${start}`}
            reaction="opportunity-attack"
            hero={LYRA}
            expiresAt={start + 20_000}
            text={text}
            mine
            compact={compact}
            className="absolute bottom-[50px] left-1/2 z-30 w-[min(430px,calc(100%-24px))] -translate-x-1/2"
            onTake={() => answer(true)}
            onPass={() => answer(false)}
          />
        </Box>
        <Box title="11 · Standing Orders · Fighter, Defaults" className={`${panel} px-5 py-4`}>
          <StandingOrders rows={heroReactions([], undefined)} compact={compact} onChange={(changed) => setSaid(JSON.stringify(changed))} />
        </Box>
        <Box title="11 · Standing Orders · Wizard with Shield, Set" className={`${panel} px-5 py-4`}>
          <StandingOrders rows={heroReactions([...LYRA_CASTING.prepared, "Shield"], { "opportunity-attack": "never" })} compact={compact} onChange={(changed) => setSaid(JSON.stringify(changed))} />
        </Box>
        <Box title="11 · Card · Lyra, Standing Orders" className="relative h-[720px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink">
          <CharacterCard
            info={{
              id: "lyra",
              name: LYRA,
              role: "Human Wizard",
              standing: SPELLS_ORDER[0].standing,
              spellcasting: { ...LYRA_CASTING, prepared: [...LYRA_CASTING.prepared, "Shield"] },
              reactions: heroReactions([...LYRA_CASTING.prepared, "Shield"], { shield: "always" }),
            }}
            compact={compact}
            onClose={() => {}}
            onOrders={(changed) => setSaid(JSON.stringify(changed))}
          />
        </Box>
      </div>
    </div>
  )
}

export function RollLooks() {
  const [take, setTake] = useState(0)
  const [compact, setCompact] = useState(false)
  const [paragraph, setParagraph] = useState(0)
  const story: { text: string; roll?: RollView; feature?: FeatureView }[] = [
    { text: "The owlbear crashes through the hedge." },
    { text: SECOND_WIND.text, feature: SECOND_WIND },
    ...ROLLS.map(([, roll]) => ({ text: roll.check, roll })),
    ...[MAGIC_MISSILE, HEALING_WORD, BURNING_HANDS, LIGHT].map((feature) => ({ text: feature.text, feature })),
  ]
  const actor = PARTY[0]
  return (
    <div className="mt-12 flex flex-col gap-10">
      <div className="flex items-end justify-between gap-6">
        <div>
          <div className={eyebrow}>Stageview · rules combat</div>
          <h2 className="mt-1.5 font-display text-[26px]">Rolls and Characters</h2>
        </div>
        <div className="flex gap-2">
          <Pill active={compact} onClick={() => setCompact((c) => !c)}>
            Compact
          </Pill>
          <Pill active className="px-6" onClick={() => setTake((t) => t + 1)}>
            Roll All Again
          </Pill>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-6">
        {ROLLS.map(([title, roll]) => (
          <Box key={title} title={title} className={`${panel} ${compact ? "px-3 py-2" : "px-5 py-4"}`}>
            <RollResult key={take} roll={roll} compact={compact} />
          </Box>
        ))}
        <Box title="Attack · Ask" className={`${panel} px-5 py-4`}>
          <RollResult roll={ATTACK_ASK} compact={compact} onRoll={() => {}} />
        </Box>
        <Box title="Death Save · Ask" className={`${panel} px-5 py-4`}>
          <RollResult roll={DEATH_ASK} compact={compact} onRoll={() => {}} />
        </Box>
        <Box title="Feature · Second Wind" className={`${panel} px-5 py-4`}>
          <FeatureEntry feature={SECOND_WIND} compact={compact} />
        </Box>
        <Box title="Feature · Bardic Inspiration" className={`${panel} px-5 py-4`}>
          <FeatureEntry feature={BARDIC} compact={compact} />
        </Box>
        <Box title="1 · Spell Attack · Ask" className={`${panel} px-5 py-4`}>
          <RollResult roll={SPELL_ASK} compact={compact} onRoll={() => {}} />
        </Box>
        {(
          [
            ["4 · Spell · Magic Missile", MAGIC_MISSILE],
            ["4 · Spell · Healing Word", HEALING_WORD],
            ["4 · Spell · Burning Hands, Before the Saves", BURNING_HANDS],
            ["4 · Spell · Light, No Target or Dice", LIGHT],
          ] as const
        ).map(([title, feature]) => (
          <Box key={title} title={title} className={`${panel} px-5 py-4`}>
            <FeatureEntry feature={feature} compact={compact} />
          </Box>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(560px,1fr))] gap-6">
        <Box title="Card · Attack, Answered with Damage">
          <CardFlow actor={actor} roll={{ kind: "attack", skill: "Longsword", dc: 13, modifier: 5, target: "Owlbear" }} answer={(dice) => ({ ...ATTACK_ASK, ...hitOrMiss(dice[0]) })} />
        </Box>
        <Box title="Card · Death Saving Throw">
          <CardFlow
            actor={actor}
            roll={{ kind: "death", skill: "Death Saving Throw", dc: 10, modifier: 0, deathSaves: { successes: 1, failures: 1 } }}
            answer={(dice) => ({
              ...DEATH_ASK,
              natural: dice[0],
              total: dice[0],
              success: dice[0] >= 10,
              ...(dice[0] === 20
                ? { deathSaves: undefined, fate: "revived" as const }
                : { deathSaves: dice[0] >= 10 ? { successes: 2, failures: 1 } : { successes: 1, failures: dice[0] === 1 ? 3 : 2 }, ...(dice[0] === 1 ? { fate: "dead" as const } : {}) }),
            })}
          />
        </Box>
        <Box title="Card · Attack with Disadvantage">
          <CardFlow
            actor={actor}
            roll={{ kind: "attack", skill: "Longsword", dc: 15, modifier: 5, target: "Owlbear", mode: "disadvantage", reasons: ["Poisoned"] }}
            answer={(dice) => ({ ...ATTACK_ASK, dc: 15, mode: "disadvantage", dice, reasons: ["Poisoned"], ...hitOrMiss(Math.min(...dice), 15) })}
          />
        </Box>
        <Box title="1 · Card · Spell Attack, Answered with Damage">
          <CardFlow
            actor={PARTY[3]}
            roll={{ kind: "attack", skill: "Fire Bolt", spell: "Fire Bolt", dc: 13, modifier: 5, target: "Owlbear" }}
            answer={(dice) => ({
              ...SPELL_ASK,
              ...hitOrMiss(dice[0]),
              ...(dice[0] === 20
                ? { damage: [{ type: "fire", dice: [8, 3], sides: 10, bonus: 0, total: 11 }] }
                : dice[0] + 5 >= 13 && dice[0] !== 1
                  ? { damage: [{ type: "fire", dice: [6], sides: 10, bonus: 0, total: 6 }] }
                  : {}),
            })}
          />
        </Box>
        <Box title="7 · Card · Party Row, Temporary Hit Points" className="relative h-[380px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink">
          <PromptCard mode={{ kind: "hold", prompt: "What does Lyra do?" }} actor={PARTY[3]} party={PARTY} compact={compact} onReply={() => {}} onRoll={() => {}} onPick={() => {}} />
        </Box>
        <Box title="Narration">
          <div className="relative w-[460px]">
            <Narration
              heading="Round 2 · The Owlbear"
              text={story[paragraph].text}
              roll={story[paragraph].roll}
              feature={story[paragraph].feature}
              index={paragraph}
              count={story.length}
              compact={compact}
              step
              onReplay={() => setParagraph(0)}
              onBack={() => setParagraph((n) => Math.max(0, n - 1))}
              onNext={() => setParagraph((n) => Math.min(story.length - 1, n + 1))}
              onSkip={() => setParagraph(story.length - 1)}
              onContinue={() => setParagraph((n) => (n + 1) % story.length)}
            />
          </div>
        </Box>
      </div>

      <Box title="Turn Order · Wrenna Stunned and Passed Over" className="relative h-[230px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink">
        <TurnOrder order={ORDER} activeId="owlbear" turnId="owlbear" label="Owlbear" passed="Wrenna Faelendar, Stunned" compact={compact} onPick={() => {}} />
      </Box>
      <Box title="7 · Turn Order · Lasting Spells and Temporary Hit Points" className="relative h-[230px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink">
        <TurnOrder order={SPELLS_ORDER} activeId="lyra" turnId="lyra" label={LYRA} compact={compact} onPick={() => {}} />
      </Box>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(420px,1fr))] gap-6">
        <Box title="Journal" className="relative h-[760px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink">
          <Journal turns={JOURNAL} chat={[]} compact={compact} onClose={() => {}} />
        </Box>
        {[
          { id: "thalbern", name: "Thalbern Ironfist", role: "Dwarf Fighter", portrait: THALBERN, at: 0 },
          { id: "branka", name: "Branka Stoneveil", role: "Dwarf Cleric", at: 1 },
          { id: "owlbear", name: "Owlbear", role: "Monstrosity", at: 4 },
          { id: "thug", name: "Warehouse Thug", role: "Human Thug", at: 7 },
        ].map(({ at, ...info }) => (
          <Box key={info.id} title={`Card · ${info.name}`} className="relative h-[520px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink">
            <CharacterCard info={{ ...info, standing: ORDER[at].standing, conditions: ORDER[at].conditions }} compact={compact} onClose={() => {}} />
          </Box>
        ))}
        <Box title="6 and 7 · Card · Lyra, Wizard 1" className="relative h-[720px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink">
          <CharacterCard
            info={{ id: "lyra", name: LYRA, role: "Human Wizard", standing: SPELLS_ORDER[0].standing, conditions: SPELLS_ORDER[0].conditions, spellcasting: LYRA_CASTING }}
            compact={compact}
            onClose={() => {}}
          />
        </Box>
        <Box title="6 · Card · Milos, Cleric 3" className="relative h-[720px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink">
          <CharacterCard
            info={{ id: "milos", name: "Milos Radan", role: "Human Cleric", standing: { kind: "hero", hitPoints: 21, maximum: 24, armorClass: 18 }, spellcasting: MILOS_CASTING }}
            compact={compact}
            onClose={() => {}}
          />
        </Box>
        <Box title="7 · Card · Reinhard, NPC" className="relative h-[520px] overflow-hidden rounded-md border border-stage-line/15 bg-stage-ink">
          <CharacterCard
            info={{ id: "reinhard", name: "Reinhard Voss", role: "Human Mage", standing: SPELLS_ORDER[2].standing, conditions: SPELLS_ORDER[2].conditions }}
            compact={compact}
            onClose={() => {}}
          />
        </Box>
      </div>

      <ReactionLooks compact={compact} />
    </div>
  )
}

// A mock engine's answer to an attack: a 20 is a Critical Hit with doubled dice, a 1 or less than the Armor Class a Miss.
function hitOrMiss(natural: number, ac = 13): Pick<RollView, "natural" | "total" | "success" | "critical" | "damage"> {
  const total = natural + 5
  if (natural === 20) return { natural, total, success: true, critical: true, damage: [{ type: "Slashing", dice: [6, 4], sides: 8, bonus: 3, total: 13 }] }
  if (natural === 1 || total < ac) return { natural, total, success: false }
  return { natural, total, success: true, damage: [{ type: "Slashing", dice: [5], sides: 8, bonus: 3, total: 8 }] }
}
