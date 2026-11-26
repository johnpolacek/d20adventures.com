import { spawn } from "node:child_process"
import { appendFileSync, createWriteStream, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { TurnRecord } from "@d20/gm-core"
import { findCurrentActor } from "@d20/gm-core/utils/turn-actors"
import { applyCharacterUpdates } from "../runtime/characters"
import { type GameCommand, game, type Packs, transitionsOf } from "../runtime/game"
import { localLlm } from "../runtime/llm"
import { LocalStore } from "../runtime/store"
import { loadPack } from "./scene-judge"

// Plays a whole adventure headless on a scripted path: what the hero says in each encounter and the d20s they roll, from
// playtest-plans.json. In process, on the current prompts and content. Each run writes a transcript (log.txt) and a
// summary (summary.json) of what a playtest reviewer asks first:
//   the encounters the path went through, and how many rounds each took
//   each GM call's time, by kind: reply, roll, continue
//   continues that added nothing to the story, the dead waits
//   the hero's health and any level owed, at each turn and at the end
//   lines an NPC said twice, and near repeats, for GM notes that say "once"
// Each GM call also goes to gm-trace.jsonl (D20_GM_TRACE), with its tokens.
// The engine's own logging goes to engine.log.
// pnpm --dir apps/desktop playtest <plan> [<plan> ...] [--jobs 2] [--out dir] [--plans file]
// Plans run side by side, two at a time by default. Keep --jobs at 4 or under on a laptop.

type Plan = {
  adventure: string
  // The hero whose health the summary follows.
  hero: string
  // The whole party, when more than the one hero. Those in `ai` are played by the game's own AI heroes, on continue.
  party?: string[]
  ai?: string[]
  // The scripted heroes' d20s in turn, round and round. A roll with Advantage or Disadvantage takes the next two.
  rolls: number[]
  // What a scripted hero says, by encounter, in order. The last is said again if the GM asks more. A list is the one
  // hero's. With a party, each hero's list goes under their id.
  lines: Record<string, string[] | Record<string, string[]>>
  fallback: string | Record<string, string>
  // Steps before the run gives up.
  max?: number
}

const here = fileURLToPath(new URL(".", import.meta.url))
const argv = process.argv.slice(2)
const opt = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const valued = new Set(["--jobs", "--out", "--plans"])
const names = argv.filter((a, i) => !a.startsWith("--") && !valued.has(argv[i - 1] ?? ""))
const plans: Record<string, Plan> = JSON.parse(readFileSync(opt("--plans") ? resolve(opt("--plans")!) : join(here, "playtest-plans.json"), "utf8"))

type Call = { kind: string; ms: number; beats: number; error?: string }
type Summary = {
  plan: string
  ended: string
  path: { encounter: string; rounds: number }[]
  calls: Record<string, { n: number; avgMs: number; maxMs: number }>
  deadContinues: number
  hero: { turn: number; encounter: string; health?: number; levelDue?: number }[]
  // Each hero's health at the end, with the party.
  party?: Record<string, number | undefined>
  repeats: { speaker: string; text: string; turns: number[] }[]
  // What the game ruled out of a hero's move, told in the story: a spell they do not know, an attack out of reach.
  rulings: { turn: number; who: string; name: string; text: string }[]
  errors: string[]
  minutes: number
}

// Words of a line, for telling a repeat in other words: two lines share most of their longer words.
const words = (s: string) => new Set(s.toLowerCase().match(/[a-z']{4,}/g) ?? [])
const overlap = (a: Set<string>, b: Set<string>) => {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const w of a) if (b.has(w)) n++
  return n / Math.min(a.size, b.size)
}

function repeatsOf(turns: TurnRecord[]) {
  const said: { speaker: string; text: string; turn: number; w: Set<string> }[] = []
  for (const t of turns)
    for (const b of t.story as { kind: string; speaker?: string; text?: string; by?: { step?: string } }[]) {
      // The authored intro is the scene's own and is said as written. A repeat is the GM saying it again.
      if (b.kind !== "line" || !b.speaker || !b.text || b.by?.step === "intro" || b.by?.step === "reply") continue
      said.push({ speaker: b.speaker, text: b.text, turn: t.order ?? 0, w: words(b.text) })
    }
  const out: Summary["repeats"] = []
  for (let i = 0; i < said.length; i++)
    for (let j = i + 1; j < said.length; j++) {
      const a = said[i]
      const b = said[j]
      if (a.speaker !== b.speaker) continue
      // A short line said again word for word is a repeat too: Silas's "Someone's out there. Get her over the side, now!"
      if ((a.text === b.text && a.text.length >= 20) || (a.w.size >= 5 && overlap(a.w, b.w) >= 0.8)) out.push({ speaker: a.speaker, text: a.text === b.text ? a.text.slice(0, 120) : `${a.text.slice(0, 80)} / ${b.text.slice(0, 80)}`, turns: [a.turn, b.turn] })
    }
  return out
}

async function run(name: string, plan: Plan, packs: Packs, dir: string): Promise<Summary> {
  mkdirSync(dir, { recursive: true })
  const logFile = join(dir, "log.txt")
  writeFileSync(logFile, "")
  const log = (line: string) => appendFileSync(logFile, `${line}\n`)
  process.env.D20_GM_TRACE = join(dir, "gm-trace.jsonl")
  const store = new LocalStore(join(dir, "adventure.sqlite"), transitionsOf(packs))
  store.acquire()
  const scratch = mkdtempSync(join(dir, "session-"))
  const started = Date.now()
  const calls: Call[] = []
  const errors: string[] = []
  const hero: Summary["hero"] = []
  const shown = new Map<string, number>()
  const said: Record<string, number> = {}
  let rolled = 0
  const storyLength = () => store.state!.turns.reduce((n, t) => n + t.story.length, 0)
  const step = async (command: GameCommand) => {
    const m = localLlm("claude", scratch, (patch) => applyCharacterUpdates(store.current().characters, patch.characterUpdates))
    const t0 = Date.now()
    const before = store.state ? storyLength() : 0
    try {
      await game(store, packs, m.llm)(command)
      const beats = storyLength() - before
      calls.push({ kind: command.kind, ms: Date.now() - t0, beats })
      log(`>> ${command.kind}${"text" in command ? `: ${command.text}` : ""}${"result" in command ? ` d20 ${command.result}${command.second ? `/${command.second}` : ""}` : ""} [${((Date.now() - t0) / 1000).toFixed(1)}s, ${beats} beats]`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      calls.push({ kind: command.kind, ms: Date.now() - t0, beats: 0, error: message })
      errors.push(`${command.kind}: ${message}`)
      log(`>> ${command.kind} FAILED [${((Date.now() - t0) / 1000).toFixed(1)}s] ${message}`)
      store.reload()
    } finally {
      m.close()
    }
  }
  const print = () => {
    for (const t of store.state!.turns) {
      if (!shown.has(t._id)) log(`\n=== TURN ${t.order} ${t.encounterId}`)
      const from = shown.get(t._id) ?? 0
      for (const b of t.story.slice(from) as Record<string, unknown>[]) {
        const who = (b.actor ?? b.speaker ?? b.character ?? (b.by as { step?: string } | undefined)?.step ?? "") as string
        const extra =
          b.kind === "roll" ? ` ${b.check} ${b.natural}${b.modifier !== undefined ? `+${b.modifier}` : ""}=${b.total} vs ${b.dc} ${b.success ? "success" : "fail"}${(b.attack as { taken?: number } | undefined)?.taken ? `, ${(b.attack as { taken: number }).taken} damage` : ""}` : b.place ? ` @${b.place}` : ""
        log(`[${b.kind}${who ? `:${who}` : ""}] ${(b.text as string | undefined) ?? ""}${extra}`)
      }
      shown.set(t._id, t.story.length)
    }
  }
  let ended = "step limit"
  try {
    const party = plan.party ?? [plan.hero]
    const ai = new Set(plan.ai ?? [])
    const scripted = (id?: string) => !!id && party.includes(id) && !ai.has(id)
    await step({ kind: "start", provider: "claude", adventure: plan.adventure, party: party.map((id) => ({ id, ai: ai.has(id) })) })
    // Each hero takes a step of their own each round, so a party has more steps to the end.
    for (let n = 0; n < (plan.max ?? 45 * party.length); n++) {
      print()
      const state = store.state!
      if (state.adventure.status === "completed") {
        ended = "completed"
        break
      }
      const turn = store.current()
      const me = turn.characters.find((c) => c.id === plan.hero) as (TurnRecord["characters"][number] & { healthPercent?: number; levelDue?: number }) | undefined
      if (hero.at(-1)?.turn !== turn.order) hero.push({ turn: turn.order ?? 0, encounter: turn.encounterId, health: me?.healthPercent, levelDue: me?.levelDue })
      if (plan.party) log(`   (${party.map((id) => `${id} ${(turn.characters.find((c) => c.id === id) as { healthPercent?: number } | undefined)?.healthPercent ?? "?"}%`).join(", ")})`)
      else log(`   (hero ${me?.healthPercent ?? "?"}% health${me?.levelDue ? `, level ${me.levelDue} owed` : ""})`)
      const actor = findCurrentActor(turn.characters)
      let command: GameCommand
      if (actor && scripted(actor.id) && actor.rollRequired && actor.rollResult === undefined) {
        const rr = actor.rollRequired
        log(`   roll asked of ${actor.id}: ${rr.rollType} DC ${rr.difficulty} ${rr.modifier >= 0 ? "+" : ""}${rr.modifier}${rr.mode && rr.mode !== "normal" ? ` ${rr.mode}${rr.reasons?.length ? ` (${rr.reasons.join(", ")})` : ""}` : ""}`)
        const next = () => plan.rolls[rolled++ % plan.rolls.length]
        const two = rr.mode === "advantage" || rr.mode === "disadvantage"
        command = { kind: "roll", turnId: turn._id, characterId: actor.id, result: next(), ...(two ? { second: next() } : {}) }
      } else if (actor && scripted(actor.id) && !actor.hasReplied) {
        const own = plan.lines[turn.encounterId]
        const fallback = typeof plan.fallback === "string" ? plan.fallback : (plan.fallback[actor.id] ?? "")
        const lines = (Array.isArray(own) ? (actor.id === plan.hero ? own : undefined) : own?.[actor.id]) ?? [fallback]
        const k = `${turn.encounterId}:${actor.id}`
        const i = said[k] ?? 0
        said[k] = i + 1
        command = { kind: "reply", turnId: turn._id, characterId: actor.id, text: lines[Math.min(i, lines.length - 1)] }
      } else if (turn.reaction && turn.reaction.answer === undefined) command = { kind: "react", turnId: turn._id, characterId: turn.reaction.offer.to, take: false }
      else command = { kind: "continue", turnId: turn._id }
      await step(command)
      if (errors.length >= 3) {
        ended = "stopped on errors"
        break
      }
    }
    print()
  } finally {
    store.close()
  }

  const turns = store.state?.turns ?? []
  const path: Summary["path"] = []
  for (const t of turns) {
    if (path.at(-1)?.encounter === t.encounterId) path.at(-1)!.rounds++
    else path.push({ encounter: t.encounterId, rounds: 1 })
  }
  const last = turns.at(-1)?.characters.find((c) => c.id === plan.hero) as { healthPercent?: number; levelDue?: number } | undefined
  if (last) hero.push({ turn: turns.at(-1)?.order ?? 0, encounter: `${turns.at(-1)?.encounterId} (end)`, health: last.healthPercent, levelDue: last.levelDue })
  const partyEnd = plan.party ? Object.fromEntries(plan.party.map((id) => [id, (turns.at(-1)?.characters.find((c) => c.id === id) as { healthPercent?: number } | undefined)?.healthPercent])) : undefined
  const byKind: Summary["calls"] = {}
  for (const c of calls) {
    if (c.kind === "start") continue
    const k = (byKind[c.kind] ??= { n: 0, avgMs: 0, maxMs: 0 })
    k.avgMs = Math.round((k.avgMs * k.n + c.ms) / (k.n + 1))
    k.n++
    k.maxMs = Math.max(k.maxMs, c.ms)
  }
  return {
    plan: name,
    ended,
    path,
    calls: byKind,
    deadContinues: calls.filter((c) => c.kind === "continue" && !c.error && c.beats === 0).length,
    hero,
    party: partyEnd,
    repeats: repeatsOf(turns),
    rulings: turns.flatMap((t) =>
      (t.story as { kind: string; name?: string; text?: string; character?: string; by?: { step?: string } }[])
        .filter((b) => b.kind === "feature" && b.by?.step === "reply" && b.name && !/ casts | uses /.test(b.text ?? ""))
        .map((b) => ({ turn: t.order ?? 0, who: b.character ?? "", name: b.name ?? "", text: (b.text ?? "").slice(0, 140) }))
    ),
    errors,
    minutes: Math.round((Date.now() - started) / 6000) / 10,
  }
}

// One plan in this process, writing its summary. Each plan runs in a process of its own, since the GM trace's file is
// read from the environment on every call.
async function single(name: string, out: string) {
  const plan = plans[name]
  const summary = await run(name, plan, { [plan.adventure]: loadPack(plan.adventure) } as Packs, join(out, name)).catch(
    (error) => ({ plan: name, ended: `crashed: ${error instanceof Error ? error.message : error}` }) as Summary
  )
  mkdirSync(join(out, name), { recursive: true })
  writeFileSync(join(out, name, "summary.json"), JSON.stringify(summary, null, 2))
}

function print(s: Summary) {
  console.log(`\n# ${s.plan}: ${s.ended}${s.minutes ? ` in ${s.minutes} min` : ""}`)
  if (!s.path) return
  console.log(`path: ${s.path.map((p) => `${p.encounter}×${p.rounds}`).join(" > ")}`)
  console.log(`calls: ${Object.entries(s.calls).map(([k, v]) => `${k} ${v.n}× avg ${(v.avgMs / 1000).toFixed(1)}s max ${(v.maxMs / 1000).toFixed(1)}s`).join(", ")}; ${s.deadContinues} continues added nothing`)
  const end = s.hero.at(-1)
  console.log(`hero at the end: ${end?.health ?? "?"}% health${end?.levelDue ? `, level ${end.levelDue} owed` : ""}`)
  if (s.party) console.log(`party at the end: ${Object.entries(s.party).map(([id, h]) => `${id} ${h ?? "?"}%`).join(", ")}`)
  for (const r of s.repeats) console.log(`REPEAT ${r.speaker} in turns ${r.turns.join(" and ")}: "${r.text}"`)
  for (const r of s.rulings ?? []) console.log(`RULING turn ${r.turn} ${r.who} ${r.name}: ${r.text}`)
  for (const e of s.errors) console.log(`ERROR ${e}`)
}

async function main() {
  if (!names.length || names.some((n) => !plans[n])) throw new Error(`Usage: playtest <${Object.keys(plans).join("|")}> [...] [--jobs 2] [--out dir] [--plans file]`)
  const out = opt("--out") ? resolve(opt("--out")!) : mkdtempSync(join(tmpdir(), "d20-playtest-"))
  if (argv.includes("--single")) return single(names[0], out)
  const jobs = Math.max(1, Math.min(4, Number(opt("--jobs") ?? 2)))
  console.log(`playtest: ${names.join(", ")} into ${out}`)
  const queue = [...names]
  const extra = opt("--plans") ? ["--plans", resolve(opt("--plans")!)] : []
  await Promise.all(
    Array.from({ length: jobs }, async () => {
      for (let name = queue.shift(); name; name = queue.shift()) {
        console.log(`playtest: ${name} started`)
        // The engine's own logging, every prompt and decision, goes to engine.log beside the transcript.
        mkdirSync(join(out, name), { recursive: true })
        const engine = createWriteStream(join(out, name, "engine.log"))
        const child = spawn(process.execPath, [...process.execArgv, process.argv[1], name, "--single", "--out", out, ...extra], { stdio: ["ignore", "pipe", "pipe"] })
        child.stdout.pipe(engine)
        child.stderr.pipe(engine)
        await new Promise((done) => child.on("exit", done))
        console.log(`playtest: ${name} finished`)
      }
    })
  )
  for (const name of names) {
    const file = join(out, name, "summary.json")
    if (existsSync(file)) print(JSON.parse(readFileSync(file, "utf8")))
    else console.log(`\n# ${name}: no summary`)
  }
  console.log(`\nlogs: ${out}/<plan>/log.txt`)
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})
