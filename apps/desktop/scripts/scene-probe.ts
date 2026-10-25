import { randomUUID } from "node:crypto"
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { TurnRecord } from "@d20/gm-core"
import { namesMetBefore } from "@d20/gm-core/story/names"
import { findCurrentActor } from "@d20/gm-core/utils/turn-actors"
import { applyCharacterUpdates } from "../runtime/characters"
import { adventureList, type GameCommand, game, type Packs, suggest, transitionsOf } from "../runtime/game"
import { localLlm } from "../runtime/llm"
import { LocalStore } from "../runtime/store"
import { type Judged, judgeRounds, loadPack, printJudged, readSave, roundScript, roundsOf, say } from "./scene-judge"

// Plays a fresh game from one encounter, the player's hero on scripted replies that push on the scene's exits and the
// rest of the party AI, then judges every round. In process, on the current prompts and content: no runtime build.
// pnpm --dir apps/desktop scene:probe <probe id> [--runs 3] [--rounds 4] [--out dir] [--through] [--pick random] [--probes file]
// --through plays on past the probe's encounter, up to --rounds in all, and judges every encounter it reaches. --pick random
// takes a random offered reply instead of the first. --probes reads probes from another file. --jobs sets how many rounds
// are judged at once.

type Probe = {
  adventure: string
  encounter: string
  // Turns to copy from a playtest save, first and last order, as the GM reads only the last five. `lead` opens the scene
  // on the real round end that led into it.
  story?: { save: string; turns: [number, number]; lead?: boolean }
  rounds: number
  replies: string[]
}
const here = fileURLToPath(new URL(".", import.meta.url))
const argv = process.argv.slice(2)
const opt = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
const through = argv.includes("--through")
const pickRandom = opt("--pick") === "random"
const probes: Record<string, Probe> = JSON.parse(readFileSync(opt("--probes") ? resolve(opt("--probes")!) : join(here, "scene-probes.json"), "utf8"))

// The story before the scene, renumbered ahead of the probe's first turn.
function seed(store: LocalStore, probe: Probe) {
  const save = store.state!
  const start = save.turns[0]
  if (probe.story) {
    const from = readSave(join(here, probe.story.save))
    const [first, last] = probe.story.turns
    const before = from.turns.filter((t) => t.order >= first && t.order <= last).sort((a, b) => a.order - b.order)
    const copied = before.map((t, i) => ({ ...t, _id: randomUUID(), adventureId: save.adventure._id, order: i + 1 }))
    const next = from.turns.find((t) => t.order === last + 1)
    if (probe.story.lead && next?.story) {
      const own = next.story.findIndex((b) => b.by.step !== "round")
      start.story = [...(own < 0 ? next.story : next.story.slice(0, own)), ...(start.story ?? [])]
    }
    start.order = copied.length + 1
    save.turns = [...(copied as TurnRecord[]), start]
  }
  // The party has been together since the gate, unless the probe starts there and the heroes are still strangers.
  if (!probe.story) return store.save()
  const heroes = start.characters.filter((c) => c.type === "pc")
  save.adventure.knowledge = [...(save.adventure.knowledge ?? []), ...namesMetBefore([heroes.map((h) => h.id)], heroes)]
  store.save()
}

