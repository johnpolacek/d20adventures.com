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
export function LedgerShell({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={`updates-page ${mono.variable}${className ? ` ${className}` : ""}`}>{children}</div>
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

/**
 * A page on the desk: Ledger at work, for pages that are used rather than read, as Admin and the Asset Library are.
 * `side` is the column of sections down the left on a wide window, and a row along the top on a narrow one.
 */
export function LedgerDesk({ side, children }: { side?: ReactNode; children: ReactNode }) {
  return (
    <LedgerShell>
      <div className="up-desk">
        {side && <aside className="up-side">{side}</aside>}
        <div className="up-desk-main">{children}</div>
      </div>
    </LedgerShell>
  )
}

/** A desk page's head: its title, a line under it, and its actions at the right. */
export function LedgerHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="up-desk-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="up-meta">{subtitle}</p>}
      </div>
      {actions && <div>{actions}</div>}
    </header>
  )
}
