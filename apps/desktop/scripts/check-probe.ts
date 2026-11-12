import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { GmPorts } from "@d20/gm-core"
import { createRollRequirementService } from "@d20/gm-core/services/roll-requirement-service"
import { DIFFICULTY_CLASSES } from "@d20/gm-core/sheet/check"
import type { ConditionEntry } from "@d20/gm-core/sheet/condition-entry"
import { placeCharacters } from "@d20/gm-core/sheet/placement"
import type { Stake } from "@d20/gm-core/sheet/stakes"
import { authoredText } from "@d20/gm-core/story/authored"
import { storyNames } from "@d20/gm-core/story/render"
import type { Character } from "@d20/gm-core/types/character"
import { isAttackRoll, isCastRoll } from "@d20/gm-core/validations/roll-requirement-schema"
import { encounterFloor } from "../runtime/floor"
import { localLlm } from "../runtime/llm"
import { loadPack } from "./scene-judge"

// Shows that the game master picks sensible checks. Each scene in check-probes.json is one action by a premade hero in
// a real encounter, with the picks that are right for it written beside it: the check off the menu, the target from
// the ladder, and Advantage or Disadvantage. The model is asked once per scene and its pick is graded by those rules,
// with no second model. In process, on the current prompt and content.
// pnpm --dir apps/desktop check:probe [--only id,id] [--out file.json]

type Probe = {
  id: string
  adventure: string
  encounter: string
  hero: string
  narrative?: string
  action: string
  checks: string[]
  dcs?: number[]
  mode?: string
  // A spell cast: its SRD id, everyone it is cast on, and whether as a Ritual.
  // `ritual: "either"` is for a Ritual spell cast with time to spare and no word of how: slowly or with a slot are both right.
  cast?: { spell: string; targets?: string[]; ritual?: boolean | "either" }
  // Spell slots a character has already used, by character id.
  slotsUsed?: Record<string, number[]>
  attack?: { weapon: string; target: string }
  // Other premade heroes in the scene, by file id.
  allies?: string[]
  // Everything the roll should put at stake, for hit points and for conditions: none for most.
  stakes?: Wanted[]
  // Stakes the roll must put, whatever else it puts with them.
  gives?: Wanted[]
  // An action that takes no roll, as it should be read: who Help is for, and with which skill.
  takes?: { target?: string; skills?: string[] }
  // The Bonus Action the hero also uses, and who it is given to. None for most.
  bonus?: { feature: string; target?: string }
  // Conditions someone in the scene already bears, by character id.
  conditionsOn?: Record<string, ConditionEntry[]>
  // Space: everyone stands where the encounter's floor stages them, and `at` moves some of them, in feet.
  floor?: true
  at?: Record<string, [number, number]>
  // Where the move should leave the hero: nowhere new, within 5 feet of someone, at least so far from someone, or
  // having walked between so many feet.
  moved?: { none?: true; near?: string; clearOf?: string; feet?: [number, number] }
  // What the rules of space should say of the move, by name: "Out Of Range". None for most.
  ruling?: string
  // Reasons the roll's Advantage or Disadvantage must name, such as "Long Range".
  reasons?: string[]
}
// A stake as a scene writes it: damage or healing, or a condition given ("condition") or ended ("end-condition").
type Wanted = { on: string; target: string; kind: string; condition?: string }
type Graded = { id: string; pass: boolean; faults: string[]; got: unknown; bonus?: string; space?: string }

const here = fileURLToPath(new URL(".", import.meta.url))
const argv = process.argv.slice(2)
const opt = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const all: Probe[] = JSON.parse(readFileSync(join(here, "check-probes.json"), "utf8"))
const only = opt("--only")?.split(",")
const probes = only ? all.filter((probe) => only.includes(probe.id)) : all

// A stake the engine made of a pick, in a scene's words.
const staked = (stake: Stake) => `${stake.kind === "condition" ? `${stake.ends ? "end " : ""}${stake.condition}` : stake.kind} to ${stake.target} on ${stake.on}`

// A pick's menu id, from the check the engine made of it.
const menuId = (check: { kind: string; skill?: string; ability?: string }) => {
  const ability = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" }[check.ability ?? ""]
  return check.kind === "skill" ? check.skill : check.kind === "save" ? `${ability}-save` : ability
}

