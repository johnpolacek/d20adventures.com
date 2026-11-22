import { invoke } from "@tauri-apps/api/core"
import { useEffect, useRef, useState } from "react"

// Development autopilot: the app plays an adventure on its own, as written below, for a recorded playthrough
// (scripts/record-playthrough.ts). It is on only when the dev server is started with VITE_D20_AUTOPILOT naming a play.
// Nothing here runs in a shipped build.

type Play = {
  adventure: string
  party: string[]
  // What the hero says on their turns, in order, by encounter. An encounter's last line is said again if the GM asks
  // more than it has. An encounter with none says `fallback`.
  lines: Record<string, string[]>
  fallback: string
  // The d20 the hero rolls, by kind of roll. A roll with Advantage or Disadvantage rolls `second` beside it.
  roll: number
  second: number
  // Replies before the autopilot gives up, so a GM that keeps asking never records forever.
  maxReplies: number
}

const PLAYS: Record<string, Play> = {
  "the-midnight-summons": {
    adventure: "the-midnight-summons",
    party: ["thalbern"],
    lines: {
      "broken-silence": ["Thalbern slips off the trail into the thick undergrowth, crouches low behind a fallen trunk and goes perfectly still."],
      "the-owlbear-prowls": ["Thalbern stays hidden, barely breathing, and waits for the Owlbear to move on."],
      "owlbear-confrontation": ["Thalbern backs away slowly, bow raised, looking for a way off the trail."],
      "timely-rescue": ["Thalbern lowers his bow. “Wollandora. Your timing is as good as ever. Lead on to the stones.”"],
      "meeting-at-the-stones": [
        "“Your squirrel found me, old friend. What could be so urgent that it needs the stones at midnight?”",
        "Thalbern looks toward the river, then back to her. “I don't love the city. But for the forest, I'll go. I'll find the relics.”",
      ],
    },
    fallback: "Thalbern presses on toward the Old Standing Stones.",
    roll: 17,
    second: 12,
    maxReplies: 10,
  },
}

export const autopilot = PLAYS[import.meta.env.VITE_D20_AUTOPILOT ?? ""] ?? null

// Tells the recorder how far the playthrough has come: "ready" when the game is about to start, and "done" with the
// spans spent waiting on the GM, which the recorder cuts.
export const mark = (name: "ready" | "done", data: unknown) => invoke<void>("autopilot_mark", { name, data }).catch(() => {})

const TYPE_MS = 28
const THINK_MS = 1400
const SEND_MS = 700
const ROLL_MS = 1600
// After the end, how long the last screen stays before the recording stops.
const END_MS = 7000
// A roll's die and verdict are worth watching for this long, though the GM is still at work.
const ROLL_SHOWN_MS = 3500

type Seat = {
  mode: { kind: string; roll?: { mode?: string } } | null
  reading: boolean
  working: boolean
  held: number | null
  ended: boolean
  turn?: string
  encounter?: string
  setAuto: (on: boolean) => void
  setDraft: (text: string) => void
  reply: (text: string) => Promise<void>
  roll: (dice: number[]) => Promise<void>
}

// Plays the hero's turns on the stage. Called by StagePlay every render, with what is on screen.
export function useAutopilot(seat: Seat) {
  const said = useRef<Record<string, number>>({})
  const replies = useRef(0)
  const acted = useRef<string | null>(null)
  const idleSince = useRef<number | null>(null)
  const spans = useRef<[number, number][]>([])
  const finished = useRef(false)
  const [, redraw] = useState(0)
  const s = useRef(seat)
  s.current = seat

  useEffect(() => {
    if (autopilot) seat.setAuto(true)
  }, [])

  // Time spent waiting on the GM with nothing new to read, for the recorder to cut.
  const now = Date.now()
  const idle = Boolean(seat.working && !seat.reading && (seat.held === null || now - seat.held > ROLL_SHOWN_MS))
  useEffect(() => {
    if (!autopilot) return
    if (idle && idleSince.current === null) idleSince.current = Date.now()
    if (!idle && idleSince.current !== null) {
      spans.current.push([idleSince.current, Date.now()])
      idleSince.current = null
    }
  })
  // A held roll turns idle only with time, so look again once it has been shown.
  useEffect(() => {
    if (!autopilot || seat.held === null || !seat.working) return
    const timer = setTimeout(() => redraw((n) => n + 1), Math.max(0, seat.held + ROLL_SHOWN_MS + 50 - Date.now()))
    return () => clearTimeout(timer)
  }, [seat.held, seat.working])

  const kind = seat.mode?.kind
  const key = `${seat.turn}:${kind}:${seat.encounter}:${replies.current}`
  const free = !seat.reading && !seat.working && seat.held === null
  useEffect(() => {
    if (!autopilot || !free || acted.current === key) return
    if (kind !== "hold" && kind !== "roll") return
    acted.current = key
    let live = true
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    void (async () => {
      if (kind === "roll") {
        await wait(ROLL_MS)
        if (!live) return
        const two = s.current.mode?.roll?.mode === "advantage" || s.current.mode?.roll?.mode === "disadvantage"
        await s.current.roll(two ? [autopilot.roll, autopilot.second] : [autopilot.roll])
        return
      }
      if (replies.current >= autopilot.maxReplies) return void end(["The autopilot ran out of replies."])
      const lines = autopilot.lines[s.current.encounter ?? ""] ?? []
      const n = said.current[s.current.encounter ?? ""] ?? 0
      const line = lines.length ? lines[Math.min(n, lines.length - 1)] : autopilot.fallback
      await wait(THINK_MS)
      for (let i = 1; i <= line.length && live; i++) {
        s.current.setDraft(line.slice(0, i))
        await wait(TYPE_MS)
      }
      await wait(SEND_MS)
      if (!live) return
      said.current[s.current.encounter ?? ""] = n + 1
      replies.current++
      await s.current.reply(line)
    })()
    return () => {
      live = false
    }
  }, [free, key, kind])

  const end = (problems: string[] = []) => {
    if (finished.current) return
    finished.current = true
    if (idleSince.current !== null) spans.current.push([idleSince.current, Date.now()])
    setTimeout(() => void mark("done", { spans: spans.current, problems, at: Date.now() }), END_MS)
  }
  useEffect(() => {
    if (autopilot && seat.ended && !seat.reading) end()
  }, [seat.ended, seat.reading])
}
