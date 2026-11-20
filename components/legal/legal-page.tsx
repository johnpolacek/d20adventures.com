import Link from "next/link"
import type { ReactNode } from "react"
import { textShadowSpreadLight } from "@d20/ui/typography/styles"
import Image from "@d20/ui/native-image"

export type LegalSection = { title: string; body: ReactNode }

/** Body text for a PlainPage. */
export const plainProse =
  "prose prose-invert max-w-none text-white/80 prose-headings:font-display prose-headings:text-blue-50 prose-h2:mt-10 prose-h2:mb-3 prose-h2:text-2xl prose-a:text-amber-200 prose-a:decoration-amber-200/40 hover:prose-a:decoration-amber-200 prose-li:marker:text-amber-300/70 prose-strong:text-white"

export const contactUs = <Link href="/contact">contact us</Link>

/** A plain page over the home page's hero art, its content on a see-through card. */
export function PlainPage({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative isolate">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-black">
        <Image className="object-cover fade-in" fill={true} src="/images/app/backgrounds/d20-hero.webp" alt="" />
      </div>
      <div className="container pt-28 pb-24">
        <article className="mx-auto max-w-3xl">
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
          <div className="rounded-lg border border-amber-200/20 bg-black/70 p-6 shadow-[0_18px_44px_#000a] backdrop-blur-sm sm:p-10">{children}</div>
        </article>
      </div>
    </div>
  )
}

/** A legal page: title, last updated date, then numbered sections. */
export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro?: ReactNode; sections: LegalSection[] }) {
  return (
    <PlainPage title={title} subtitle={`Updated ${updated}`}>
      <div className={plainProse}>
        {intro && <div className="text-lg text-white/90 [&>p:first-child]:mt-0">{intro}</div>}
        {sections.map((section, i) => (
          <section key={section.title}>
            <h2>
              <span className="mr-3 text-amber-300/70">{i + 1}.</span>
              {section.title}
            </h2>
            {section.body}
          </section>
        ))}
      </div>
    </PlainPage>
  )
}
