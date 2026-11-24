import type { Metadata } from "next"
import { AboutTitle } from "@/components/about/about-title"
import { MarkdownPage } from "@/components/layout/markdown-page"
import { readPage } from "@/lib/updates"
import { served } from "@/lib/served"
import { share } from "@/lib/share"

// The words are in content/about.md.
const page = () => readPage("about.md")

export async function generateMetadata(): Promise<Metadata> {
  const { title, description, image } = await page()
  const picture = image ? { url: served(image), width: 1920, height: 1076, alt: "The Realm of Myr, a river town and its cathedral at sunrise" } : undefined
  return share({ title, cardTitle: `${title} D20 Adventures`, path: "/about", description, image: picture })
}

export default async function AboutPage() {
  const p = await page()
  return <MarkdownPage page={p} head={<AboutTitle title={p.title} />} />
}
