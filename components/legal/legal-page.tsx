import Link from "next/link"
import type { ReactNode } from "react"
import { PlainPage, plainProse } from "@/components/layout/plain-page"

export type LegalSection = { title: string; body: ReactNode }

export const contactUs = <Link href="/contact">contact us</Link>

/** A legal page: title, last updated date, then numbered sections. */
export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro?: ReactNode; sections: LegalSection[] }) {
  return (
    <PlainPage title={title} subtitle={`Updated ${updated}`}>
      <div className={plainProse}>
        {intro && <div className="text-lg text-white/90 [&>p:first-child]:mt-0">{intro}</div>}
        {sections.map((section, i) => (
          <section key={section.title}>
            <h2>
              <span className="mr-3 text-accent-300/70">{i + 1}.</span>
              {section.title}
            </h2>
            {section.body}
          </section>
        ))}
      </div>
    </PlainPage>
  )
}
