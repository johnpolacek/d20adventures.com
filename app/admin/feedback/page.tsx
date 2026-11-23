import type { Metadata } from "next"
import type { CSSProperties } from "react"
import { LedgerHead } from "@/components/layout/ledger-page"
import { requireAdmin } from "@/lib/auth-utils"
import { clerkClient } from "@/lib/clerk"
import { listFeedback } from "@/lib/feedback/store"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Feedback" }

export default async function AdminFeedbackPage() {
  const { isAdmin } = await requireAdmin()
  if (!isAdmin) return <LedgerHead title="Access Denied" />

  const rows = await listFeedback()
  const users = await clerkClient.users.getUserList({ userId: [...new Set(rows.map((row) => row.userId))], limit: 100 }).catch(() => null)
  const names = new Map(users?.data.map((user) => [user.id, user.primaryEmailAddress?.emailAddress ?? user.username ?? user.id]))

  return (
    <>
      <LedgerHead title="Feedback" subtitle={rows.length === 0 ? "None yet" : `${rows.length} ${rows.length === 1 ? "note" : "notes"}, newest first`} />
      <ul className="grid gap-4">
        {rows.map((row, index) => (
          <li key={row.id} className={`up-panel up-panel-body ${index < 40 ? "enter-rise" : ""}`} style={{ "--i": Math.min(index, 8) } as CSSProperties}>
            <div className="up-small flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{new Date(row.createdAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}</span>
              <span>{names.get(row.userId) ?? row.userId}</span>
              <span className="up-pill capitalize">{row.source}</span>
              <span className="up-pill capitalize">{row.kind}</span>
              {row.rating !== undefined && <span className="tracking-wider" style={{ color: "var(--up-warn)" }}>{"★".repeat(row.rating) + "☆".repeat(Math.max(0, 5 - row.rating))}</span>}
            </div>
            {row.message && <p className="mt-3 whitespace-pre-wrap">{row.message}</p>}
            {row.bestMoment && (
              <p className="mt-3 whitespace-pre-wrap">
                <span className="up-small">Best Moment: </span>
                {row.bestMoment}
              </p>
            )}
            {row.broke && (
              <p className="mt-3 whitespace-pre-wrap">
                <span className="up-small">What Broke: </span>
                {row.broke}
              </p>
            )}
            {row.screenshotUrls.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {row.screenshotUrls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="transition-[opacity,scale] duration-150 ease-snap hover:opacity-80 active:scale-[0.97]">
                    <img src={url} alt="Screenshot" className="h-28 rounded border object-cover" style={{ borderColor: "var(--up-line)" }} />
                  </a>
                ))}
              </div>
            )}
            <dl className="up-small mt-3 flex flex-wrap gap-x-4 gap-y-1 !text-xs">
              {Object.entries(row.context)
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <div key={key} className="flex gap-1">
                    <dt>{key}:</dt>
                    <dd style={{ color: "var(--up-muted)" }}>{value}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </>
  )
}
