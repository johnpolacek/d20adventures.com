import type { Metadata } from "next"
import { MarkdownPage } from "@/components/layout/markdown-page"
import { readPage } from "@/lib/updates"

// The words are in content/about.md.
const page = () => readPage("about.md")

export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = await page()
  return { title: `${title} | D20 Adventures`, description }
}

export default async function AboutPage() {
  return <MarkdownPage page={await page()} />
}
