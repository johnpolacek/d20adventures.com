// Builds the game's sound files from the CC0 packs in `public/stage/sounds/SOURCES.md`, unpacked into one folder:
// effects mono, ambience beds stereo, all MP3 (the app's WebKit view plays no Ogg), each brought to its level here so the
// code keeps plain gains. Effects trim their leading silence. Beds are cut to length and loop in the engine with a
// crossfade, so they need no seam of their own.
//
//   pnpm tsx scripts/sound-assets.ts ~/Desktop/d20-sound-sources
//
// Then `pnpm stage:sync public/stage/sounds` before pushing.

import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"

const from = resolve(process.argv[2] ?? join(homedir(), "Desktop/d20-sound-sources"))
const out = resolve("public/stage/sounds")

// Effects: cue name, source takes. Level is the RMS in dBFS each take is brought to, peaks held under -3.
const FX: Record<string, string[]> = {
  blade: ["oga-80-rpg/blade_01.ogg", "oga-80-rpg/blade_02.ogg", "oga-80-rpg/blade_03.ogg"],
  hit: ["oga-100-cc0/hit_01.ogg", "oga-100-cc0/hit_02.ogg", "oga-100-cc0/hit_03.ogg"],
  thunk: ["oga-100-cc0/wooden_01.ogg", "oga-100-cc0/wooden_02.ogg", "oga-100-cc0/wooden_03.ogg"],
  fire: ["oga-80-rpg/spell_fire_03.ogg", "oga-80-rpg/spell_fire_04.ogg", "oga-80-rpg/spell_fire_06.ogg"],
  spell: ["oga-80-rpg/spell_01.ogg", "oga-80-rpg/spell_02.ogg"],
  cloth: ["kenney-rpg/OGG/cloth1.ogg", "kenney-rpg/OGG/cloth2.ogg", "kenney-rpg/OGG/cloth3.ogg"],
  coins: ["kenney-rpg/OGG/handleCoins.ogg", "kenney-rpg/OGG/handleCoins2.ogg"],
  key: ["kenney-rpg/OGG/metalClick.ogg"],
  book: ["kenney-rpg/OGG/bookOpen.ogg"],
  draw: ["kenney-rpg/OGG/drawKnife3.ogg"],
  // The lowest of the pack's footsteps and creature takes: the game plays them slower still for something big.
  step: ["kenney-rpg/OGG/footstep00.ogg", "kenney-rpg/OGG/footstep01.ogg", "kenney-rpg/OGG/footstep02.ogg", "kenney-rpg/OGG/footstep08.ogg", "kenney-rpg/OGG/footstep09.ogg"],
  growl: ["oga-80-rpg/creature_monster_03.ogg", "oga-80-rpg/creature_monster_04.ogg", "oga-80-rpg/creature_roar_02.ogg"],
  hurt: ["oga-80-rpg/creature_hurt_01.ogg", "oga-80-rpg/creature_hurt_02.ogg"],
}
const FX_LEVEL = -24

// Ambience beds: source, start and length in seconds, and an optional filter. Quieter than effects by far.
const BEDS: Record<string, { src: string; start?: number; length: number; filter?: string }> = {
  hearth: { src: "oga-ambience/fire.wav", length: 29 },
  crowd: { src: "oga-ambience/crowd_shouting_0.ogg", length: 27, filter: "lowpass=f=1800,highpass=f=140" },
  wind: { src: "oga-ambience/wind_background_noise_2.wav", length: 44 },
  night: { src: "oga-ambience/crickets_1.mp3", length: 11.4 },
  birds: { src: "oga-ambience/park_ambience_birds.wav", start: 20, length: 60 },
  river: { src: "oga-ambience/park_ambience_river.wav", start: 20, length: 60 },
  dawn: { src: "oga-ambience/amb_morning.wav", length: 63 },
  dungeon: { src: "oga-ambience/dungeon_ambient_1_0.ogg", length: 60 },
  drip: { src: "oga-ambience/atmosbasement.mp3_.flac", length: 20 },
}
const BED_LEVEL = -30

function ffmpeg(args: string[]) {
  return execFileSync("ffmpeg", ["-hide_banner", "-nostdin", ...args], { stdio: ["ignore", "pipe", "pipe"] }).toString()
}
function encode(src: string, dest: string, filter: string, target: number, channels: number) {
  const { rms, peak } = levelsOf(src, filter)
  const gain = Math.min(target - rms, -3 - peak)
  const af = `${filter},volume=${gain.toFixed(2)}dB`
  ffmpeg(["-y", "-i", src, "-af", af, "-ac", String(channels), "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "96k", dest])
  const after = levelsOf(dest, "anull")
  console.log(`${dest.replace(`${out}/`, "").padEnd(22)} rms ${after.rms.toFixed(1)} peak ${after.peak.toFixed(1)}`)
}
// RMS and peak in dBFS after the filter chain. ffmpeg prints them on stderr.
const levelsOf = (file: string, filter: string) => {
  const r = execFileSync("sh", ["-c", `ffmpeg -hide_banner -nostdin -i "$0" -af "$1,astats=measure_perchannel=0" -f null - 2>&1`, file, filter])
  const text = r.toString()
  const num = (label: string) => Number(text.match(new RegExp(`${label} dB:\\s*(-?[\\d.]+)`))?.[1] ?? "NaN")
  return { rms: num("RMS level"), peak: num("Peak level") }
}

if (!existsSync(from)) throw new Error(`no sources at ${from}`)
mkdirSync(join(out, "fx"), { recursive: true })
mkdirSync(join(out, "ambience"), { recursive: true })

// Leading silence off, and a few ms of fade so a cut start does not click.
const TRIM = "silenceremove=start_periods=1:start_threshold=-50dB,afade=t=in:d=0.004"
for (const [cue, takes] of Object.entries(FX)) {
  takes.forEach((t, i) => encode(join(from, t), join(out, "fx", `${cue}-${i + 1}.mp3`), TRIM, FX_LEVEL, 1))
}
for (const [bed, b] of Object.entries(BEDS)) {
  const cut = `atrim=start=${b.start ?? 0}:duration=${b.length},asetpts=PTS-STARTPTS${b.filter ? `,${b.filter}` : ""}`
  encode(join(from, b.src), join(out, "ambience", `${bed}.mp3`), cut, BED_LEVEL, 2)
}
