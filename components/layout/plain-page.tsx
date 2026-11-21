import { Heading } from "@d20/ui/typography/heading"
import type { ReactNode } from "react"
import { textShadowSpreadLight } from "@d20/ui/typography/styles"
import Image from "@d20/ui/native-image"
import { served } from "@/lib/served"

/** The see-through card that holds a PlainPage's content. */
export const plainCard = "rounded-lg border border-accent-200/20 bg-black/70 shadow-float backdrop-blur-sm"

/** Body text for a PlainPage. */
export const plainProse =
  "prose prose-invert max-w-none text-white/80 prose-headings:font-display prose-headings:text-action-50 prose-h2:mt-10 prose-h2:mb-3 prose-h2:text-2xl prose-a:text-accent-200 prose-a:decoration-accent-200/40 prose-a:transition-colors prose-a:duration-150 hover:prose-a:decoration-accent-200 prose-li:marker:text-accent-300/70 prose-strong:text-white"

/** A plain page over the home page's hero art, its content on a see-through card unless `card` is false. */
export function PlainPage({ title, subtitle, card = true, width = "max-w-3xl", children }: { title?: string; subtitle?: ReactNode; card?: boolean; width?: string; children: ReactNode }) {
  return (
    <div className="relative isolate">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-black">
        <Image className="object-cover fade-in" fill={true} src={served("/images/app/backgrounds/d20-hero.webp")} alt="" />
      </div>
      <div className="container pt-28 pb-24">
        <article className={`mx-auto ${width}`}>
          {title && (
            <header className="mb-8 flex flex-col items-center text-center">
              <Heading variant="h1" className="text-action-50" style={textShadowSpreadLight}>
                {title}
              </Heading>
              {subtitle && (
                <p className="mt-3 font-display text-sm tracking-label uppercase text-accent-200" style={textShadowSpreadLight}>
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

