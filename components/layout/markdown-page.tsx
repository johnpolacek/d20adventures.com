import Link from "next/link"
import { LedgerShell } from "@/components/layout/ledger-page"
import { PostBody } from "@/components/updates/post-body"
import type { Update } from "@/lib/updates"
import { renderPost } from "@/lib/updates"

/** A page whose words are a markdown file in `content/` (`readPage`), set like a post on /updates. `back` links to the page above it. */
export function MarkdownPage({ page, back }: { page: Update; back?: { href: string; label: string } }) {
  const { html } = renderPost(page)
  return (
    <LedgerShell>
      <div className="up-layout">
        <article className="up-main">
          <header className="up-title-block">
            {back && (
              <Link className="up-back" href={back.href}>
                <span aria-hidden="true">←</span> {back.label}
              </Link>
            )}
            <h1>{page.title}</h1>
            {page.description && <p className="up-dek">{page.description}</p>}
          </header>
          <PostBody className="up-prose" html={html} />
        </article>
      </div>
    </LedgerShell>
  )
}
