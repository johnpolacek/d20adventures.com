import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"
import { fileURLToPath } from "node:url"
import { gunzipSync } from "node:zlib"
import type { TurnRecord } from "@d20/gm-core"
import type { StoryBeat } from "@d20/gm-core/story/beats"
import { nameOf, type StoryNames, scriptLine } from "@d20/gm-core/story/render"
import type { RuntimeArtifacts } from "@d20/gm-core/wiki-adventures/types"
import { z } from "zod"
import { createSession } from "../../desktop-spike/harness/sessions.mjs"
import type { Pack } from "../runtime/game"
import { schemaLlm } from "../runtime/llm"
import type { Save } from "../runtime/store"

// Judges each round of a save against the encounter it was played in: whether the GM opened a way out the content
// does not give, or acted against the notes. Claude judges through its CLI, one fresh session a round.
// pnpm --dir apps/desktop scene:judge <save.sqlite|.json|.json.gz> [--rounds 28-36] [--encounter id] [--jobs 4] [--out report.json] [--prompt]

const require = createRequire(import.meta.url)
export const root = fileURLToPath(new URL("../../../", import.meta.url))

export function readSave(path: string): Save {
  if (path.endsWith(".sqlite")) {
    const db = new DatabaseSync(path, { readOnly: true })
    const row = db.prepare("SELECT json FROM save WHERE id=1").get() as { json: string } | undefined
    db.close()
    if (!row) throw new Error(`No save in ${path}`)
    return JSON.parse(row.json)
  }
  const raw = readFileSync(path)
  return JSON.parse((path.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"))
}

// The adventure as the content stands now, not as it was when the save was played.
export function loadPack(plan: string): Pack {
  const { loadLocalWikiAdventureRuntime } = require("../../../lib/wiki-adventures/local-runtime.ts")
  const cwd = process.cwd()
  process.chdir(root)
  try {
    return loadLocalWikiAdventureRuntime("realm-of-myr", plan)
  } finally {
    process.chdir(cwd)
  }
}

export type Round = { order: number; encounterId: string; story: StoryBeat[]; characters: TurnRecord["characters"] }

// A turn opens with the end of the round before it, told on the old scene. A round is its turn's own beats and the
// end-of-round beats that open the next turn.
export function roundsOf(save: Save): Round[] {
  const turns = [...save.turns].sort((a, b) => a.order - b.order)
  const lead = (t: TurnRecord) => {
    let i = 0
    while (i < (t.story ?? []).length && t.story![i].by.step === "round") i++
    return i
  }
  return turns.map((t, i) => {
    const next = turns[i + 1]
    return {
      order: t.order,
      encounterId: t.encounterId,
      story: [...(t.story ?? []).slice(lead(t)), ...(next ? next.story!.slice(0, lead(next)) : [])] as StoryBeat[],
      characters: [...t.characters, ...(next?.characters ?? []).filter((c) => !t.characters.some((o) => o.id === c.id))],
    }
  })
}

const linked = (text: string, artifacts: RuntimeArtifacts) =>
  text.replace(/\[\[(\w+):([a-z0-9-]+)\]\]/g, (_, type: string, id: string) => (type === "encounter" ? `"${artifacts.encounters[id]?.title ?? id}"` : nameOf({}, id)))

// The adventure's scenes from the start along its transitions, so naming what a later scene holds reads as foreshadowing.
function playOrder(artifacts: RuntimeArtifacts): string[] {
  const order = [artifacts.manifest.startEncounterId]
  for (let i = 0; i < order.length; i++) {
    for (const t of artifacts.graph.encounterTransitions) if (t.fromEncounterId === order[i] && !order.includes(t.toEncounterId)) order.push(t.toEncounterId)
  }
  return [...order, ...Object.keys(artifacts.encounters).filter((id) => !order.includes(id))]
}

// The scene as authored: what the judge holds the round to.
export function authoredScene(artifacts: RuntimeArtifacts, encounterId: string): string {
  const e = artifacts.encounters[encounterId]
  if (!e) throw new Error(`No encounter ${encounterId}`)
  const sheet = (id: string) => artifacts.characterSheets.npcs[id]?.sheet
  const ways = e.transitions.map((t) => `- ${linked(t.condition, artifacts)}`)
  const cast = e.npcRefs.map((n) => `- ${sheet(n.id)?.name ?? nameOf({}, n.id)}: ${n.behavior ?? sheet(n.id)?.personality ?? ""}`)
  const scenes = playOrder(artifacts).map((id) => `- ${artifacts.encounters[id]?.title ?? id}${id === encounterId ? " (this scene)" : ""}`)
  return [
    `# The adventure's scenes, in play order\n${scenes.join("\n")}`,
    `# The authored scene: ${e.title}`,
    `## Intro\n${e.sections.intro ?? "(none)"}`,
    `## GM notes\n${linked(e.sections.gmNotes ?? "(none)", artifacts)}`,
    `## Ways out, the only transitions the scene has\n${ways.length ? ways.join("\n") : "None. The adventure ends here."}`,
    `## Cast\n${cast.length ? cast.join("\n") : "No NPCs."}`,
  ].join("\n\n")
}

// The round as a script, each part headed by who wrote it.
export function roundScript(round: Round): string {
  const names: StoryNames = Object.fromEntries(round.characters.map((c) => [c.id, c.name]))
  const role = (id?: string) => {
    const c = round.characters.find((x) => x.id === id)
    return !c ? "the GM" : c.type === "npc" ? "an NPC, played by the GM" : c.controlledBy === "ai" ? "an AI hero" : "the player's hero"
  }
  const head = (beat: StoryBeat) =>
    beat.by.step === "intro"
      ? "The scene's intro, as authored:"
      : beat.by.step === "round"
        ? "The end of the round, told by the GM:"
        : `${nameOf(names, beat.by.character ?? "")}'s ${beat.by.step === "roll" ? "roll" : "turn"}, ${role(beat.by.character)}:`
  const lines: string[] = []
  let last: StoryBeat | undefined
  for (const beat of round.story) {
    if (!last || last.by.step !== beat.by.step || last.by.character !== beat.by.character) lines.push("", head(beat))
    lines.push(scriptLine(beat, names))
    last = beat
  }
  return lines.join("\n").trim()
}

export const verdictSchema = z.object({
  verdict: z.enum(["on", "off"]),
  findings: z.array(
    z.object({
      kind: z.enum(["invented-exit", "against-notes"]),
      quote: z.string(),
      pushedBy: z.enum(["gm", "player", "ai-hero"]),
      why: z.string(),
    })
  ),
  contentGap: z.string().nullable(),
})
export type Verdict = z.infer<typeof verdictSchema>

const SYSTEM = "You review rounds of an AI-run tabletop game against the authored scene they were played in. Use only the supplied text. Do not use tools. Follow the requested output format exactly."

const task = `# Task

Judge whether the round stays on the authored scene's rails. The GM writes the narration, the end of the round, every NPC, every roll's outcome, and the AI heroes' turns. The player writes only the words marked as the player's.

Off the rails is one of these:
- invented-exit: the GM opens a way out of the scene that the intro, notes and ways out do not give. A secret passage, stair, door or tunnel. A trail, track or clue that leads somewhere else. A fleeing figure to follow, or a chase. A new place to go. An NPC who leads the party away.
- against-notes: what happens contradicts the notes or a cast behavior. An NPC the notes have leave comes back, one who should not talk does, an event the notes rule out happens.

On the rails: detail improvised inside the scene, NPCs answering in character, taking one of the listed ways out by an ordinary route such as a door or the street, a search or chase for something the notes do not give that finds nothing, a player's attempt the GM turns away. Naming a person, place or event that a later scene holds is foreshadowing, not an exit, unless the round sends the party there now.

For each finding quote the round's own words, say why in one sentence, and say who pushed it: "gm" when the GM offered it unprompted, "player" when the player's words asked for it and the GM went along, "ai-hero" when an AI hero's turn asked for it.

contentGap: if the player or an AI hero tried something reasonable that the notes do not answer, so the GM had to invent what happened, name the move and what the notes lack, in one sentence. Otherwise null.

verdict is "off" when there is at least one finding, and "on" with no findings otherwise.`

export const judgePrompt = (scene: string, round: Round) => `${scene}\n\n# The round as played\n\n${roundScript(round)}\n\n${task}`

// One round judged in a fresh CLI session, so no round colours another.
export async function judgeRound(scene: string, round: Round, cwd: string): Promise<Verdict> {
  const session = createSession("claude", cwd, SYSTEM)
  try {
    const ask = async (prompt: string) => {
      const result = await session.ask(prompt)
      if (result.failed || !result.text.trim()) throw new Error("Claude could not finish the judgement.")
      return result.text.trim()
    }
    return (await schemaLlm(ask).generateObject({ schema: verdictSchema, prompt: judgePrompt(scene, round) })).object as Verdict
  } finally {
    session.close()
  }
}

export async function pool<T, R>(items: T[], jobs: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(jobs, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await work(items[i])
      }
    })
  )
  return out
}

