import type { Metadata } from "next"
import { MarkdownPage } from "@/components/layout/markdown-page"
import { readPage } from "@/lib/updates"

// The words are in content/gates.md. The six gates are pages of their own in public/stage/gates.
const page = () => readPage("gates.md")

export async function generateMetadata(): Promise<Metadata> {
  const { title, description } = await page()
  return { title: `${title} | D20 Adventures`, description }
}

export default async function GatesPage() {
  return <MarkdownPage page={await page()} back={{ href: "/about", label: "About" }} />
}
