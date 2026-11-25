import type { ReactNode } from "react"
import { LedgerShell } from "@/components/layout/ledger-page"
import "@/app/vision/vision.css"
import "./look.css"

/** The Updates pages are for reading, so they wear Ledger. */
export default function UpdatesLayout({ children }: { children: ReactNode }) {
  return <LedgerShell>{children}</LedgerShell>
}
