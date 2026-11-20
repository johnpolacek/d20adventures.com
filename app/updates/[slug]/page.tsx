import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import Image from "@d20/ui/native-image"
import { textShadowSpreadLight } from "@d20/ui/typography/styles"
import { UpdatesBackdrop } from "@/components/updates/updates-backdrop"
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
    <article className="relative isolate min-h-screen">
      <UpdatesBackdrop />
      <header className="relative flex min-h-[34rem] items-end overflow-hidden pt-28 sm:min-h-[40rem]">
        {post.image && <Image className="object-cover fade-in" fill={true} src={post.image} alt="" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/10 to-black" />
        <div className="container relative pb-10">
          <div className="mx-auto max-w-3xl">
            <Link href="/updates" className="font-display text-sm tracking-[0.2em] uppercase text-amber-200/80 hover:text-amber-200">
              Updates
            </Link>
            <h1 className="mt-3 font-display text-4xl sm:text-6xl leading-tight text-blue-50" style={textShadowSpreadLight}>
              {post.title}
            </h1>
            <time className="mt-4 block font-display text-sm tracking-[0.2em] uppercase text-amber-300/90" style={textShadowSpreadLight}>
              {formatPostDate(post.date)}
            </time>
          </div>
        </div>
      </header>
      <div className="container pb-24">
        <div className="mx-auto max-w-3xl">
          <div className="stage-rule mb-10 h-1.5 w-full" />
          <div className="update-body prose prose-invert prose-lg max-w-none prose-a:text-amber-200 prose-a:decoration-amber-200/40 hover:prose-a:decoration-amber-200 prose-li:marker:text-amber-300/70 prose-img:rounded-lg" dangerouslySetInnerHTML={{ __html: renderPost(post) }} />
        </div>
      </div>
    </article>
  )
}
