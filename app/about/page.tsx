import type { Metadata } from "next"
import { MarkdownPage } from "@/components/layout/markdown-page"
import { readPage } from "@/lib/updates"
import { served } from "@/lib/served"

// The words are in content/about.md.
const page = () => readPage("about.md")

export async function generateMetadata(): Promise<Metadata> {
  const { title, description, image } = await page()
  const images = image ? [{ url: served(image), width: 1920, height: 1076, alt: "The Realm of Myr, a river town and its cathedral at sunrise" }] : undefined
  return {
    title: `${title} | D20 Adventures`,
    description,
    alternates: { canonical: "/about" },
    openGraph: { title: `${title} D20 Adventures`, description, url: "/about", type: "website", images },
    twitter: { card: "summary_large_image", title: `${title} D20 Adventures`, description, images: images?.map((i) => i.url) },
  }
}

export default async function AboutPage() {
  return <MarkdownPage page={await page()} />
}