async function run(probe: Probe): Promise<Graded> {
  const pack = loadPack(probe.adventure)
  const bears = <T extends { id: string }>(character: T): T => ({
    ...character,
    ...(probe.conditionsOn?.[character.id] ? { conditions: probe.conditionsOn[character.id] } : {}),
    ...(probe.slotsUsed?.[character.id] ? { spellSlots: probe.slotsUsed[character.id] } : {}),
  })
  const hero: Character = bears({ ...JSON.parse(readFileSync(join(here, `../../../content/settings/realm-of-myr/adventures/${probe.adventure}/characters/${probe.hero}.json`), "utf8")), type: "pc" })
  const encounter = pack.artifacts.encounters[probe.encounter]
  if (!encounter) throw new Error(`${probe.id}: no encounter ${probe.encounter}`)
  const model = localLlm("claude", mkdtempSync(join(tmpdir(), "check-probe-")))
  try {
    const { readAction } = createRollRequirementService({ llm: model.llm } as GmPorts)
    // On a floor everyone stands where the encounter stages them, unless the scene says where.
    const floor = probe.floor ? await encounterFloor(probe.encounter) : undefined
    if (probe.floor && !floor) throw new Error(`${probe.id}: ${probe.encounter} has no floor plan`)
    const stand = <T extends { id: string; name: string }>(characters: T[]): T[] =>
      (floor ? placeCharacters(characters, floor) : characters).map((character) =>
        probe.at?.[character.id] ? { ...character, position: { x: probe.at[character.id][0], y: probe.at[character.id][1] } } : character
      )
    const everyone = stand([
      hero,
      ...(probe.allies ?? []).map((ally) => ({
        ...JSON.parse(readFileSync(join(here, `../../../content/settings/realm-of-myr/adventures/${probe.adventure}/characters/${ally}.json`), "utf8")),
        type: "pc" as const,
      })),
      ...encounter.npcRefs.map((ref) => bears({ ...pack.artifacts.characterSheets.npcs[ref.id].sheet, type: "npc" as const })),
    ])
    const [standing] = everyone
    const reading = await readAction(probe.action, standing, {
      floor,
      encounterIntro: authoredText(encounter.sections.intro ?? "", storyNames([hero])),
      encounterInstructions: encounter.sections.gmNotes ?? "",
      narrativeContext: probe.narrative ?? "",
      // The hero and the encounter's NPCs, so an attack has someone to land on.
      present: everyone,
    })
    // A spell with a spell attack is a roll to throw. Any other cast is read with no roll.
    const got = reading.roll
    const cast = got && isCastRoll(got) ? got.cast : reading.cast?.cast
    const faults: string[] = []
    // Hide is a roll the engine sets, named for the action. An action with no roll is read by its own name.
    const picked = cast
      ? "cast"
      : !got
        ? (reading.action?.action ?? "none")
        : isAttackRoll(got)
          ? "attack"
          : !("check" in got)
            ? "?"
            : got.rollType.startsWith("Hide")
              ? "hide"
              : (menuId(got.check) ?? "?")
    if (cast || probe.cast) {
      const told = (c?: { spell: string; targets?: string[]; ritual?: boolean }) =>
        c ? `${c.spell}${c.ritual ? " as a ritual" : ""} on ${[...(c.targets ?? [])].sort().join(" and ") || "no one"}` : "nothing"
      const wanted = probe.cast?.ritual === "either" ? { ...probe.cast, ritual: cast?.ritual } : (probe.cast as { spell: string; targets?: string[]; ritual?: boolean } | undefined)
      if (told(cast) !== told(wanted)) faults.push(`cast ${told(cast)}, wanted ${told(wanted)}`)
    }
    const said = (bonus?: { feature: string; target?: string }) => (bonus ? `${bonus.feature}${bonus.target ? ` for ${bonus.target}` : ""}` : "none")
    if (said(reading.bonus) !== said(probe.bonus)) faults.push(`bonus action ${said(reading.bonus)}, wanted ${said(probe.bonus)}`)
    if (probe.takes && reading.action?.action === "help") {
      if (probe.takes.target && reading.action.target !== probe.takes.target) faults.push(`help for ${reading.action.target}, wanted ${probe.takes.target}`)
      if (probe.takes.skills && !probe.takes.skills.includes(reading.action.skill ?? "none")) faults.push(`help with ${reading.action.skill ?? "no skill"}, wanted ${probe.takes.skills.join(" or ")}`)
    }
    if (!probe.checks.includes(picked)) faults.push(`check ${picked}, wanted ${probe.checks.join(" or ")}`)
    // Space: where the move left the hero, and what the rules of space said of it.
    if (probe.floor) {
      const ended = reading.move?.at ?? standing.position
      const feetTo = (id: string) => {
        const other = everyone.find((character) => character.id === id)?.position
        return other && ended ? Math.round(Math.hypot(other.x - ended.x, other.y - ended.y)) : undefined
      }
      const walked = reading.move?.feet ?? 0
      if (probe.moved?.none && walked) faults.push(`moved ${walked} feet, wanted no move`)
      if (probe.moved?.near && !((feetTo(probe.moved.near) ?? 999) <= 8)) faults.push(`ended ${feetTo(probe.moved.near)} feet from ${probe.moved.near}, wanted beside them`)
      if (probe.moved?.clearOf && !((feetTo(probe.moved.clearOf) ?? 0) >= 10)) faults.push(`ended ${feetTo(probe.moved.clearOf)} feet from ${probe.moved.clearOf}, wanted clear of them`)
      if (probe.moved?.feet && (walked < probe.moved.feet[0] || walked > probe.moved.feet[1])) faults.push(`moved ${walked} feet, wanted ${probe.moved.feet[0]} to ${probe.moved.feet[1]}`)
      if ((reading.ruling?.name ?? "none") !== (probe.ruling ?? "none")) faults.push(`ruling ${reading.ruling?.name ?? "none"}, wanted ${probe.ruling ?? "none"}`)
      for (const reason of probe.reasons ?? []) if (!got?.reasons?.includes(reason)) faults.push(`reasons ${got?.reasons?.join(", ") || "none"}, wanted ${reason} among them`)
    }
    if (got && probe.mode && got.mode !== probe.mode) faults.push(`${got.mode}, wanted ${probe.mode}`)
    if (got && isAttackRoll(got)) {
      // An attack is graded on the weapon and on who it lands on. Its target number is the Armor Class, not a pick.
      if (probe.attack && got.attack.weapon !== probe.attack.weapon) faults.push(`weapon ${got.attack.weapon}, wanted ${probe.attack.weapon}`)
      if (probe.attack && got.attack.target !== probe.attack.target) faults.push(`target ${got.attack.target}, wanted ${probe.attack.target}`)
    } else if (got && "check" in got) {
      if (!Object.values(DIFFICULTY_CLASSES).includes(got.difficulty as 5)) faults.push(`target ${got.difficulty} is off the ladder`)
      if (probe.dcs && !probe.dcs.includes(got.difficulty)) faults.push(`target ${got.difficulty}, wanted ${probe.dcs.join(" or ")}`)
      // What the roll puts at stake: who, on which outcome, hurt or healed or given or freed of a condition. The dice
      // are the ladder's or the notes'.
      const wants = (stake: Wanted) => `${stake.condition ? `${stake.kind === "end-condition" ? "end " : ""}${stake.condition}` : stake.kind} to ${stake.target} on ${stake.on}`
      const picked = (got.stakes ?? []).map(staked)
      if (probe.stakes) {
        const wanted = probe.stakes.map(wants).sort().join(", ") || "none"
        if ((picked.slice().sort().join(", ") || "none") !== wanted) faults.push(`stakes ${picked.join(", ") || "none"}, wanted ${wanted}`)
      }
      for (const stake of probe.gives ?? []) if (!picked.includes(wants(stake))) faults.push(`stakes ${picked.join(", ") || "none"}, wanted ${wants(stake)} among them`)
    }
    return {
      id: probe.id,
      pass: faults.length === 0,
      faults,
      got: got ?? (cast ? { cast } : null) ?? reading.action ?? null,
      bonus: said(reading.bonus),
      space: probe.floor ? `${reading.move ? `moved ${reading.move.feet} feet` : "no move"}${reading.ruling ? `, ${reading.ruling.name}` : ""}` : undefined,
    }
  } catch (error) {
    return { id: probe.id, pass: false, faults: [String(error)], got: null }
  } finally {
    model.close()
  }
}

