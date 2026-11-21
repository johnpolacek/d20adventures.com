import type { ReactNode } from "react"
import { JetBrains_Mono } from "next/font/google"
import "@/app/updates/updates.css"

// Prompts are long, so they are set in a plain mono, not the site's display mono.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-update-mono", weight: ["400", "500"], display: "swap" })

/**
 * Puts a page in the reading look: quiet parchment in place of the site's dark stage, in a light and a dark look.
 * The site header and footer follow whatever page wears it (the `body:has(.updates-page)` rules in updates.css).
 */
export function ReadingShell({ children }: { children: ReactNode }) {
  return <div className={`updates-page ${mono.variable}`}>{children}</div>
}

/** A plain page in the reading look: its title, an optional line under it, then its content in one column. `aside` sits beside the column on a wide window. */
export function ReadingPage({ title, subtitle, aside, children }: { title: string; subtitle?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <ReadingShell>
      <div className="up-layout">
        {aside}
        <article className="up-main">
          <header className="up-title-block">
            <h1>{title}</h1>
            {subtitle && <p className="up-meta">{subtitle}</p>}
          </header>
          {children}
        </article>
      </div>
    </ReadingShell>
  )
}
