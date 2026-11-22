import type { ReactNode } from "react"
import { JetBrains_Mono } from "next/font/google"
import "@/app/updates/updates.css"

// Prompts are long, so they are set in a plain mono, not the site's display mono.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-update-mono", weight: ["400", "500"], display: "swap" })

/**
 * Ledger is the site's look for pages that are read, not played: quiet parchment in place of the dark stage, in a
 * light and a dark look. Updates, About, Terms, Privacy, Licenses and Contact wear it, and /ui shows it.
 *
 * This puts a page in Ledger. The site header and footer follow whatever page wears it (the `body:has(.updates-page)`
 * rules in app/updates/updates.css, where its classes begin `up-`).
 */
export function LedgerShell({ children }: { children: ReactNode }) {
  return <div className={`updates-page ${mono.variable}`}>{children}</div>
}

/** A plain page in Ledger: its title, an optional line under it, then its content in one column. `aside` sits beside the column on a wide window. */
export function LedgerPage({ title, subtitle, aside, children }: { title: string; subtitle?: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <LedgerShell>
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
    </LedgerShell>
  )
}