async function play(probe: Probe, packs: Packs, dir: string, rounds: number, log: (line: string) => void): Promise<string> {
  const store = new LocalStore(join(dir, "adventure.sqlite"), transitionsOf(packs))
  store.acquire()
  const scratch = mkdtempSync(join(dir, "session-"))
  const model = () => localLlm("claude", scratch, (patch) => applyCharacterUpdates(store.current().characters, patch.characterUpdates))
  const step = async (command: GameCommand) => {
    const m = model()
    try {
      await game(store, packs, m.llm)(command)
    } finally {
      m.close()
    }
  }
  // Past the scripted replies, the hero takes the first reply the game offers, as the playtests did.
  const offered = async (turnId: string, characterId: string, name: string) => {
    const m = model()
    try {
      const offers = await suggest(store.state, packs, m.llm, { kind: "suggest", turnId, characterId })
      return offers[pickRandom ? Math.floor(Math.random() * offers.length) : 0].text
    } catch {
      return `${name} stays close to the others and watches.`
    } finally {
      m.close()
    }
  }
  try {
    const { party } = adventureList(packs).find((a) => a.id === probe.adventure)!
    await step({ kind: "start", provider: "claude", adventure: probe.adventure, party: party.map((id, i) => ({ id, ai: i > 0 })) })
    seed(store, probe)
    const start = store.current().order
    let replies = 0
    for (let n = 0; n < 200; n++) {
      if (store.state!.adventure.status === "completed") return "the adventure ended"
      const turn = store.current()
      if (!through && turn.encounterId !== probe.encounter) return `moved on to ${turn.encounterId}`
      const counted = store.state!.turns.filter((t) => (through ? t.order >= start : t.encounterId === probe.encounter))
      if (counted.length > rounds) return `${rounds} rounds played${through ? `, ended in ${turn.encounterId}` : ""}`
      const actor = findCurrentActor(turn.characters)
      const player = actor?.type === "pc" && actor.controlledBy !== "ai"
      let command: GameCommand
      if (player && actor.rollRequired && actor.rollResult === undefined) command = { kind: "roll", turnId: turn._id, characterId: actor.id, result: 1 + Math.floor(Math.random() * 20) }
      else if (player && !actor.hasReplied) command = { kind: "reply", turnId: turn._id, characterId: actor.id, text: probe.replies[replies++] ?? (await offered(turn._id, actor.id, actor.name)) }
      else command = { kind: "continue", turnId: turn._id }
      const t0 = Date.now()
      const who = command.kind === "continue" ? (actor ? actor.name : "round end") : `${actor!.name} ${command.kind}`
      for (let attempt = 0; ; attempt++) {
        try {
          await step(command)
          break
        } catch (error) {
          store.reload()
          if (attempt === 1) return `stopped: ${error instanceof Error ? error.message : error}`
        }
      }
      log(`round ${turn.order} ${who}${command.kind === "reply" ? `: ${command.text.slice(0, 80)}` : ""} (${Math.round((Date.now() - t0) / 1000)}s)`)
    }
    return "step limit"
  } finally {
    store.close()
  }
}

async function main() {
  const id = argv[0]
  const probe = probes[id]
  if (!probe) throw new Error(`Usage: scene:probe <${Object.keys(probes).join("|")}> [--runs 3] [--rounds 4] [--out dir] [--through] [--pick random] [--probes file] [--jobs 4]`)
  const runs = Number(opt("--runs") ?? 3)
  const rounds = Number(opt("--rounds") ?? probe.rounds)
  const out = opt("--out") ? resolve(opt("--out")!) : mkdtempSync(join(tmpdir(), `scene-probe-${id}-`))
  const pack = loadPack(probe.adventure)
  const started = structuredClone(pack)
  started.artifacts.manifest.startEncounterId = probe.encounter
  const packs: Packs = { [probe.adventure]: started }
  say(`Probe ${id}: ${runs} runs of up to ${rounds} rounds in ${probe.encounter}. Saves in ${out}`)
  const results = await Promise.all(
    Array.from({ length: runs }, async (_, i) => {
      const dir = join(out, `run-${i + 1}`)
      mkdirSync(dir, { recursive: true })
      const ended = await play(probe, packs, dir, rounds, (line) => say(`[run ${i + 1}] ${line}`)).catch((error) => `crashed: ${error instanceof Error ? error.message : error}`)
      say(`[run ${i + 1}] ${ended}`)
      const played = roundsOf(readSave(join(dir, "adventure.sqlite"))).filter(
        (r) => (through || r.encounterId === probe.encounter) && r.story.length && !(probe.story && r.order <= probe.story.turns[1] - probe.story.turns[0] + 1)
      )
      writeFileSync(join(dir, "transcript.txt"), played.map((r) => `## Round ${r.order}\n\n${roundScript(r)}`).join("\n\n"))
      const judged: Judged[] = await judgeRounds(pack.artifacts, played, Number(opt("--jobs") ?? 4))
      return { run: i + 1, ended, judged }
    })
  )
  for (const r of results) {
    say(`\nRun ${r.run}: ${r.ended}`)
    r.judged.forEach(printJudged)
  }
  const offRun = (r: (typeof results)[number]) => r.judged.some((j) => "verdict" in j && j.verdict.verdict === "off")
  const judgedRounds = results.flatMap((r) => r.judged)
  const off = judgedRounds.filter((j) => "verdict" in j && j.verdict.verdict === "off").length
  say(`\n${results.filter(offRun).length} of ${runs} runs off the rails, ${off} of ${judgedRounds.length} rounds`)
  writeFileSync(join(out, "report.json"), `${JSON.stringify({ probe: id, rounds, results }, null, 2)}\n`)
}

// Core debugging must not flood the report.
console.log = console.warn = console.error = () => {}
main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? (error.stack ?? error.message) : error}\n`)
  process.exit(1)
})
