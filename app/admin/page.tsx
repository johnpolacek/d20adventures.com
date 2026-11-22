import type { Metadata } from "next"
import Link from "next/link"
import type { CSSProperties, ReactNode } from "react"
import { clerkClient } from "@clerk/nextjs/server"
import { getAllAdventuresAdmin } from "@/app/_actions/admin/get-all-adventures"
import { listQueue } from "@/lib/content-queue/store"
import { listFeedback } from "@/lib/feedback/store"
import { listAdminWikiAdventures } from "@/lib/wiki-adventures/admin-authoring"
import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { Heading } from "@d20/ui/typography/heading"
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

type Tone = "blue" | "green" | "gold" | "red" | "plain"
const tones: Record<Tone, string> = {
  blue: "bg-sky-400/10 text-sky-300",
  green: "bg-emerald-400/10 text-emerald-300",
  gold: "bg-amber-400/10 text-amber-300",
  red: "bg-red-400/10 text-red-300",
  plain: "bg-white/5 text-white/60",
}
function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs", tones[tone])}>{children}</span>
}

function Panel({ title, href, action, i, className, children }: { title: string; href?: string; action?: string; i: number; className?: string; children: ReactNode }) {
  return (
    <section className={cn("enter-rise overflow-hidden rounded-xl border border-white/10 bg-black/40", className)} style={{ "--i": i } as CSSProperties}>
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {href && (
          <Link href={href} className="text-sm text-primary-300 transition-colors hover:text-primary-200">
            {action ?? "View All"}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function Stat({ label, value, sub, href, i, children }: { label: string; value: string | number; sub?: ReactNode; href: string; i: number; children?: ReactNode }) {
  return (
    <Link href={href} className="enter-rise rounded-xl border border-white/10 bg-black/40 px-5 py-4 transition-colors hover:border-white/25" style={{ "--i": i } as CSSProperties}>
      <p className="text-sm text-white/60">{label}</p>
      <p className="mt-1.5 mb-1 font-mono text-3xl text-white">{value}</p>
      {sub && <p className="text-xs text-white/45">{sub}</p>}
      {children}
    </Link>
  )
}

const Empty = ({ children }: { children: ReactNode }) => <p className="px-5 py-6 text-sm text-white/45">{children}</p>
const Unavailable = () => <Empty>Unavailable</Empty>

const statusTone = { active: "blue", completed: "green", waitingForPlayers: "plain" } as const
const statusLabel = { active: "Active", completed: "Completed", waitingForPlayers: "Waiting" } as const
const th = "px-5 pt-3 pb-2 text-left text-xs font-medium text-white/40"
const td = "border-t border-white/10 px-5 py-2.5"

export default async function AdminPage() {
  const { isAdmin, requiresSetup } = await requireAdmin()

  if (requiresSetup) {
    return (
      <div className="container max-w-2xl py-8 md:py-12">
        <AdminConfigMessage />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="container py-8 md:py-12">
        <div className="mx-auto max-w-2xl text-center">
          <Heading variant="h1" className="mb-4">
            Access Denied
          </Heading>
          <p className="text-white/60 text-balance mb-8">You don&apos;t have permission to access this page. Please contact an administrator if you believe this is an error.</p>
        </div>
      </div>
    )
  }

  const local = process.env.NODE_ENV === "development"
  const [budget, plans, games, feedback, users] = await Promise.all([
    budgetToday().catch(() => null),
    safe(listAdminWikiAdventures),
    safe(getAllAdventuresAdmin),
    safe(() => listFeedback()),
    safe(userStats),
  ])

  const now = Date.now()
  const titles = new Map(plans?.map((plan) => [plan.planId, plan.title]))
  const titleOf = (planId: string) => titles.get(planId) ?? planId
  const thisWeek = games?.filter((game) => game.startedAt > now - 7 * DAY).length ?? 0
  const lastWeek = games?.filter((game) => game.startedAt > now - 14 * DAY && game.startedAt <= now - 7 * DAY).length ?? 0
  const notes = [...(feedback ?? [])].sort((a, b) => b.createdAt - a.createdAt)
  const rated = notes.filter((row) => row.rating !== undefined)
  const average = rated.length ? (rated.reduce((sum, row) => sum + (row.rating ?? 0), 0) / rated.length).toFixed(1) : "–"
  const plays = new Map<string, number>()
  for (const game of games ?? []) plays.set(game.planId, (plays.get(game.planId) ?? 0) + 1)

  const today = new Date().toISOString().slice(0, 10)
  const queue = local
    ? listQueue()
        .flatMap((item) => Object.entries(item.schedule).map(([platform, day]) => ({ item, platform, day })))
        .filter(({ day, item, platform }) => day >= today && !item.posted[platform])
        .sort((a, b) => a.day.localeCompare(b.day))
        .slice(0, 4)
    : []
  const weekday = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", day: "numeric" })

  return (
    <div className="px-4 py-8 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <Heading variant="h3">Overview</Heading>
          <p className="text-sm text-white/45">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "America/Chicago" })}</p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat
            i={0}
            href="/admin/adventures"
            label="Games This Week"
            value={games ? thisWeek : "–"}
            sub={games && (thisWeek >= lastWeek ? <><span className="text-emerald-300">+{thisWeek - lastWeek}</span> vs last week</> : <><span className="text-red-300">{thisWeek - lastWeek}</span> vs last week</>)}
          />
          <Stat i={1} href="/admin/users" label="Players" value={users?.count ?? "–"} sub={users && <><span className="text-emerald-300">+{users.week}</span> this week</>} />
          <Stat i={2} href="/admin/feedback" label="Avg Rating" value={feedback ? average : "–"} sub={feedback && `from ${rated.length} ratings`} />
          <Stat i={3} href="#budget" label="AI Spend Today" value={budget ? `$${budget.usd.toFixed(2)}` : "–"}>
            {budget && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full bg-primary-400" style={{ width: `${budget.limit > 0 ? Math.min(100, (budget.usd / budget.limit) * 100) : 100}%` }} />
              </div>
            )}
          </Stat>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Panel i={4} title="Recent Games" href="/admin/adventures">
            {!games ? (
              <Unavailable />
            ) : games.length === 0 ? (
              <Empty>No games yet</Empty>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>Adventure</th>
                    <th className={th}>Players</th>
                    <th className={th}>Status</th>
                    <th className={cn(th, "text-right")}>Started</th>
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
                          <td className={td}>{titleOf(game.planId)}</td>
                          <td className={cn(td, "text-white/70")}>
                            {people}
                            {ai > 0 && <span className="text-white/40"> + {ai} AI</span>}
                          </td>
                          <td className={td}>
                            <Pill tone={statusTone[status]}>{statusLabel[status]}</Pill>
                          </td>
                          <td className={cn(td, "text-right font-mono text-white/70")}>{ago(game.startedAt)}</td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            )}
          </Panel>

          <div className="grid content-start gap-4">
            <Panel i={5} title="Latest Feedback" href="/admin/feedback">
              {!feedback ? (
                <Unavailable />
              ) : notes.length === 0 ? (
                <Empty>No feedback yet</Empty>
              ) : (
                <ul>
                  {notes.slice(0, 3).map((note) => (
                    <li key={note.id} className="border-t border-white/10 px-5 py-3 first:border-t-0">
                      <p className="text-xs text-white/45">
                        {note.rating !== undefined && <span className="mr-1.5 tracking-wider text-amber-300">{"★".repeat(note.rating) + "☆".repeat(Math.max(0, 5 - note.rating))}</span>}
                        {note.context.plan ? titleOf(note.context.plan) : note.kind === "ending" ? "Ending" : "General"} · {ago(note.createdAt)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-sm text-white/85">{note.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <section id="budget" className="enter-rise scroll-mt-20 rounded-xl border border-white/10 bg-black/40" style={{ "--i": 6 } as CSSProperties}>
              <div className="flex items-baseline justify-between border-b border-white/10 px-5 py-3.5">
                <h2 className="text-sm font-semibold">AI Budget</h2>
                <span className="text-xs uppercase tracking-wider text-white/40">Today</span>
              </div>
              <div className="px-5 py-4">{budget ? <AiBudget usd={budget.usd} calls={budget.calls} limit={budget.limit} /> : <p className="text-sm text-white/45">Unavailable</p>}</div>
            </section>
          </div>

          <Panel i={7} title="Adventure Plans" href="/admin/adventure-plans" className={local ? undefined : "lg:col-span-2"}>
            {!plans ? (
              <Unavailable />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className={th}>Adventure</th>
                    <th className={cn(th, "text-right")}>Encounters</th>
                    <th className={cn(th, "text-right")}>Plays</th>
                    <th className={th}>Health</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => (
                    <tr key={plan.planId}>
                      <td className={td}>
                        <Link href={`/admin/adventure-plans/${plan.settingId}/${plan.planId}`} className="hover:text-primary-200">
                          {plan.title}
                        </Link>
                      </td>
                      <td className={cn(td, "text-right font-mono text-white/70")}>{plan.encounterCount}</td>
                      <td className={cn(td, "text-right font-mono text-white/70")}>{games ? (plays.get(plan.planId) ?? 0) : "–"}</td>
                      <td className={td}>
                        {plan.errorCount > 0 ? (
                          <Pill tone="red">{plan.errorCount === 1 ? "1 Error" : `${plan.errorCount} Errors`}</Pill>
                        ) : plan.warningCount > 0 ? (
                          <Pill tone="gold">{plan.warningCount === 1 ? "1 Warning" : `${plan.warningCount} Warnings`}</Pill>
                        ) : (
                          <Pill tone="green">Clean</Pill>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {local && (
            <Panel i={8} title="Content Queue" href="/admin/content" action="Open Queue">
              {queue.length === 0 ? (
                <Empty>Nothing scheduled</Empty>
              ) : (
                <ul>
                  {queue.map(({ item, platform, day }) => (
                    <li key={`${item.slug}-${platform}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 border-t border-white/10 px-5 py-2.5 text-sm first:border-t-0">
                      <span className="font-mono text-white/60">{weekday(day)}</span>
                      <span className="min-w-0">
                        <span className="block">{platform}</span>
                        <span className="block truncate text-xs text-white/45">{item.title}</span>
                      </span>
                      <Pill tone={item.status === "scheduled" ? "green" : item.status === "draft" ? "gold" : "plain"}>{item.status[0].toUpperCase() + item.status.slice(1)}</Pill>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
