import { type ChildProcess, execFileSync, spawn } from "node:child_process"
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { prunePlaythroughs } from "./playthrough-prune"

// Records the desktop app playing an adventure on its own (src/autopilot.ts), with its sound, as a video on the Desktop.
// The app runs from the dev server on a data folder of its own, so real saves are never touched. Time spent waiting on
// the GM is cut from the video, leaving a beat at each side of the cut.
// pnpm --dir apps/desktop record:playthrough [play] [--no-audio] [--audio "BlackHole 2ch"] [--keep-waits]
// Sound is recorded from BlackHole (brew install --cask blackhole-2ch). For the run the Mac's output becomes a device
// that plays to the speakers and BlackHole at once (scripts/audio-route.swift), and is put back after. The app runs on
// its own port, so a dev app already open keeps running. The terminal needs Screen Recording access.
// Each run first deletes videos there older than 3 days (playthrough-prune.ts). The uncut recording is deleted once the
// cut is saved. A run that stops early is still cut, up to the last turn the autopilot asked for. The display is kept
// awake for the run, since a sleeping display records as its last frame while the game plays on.

const args = process.argv.slice(2)
const flag = (name: string) => args.includes(name)
const option = (name: string) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
const play = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--audio") ?? "the-midnight-summons"
const audioName = flag("--no-audio") ? null : (option("--audio") ?? "BlackHole 2ch")
// A wait shorter than this stays in. A longer one keeps its first and last moments.
const CUT_OVER = 4
const KEEP_BEFORE = 1.5
const KEEP_AFTER = 1

const desktop = resolve(fileURLToPath(import.meta.url), "../..")
// Beside the dev app's 1422, so one already open is left alone.
const PORT = 1423
const base = join(tmpdir(), "d20-autopilot")
const data = join(base, "data")
const marks = join(base, "marks")
const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-")
const out = join(homedir(), "Desktop", "d20-playthroughs")
const raw = join(out, `${play}-${stamp}-raw.mov`)
const final = join(out, `${play}-${stamp}.mp4`)
const rawSound = join(out, `${play}-${stamp}-sound.wav`)

const say = (line: string) => console.log(`record: ${line}`)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function waitFor(file: string, minutes: number, alive: () => boolean) {
  const until = Date.now() + minutes * 60_000
  while (Date.now() < until) {
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"))
    if (!alive()) throw new Error("The app stopped. See its log.")
    await sleep(500)
  }
  throw new Error(`Gave up waiting for ${file}.`)
}

// The screen and sound inputs, by their index in AVFoundation's list.
function devices() {
  let text = ""
  try {
    execFileSync("ffmpeg", ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], { stdio: "pipe" })
  } catch (e) {
    text = String((e as { stderr?: Buffer }).stderr ?? "")
  }
  const [video, audio] = text.split("AVFoundation audio devices:")
  const find = (part: string | undefined, test: (name: string) => boolean) =>
    [...(part ?? "").matchAll(/\[(\d+)\] (.+)$/gm)].find((m) => test(m[2].trim()))?.[1]
  const screen = find(video, (n) => n.startsWith("Capture screen"))
  const sound = audioName ? find(audio, (n) => n === audioName) : undefined
  return { screen, sound, list: (audio ?? "").match(/\] .+$/gm)?.map((l) => l.slice(2)) ?? [] }
}

// The waits, as seconds into the recording, that come out of the video.
function cuts(spans: [number, number][], start: number) {
  return spans
    .map(([a, b]) => [(a - start) / 1000, (b - start) / 1000] as const)
    .filter(([a, b]) => b - a > CUT_OVER && b > 0)
    .map(([a, b]) => [Math.max(0, a) + KEEP_BEFORE, b - KEEP_AFTER] as const)
    .filter(([a, b]) => b > a)
}

