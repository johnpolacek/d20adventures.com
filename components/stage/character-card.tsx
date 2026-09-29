"use client"

// A character's card, opened by clicking them on the stage or in the party row (the prototype's cards).

import { cn } from "@/lib/utils"
import { eyebrow, panel } from "./hud"

export interface CardInfo {
  id: string
  name: string
  role: string
  portrait?: string
  about?: string
  lines?: string[]
}

export function CharacterCard({ info, compact = false, onClose }: { info: CardInfo; compact?: boolean; onClose: () => void }) {
  return (
    <section
      className={cn(panel, "fade-in absolute z-40 overflow-y-auto px-6 pt-6 pb-5", compact ? "top-12 right-3 bottom-12 w-[min(330px,55vw)]" : "top-24 right-10 max-h-[calc(100%-230px)] w-[330px]")}
    >
      <button type="button" onClick={onClose} aria-label="Close card" className="absolute top-2.5 right-3 text-[22px] leading-none text-stage-muted hover:text-stage-cream">
        ×
      </button>
      {info.portrait && (
        // biome-ignore lint/performance/noImgElement: portrait art from the stage assets
        <img src={info.portrait} alt="" className="-mt-1 mb-3 block h-[132px] w-full border border-stage-brass/50 object-cover object-[50%_15%] [filter:sepia(.2)_saturate(.88)]" />
      )}
      <div className={eyebrow}>{info.role}</div>
      <h2 className="mt-1.5 mb-2.5 font-serif text-[27px] font-normal">{info.name}</h2>
      {info.about && <p className="mb-2 text-[12px] leading-[1.7] text-[#e6dac6]">{info.about}</p>}
      {info.lines && info.lines.length > 0 && (
        <>
          <h3 className={cn(eyebrow, "mt-4 mb-2")}>Says</h3>
          <ul>
            {info.lines.map((l) => (
              <li key={l} className="font-serif text-[13px] leading-[1.75] text-[#eee1ca] italic">
                “{l}”
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
