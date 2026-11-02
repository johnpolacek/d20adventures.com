import { cn } from "@/lib/utils"

export const playersLine = ([min, max]: [number, number]) => `${min === max ? min : `${min}–${max}`} ${max === 1 ? "player" : "players"}`

// An adventure's cover, as on a classic printed module: the painting edge to edge, the title over its sky and the
// player count at its foot. Covers are painted by scripts/adventure-covers.ts.
// Type is sized to the cover, not the window, and shrinks so the longest word stays on the cover.
export function ModuleCover(props: { id: string; title: string; players: [number, number]; className?: string }) {
  const longest = Math.max(...props.title.split(/\s+/).map((w) => w.length))
  return (
    <figure className={cn("@container relative aspect-[3/4] w-full overflow-hidden rounded-[4px] bg-black text-left shadow-[0_18px_40px_#000a]", props.className)}>
      <img data-intro="art" src={`/stage/covers/${props.id}.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div data-intro="shade" className="absolute inset-x-0 top-0 bg-gradient-to-b from-black via-black/60 to-transparent px-[7%] pt-[11%] pb-[24%]">
        <h1
          data-intro="title"
          className="font-display leading-[1.04] text-stage-cream [text-shadow:0_2px_8px_#000,0_0_2px_#000]"
          style={{ fontSize: `min(12.5cqw, ${(84 / (longest * 0.74)).toFixed(2)}cqw)` }}
        >
          {props.title}
        </h1>
      </div>
      <figcaption className="absolute right-[5%] bottom-[4%] font-sans text-[max(9px,3.8cqw)] font-medium uppercase tracking-[0.22em] text-stage-cream/90">
        {/* The tracking trails the last letter, so the pill's right side pads that much less. */}
        <span data-intro="players" className="block rounded-full bg-black/70 py-[0.5em] pr-[0.78em] pl-[1em]">
          {playersLine(props.players)}
        </span>
      </figcaption>
    </figure>
  )
}