// The cut video, from the raw picture and sound: the waits out, and nothing after until seconds when given. The sound is
// cut by trimming its kept pieces and joining them, since aselect passes every sample through.
function cutVideo(raw: string, rawSound: string | null, soundLate: number, cut: (readonly [number, number])[], final: string, until?: number) {
  const end = until ?? Infinity
  const drop = cut.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join("+")
  const keep = drop ? `not(${drop})` : "1"
  const pieces: [number, number][] = []
  let from = 0
  for (const [a, b] of cut) {
    if (a >= end) break
    pieces.push([from, a])
    from = b
  }
  if (from < end) pieces.push([from, end])
  const trim = ([a, b]: [number, number]) => `atrim=start=${a.toFixed(3)}${Number.isFinite(b) ? `:end=${b.toFixed(3)}` : ""},asetpts=PTS-STARTPTS`
  const sound = rawSound
    ? `;[1:a]asplit=${pieces.length}${pieces.map((_, i) => `[s${i}]`).join("")};${pieces.map((p, i) => `[s${i}]${trim(p)}[k${i}]`).join(";")};${pieces.map((_, i) => `[k${i}]`).join("")}concat=n=${pieces.length}:v=0:a=1[a]`
    : ""
  const filter = `[0:v]select='${keep}',setpts=N/FRAME_RATE/TB,scale=1920:-2[v]${sound}`
  const limit = until === undefined ? [] : ["-t", until.toFixed(2)]
  execFileSync(
    "ffmpeg",
    ["-hide_banner", "-y", ...limit, "-i", raw, ...(rawSound ? ["-itsoffset", soundLate.toFixed(3), ...limit, "-i", rawSound] : []), "-filter_complex", filter, "-map", "[v]", ...(rawSound ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []), "-c:v", "h264_videotoolbox", "-b:v", "12M", "-movflags", "+faststart", final],
    { stdio: "inherit" }
  )
  rmSync(raw, { force: true })
  if (rawSound) rmSync(rawSound, { force: true })
}

function lsofBusy() {
  try {
    return execFileSync("lsof", ["-ti", `tcp:${PORT}`], { stdio: "pipe" }).toString().trim().length > 0
  } catch {
    return false
  }
}

function stopApp(app: ChildProcess) {
  if (app.pid) {
    try {
      process.kill(-app.pid, "SIGTERM")
    } catch {}
  }
  // The dev server, by the port it listens on.
  try {
    const pids = execFileSync("lsof", ["-ti", `tcp:${PORT}`], { stdio: "pipe" }).toString().trim().split("\n").filter(Boolean)
    for (const pid of pids) process.kill(Number(pid), "SIGTERM")
  } catch {}
}

// The Mac's output, sent to the speakers and BlackHole for the run. Returns how to put it back.
function routeSound() {
  const source = join(desktop, "scripts/audio-route.swift")
  const tool = join(base, "audio-route")
  if (!existsSync(tool) || statSync(tool).mtimeMs < statSync(source).mtimeMs) execFileSync("swiftc", ["-O", "-o", tool, source], { stdio: "inherit" })
  const previous = execFileSync(tool, ["start"]).toString().trim()
  let restored = false
  return () => {
    if (restored) return
    restored = true
    try {
      execFileSync(tool, ["stop", previous])
    } catch {}
  }
}