export type Judged = { order: number; encounterId: string } & ({ verdict: Verdict } | { error: string })

export async function judgeRounds(artifacts: RuntimeArtifacts, rounds: Round[], jobs: number, onEach?: (j: Judged) => void): Promise<Judged[]> {
  const cwd = mkdtempSync(join(tmpdir(), "scene-judge-"))
  try {
    return await pool(rounds, jobs, async (round) => {
      const base = { order: round.order, encounterId: round.encounterId }
      let judged: Judged
      try {
        judged = { ...base, verdict: await judgeRound(authoredScene(artifacts, round.encounterId), round, cwd) }
      } catch (error) {
        judged = { ...base, error: error instanceof Error ? error.message : String(error) }
      }
      onEach?.(judged)
      return judged
    })
  } finally {
    rmSync(cwd, { recursive: true, force: true })
  }
}

export const say = (line: string) => process.stdout.write(`${line}\n`)

export function printJudged(j: Judged) {
  if ("error" in j) return say(`R${j.order} ${j.encounterId} ERROR ${j.error}`)
  say(`R${j.order} ${j.encounterId} ${j.verdict.verdict === "off" ? "OFF" : "on"}`)
  for (const f of j.verdict.findings) say(`  ${f.kind} (${f.pushedBy}): "${f.quote}" ${f.why}`)
  if (j.verdict.contentGap) say(`  gap: ${j.verdict.contentGap}`)
}

