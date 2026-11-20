import type { Metadata } from "next"
import { Showcase } from "./showcase"

export const metadata: Metadata = {
  title: "UI | D20 Adventures",
  robots: { index: false, follow: false },
}

export default function UIPage() {
  return <Showcase />
}
