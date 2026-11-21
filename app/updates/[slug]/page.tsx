import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CopyLinkButton, PostBody } from "@/components/updates/post-body"
import { PostContents } from "@/components/updates/post-contents"
import { formatPostDate, getPost, getPosts, renderPost } from "@/lib/updates"

// Rebuilt at most hourly, so a post dated today appears within the hour of midnight, Chicago time, with no deploy.
export const revalidate = 3600
export const dynamicParams = true

export async function generateStaticParams() {
  return (await getPosts()).map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const post = await getPost((await params).slug)
  if (!post) return {}
  const images = post.image ? [{ url: post.image }] : undefined
  return {
    title: `${post.title} | D20 Adventures`,
    description: post.description,
    authors: [{ name: post.author }],
    openGraph: { title: post.title, description: post.description, type: "article", publishedTime: post.date, images },
    twitter: { card: "summary_large_image", title: post.title, description: post.description, images: post.image ? [post.image] : undefined },
  }
}

export default async function UpdatePage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug)
  if (!post) notFound()
  const { html, sections, minutes } = renderPost(post)
  const markdown = `/updates/${post.slug}/markdown`
  return (
    <div className="up-layout" id="top">
      {sections.length > 1 && (
        <aside className="up-toc" aria-label="Contents">
          <nav>
            <p className="up-label">Contents</p>
            <PostContents sections={sections} />
            <div className="up-toc-foot">
              <CopyLinkButton>
                <span data-label>Copy Link</span>
              </CopyLinkButton>
              <a href={markdown} download>
                Download as Markdown
              </a>
              <a href="#top">Back to Top</a>
            </div>
          </nav>
        </aside>
      )}
      <article className="up-main">
        <header className="up-title-block">
          <Link className="up-back" href="/updates">
            <span aria-hidden="true">←</span> Updates
          </Link>
          <h1>{post.title}</h1>
          {post.description && <p className="up-dek">{post.description}</p>}
          <div className="up-meta">
            <span className="up-author">{post.author}</span>
            <time dateTime={post.date}>{formatPostDate(post.date)}</time>
            <span>{minutes} Min Read</span>
            <span className="up-meta-actions">
              <CopyLinkButton className="up-btn">
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M6.5 9.5l3-3M7 4.5l1-1a2.8 2.8 0 014 4l-1 1M9 11.5l-1 1a2.8 2.8 0 01-4-4l1-1" />
                </svg>
                <span data-label>Copy Link</span>
              </CopyLinkButton>
              <a className="up-btn" href={markdown} download>
                Markdown
              </a>
            </span>
          </div>
        </header>
        {sections.length > 1 && (
          <details className="up-toc-inline">
            <summary>Contents</summary>
            <ol>
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </details>
        )}
        <PostBody className="up-prose" html={html} />
        <footer className="up-article-foot">
          <Link href="/updates">
            <span aria-hidden="true">←</span> All Updates
          </Link>
          <a href={markdown} download>
            Download as Markdown
          </a>
        </footer>
      </article>
    </div>
  )
}
