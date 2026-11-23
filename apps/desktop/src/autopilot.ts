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
  // Live: each turn is handed out as turn.json for someone to play, and their reply.json is typed in. `lines` and
  // `fallback` go unused, and the dice roll in turn from `rolls`.
  live?: boolean
  rolls?: number[]
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
  "covert-cargo": {
    adventure: "covert-cargo",
    party: ["1749159962941", "1749307435667", "thalbern"],
    lines: {},
    fallback: "",
    roll: 15,
    second: 9,
    maxReplies: 60,
    live: true,
    rolls: [16, 12, 18, 9, 14, 19, 11, 15, 7, 17, 13, 20, 10, 16, 8, 14],
  },
}

export const autopilot = PLAYS[import.meta.env.VITE_D20_AUTOPILOT ?? ""] ?? null

// Nothing on screen asks for the viewer in a recording: the Feedback callout a session shows once is taken as seen
// (@d20/ui/stage/feedback), and tooltips under the resting cursor stay hidden, as does the cursor.
if (autopilot && typeof document !== "undefined") {
  try {
    sessionStorage.setItem("d20-feedback-callout", "1")
  } catch {}
  const style = document.createElement("style")
  style.textContent = `[role="tooltip"] { display: none !important } * { cursor: none !important }`
  document.head.append(style)
}

// Tells the recorder how far the playthrough has come: "ready" when the game is about to start, and "done" with the
// spans spent waiting on the GM, which the recorder cuts.
export const mark = (name: "ready" | "done" | "turn", data: unknown) => invoke<void>("autopilot_mark", { name, data }).catch(() => {})

// Development only, so it reaches apps/desktop/.logs/window.log (src/dev-log.ts).
const log = (...parts: unknown[]) => console.warn("[autopilot]", ...parts)

// Each camera move, for a run whose scene changes look wrong. Nothing outside the autopilot.
export const logShot = (turn: string | undefined, paragraph: number, shot: string, cut: boolean) => {
  if (autopilot) log("shot", `${turn?.slice(0, 8)}:${paragraph}`, shot, cut ? "cut" : "glide")
}

const TYPE_MS = 28
const THINK_MS = 1400
const SEND_MS = 700
const ROLL_MS = 1600
// After the end, how long the last screen stays before the recording stops.
const END_MS = 7000
// A roll's die and verdict are worth watching for this long, though the GM is still at work.
const ROLL_SHOWN_MS = 3500
// A paragraph read for this long is taken to be stuck. The longest take about half a minute aloud.
const STUCK_MS = 45_000
// Of a stuck paragraph, how much stays in the video.
const STUCK_KEEP_MS = 12_000

type Seat = {
  mode: { kind: string; roll?: { mode?: string } } | null
  reading: boolean
  working: boolean
  held: number | null
  ended: boolean
  turn?: string
  // The hero whose turn it is, and the story on screen, for a live autopilot.
  actor?: { id: string; name: string }
  story?: string[]
  // How many beats the turn's story has, which every action adds to.
  step?: number
  encounter?: string
  // The paragraph being read, with whether the narrator is speaking it, or null when nothing is read.
  paragraph: string | null
  // Moves the reading on, as the next-paragraph button does.
  advance: () => void
  setAuto: (on: boolean) => void
  setDraft: (text: string) => void
  reply: (text: string) => Promise<void>
  roll: (dice: number[]) => Promise<void>
}

// Plays the hero's turns on the stage. Called by StagePlay every render, with what is on screen.
export function useAutopilot(seat: Seat) {
  const said = useRef<Record<string, number>>({})
  const replies = useRef(0)
  // The last turn the autopilot played, as the key below.
  const acted = useRef<string | null>(null)
  const idleSince = useRef<number | null>(null)
  const spans = useRef<[number, number][]>([])
  const finished = useRef(false)
  const rolled = useRef(0)
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

  // One action at a time, for the hero's turn as it stands: the turn, how far its story has come and what the card asks.
  // The story grows with every action, so a reply or roll the player makes by hand never leaves the autopilot waiting
  // on a turn it thinks it has played. An action whose card changes before it is sent is dropped, and tried again
  // once the card is back.
  const kind = seat.mode?.kind
  const key = `${seat.turn}:${seat.step}:${kind}`
  const free = !seat.reading && !seat.working && seat.held === null
  const now_ = useRef({ key, free })
  now_.current = { key, free }
  const pending = useRef(false)
  useEffect(() => {
    if (!autopilot || !free || pending.current || acted.current === key) return
    if (kind !== "hold" && kind !== "roll") return
    pending.current = true
    const play = autopilot
    const still = () => now_.current.key === key && now_.current.free
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
    void (async () => {
      try {
        if (kind === "roll") {
          await wait(ROLL_MS)
          if (!still()) return log("roll dropped", key)
          acted.current = key
          const two = s.current.mode?.roll?.mode === "advantage" || s.current.mode?.roll?.mode === "disadvantage"
          const next = () => (play.rolls?.length ? play.rolls[rolled.current++ % play.rolls.length] : play.roll)
          const dice = play.rolls?.length ? (two ? [next(), next()] : [next()]) : two ? [play.roll, play.second] : [play.roll]
          log("roll", key, dice)
          await s.current.roll(dice)
          return
        }
        if (replies.current >= play.maxReplies) return void end(["The autopilot ran out of replies."])
        const encounter = s.current.encounter ?? ""
        const lines = play.lines[encounter] ?? []
        const n = said.current[encounter] ?? 0
        let line = lines.length ? lines[Math.min(n, lines.length - 1)] : play.fallback
        if (play.live) {
          const asked = Date.now()
          await mark("turn", { key, actor: s.current.actor, encounter, story: s.current.story ?? [], replies: replies.current, at: asked })
          line = ""
          while (!line) {
            await wait(500)
            if (!still()) return log("turn dropped", key)
            const got = await invoke<{ key?: string; text?: string } | null>("autopilot_reply").catch(() => null)
            if (got?.text && (!got.key || got.key === key)) line = got.text.trim()
          }
          // The time spent deciding is cut, as a wait on the GM is.
          spans.current.push([asked, Date.now()])
        }
        await wait(THINK_MS)
        for (let i = 1; i <= line.length; i++) {
          if (!still()) {
            s.current.setDraft("")
            return log("reply dropped", key)
          }
          s.current.setDraft(line.slice(0, i))
          await wait(TYPE_MS)
        }
        await wait(SEND_MS)
        if (!still()) return log("reply dropped", key)
        acted.current = key
        said.current[encounter] = n + 1
        replies.current++
        log("reply", key, line)
        await s.current.reply(line)
      } finally {
        pending.current = false
        redraw((n) => n + 1)
      }
    })()
  }, [free, key, kind])
  // A paragraph that never finishes reading, as when the narrator's sound is held while the window is hidden, is moved
  // on, and the time it held is cut from the video.
  useEffect(() => {
    if (!autopilot || !seat.paragraph) return
    const since = Date.now()
    const timer = setTimeout(() => {
      log("stuck", seat.paragraph, document.visibilityState)
      spans.current.push([since + STUCK_KEEP_MS, Date.now()])
      s.current.advance()
    }, STUCK_MS)
    return () => clearTimeout(timer)
  }, [seat.paragraph])
  // What the autopilot waits on, now and then, in the window log, for a run that stalls.
  useEffect(() => {
    if (!autopilot) return
    const timer = setInterval(() => log("waiting", now_.current.key, now_.current.free ? "free" : "busy", s.current.reading ? "reading" : "", s.current.working ? "working" : ""), 20_000)
    return () => clearInterval(timer)
  }, [])

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
