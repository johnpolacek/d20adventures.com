import type { Metadata } from "next"
import Link from "next/link"
import Image from "@d20/ui/native-image"
import { PlainPage, plainCard } from "@/components/layout/plain-page"
import { formatPostDate, getPosts } from "@/lib/updates"

export const metadata: Metadata = {
  title: "Updates | D20 Adventures",
  description: "What's new in D20 Adventures.",
  alternates: { types: { "application/rss+xml": "/updates/rss.xml" } },
}

export default async function UpdatesPage() {
  const posts = await getPosts()
  return (
    <PlainPage title="Updates" card={false}>
      <ul className="space-y-8">
        {posts.map((post) => (
          <li key={post.slug}>
            <Link href={`/updates/${post.slug}`} className={`group grid overflow-hidden transition-colors hover:border-amber-200/50 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] ${plainCard}`}>
              <div className="relative aspect-video sm:aspect-auto sm:min-h-56 bg-black">
                <Image
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  fill={true}
                  src={post.image ?? "/images/app/backgrounds/d20-hero.webp"}
                  alt=""
                />
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <time className="font-display text-sm tracking-[0.2em] uppercase text-amber-300/90">{formatPostDate(post.date)}</time>
                <h2 className="mt-2 font-display text-2xl sm:text-3xl text-blue-50 group-hover:text-white">{post.title}</h2>
                {post.description && <p className="mt-3 text-white/75">{post.description}</p>}
                <span className="mt-5 font-display text-sm text-amber-200/80 group-hover:text-amber-200">Read On</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </PlainPage>
  )
}