async function main() {
  const argv = process.argv.slice(2)
  const opt = (k: string) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : undefined)
  const path = argv[0]
  if (!path || path.startsWith("--")) throw new Error("Usage: scene:judge <save> [--rounds 28-36] [--encounter id] [--jobs 4] [--out report.json]")
  const save = readSave(resolve(path))
  const [from, to] = (opt("--rounds") ?? "1-9999").split("-").map(Number)
  const rounds = roundsOf(save).filter((r) => r.order >= from && r.order <= (to ?? from) && (!opt("--encounter") || r.encounterId === opt("--encounter")))
  const { artifacts } = loadPack(save.adventure.planId)
  // --prompt prints what the judge would read, with no model call.
  if (argv.includes("--prompt")) {
    for (const r of rounds) say(`${judgePrompt(authoredScene(artifacts, r.encounterId), r)}\n\n${"=".repeat(80)}`)
    return
  }
  say(`Judging ${rounds.length} rounds of ${save.adventure.title}`)
  const judged = await judgeRounds(artifacts, rounds, Number(opt("--jobs") ?? 4), printJudged)
  const off = judged.filter((j) => "verdict" in j && j.verdict.verdict === "off").length
  const failed = judged.filter((j) => "error" in j).length
  say(`\n${off} of ${judged.length} rounds off the rails${failed ? `, ${failed} not judged` : ""}`)
  if (opt("--out")) writeFileSync(resolve(opt("--out")!), `${JSON.stringify(judged, null, 2)}\n`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Core debugging must not flood the report.
  console.log = console.warn = () => {}
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : error}\n`)
    process.exit(1)
  })
}
