"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@d20/ui/button"
import type { Save } from "@/apps/desktop/runtime/store"
import { useScenes } from "@/apps/desktop/src/stage-data"
import { StagePlay } from "@/apps/desktop/src/stage-play"
import saved from "./midnight-save.json"

type Turn = Save["turns"][number]
type Character = Turn["characters"][number]

// Metres on the stage to the engine's feet.
const ft = (x: number, z: number) => ({ x: x / 0.3048, y: z / 0.3048 })
const base = saved as unknown as Save
const [t1, t2, t3] = base.turns
const thalbern = (t: Turn, change: object) => ({ ...t, characters: t.characters.map((c) => (c.id === "thalbern" ? ({ ...c, ...change } as Character) : c)) })
const owlbear = (t: Turn, change: object) => ({ ...t, characters: t.characters.map((c) => (c.id === "owlbear" ? ({ ...c, ...change } as Character) : c)) })
const story = (t: Turn, n: number) => ({ ...t, story: t.story.slice(0, n) })
const hidden = { conditions: [{ id: "invisible" }] } as unknown as Partial<Character>
const out = { conditions: undefined } as unknown as Partial<Character>
const hideRoll = {
  rollRequired: {
    check: { kind: "skill", skill: "stealth" },
    rollType: "Hide (Stealth)",
    difficulty: 15,
    modifier: 5,
    mode: "normal",
    stakes: [{ on: "success", target: "thalbern", kind: "condition", condition: "invisible", span: "lasting" }],
  },
} as unknown as Partial<Character>
const start = ft(-1.2, 12.5)
const ferns = ft(-4.6, 9.2)
// The roll failed: the same paragraph with the other outcome.
const failed: Turn = {
  ...t1,
  story: [
    ...t1.story.slice(0, 6),
    { ...(t1.story[6] as object), natural: 3, dice: [3], mode: "normal", total: 8, success: false, conditions: undefined } as unknown as Turn["story"][number],
    { kind: "narration", by: { step: "roll", character: "thalbern" }, text: "A frond snaps under his boot. He is in the ferns, but anything listening knows where." } as Turn["story"][number],
  ],
}
const save = (turns: Turn[]): Save => ({ ...base, turns, adventure: { ...base.adventure, currentTurnId: turns[turns.length - 1]._id, currentEncounterId: turns[turns.length - 1].encounterId } })

const STEPS: { label: string; save: Save }[] = [
  { label: "1 broken silence: intro", save: save([thalbern(story(t1, 4), { position: start, ...out })]) },
  { label: "2 hide: to the ferns, roll asked", save: save([thalbern(story(t1, 6), { position: ferns, ...out, ...hideRoll })]) },
  { label: "3 hide roll made", save: save([thalbern(t1, { position: ferns, ...hidden })]) },
  { label: "3b hide roll failed", save: save([thalbern(failed, { position: ferns, ...out })]) },
  { label: "4 owlbear prowls: intro", save: save([thalbern(t1, { position: ferns, ...hidden }), story(t2, 5)]) },
  { label: "5 owlbear moves about", save: save([thalbern(t1, { position: ferns, ...hidden }), owlbear(t2, { position: ft(-0.6, 2.4) })]) },
  {
    label: "6 owlbear moves on, next scene",
    save: save([
      thalbern(t1, { position: ferns, ...hidden }),
      owlbear(t2, { position: ft(-0.6, 2.4) }),
      { ...t3, characters: [...t3.characters, { ...(t2.characters.find((c) => c.id === "owlbear") as Character), position: ft(-0.6, 2.4), fled: true } as Character] },
    ]),
  },
  {
    label: "7 owlbear moves on in its own turn",
    save: save([
      thalbern(t1, { position: ferns, ...hidden }),
      owlbear(
        {
          ...t2,
          story: [
            ...t2.story,
            { kind: "action", by: { step: "npc", character: "owlbear" }, text: "Finding nothing, the owlbear huffs and lumbers off into the dark.", actor: "owlbear" } as Turn["story"][number],
          ],
        },
        { position: ft(-0.6, 2.4), fled: true }
      ),
    ]),
  },
]

export function StagePlayMock({ start: first }: { start: number }) {
  const [step, setStep] = useState(Math.min(first, STEPS.length - 1))
  useEffect(() => {
    ;(window as unknown as { __step?: (n: number) => void }).__step = setStep
  }, [])
  const current = STEPS[step].save
  const art = useMemo(() => ({}), [])
  const scenes = useScenes("repo")
  if (!scenes) return null
  return (
    <div className="fixed inset-0">
      <StagePlay
        save={current}
        busy={false}
        art={art}
        controls={(c) => c.type === "pc"}
        overlay={false}
        onReply={async () => false}
        onRoll={async () => false}
        onContinue={() => {}}
        onError={(m) => console.error(m)}
      />
      <div className="fixed bottom-2 left-2 z-overlay flex flex-wrap gap-1 rounded bg-black/70 p-1 text-xs text-white">
        {STEPS.map((s, i) => (
          <Button variant="plain" key={s.label} type="button" onClick={() => setStep(i)} className={i === step ? "bg-white px-2 py-1 text-black" : "px-2 py-1"}>
            {s.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
