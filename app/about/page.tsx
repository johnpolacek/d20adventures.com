import type { Metadata } from "next"
import { LedgerShell } from "@/components/layout/ledger-page"
import { PostBody } from "@/components/updates/post-body"
import { readPage, renderPost } from "@/lib/updates"

// The words are in content/about.md, set like a post on /updates.
const page = () => readPage("about.md")

export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = await page()
  return { title: `${title} | D20 Adventures`, description }
}

export default async function AboutPage() {
  const about = await page()
  const { html } = renderPost(about)
  return (
    <LedgerShell>
      <div className="up-layout">
        <article className="up-main">
          <header className="up-title-block">
            <h1>{about.title}</h1>
            {about.description && <p className="up-dek">{about.description}</p>}
          </header>
          <PostBody className="up-prose" html={html} />
        </article>
      </div>
    </LedgerShell>
  )
}
