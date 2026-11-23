import type { Metadata } from "next"
import Link from "next/link"
import type { ReactNode } from "react"
import { clerkClient } from "@clerk/nextjs/server"
import { getAllAdventuresAdmin } from "@/app/_actions/admin/get-all-adventures"
import { listQueue } from "@/lib/content-queue/store"
import { listFeedback } from "@/lib/feedback/store"
import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { LedgerHead } from "@/components/layout/ledger-page"
import { requireAdmin } from "@/lib/auth-utils"
import { AiBudget } from "@/components/admin/ai-budget"
import { budgetToday } from "@/lib/gm-server/budget"
import { cn } from "@d20/ui/utils"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "D20 Admin Dashboard",
}

const DAY = 86_400_000

const ago = (ms: number) => {
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 60) return `${Math.max(minutes, 1)}m`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.round(hours / 24)}d`
}

// An adventure's name from its id, as the-road-to-kordavos reads The Road to Kordavos.
const SMALL = new Set(["a", "an", "and", "of", "the", "to", "in", "on"])
const titleOf = (planId: string) =>
  planId
    .split("-")
    .map((word, i) => (i > 0 && SMALL.has(word) ? word : word[0].toUpperCase() + word.slice(1)))
    .join(" ")

const safe = <T,>(work: () => Promise<T>) =>
  work().catch((error) => {
    console.error("[admin] dashboard data failed", error)
    return null
  })

async function userStats() {
  const client = await clerkClient()
  const [count, newest] = await Promise.all([client.users.getCount(), client.users.getUserList({ orderBy: "-created_at", limit: 50 })])
  return { count, week: newest.data.filter((u) => u.createdAt > Date.now() - 7 * DAY).length }
}

type Tone = "accent" | "good" | "warn" | "plain"
function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cn("up-pill", tone !== "plain" && `is-${tone}`)}>{children}</span>
}

function Panel({ title, href, action, id, className, children }: { title: string; href?: string; action?: string; id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn("up-panel scroll-mt-20", className)}>
      <div className="up-panel-head">
        <h2>{title}</h2>
        {href && <Link href={href}>{action ?? "View All"}</Link>}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value, sub, href, children }: { label: string; value: string | number; sub?: ReactNode; href: string; children?: ReactNode }) {
  return (
    <Link href={href} className="up-stat">
      <p className="up-label">{label}</p>
      <p className="up-stat-value">{value}</p>
      {sub && <p className="up-stat-sub">{sub}</p>}
      {children}
    </Link>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="up-empty">{children}</p>
const Unavailable = () => <Empty>Unavailable</Empty>

const statusTone = { active: "accent", completed: "good", waitingForPlayers: "plain" } as const
const statusLabel = { active: "Active", completed: "Completed", waitingForPlayers: "Waiting" } as const

export default async function AdminPage() {
  const { isAdmin, requiresSetup } = await requireAdmin()

  if (requiresSetup) {
    return (
      <div className="max-w-2xl py-12">
        <AdminConfigMessage />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="up-main py-16">
        <LedgerHead title="Access Denied" />
        <p className="up-prose">You don&apos;t have permission to access this page. Please contact an administrator if you believe this is an error.</p>
      </div>
    )
  }

  const local = process.env.NODE_ENV === "development"
  const [budget, games, feedback, users] = await Promise.all([
    budgetToday().catch(() => null),
    safe(getAllAdventuresAdmin),
    safe(() => listFeedback()),
    safe(userStats),
  ])

  const now = Date.now()
  const thisWeek = games?.filter((game) => game.startedAt > now - 7 * DAY).length ?? 0
  const lastWeek = games?.filter((game) => game.startedAt > now - 14 * DAY && game.startedAt <= now - 7 * DAY).length ?? 0
  const notes = [...(feedback ?? [])].sort((a, b) => b.createdAt - a.createdAt)
  const rated = notes.filter((row) => row.rating !== undefined)
  const average = rated.length ? (rated.reduce((sum, row) => sum + (row.rating ?? 0), 0) / rated.length).toFixed(1) : "–"
  // Open items first by how far along they are, then by their rank in the queue, each with its next unposted day.
  const today = new Date().toISOString().slice(0, 10)
  const stage = { scheduled: 0, draft: 1, idea: 2 } as const
  const queue = local
    ? listQueue()
        .filter((item) => item.status in stage)
        .map((item) => ({
          item,
          next: Object.entries(item.schedule)
            .filter(([platform, day]) => day >= today && !item.posted[platform])
            .sort((a, b) => a[1].localeCompare(b[1]))[0],
        }))
        .sort((a, b) => stage[a.item.status as keyof typeof stage] - stage[b.item.status as keyof typeof stage] || a.item.rank - b.item.rank)
    : []
  const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric" })

  return (
    <>
      <LedgerHead title="Overview" subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" })} />

      <div className="up-stats">
        <Stat
          href="/admin/adventures"
          label="Games This Week"
          value={games ? thisWeek : "–"}
          sub={games && (thisWeek >= lastWeek ? <><span className="up-good">+{thisWeek - lastWeek}</span> vs last week</> : <><span className="up-bad">{thisWeek - lastWeek}</span> vs last week</>)}
        />
        <Stat href="/admin/users" label="Players" value={users?.count ?? "–"} sub={users && <><span className="up-good">+{users.week}</span> this week</>} />
        <Stat href="/admin/feedback" label="Avg Rating" value={feedback ? average : "–"} sub={feedback && `from ${rated.length} ratings`} />
        <Stat href="#budget" label="AI Spend Today" value={budget ? `$${budget.usd.toFixed(2)}` : "–"}>
          {budget && (
            <div className="up-meter">
              <div style={{ width: `${budget.limit > 0 ? Math.min(100, (budget.usd / budget.limit) * 100) : 100}%` }} />
            </div>
          )}
        </Stat>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {local && (
          <Panel title="Content Queue" href="/admin/content" action="Open Queue" className="lg:order-1">
            {queue.length === 0 ? (
              <Empty>Nothing in the queue</Empty>
            ) : (
              <ul className="up-list">
                {queue.slice(0, 8).map(({ item, next }) => (
                  <li key={item.slug}>
                    <Link href="/admin/content">
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <span className="up-small font-mono">{next ? `${next[0]} ${weekday(next[1])}` : ""}</span>
                      <Pill tone={item.status === "scheduled" ? "good" : item.status === "draft" ? "warn" : "plain"}>{item.status[0].toUpperCase() + item.status.slice(1)}</Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
        <div className="grid content-start gap-4 lg:order-2">
          <Panel title="Latest Feedback" href="/admin/feedback">
            {!feedback ? (
              <Unavailable />
            ) : notes.length === 0 ? (
              <Empty>No feedback yet</Empty>
            ) : (
              <ul className="up-list">
                {notes.slice(0, 3).map((note) => (
                  <li key={note.id}>
                    <div className="!block">
                      <p className="up-small">
                        {note.rating !== undefined && <span className="mr-1.5 tracking-wider" style={{ color: "var(--up-warn)" }}>{"★".repeat(note.rating) + "☆".repeat(Math.max(0, 5 - note.rating))}</span>}
                        {note.context.plan ? titleOf(note.context.plan) : note.kind === "ending" ? "Ending" : "General"} · {ago(note.createdAt)}
                      </p>
                      <p className="mt-1 line-clamp-2">{note.message}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id="budget" title="AI Budget Today">
            <div className="up-panel-body">{budget ? <AiBudget usd={budget.usd} calls={budget.calls} limit={budget.limit} /> : <p className="up-small">Unavailable</p>}</div>
          </Panel>
        </div>

        <Panel title="Recent Games" href="/admin/adventures" className={local ? "lg:order-3 lg:col-span-2" : "lg:order-1"}>
          {!games ? (
            <Unavailable />
          ) : games.length === 0 ? (
            <Empty>No games yet</Empty>
          ) : (
            <div className="up-table">
              <table>
                <thead>
                  <tr>
                    <th>Adventure</th>
                    <th>Players</th>
                    <th>Status</th>
                    <th align="right">Started</th>
                  </tr>
                </thead>
                <tbody>
                  {[...games]
                    .sort((a, b) => b.startedAt - a.startedAt)
                    .slice(0, 6)
                    .map((game) => {
                      const ai = (game.players ?? []).filter((p) => p.controlledBy === "ai").length
                      const people = (game.players ?? []).length - ai
                      const status = game.status ?? "active"
                      return (
                        <tr key={game._id}>
                          <td>{titleOf(game.planId)}</td>
                          <td>
                            {people}
                            {ai > 0 && <span className="up-small"> + {ai} AI</span>}
                          </td>
                          <td>
                            <Pill tone={statusTone[status]}>{statusLabel[status]}</Pill>
                          </td>
                          <td align="right">{ago(game.startedAt)}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  )
}
