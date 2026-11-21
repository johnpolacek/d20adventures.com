import { getPost, getPosts, postMarkdown } from "@/lib/updates"

export const dynamic = "force-static"
export const dynamicParams = false

export async function generateStaticParams() {
  return (await getPosts()).map((post) => ({ slug: post.slug }))
}

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const post = await getPost((await params).slug)
  if (!post) return new Response("Not found", { status: 404 })
  return new Response(postMarkdown(post), {
    headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${post.slug}.md"` },
  })
}
