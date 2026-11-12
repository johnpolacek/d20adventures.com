"use client"

// Every look a roll and a character can have on the stage, from mock data, to check by eye: the attack on the card
// before and after the engine answers it, Hit, Miss and Critical Hit with their damage, a save that hurts and gives a
// condition, a Bardic Inspiration die, the Death Saving Throw, a class feature used, and how heroes and NPCs stand.

import { type ReactNode, useState } from "react"
import { CharacterCard } from "@/components/stage/character-card"
import { eyebrow, Pill, panel } from "@/components/stage/hud"
import { Journal, type JournalTurn } from "@/components/stage/journal"
import { Narration } from "@/components/stage/narration"
import { type CardCharacter, type CardMode, type CardRoll, PromptCard } from "@/components/stage/prompt-card"
import { FeatureEntry } from "@/components/stage/roll-parts"
import { RollResult } from "@/components/stage/roll-result"
import type { FeatureView, RollAsk, RollView } from "@/components/stage/roll-view"
import { type OrderEntry, TurnOrder } from "@/components/stage/turn-order"

const THALBERN = "/images/app/characters/default.png"

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
]

const JOURNAL: JournalTurn[] = [
  {
    number: 1,
    title: "The Owlbear",
    paragraphs: ["The owlbear crashes through the hedge.", { feature: SECOND_WIND }, { roll: HIT }, { roll: CRITICAL }, { roll: MISS }, { roll: SAVE_HARM }, { feature: BARDIC }, { roll: INSPIRED }],
  },
  { number: 2, title: "The Owlbear", paragraphs: [{ roll: DEATH_SAVED }, { roll: DEATH_20 }, { roll: DEATH_1 }, { roll: HIT_RESISTED }] },
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

const PARTY: CardCharacter[] = [
  { id: "thalbern", name: "Thalbern Ironfist", role: "Dwarf Fighter", portrait: THALBERN, standing: { kind: "hero", hitPoints: 9, maximum: 13, armorClass: 16 } },
  { id: "branka", name: "Branka Stoneveil", role: "Dwarf Cleric", standing: { kind: "dying", successes: 1, failures: 2 } },
  { id: "yeva", name: "Yeva Softstep", role: "Halfling Rogue", standing: { kind: "stable" } },
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

export function RollLooks() {
  const [take, setTake] = useState(0)
  const [compact, setCompact] = useState(false)
  const [paragraph, setParagraph] = useState(0)
  const story: { text: string; roll?: RollView; feature?: FeatureView }[] = [
    { text: "The owlbear crashes through the hedge." },
    { text: SECOND_WIND.text, feature: SECOND_WIND },
    ...ROLLS.map(([, roll]) => ({ text: roll.check, roll })),
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
      </div>
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
