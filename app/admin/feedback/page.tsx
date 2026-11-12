import type { Metadata } from "next"
import { AdminBreadcrumb } from "@/components/nav/admin-breadcrumb"
import { requireAdmin } from "@/lib/auth-utils"
import { clerkClient } from "@/lib/clerk"
import { listFeedback } from "@/lib/feedback/store"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Feedback" }

export default async function AdminFeedbackPage() {
  const { isAdmin } = await requireAdmin()
  if (!isAdmin) return <div className="container py-8">Access Denied</div>

  const rows = await listFeedback()
  const users = await clerkClient.users.getUserList({ userId: [...new Set(rows.map((row) => row.userId))], limit: 100 }).catch(() => null)
  const names = new Map(users?.data.map((user) => [user.id, user.primaryEmailAddress?.emailAddress ?? user.username ?? user.id]))

  return (
    <div className="container py-8">
      <AdminBreadcrumb items={[{ label: "Feedback" }]} />
      <h1 className="mb-6 text-4xl font-bold">Feedback</h1>
      {rows.length === 0 && <p className="text-muted-foreground">None yet.</p>}
      <ul className="grid gap-4">
        {rows.map((row) => (
          <li key={row.id} className="rounded-lg border border-white/15 bg-white/5 p-4 font-sans">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-white/60">
              <span>{new Date(row.createdAt).toLocaleString("en-US", { timeZone: "America/Chicago" })}</span>
              <span>{names.get(row.userId) ?? row.userId}</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 uppercase">{row.source}</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 uppercase">{row.kind}</span>
              {row.rating !== undefined && <span className="text-amber-300">{row.rating} / 5</span>}
            </div>
            {row.message && <p className="mt-3 whitespace-pre-wrap">{row.message}</p>}
            {row.bestMoment && (
              <p className="mt-3 whitespace-pre-wrap">
                <span className="text-white/60">Best Moment: </span>
                {row.bestMoment}
              </p>
            )}
            {row.broke && (
              <p className="mt-3 whitespace-pre-wrap">
                <span className="text-white/60">What Broke: </span>
                {row.broke}
              </p>
            )}
            {row.screenshotUrls.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {row.screenshotUrls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                    {/* biome-ignore lint/performance/noImgElement: a private file behind a link that expires */}
                    <img src={url} alt="Screenshot" className="h-28 rounded border border-white/15 object-cover" />
                  </a>
                ))}
              </div>
            )}
            <dl className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
              {Object.entries(row.context)
                .filter(([, value]) => value)
                .map(([key, value]) => (
                  <div key={key} className="flex gap-1">
                    <dt>{key}:</dt>
                    <dd className="text-white/75">{value}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  )
}
