import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Heading } from "@d20/ui/typography/heading"
import { formatPostDate, getPost, getPosts, renderPost } from "@/lib/updates"

export const dynamicParams = false

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
    <article className="container pt-24 pb-12">
      <div className="mx-auto max-w-2xl">
        <Link href="/updates" className="text-sm opacity-60 hover:underline underline-offset-4">
          Updates
        </Link>
        <Heading variant="h2" as="h1" className="mt-4">
          {post.title}
        </Heading>
        <time className="mt-2 block text-sm opacity-60">{formatPostDate(post.date)}</time>
        <div className="prose prose-invert prose-lg mt-10 max-w-none prose-img:rounded-lg" dangerouslySetInnerHTML={{ __html: renderPost(post) }} />
      </div>
    </article>
  )
}
