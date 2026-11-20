import Link from "next/link"
import type { ReactNode } from "react"
import { textShadowSpreadLight } from "@d20/ui/typography/styles"
import { UpdatesBackdrop } from "@/components/updates/updates-backdrop"

export type LegalSection = { title: string; body: ReactNode }

export const contactUs = <Link href="/contact">contact us</Link>

/** A plain legal page: title, last updated date, then numbered sections. */
export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro?: ReactNode; sections: LegalSection[] }) {
  return (
    <div className="relative isolate min-h-screen">
      <UpdatesBackdrop strength="opacity-15" />
      <div className="container pt-28 pb-24">
        <article className="mx-auto max-w-2xl">
          <header className="mb-12 flex flex-col items-center text-center">
            <h1 className="font-display text-5xl sm:text-6xl text-blue-50" style={textShadowSpreadLight}>
              {title}
            </h1>
            <p className="mt-4 font-display text-sm tracking-[0.2em] uppercase text-amber-300/90">Updated {updated}</p>
            <div className="stage-rule mt-6 h-1.5 w-64" />
          </header>
          <div className="prose prose-invert max-w-none text-white/80 prose-headings:font-display prose-headings:text-blue-50 prose-h2:mt-10 prose-h2:mb-3 prose-h2:text-2xl prose-a:text-amber-200 prose-a:decoration-amber-200/40 hover:prose-a:decoration-amber-200 prose-li:marker:text-amber-300/70 prose-strong:text-white">
            {intro && <div className="text-lg text-white/90">{intro}</div>}
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
        </article>
      </div>
    </div>
  )
}
