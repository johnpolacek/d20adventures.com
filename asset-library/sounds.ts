// The game's sounds as the library lists them: every file under public/stage/sounds, a cue's takes kept together
// ("blade-1.mp3", "blade-2.mp3" are the cue "blade"), with what the game plays it for and where it came from.
//
// The credits are read from public/stage/sounds/SOURCES.md, whose lines name cues in backticks, then the source and its
// address: "- `blade`, `fire`: "80 CC0 RPG SFX", https://…". A cue no line names shows no source.

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import type { Sound } from "./types"

const AUDIO = /\.(mp3|ogg|wav|m4a)$/i

// What the game plays each cue for (packages/ui/src/sound): effects in fx.ts, beds in ambience.ts, the dice in dice.ts.
const USES: Record<string, string> = {
  blade: "A blade that strikes",
  hit: "A blow that lands",
  thunk: "A missile that lands in wood or earth",
  fire: "A fire spell",
  spell: "A spell that lands, softened for shadow and nature",
  cloth: "A scroll, letter or map handled",
  coins: "A pouch or coin handled",
  key: "A key handled",
  book: "A book opened",
  draw: "A blade drawn",
  step: "A footstep on earth, and anything soft",
  "step-leaves": "A footstep in leaves",
  "step-wood": "A footstep on boards",
  "step-stone": "A footstep on stone",
  "step-gravel": "A footstep on gravel",
  growl: "A beast coming on, striking or struck",
  hurt: "A beast hurt",
  "d20-roll": "The die rolled",
  hearth: "A fire in the room",
  crowd: "A crowd about",
  wind: "Wind outside",
  night: "Crickets at night",
  birds: "Birds by day",
  river: "Running water",
  dawn: "Morning outdoors",
  dungeon: "A dungeon's air",
  drip: "Water dripping underground",
}

async function credits(dir: string): Promise<Map<string, { name: string; url?: string }>> {
  const text = await readFile(path.join(dir, "SOURCES.md"), "utf8").catch(() => "")
  const found = new Map<string, { name: string; url?: string }>()
  let line = ""
  // A credit may wrap onto the next line, indented.
  for (const raw of [...text.split("\n"), ""]) {
    if (/^\s{2,}\S/.test(raw) && line) {
      line += ` ${raw.trim()}`
      continue
    }
    const m = /^- ((?:`[^`]+`,?\s*)+):\s*(.*)$/.exec(line)
    if (m) {
      const url = /https?:\/\/\S+/.exec(m[2])?.[0]
      const name = m[2].replace(/https?:\/\/\S+/, "").replace(/[",\s]+$/, "").replaceAll('"', "").trim() || (url?.includes("opengameart.org") ? "OpenGameArt" : url ? new URL(url).hostname : "")
      for (const cue of m[1].match(/`([^`]+)`/g) ?? []) found.set(cue.slice(1, -1), { name, url })
    }
    line = raw
  }
  return found
}

export async function gatherSounds(pub: string): Promise<Sound[]> {
  const dir = path.join(pub, "stage/sounds")
  const credit = await credits(dir)
  const folders: [string, Sound["kind"]][] = [
    ["", "Dice"],
    ["fx", "Effects"],
    ["ambience", "Ambience"],
  ]
  const sounds: Sound[] = []
  for (const [folder, kind] of folders) {
    const files = (await readdir(path.join(dir, folder)).catch(() => [] as string[])).filter((f) => AUDIO.test(f)).sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
    const cues = new Map<string, string[]>()
    for (const f of files) {
      const cue = f.replace(AUDIO, "").replace(/-\d+$/, "")
      cues.set(cue, [...(cues.get(cue) ?? []), `/stage/sounds/${folder ? `${folder}/` : ""}${f}`])
    }
    for (const [cue, takes] of cues) sounds.push({ id: cue, kind, takes, use: USES[cue], source: credit.get(cue), loop: kind === "Ambience" })
  }
  return sounds
}
