import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { GmPorts } from "@d20/gm-core"
import { createRollRequirementService } from "@d20/gm-core/services/roll-requirement-service"
import { DIFFICULTY_CLASSES } from "@d20/gm-core/sheet/check"
import type { ConditionEntry } from "@d20/gm-core/sheet/condition-entry"
import type { Stake } from "@d20/gm-core/sheet/stakes"
import { authoredText } from "@d20/gm-core/story/authored"
import { storyNames } from "@d20/gm-core/story/render"
import type { Character } from "@d20/gm-core/types/character"
import { isAttackRoll } from "@d20/gm-core/validations/roll-requirement-schema"
import { localLlm } from "../runtime/llm"
import { loadPack } from "./scene-judge"

// Shows that the game master picks sensible checks. Each scene in check-probes.json is one action by a premade hero in
// a real encounter, with the picks that are right for it written beside it: the check off the menu, the target from
// the ladder, and Advantage or Disadvantage. The model is asked once per scene and its pick is graded by those rules,
// with no second model. In process, on the current prompt and content.
// pnpm --dir apps/desktop check:probe [--only id] [--out file.json]

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
  spell?: string
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
}
// A stake as a scene writes it: damage or healing, or a condition given ("condition") or ended ("end-condition").
type Wanted = { on: string; target: string; kind: string; condition?: string }
type Graded = { id: string; pass: boolean; faults: string[]; got: unknown; bonus?: string }

const here = fileURLToPath(new URL(".", import.meta.url))
const argv = process.argv.slice(2)
const opt = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const all: Probe[] = JSON.parse(readFileSync(join(here, "check-probes.json"), "utf8"))
const probes = opt("--only") ? all.filter((probe) => probe.id === opt("--only")) : all

// A stake the engine made of a pick, in a scene's words.
const staked = (stake: Stake) => `${stake.kind === "condition" ? `${stake.ends ? "end " : ""}${stake.condition}` : stake.kind} to ${stake.target} on ${stake.on}`

// A pick's menu id, from the check the engine made of it.
const menuId = (check: { kind: string; skill?: string; ability?: string }) => {
  const ability = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" }[check.ability ?? ""]
  return check.kind === "skill" ? check.skill : check.kind === "save" ? `${ability}-save` : ability
}