async function main() {
  const { screen, sound, list } = devices()
  if (!screen) throw new Error("No screen to capture. Give the terminal Screen Recording access in System Settings.")
  if (audioName && !sound)
    throw new Error(`No sound input named “${audioName}”. Install BlackHole (brew install --cask blackhole-2ch), or pass --no-audio. Inputs: ${list.join(", ")}`)

  // A fresh game each time. The narrator's voice model and the downloaded art and figures stay, so a run never waits on
  // a download: a figure still downloading when its scene opens shows as a standee. The voice model can come from the
  // installed app.
  mkdirSync(data, { recursive: true })
  for (const f of readdirSync(data)) if (f !== "models" && f !== "files") rmSync(join(data, f), { recursive: true, force: true })
  const installed = join(homedir(), "Library/Application Support/com.d20adventures.desktop/models")
  if (!existsSync(join(data, "models")) && existsSync(installed)) cpSync(installed, join(data, "models"), { recursive: true })
  rmSync(marks, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  prunePlaythroughs()

  if (lsofBusy()) throw new Error(`Port ${PORT} is in use. Is another recording running?`)
  // Held until this script exits.
  spawn("caffeinate", ["-d", "-i", "-w", String(process.pid)], { stdio: "ignore", detached: true }).unref()
  mkdirSync(base, { recursive: true })
  const restore = sound ? routeSound() : () => {}
  process.on("exit", restore)

  say(`starting the app to play ${play}`)
  const log = createWriteStream(join(base, "app.log"))
  const config = { build: { devUrl: `http://127.0.0.1:${PORT}`, beforeDevCommand: `pnpm prepare:runtime && vite --host 127.0.0.1 --port ${PORT} --strictPort` } }
  const app = spawn("pnpm", ["tauri", "dev", "--config", JSON.stringify(config)], {
    cwd: desktop,
    detached: true,
    env: { ...process.env, VITE_D20_AUTOPILOT: play, D20_DATA_DIR: data, D20_AUTOPILOT_DIR: marks },
  })
  app.stdout?.pipe(log)
  app.stderr?.pipe(log)
  let running = true
  app.on("exit", () => {
    running = false
  })
  // The screen and the sound are recorded by two ffmpeg processes. In one, encoding the full screen held up the audio
  // queue, and dropped pieces of the sound left clicks all through the narration.
  const recorders: ChildProcess[] = []
  const capture = (args: string[]) => {
    const proc = spawn("ffmpeg", ["-hide_banner", "-y", ...args], { stdio: ["pipe", "ignore", "pipe"] })
    recorders.push(proc)
    // Recording starts when ffmpeg says it is capturing.
    const started = new Promise<number>((done) => {
      proc.stderr!.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("Press [q]")) done(Date.now())
      })
      setTimeout(() => done(Date.now()), 8000)
    })
    return { proc, started }
  }
  const stopRecording = async () => {
    for (const r of recorders) r.stdin?.write("q")
    await Promise.all(recorders.map((r) => (r.exitCode === null ? new Promise((done) => r.on("exit", done)) : null)))
    recorders.length = 0
  }
  const quit = () => {
    for (const r of recorders) r.kill("SIGINT")
    stopApp(app)
    process.exit(1)
  }
  process.on("SIGINT", quit)

  let start = 0
  let soundLate = 0
  try {
    await waitFor(join(marks, "ready.json"), 10, () => running)
    say("recording")
    const video = capture(["-f", "avfoundation", "-capture_cursor", "0", "-framerate", "30", "-i", `${screen}:none`, "-c:v", "h264_videotoolbox", "-b:v", "20M", "-pix_fmt", "yuv420p", raw])
    const audio = sound ? capture(["-thread_queue_size", "4096", "-f", "avfoundation", "-i", `none:${sound}`, "-c:a", "pcm_s16le", rawSound]) : null
    start = await video.started
    // How much later the sound began than the picture, so the two line up.
    soundLate = audio ? ((await audio.started) - start) / 1000 : 0
    const done: { spans: [number, number][]; problems: string[] } = await waitFor(join(marks, "done.json"), 150, () => running)
    await stopRecording()
    stopApp(app)
    restore()
    for (const p of done.problems) say(`problem: ${p}`)

    const cut = flag("--keep-waits") ? [] : cuts(done.spans, start)
    say(`cutting ${cut.length} waits, ${Math.round(cut.reduce((s, [a, b]) => s + b - a, 0))}s in all`)
    cutVideo(raw, sound ? rawSound : null, soundLate, cut, final)
    say(`saved ${final}`)
  } catch (e) {
    say(String(e instanceof Error ? e.message : e))
    say(`app log: ${join(base, "app.log")}`)
    await stopRecording()
    stopApp(app)
    restore()
    // What was recorded, cut up to the last turn a live autopilot asked for, a few seconds after it was asked.
    if (start && existsSync(raw)) {
      try {
        const turn = existsSync(join(marks, "turn.json")) ? JSON.parse(readFileSync(join(marks, "turn.json"), "utf8")) : null
        const until = turn?.at ? (turn.at - start) / 1000 + 5 : undefined
        const partial = final.replace(/\.mp4$/, "-partial.mp4")
        cutVideo(raw, sound ? rawSound : null, soundLate, flag("--keep-waits") ? [] : cuts(turn?.spans ?? [], start), partial, until)
        say(`saved what was recorded, ${partial}`)
      } catch (e) {
        say(`could not cut what was recorded, so it stays uncut: ${raw}. ${String(e instanceof Error ? e.message : e)}`)
      }
    }
    process.exit(1)
  }
}

void main()
