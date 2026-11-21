import Link from "next/link"
import type { ReactNode } from "react"
import { LedgerPage } from "@/components/layout/ledger-page"
import { PostContents } from "@/components/updates/post-contents"

export type LegalSection = { title: string; body: ReactNode }

export const contactUs = <Link href="/contact">contact us</Link>

const sectionId = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

/** A legal page: title, last updated date, then numbered sections, with their list beside them on a wide window. */
export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro?: ReactNode; sections: LegalSection[] }) {
  const contents = sections.map((section) => ({ id: sectionId(section.title), title: section.title }))
  return (
    <LedgerPage
      title={title}
      subtitle={`Updated ${updated}`}
      aside={
        <aside className="up-toc" aria-label="Contents">
          <nav>
            <p className="up-label">Contents</p>
            <PostContents sections={contents} />
          </nav>
        </aside>
      }
    >
      <div className="up-prose">
        {intro && <div className="up-dek">{intro}</div>}
        {sections.map((section, i) => (
          <section key={section.title}>
            <h2 id={contents[i].id}>
              <span className="up-num">{String(i + 1).padStart(2, "0")}</span>
              {section.title}
            </h2>
            {section.body}
          </section>
        ))}
      </div>
    </LedgerPage>
  )
}
