import { LedgerShell } from "@/components/layout/ledger-page"
import { PostBody } from "@/components/updates/post-body"
import type { Update } from "@/lib/updates"
import { renderPost } from "@/lib/updates"

/** A page whose words are a markdown file in `content/` (`readPage`), set like a post on /updates. */
export function MarkdownPage({ page }: { page: Update }) {
  const { html } = renderPost(page)
  return (
    <LedgerShell>
      <div className="up-layout">
        <article className="up-main">
          <header className="up-title-block">
            <h1>{page.title}</h1>
            {page.description && <p className="up-dek">{page.description}</p>}
          </header>
          <PostBody className="up-prose" html={html} />
        </article>
      </div>
    </LedgerShell>
  )
}
