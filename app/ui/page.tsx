import type { Metadata } from "next"
import { Showcase } from "./showcase"
// The Updates pages' reading look, shown in its own box on the Reading tile.
import "../updates/updates.css"

export const metadata: Metadata = {
  title: "UI | D20 Adventures",
  robots: { index: false, follow: false },
}

export default function UIPage() {
  return <Showcase />
}
