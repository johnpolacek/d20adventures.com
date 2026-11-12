import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { GmPorts } from "@d20/gm-core"
import { createRollRequirementService } from "@d20/gm-core/services/roll-requirement-service"
import { DIFFICULTY_CLASSES } from "@d20/gm-core/sheet/check"
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
}
type Graded = { id: string; pass: boolean; faults: string[]; got: unknown }

const here = fileURLToPath(new URL(".", import.meta.url))
const argv = process.argv.slice(2)
const opt = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const all: Probe[] = JSON.parse(readFileSync(join(here, "check-probes.json"), "utf8"))
const probes = opt("--only") ? all.filter((probe) => probe.id === opt("--only")) : all

// A pick's menu id, from the check the engine made of it.
const menuId = (check: { kind: string; skill?: string; ability?: string }) => {
  const ability = { str: "strength", dex: "dexterity", con: "constitution", int: "intelligence", wis: "wisdom", cha: "charisma" }[check.ability ?? ""]
  return check.kind === "skill" ? check.skill : check.kind === "save" ? `${ability}-save` : ability
}

async function run(probe: Probe): Promise<Graded> {
  const pack = loadPack(probe.adventure)
  const hero: Character = { ...JSON.parse(readFileSync(join(here, `../../../content/settings/realm-of-myr/adventures/${probe.adventure}/characters/${probe.hero}.json`), "utf8")), type: "pc" }
  const encounter = pack.artifacts.encounters[probe.encounter]
  if (!encounter) throw new Error(`${probe.id}: no encounter ${probe.encounter}`)
  const model = localLlm("claude", mkdtempSync(join(tmpdir(), "check-probe-")))
  try {
    const { getRollRequirementForAction } = createRollRequirementService({ llm: model.llm } as GmPorts)
    const got = await getRollRequirementForAction(probe.action, hero, {
      encounterIntro: authoredText(encounter.sections.intro ?? "", storyNames([hero])),
      encounterInstructions: encounter.sections.gmNotes ?? "",
      narrativeContext: probe.narrative ?? "",
      // The hero and the encounter's NPCs, so an attack has someone to land on.
      present: [hero, ...encounter.npcRefs.map((ref) => ({ ...pack.artifacts.characterSheets.npcs[ref.id].sheet, type: "npc" as const }))],
    })
    const faults: string[] = []
    const picked = !got ? "none" : isAttackRoll(got) ? "attack" : (menuId(got.check) ?? "?")
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
    }
    return { id: probe.id, pass: faults.length === 0, faults, got }
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
  const got = g.got as { rollType: string; difficulty: number; modifier: number; mode: string; reasons?: string[]; attack?: { target: string } } | null
  const pick = got
    ? `${got.rollType} ${got.attack ? `on ${got.attack.target}, AC` : "DC"} ${got.difficulty}, bonus ${got.modifier}${got.mode === "normal" ? "" : `, ${got.mode} (${got.reasons?.join(", ") ?? "no reason"})`}`
    : "no roll"
  log(`${g.pass ? "pass" : "FAIL"}  ${g.id.padEnd(18)} ${pick}${g.faults.length ? `\n      ${g.faults.join("; ")}` : ""}`)
}
log(`\n${graded.filter((g) => g.pass).length} of ${graded.length} pass`)
if (opt("--out")) writeFileSync(resolve(opt("--out")!), JSON.stringify(graded, null, 2))
process.exit(graded.every((g) => g.pass) ? 0 : 1)
