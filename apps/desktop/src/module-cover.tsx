import { cn } from "@/lib/utils"

export const playersLine = ([min, max]: [number, number]) => `${min === max ? min : `${min}–${max}`} ${max === 1 ? "player" : "players"}`

// An adventure's cover, as on a classic printed module: the painting edge to edge, the title over its sky and the
// player count at its foot. Covers are painted by scripts/adventure-covers.ts.
export function ModuleCover(props: { id: string; title: string; players: [number, number]; className?: string }) {
  return (
    <figure className={cn("relative aspect-[3/4] w-full overflow-hidden rounded-[4px] bg-stage-ink shadow-[0_18px_40px_#000a]", props.className)}>
      <img src={`/stage/covers/${props.id}.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-x-0 top-0 bg-gradient-to-b from-black/70 via-black/25 to-transparent px-[7%] pt-[7%] pb-[16%]">
        <h1 className="font-display text-[clamp(22px,3.3vw,40px)] leading-[1.04] text-stage-cream [text-shadow:0_2px_8px_#000,0_0_2px_#000]">{props.title}</h1>
      </div>
      <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-[7%] pt-[12%] pb-[5%] text-right font-sans text-[clamp(9px,1vw,12px)] font-medium uppercase tracking-[0.22em] text-stage-cream/90 [text-shadow:0_1px_4px_#000]">
        {playersLine(props.players)}
      </figcaption>
    </figure>
  )
}
