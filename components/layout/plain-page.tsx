import type { ReactNode } from "react"
import { textShadowSpreadLight } from "@d20/ui/typography/styles"
import Image from "@d20/ui/native-image"

/** The see-through card that holds a PlainPage's content. */
export const plainCard = "rounded-lg border border-amber-200/20 bg-black/70 shadow-[0_18px_44px_#000a] backdrop-blur-sm"

/** Body text for a PlainPage. */
export const plainProse =
  "prose prose-invert max-w-none text-white/80 prose-headings:font-display prose-headings:text-blue-50 prose-h2:mt-10 prose-h2:mb-3 prose-h2:text-2xl prose-a:text-amber-200 prose-a:decoration-amber-200/40 hover:prose-a:decoration-amber-200 prose-li:marker:text-amber-300/70 prose-strong:text-white"

/** A plain page over the home page's hero art, its content on a see-through card unless `card` is false. */
export function PlainPage({ title, subtitle, card = true, width = "max-w-3xl", children }: { title?: string; subtitle?: ReactNode; card?: boolean; width?: string; children: ReactNode }) {
  return (
    <div className="relative isolate">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-black">
        <Image className="object-cover fade-in" fill={true} src="/images/app/backgrounds/d20-hero.webp" alt="" />
      </div>
      <div className="container pt-28 pb-24">
        <article className={`mx-auto ${width}`}>
          {title && (
            <header className="mb-8 flex flex-col items-center text-center">
              <h1 className="font-display text-5xl sm:text-6xl text-blue-50" style={textShadowSpreadLight}>
                {title}
              </h1>
              {subtitle && (
                <p className="mt-3 font-display text-sm tracking-[0.2em] uppercase text-amber-200" style={textShadowSpreadLight}>
                  {subtitle}
                </p>
              )}
            </header>
          )}
          {card ? <div className={`${plainCard} p-6 sm:p-10`}>{children}</div> : children}
        </article>
      </div>
    </div>
  )
}