const log = console.log
// The core logs every prompt and pick. Only the grades are wanted here, unless PROBE_LOG is set.
if (!process.env.PROBE_LOG) console.log = () => {}
const graded: Graded[] = []
const queue = [...probes]
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let probe = queue.shift(); probe; probe = queue.shift()) graded.push(await run(probe))
  })
)
graded.sort((a, b) => all.findIndex((p) => p.id === a.id) - all.findIndex((p) => p.id === b.id))
for (const g of graded) {
  const got = g.got as {
    rollType: string
    difficulty: number
    modifier: number
    mode: string
    reasons?: string[]
    attack?: { target: string }
    stakes?: Stake[]
    action?: string
    target?: string
    skill?: string
    cast?: { spell: string; targets: string[]; ritual?: boolean }
  } | null
  const pick = got?.cast
    ? `cast ${got.cast.spell}${got.cast.ritual ? " as a ritual" : ""} on ${got.cast.targets.join(", ") || "no one"}${got.rollType ? `, spell attack against AC ${got.difficulty}, bonus ${got.modifier}${got.mode === "normal" ? "" : `, ${got.mode} (${got.reasons?.join(", ") ?? "no reason"})`}` : ", no roll"}`
    : got?.action
      ? `${got.action}${got.target ? ` for ${got.target}` : ""}${got.skill ? ` with ${got.skill}` : ""}, no roll`
      : got
        ? `${got.rollType} ${got.attack ? `on ${got.attack.target}, AC` : "DC"} ${got.difficulty}, bonus ${got.modifier}${got.mode === "normal" ? "" : `, ${got.mode} (${got.reasons?.join(", ") ?? "no reason"})`}${got.stakes?.length ? `, stakes: ${got.stakes.map((stake) => `${"dice" in stake ? `${stake.dice} ` : ""}${staked(stake)}`).join("; ")}` : ""}`
        : "no roll"
  log(
    `${g.pass ? "pass" : "FAIL"}  ${g.id.padEnd(18)} ${pick}${g.bonus && g.bonus !== "none" ? `, bonus action: ${g.bonus}` : ""}${g.space ? `, ${g.space}` : ""}${g.faults.length ? `\n      ${g.faults.join("; ")}` : ""}`
  )
}
log(`\n${graded.filter((g) => g.pass).length} of ${graded.length} pass`)
if (opt("--out")) writeFileSync(resolve(opt("--out")!), JSON.stringify(graded, null, 2))
process.exit(graded.every((g) => g.pass) ? 0 : 1)