async function run(probe: Probe): Promise<Graded> {
  const pack = loadPack(probe.adventure)
  const bears = <T extends { id: string }>(character: T): T => (probe.conditionsOn?.[character.id] ? { ...character, conditions: probe.conditionsOn[character.id] } : character)
  const hero: Character = bears({ ...JSON.parse(readFileSync(join(here, `../../../content/settings/realm-of-myr/adventures/${probe.adventure}/characters/${probe.hero}.json`), "utf8")), type: "pc" })
  const encounter = pack.artifacts.encounters[probe.encounter]
  if (!encounter) throw new Error(`${probe.id}: no encounter ${probe.encounter}`)
  const model = localLlm("claude", mkdtempSync(join(tmpdir(), "check-probe-")))
  try {
    const { readAction } = createRollRequirementService({ llm: model.llm } as GmPorts)
    const reading = await readAction(probe.action, hero, {
      encounterIntro: authoredText(encounter.sections.intro ?? "", storyNames([hero])),
      encounterInstructions: encounter.sections.gmNotes ?? "",
      narrativeContext: probe.narrative ?? "",
      // The hero and the encounter's NPCs, so an attack has someone to land on.
      present: [
        hero,
        ...(probe.allies ?? []).map((ally) => ({
          ...JSON.parse(readFileSync(join(here, `../../../content/settings/realm-of-myr/adventures/${probe.adventure}/characters/${ally}.json`), "utf8")),
          type: "pc" as const,
        })),
        ...encounter.npcRefs.map((ref) => bears({ ...pack.artifacts.characterSheets.npcs[ref.id].sheet, type: "npc" as const })),
      ],
    })
    const got = reading.roll
    const faults: string[] = []
    // Hide is a roll the engine sets, named for the action. An action with no roll is read by its own name.
    const picked = !got ? (reading.action?.action ?? "none") : isAttackRoll(got) ? "attack" : got.rollType.startsWith("Hide") ? "hide" : (menuId(got.check) ?? "?")
    const said = (bonus?: { feature: string; target?: string }) => (bonus ? `${bonus.feature}${bonus.target ? ` for ${bonus.target}` : ""}` : "none")
    if (said(reading.bonus) !== said(probe.bonus)) faults.push(`bonus action ${said(reading.bonus)}, wanted ${said(probe.bonus)}`)
    if (probe.takes && reading.action?.action === "help") {
      if (probe.takes.target && reading.action.target !== probe.takes.target) faults.push(`help for ${reading.action.target}, wanted ${probe.takes.target}`)
      if (probe.takes.skills && !probe.takes.skills.includes(reading.action.skill ?? "none")) faults.push(`help with ${reading.action.skill ?? "no skill"}, wanted ${probe.takes.skills.join(" or ")}`)
    }
    if (!probe.checks.includes(picked)) faults.push(`check ${picked}, wanted ${probe.checks.join(" or ")}`)
    if (got && probe.mode && got.mode !== probe.mode) faults.push(`${got.mode}, wanted ${probe.mode}`)
    if (got && isAttackRoll(got)) {
      // An attack is graded on the weapon and on who it lands on. Its target number is the Armor Class, not a pick.
      if (probe.attack && got.attack.weapon !== probe.attack.weapon) faults.push(`weapon ${got.attack.weapon}, wanted ${probe.attack.weapon}`)
      if (probe.attack && got.attack.target !== probe.attack.target) faults.push(`target ${got.attack.target}, wanted ${probe.attack.target}`)
    } else if (got) {
      if (!Object.values(DIFFICULTY_CLASSES).includes(got.difficulty as 5)) faults.push(`target ${got.difficulty} is off the ladder`)
      if (probe.dcs && !probe.dcs.includes(got.difficulty)) faults.push(`target ${got.difficulty}, wanted ${probe.dcs.join(" or ")}`)
      if ((probe.spell ?? undefined) !== got.spell) faults.push(`spell ${got.spell ?? "none"}, wanted ${probe.spell ?? "none"}`)
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
    return { id: probe.id, pass: faults.length === 0, faults, got: got ?? reading.action ?? null, bonus: said(reading.bonus) }
  } catch (error) {
    return { id: probe.id, pass: false, faults: [String(error)], got: null }
  } finally {
    model.close()
  }
}

const log = console.log
// The core logs every prompt and pick. Only the grades are wanted here.
console.log = () => {}
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
  } | null
  const pick = got?.action
    ? `${got.action}${got.target ? ` for ${got.target}` : ""}${got.skill ? ` with ${got.skill}` : ""}, no roll`
    : got
      ? `${got.rollType} ${got.attack ? `on ${got.attack.target}, AC` : "DC"} ${got.difficulty}, bonus ${got.modifier}${got.mode === "normal" ? "" : `, ${got.mode} (${got.reasons?.join(", ") ?? "no reason"})`}${got.stakes?.length ? `, stakes: ${got.stakes.map((stake) => `${"dice" in stake ? `${stake.dice} ` : ""}${staked(stake)}`).join("; ")}` : ""}`
      : "no roll"
  log(`${g.pass ? "pass" : "FAIL"}  ${g.id.padEnd(18)} ${pick}${g.bonus && g.bonus !== "none" ? `, bonus action: ${g.bonus}` : ""}${g.faults.length ? `\n      ${g.faults.join("; ")}` : ""}`)
}
log(`\n${graded.filter((g) => g.pass).length} of ${graded.length} pass`)
if (opt("--out")) writeFileSync(resolve(opt("--out")!), JSON.stringify(graded, null, 2))
process.exit(graded.every((g) => g.pass) ? 0 : 1)
