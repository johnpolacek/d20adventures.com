import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { PlainPage, plainProse } from "@/components/layout/plain-page"
import { PostBody } from "@/components/updates/post-body"
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
    openGraph: { title: post.title, description: post.description, type: "article", publishedTime: post.date, images },
    twitter: { card: "summary_large_image", title: post.title, description: post.description, images: post.image ? [post.image] : undefined },
  }
}

export default async function UpdatePage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug)
  if (!post) notFound()
  return (
    <PlainPage card={false} width="max-w-3xl lg:max-w-4xl xl:max-w-5xl">
      <div className="overflow-hidden rounded-lg border border-accent-200/20 bg-black/90 shadow-float">
        <header className="px-6 pt-10 sm:px-10 lg:px-14 lg:pt-14">
          <Link href="/updates" className="font-display text-sm tracking-[0.2em] uppercase text-accent-200/80 transition-[color,opacity] duration-150 hover:text-accent-200 active:opacity-70">
            Updates
          </Link>
          <h1 className="mt-3 font-display text-4xl leading-tight text-blue-50 sm:text-5xl">{post.title}</h1>
          <time className="mt-3 block font-display text-sm tracking-[0.2em] uppercase text-accent-300/90">{formatPostDate(post.date)}</time>
          <div className="mt-8 h-px w-full bg-gradient-to-r from-accent-200/0 via-accent-200/45 to-accent-200/0" />
        </header>
        <PostBody className={`update-body px-6 pt-8 pb-10 sm:px-10 lg:px-14 prose-lg prose-img:rounded-lg ${plainProse}`} html={renderPost(post)} />
        <div className="flex justify-end border-t border-accent-200/15 px-6 py-4 sm:px-10 lg:px-14">
          <a href={`/updates/${post.slug}/markdown`} download className="font-display text-sm text-accent-200/80 transition-[color,opacity] duration-150 hover:text-accent-200 active:opacity-70">
            Download as Markdown
          </a>
        </div>
      </div>
    </PlainPage>
  )
}
