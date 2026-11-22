import { type ChildProcess, execFileSync, spawn } from "node:child_process"
import { cpSync, createWriteStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

// Records the desktop app playing an adventure on its own (src/autopilot.ts), with its sound, as a video on the Desktop.
// The app runs from the dev server on a data folder of its own, so real saves are never touched. Time spent waiting on
// the GM is cut from the video, leaving a beat at each side of the cut.
// pnpm --dir apps/desktop record:playthrough [play] [--no-audio] [--audio "BlackHole 2ch"] [--keep-waits]
// Sound is recorded from BlackHole (brew install --cask blackhole-2ch). For the run the Mac's output becomes a device
// that plays to the speakers and BlackHole at once (scripts/audio-route.swift), and is put back after. The app runs on
// its own port, so a dev app already open keeps running. The terminal needs Screen Recording access.

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

  if (lsofBusy()) throw new Error(`Port ${PORT} is in use. Is another recording running?`)
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
  let recorder: ChildProcess | null = null
  const quit = () => {
    recorder?.kill("SIGINT")
    stopApp(app)
    process.exit(1)
  }
  process.on("SIGINT", quit)

  try {
    await waitFor(join(marks, "ready.json"), 10, () => running)
    say("recording")
    const input = sound ? `${screen}:${sound}` : `${screen}:none`
    recorder = spawn(
      "ffmpeg",
      ["-hide_banner", "-y", "-f", "avfoundation", "-capture_cursor", "0", "-framerate", "30", "-i", input, "-c:v", "h264_videotoolbox", "-b:v", "20M", "-pix_fmt", "yuv420p", ...(sound ? ["-c:a", "aac", "-b:a", "192k"] : []), raw],
      { stdio: ["pipe", "ignore", "pipe"] }
    )
    // The recording starts when ffmpeg says it is capturing.
    const start = await new Promise<number>((done) => {
      recorder!.stderr!.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("Press [q]")) done(Date.now())
      })
      setTimeout(() => done(Date.now()), 8000)
    })
    const done: { spans: [number, number][]; problems: string[] } = await waitFor(join(marks, "done.json"), 45, () => running)
    recorder.stdin!.write("q")
    await new Promise((r) => recorder!.on("exit", r))
    recorder = null
    stopApp(app)
    restore()
    for (const p of done.problems) say(`problem: ${p}`)

    const cut = flag("--keep-waits") ? [] : cuts(done.spans, start)
    const drop = cut.map(([a, b]) => `between(t,${a.toFixed(2)},${b.toFixed(2)})`).join("+")
    const keep = drop ? `not(${drop})` : "1"
    say(`cutting ${cut.length} waits, ${Math.round(cut.reduce((s, [a, b]) => s + b - a, 0))}s in all`)
    const filter = `[0:v]select='${keep}',setpts=N/FRAME_RATE/TB,scale=1920:-2[v]${sound ? `;[0:a]aselect='${keep}',asetpts=N/SR/TB[a]` : ""}`
    execFileSync(
      "ffmpeg",
      ["-hide_banner", "-y", "-i", raw, "-filter_complex", filter, "-map", "[v]", ...(sound ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []), "-c:v", "h264_videotoolbox", "-b:v", "12M", "-movflags", "+faststart", final],
      { stdio: "inherit" }
    )
    say(`saved ${final}`)
    say(`uncut ${raw}`)
  } catch (e) {
    say(String(e instanceof Error ? e.message : e))
    say(`app log: ${join(base, "app.log")}`)
    recorder?.kill("SIGINT")
    stopApp(app)
    process.exit(1)
  }
}

void main()
