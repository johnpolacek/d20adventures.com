import type { ReactNode } from "react"
import { JetBrains_Mono } from "next/font/google"
import "./updates.css"

// Prompts are long, so they are set in a plain mono, not the site's display mono.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-update-mono", weight: ["400", "500"], display: "swap" })

/** The Updates pages are for reading: quiet parchment in place of the site's dark stage, in a light and a dark look. */
export default function UpdatesLayout({ children }: { children: ReactNode }) {
  return <div className={`updates-page ${mono.variable}`}>{children}</div>
}
