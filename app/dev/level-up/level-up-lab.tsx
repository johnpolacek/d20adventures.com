"use client"

import type { Sheet } from "@d20/gm-core/sheet/sheet"
import { useState } from "react"
import { Pill } from "@/components/stage/hud"
import { LevelUp } from "@/components/stage/level-up"

export function LevelUpLab({ heroes }: { heroes: { name: string; image?: string; sheets: Sheet[] }[] }) {
  const [hero, setHero] = useState(0)
  const [level, setLevel] = useState(0)
  const [compact, setCompact] = useState(false)
  const [refuse, setRefuse] = useState(false)
  const [said, setSaid] = useState("")
  const picked = heroes[hero]
  const sheet = picked.sheets[Math.min(level, picked.sheets.length - 1)]
  return (
    <div className="min-h-screen bg-stage-ink p-6 font-sans text-stage-cream">
      <div className="mb-4 flex flex-wrap gap-2">
        {heroes.map((h, index) => (
          <Pill key={h.name} active={index === hero} onClick={() => setHero(index)}>
            {h.name}
          </Pill>
        ))}
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {picked.sheets.map((s, index) => (
          <Pill key={s.level} active={index === level} onClick={() => setLevel(index)}>
            To Level {s.level + 1}
          </Pill>
        ))}
        <Pill active={compact} onClick={() => setCompact(!compact)}>
          Compact
        </Pill>
        <Pill active={refuse} onClick={() => setRefuse(!refuse)}>
          Host Refuses
        </Pill>
      </div>
      <div className={compact ? "h-[420px] w-[430px]" : "h-[640px] w-[560px]"}>
        <LevelUp
          key={`${hero}:${level}`}
          hero={picked.name}
          portrait={picked.image}
          sheet={sheet}
          compact={compact}
          onTake={async (choices) => {
            await new Promise((done) => setTimeout(done, 600))
            if (refuse) return "The game could not save the level. Try again."
            setSaid(JSON.stringify(choices, null, 2))
            return undefined
          }}
          onClose={() => setSaid("Later")}
        />
      </div>
      {said && <pre className="mt-6 max-w-[560px] whitespace-pre-wrap font-mono text-[11px] text-stage-cream/80">{said}</pre>}
    </div>
  )
}
