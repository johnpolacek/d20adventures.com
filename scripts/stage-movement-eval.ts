// Eval for narrative → movement: does the model send characters where their written action implies, and keep still
// otherwise? Uses the Kordavos gate's labelled places with the party at the checkpoint.
//
//   node --env-file=.env --env-file=.env.local --import tsx scripts/stage-movement-eval.ts

import { generateObject } from "ai"
import { currentModel } from "../lib/ai/llm"
import { bearing, MOVEMENT_SYSTEM, type MovementContext, movementIntentSchema, movementPrompt } from "../lib/stage/movement"
import { SETS } from "../lib/stage/sets"
import { parseSet } from "../lib/stage/spec/build"

type Case = { actor: string; name: string; action: string; expect: { move: string; place?: string | string[]; character?: string; pace?: string } }
const CASES: Case[] = [
  {
    actor: "yeva",
    name: "Yeva Softstep",
    action: "Yeva hums a festival tune and drifts toward the gap in the barrier, trying to slip through without paying her three marks while the sergeant is busy counting.",
    expect: { move: "place", place: "barrierGap", pace: "sneak" },
  },
  {
    actor: "branka",
    name: "Branka Stoneveil",
    action: "Branka squares her shoulders so the old gate-ward sigil on her breastplate catches the light. “Branka Stoneveil. My family kept this gate for four generations.”",
    expect: { move: "stay" },
  },
  { actor: "milos", name: "Milos Radan", action: "Milos steps up to the sergeant's table and counts out the party's marks onto the ledger himself.", expect: { move: "place", place: "ledger" } },
  { actor: "cassia", name: "Cassia Verane", action: "Cassia takes two steps back and unrolls one of her charts to check the tunnels.", expect: { move: "relative" } },
  { actor: "milos", name: "Milos Radan", action: "Milos walks over to Garlan and presses the coins into his hand.", expect: { move: "character", character: "garlan" } },
  { actor: "yeva", name: "Yeva Softstep", action: "Yeva bolts for the great arch before anyone can stop her.", expect: { move: "place", place: "gateArch", pace: "hurry" } },
  { actor: "branka", name: "Branka Stoneveil", action: "Branka wanders over to the brazier to warm her hands while the others talk.", expect: { move: "place", place: "brazier" } },
  { actor: "cassia", name: "Cassia Verane", action: "Cassia sighs and goes back to wait in the line with the others.", expect: { move: "place", place: "lineBack" } },
]
const POS: Record<string, { x: number; z: number; ry: number }> = {
  branka: { x: 1.42, z: 12.8, ry: 2.66 },
  cassia: { x: 0.22, z: 12.8, ry: 2.3 },
  yeva: { x: 0.82, z: 13.65, ry: 2.5 },
  milos: { x: -0.4, z: 13.65, ry: 2.2 },
  garlan: { x: 2.3, z: 11.1, ry: -0.72 },
}
const NAMES: Record<string, string> = { branka: "Branka Stoneveil", cassia: "Cassia Verane", yeva: "Yeva Softstep", milos: "Milos Radan", garlan: "Garlan Ironfist" }

async function main() {
  const set = parseSet(await SETS["realm-of-myr/kordavos-south-gate"]())
  let pass = 0
  for (const c of CASES) {
    const me = POS[c.actor]
    const ctx: MovementContext = {
      actor: { id: c.actor, name: c.name, speed: 7.5 },
      action: c.action,
      places: Object.entries(set.marks)
        .filter(([, m]) => m.label)
        .map(([id, m]) => ({ id, label: m.label as string, distance: Math.hypot(m.at[0] - me.x, m.at[1] - me.z), direction: bearing(me, { x: m.at[0], z: m.at[1] }) })),
      characters: Object.entries(POS)
        .filter(([id]) => id !== c.actor)
        .map(([id, p]) => ({ id, name: NAMES[id], distance: Math.hypot(p.x - me.x, p.z - me.z), direction: bearing(me, p) })),
    }
    const t0 = Date.now()
    const { object } = await generateObject({ model: currentModel, schema: movementIntentSchema, system: MOVEMENT_SYSTEM, prompt: movementPrompt(ctx) })
    const places = Array.isArray(c.expect.place) ? c.expect.place : c.expect.place ? [c.expect.place] : []
    const ok = object.move === c.expect.move && (!places.length || places.includes(object.place ?? "")) && (!c.expect.character || object.character === c.expect.character)
    const paceOk = !c.expect.pace || object.pace === c.expect.pace
    if (ok) pass++
    console.log(
      `${ok ? "PASS" : "FAIL"}${ok && !paceOk ? " (pace " + object.pace + ")" : ""} ${c.name.split(" ")[0]}: ${JSON.stringify({ move: object.move, place: object.place, character: object.character, direction: object.direction, meters: object.meters, pace: object.pace, summary: object.summary })} ${Date.now() - t0} ms`
    )
  }
  console.log(`${pass}/${CASES.length} destinations correct`)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
