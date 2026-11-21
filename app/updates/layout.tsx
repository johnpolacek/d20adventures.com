import type { ReactNode } from "react"
import { ReadingShell } from "@/components/layout/reading-page"

/** The Updates pages are for reading, so they wear the reading look. */
export default function UpdatesLayout({ children }: { children: ReactNode }) {
  return <ReadingShell>{children}</ReadingShell>
}
