import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import Image from "@d20/ui/native-image"
import { PlainPage, plainCard, plainProse } from "@/components/layout/plain-page"
import { PostBody } from "@/components/updates/post-body"
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
    <PlainPage
      title={post.title}
      subtitle={
        <>
          <Link href="/updates" className="hover:text-amber-100">
            Updates
          </Link>
          <span className="mx-3 text-amber-200/60">·</span>
          <time>{formatPostDate(post.date)}</time>
        </>
      }
      card={false}
      width="max-w-3xl lg:max-w-4xl xl:max-w-5xl"
    >
      <div className={`overflow-hidden ${plainCard}`}>
        {post.image && (
          <div className="relative aspect-video">
            <Image className="object-cover fade-in" fill={true} src={post.image} alt="" />
          </div>
        )}
        <PostBody className={`update-body p-6 sm:p-10 lg:px-14 prose-lg prose-img:rounded-lg ${plainProse}`} html={renderPost(post)} />
        <div className="flex justify-end border-t border-amber-200/15 px-6 py-4 sm:px-10 lg:px-14">
          <a href={`/updates/${post.slug}/markdown`} download className="font-display text-sm text-amber-200/80 hover:text-amber-200">
            Download as Markdown
          </a>
        </div>
      </div>
    </PlainPage>
  )
}
