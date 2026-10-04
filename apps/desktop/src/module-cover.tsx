import { cn } from "@/lib/utils"

// Each adventure's module code and trade-dress colour, after the classic printed adventure modules. Our own dress:
// the D20 Adventures wordmark, never a publisher's marks. Covers are painted by scripts/adventure-covers.ts.
const MODULES: Record<string, { code: string; color: string }> = {
  "the-road-to-kordavos": { code: "M1", color: "#2f5a35" },
  "the-midnight-summons": { code: "M2", color: "#3f2f5f" },
  "covert-cargo": { code: "M3", color: "#1d5266" },
  "march-of-davos": { code: "M4", color: "#8a2b1d" },
}

export const playersLine = ([min, max]: [number, number]) => `An adventure for ${min === max ? min : `${min}–${max}`} ${max === 1 ? "player" : "players"}`

// An adventure module's cover: a coloured border, a top band with the wordmark, the setting and the module code, the
// title over the painting, and a caption with who it is for.
export function ModuleCover(props: { id: string; title: string; players: [number, number]; setting?: string; className?: string }) {
  const m = MODULES[props.id] ?? { code: "M", color: "#5a3e26" }
  return (
    <figure
      className={cn("relative flex aspect-[3/4] w-full flex-col overflow-hidden rounded-[3px] p-[3.2%] shadow-[0_18px_40px_#000a,inset_0_0_0_1px_#f6ead433]", props.className)}
      style={{ background: m.color }}
    >
      <div className="flex items-stretch gap-[3%] pb-[3%]">
        <div className="grid aspect-square w-[17%] place-items-center rounded-[2px] bg-stage-parchment font-display text-[clamp(14px,2.4vw,26px)] leading-none text-stage-ink shadow-[inset_0_0_0_2px_#00000040]">
          {m.code}
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center border-y border-stage-parchment/60 py-[2%] text-stage-parchment">
          <span className="font-display text-[clamp(11px,1.6vw,17px)] tracking-[0.12em]">D20 ADVENTURES</span>
          <span className="truncate font-sans text-[clamp(7px,0.85vw,9px)] font-medium uppercase tracking-[0.24em] opacity-80">{props.setting ? `${props.setting} module` : "Adventure module"}</span>
        </div>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-[2px] shadow-[inset_0_0_0_2px_#f6ead4cc]">
        <img src={`/stage/covers/${props.id}.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 via-black/35 to-transparent px-[6%] pt-[5%] pb-[12%]">
          <h1 className="font-display text-[clamp(20px,3.1vw,36px)] leading-[1.05] text-stage-cream [text-shadow:0_2px_6px_#000,0_0_2px_#000]">{props.title}</h1>
        </div>
      </div>
      <figcaption className="whitespace-nowrap pt-[3%] text-center font-sans text-[clamp(8px,0.95vw,11px)] font-medium uppercase tracking-[0.16em] text-stage-parchment">
        {playersLine(props.players)}
      </figcaption>
    </figure>
  )
}
