import type { Metadata } from "next"
import { Showcase } from "./showcase"
// Ledger, the look of the pages that are read, shown in its own box on the Ledger tile.
import "../updates/updates.css"

export const metadata: Metadata = {
  title: "UI | D20 Adventures",
  robots: { index: false, follow: false },
}

export default function UIPage() {
  return <Showcase />
}
