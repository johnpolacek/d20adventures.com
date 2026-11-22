import type { Metadata } from "next"
import Link from "next/link"
import type { CSSProperties } from "react"
import { clerkClient } from "@clerk/nextjs/server"
import { ChevronRightIcon, ClipboardListIcon, Gamepad2Icon, InboxIcon, MessageSquareIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { getAllAdventuresAdmin } from "@/app/_actions/admin/get-all-adventures"
import { listQueue } from "@/lib/content-queue/store"
import { listFeedback } from "@/lib/feedback/store"
import { listAdminWikiAdventures } from "@/lib/wiki-adventures/admin-authoring"
import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { Heading } from "@d20/ui/typography/heading"
import { Card } from "@d20/ui/card"
import { requireAdmin } from "@/lib/auth-utils"
import { AiBudget } from "@/components/admin/ai-budget"
import { budgetToday } from "@/lib/gm-server/budget"

export const dynamic = "force-dynamic"
export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "D20 Admin Dashboard",
}

type Stat = { label: string; value: string | number }
type Section = { href: string; title: string; icon: LucideIcon; value: string | number | null; unit: string; stats: Stat[] }

const ago = (ms: number) => {
  const minutes = Math.round((Date.now() - ms) / 60000)
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const safe = <T,>(work: () => Promise<T>) => work().catch((error) => {
  console.error("[admin] dashboard stat failed", error)
  return null
})

async function userStats() {
  const client = await clerkClient()
  const [count, newest] = await Promise.all([client.users.getCount(), client.users.getUserList({ orderBy: "-created_at", limit: 50 })])
  const week = Date.now() - 7 * 86_400_000
  return { count, week: newest.data.filter((u) => u.createdAt > week).length, latest: newest.data[0]?.createdAt }
}

async function loadSections(local: boolean): Promise<Section[]> {
  const [plans, games, feedback, users] = await Promise.all([
    safe(listAdminWikiAdventures),
    safe(getAllAdventuresAdmin),
    safe(() => listFeedback()),
    safe(userStats),
  ])
  const rated = feedback?.filter((row) => row.rating !== undefined) ?? []
  const average = rated.length ? (rated.reduce((sum, row) => sum + (row.rating ?? 0), 0) / rated.length).toFixed(1) : "None"
  const latestFeedback = feedback?.reduce((max, row) => Math.max(max, row.createdAt), 0)

  const sections: Section[] = [
    {
      href: "/admin/adventure-plans",
      title: "Adventure Plans",
      icon: ClipboardListIcon,
      value: plans?.length ?? null,
      unit: "adventures",
      stats: plans
        ? [
            { label: "Encounters", value: plans.reduce((sum, plan) => sum + plan.encounterCount, 0) },
            { label: "Errors", value: plans.reduce((sum, plan) => sum + plan.errorCount, 0) },
            { label: "Warnings", value: plans.reduce((sum, plan) => sum + plan.warningCount, 0) },
          ]
        : [],
    },
    {
      href: "/admin/adventures",
      title: "Games",
      icon: Gamepad2Icon,
      value: games?.length ?? null,
      unit: "played",
      stats: games
        ? [
            { label: "Active", value: games.filter((game) => game.status === "active").length },
            { label: "Completed", value: games.filter((game) => game.status === "completed").length },
            { label: "Latest", value: games.length ? ago(Math.max(...games.map((game) => game.startedAt))) : "None" },
          ]
        : [],
    },
    {
      href: "/admin/feedback",
      title: "Feedback",
      icon: MessageSquareIcon,
      value: feedback?.length ?? null,
      unit: "notes",
      stats: feedback
        ? [
            { label: "Avg Rating", value: average },
            { label: "Endings", value: feedback.filter((row) => row.kind === "ending").length },
            { label: "Latest", value: latestFeedback ? ago(latestFeedback) : "None" },
          ]
        : [],
    },
    {
      href: "/admin/users",
      title: "Users",
      icon: UsersIcon,
      value: users?.count ?? null,
      unit: "accounts",
      stats: users
        ? [
            { label: "This Week", value: users.week },
            { label: "Newest", value: users.latest ? ago(users.latest) : "None" },
          ]
        : [],
    },
  ]

  // The content queue is files on this machine, so it only opens in development.
  if (local) {
    const queue = listQueue()
    const today = new Date().toISOString().slice(0, 10)
    const next = queue
      .flatMap((item) => Object.values(item.schedule))
      .filter((day) => day >= today)
      .sort()[0]
    sections.push({
      href: "/admin/content",
      title: "Content Queue",
      icon: InboxIcon,
      value: queue.filter((item) => item.status !== "posted" && item.status !== "shelved").length,
      unit: "open",
      stats: [
        { label: "Scheduled", value: queue.filter((item) => item.status === "scheduled").length },
        { label: "Posted", value: queue.filter((item) => item.status === "posted").length },
        { label: "Next", value: next ? next.slice(5) : "None" },
      ],
    })
  }
  return sections
}

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

  const [budget, sections] = await Promise.all([budgetToday().catch(() => null), loadSections(process.env.NODE_ENV === "development")])

  return (
    <div className="container py-8 md:py-12">
      <div className="mx-auto max-w-5xl">
        <Heading variant="h3" className="mb-8">
          Admin
        </Heading>
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <nav aria-label="Admin Sections" className="grid content-start gap-4 sm:grid-cols-2">
            {sections.map((section, i) => {
              const Icon = section.icon
              return (
                <Card key={section.href} className="enter-rise gap-4 px-5 py-5" style={{ "--i": i } as CSSProperties}>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/70 ring-1 ring-white/10">
                      <Icon className="size-4.5" />
                    </span>
                    <h2 className="font-display text-lg font-bold leading-tight">{section.title}</h2>
                  </div>
                  <p className="font-mono text-3xl text-white">
                    {section.value ?? "–"}
                    <span className="ml-2 text-sm text-white/50">{section.value === null ? "Unavailable" : section.unit}</span>
                  </p>
                  {section.stats.length > 0 && (
                    <dl className="grid grid-cols-3 gap-2 border-t border-white/10 pt-3">
                      {section.stats.map((stat) => (
                        <div key={stat.label} className="min-w-0">
                          <dt className="text-3xs uppercase tracking-wider text-white/40">{stat.label}</dt>
                          <dd className="truncate font-mono text-sm text-white/85">{stat.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <Link
                    href={section.href}
                    className="group -mx-2 mt-auto flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-primary-300 transition-[background-color,color,scale] duration-150 ease-snap hover:bg-white/5 hover:text-primary-200 active:scale-[0.98]"
                  >
                    Open {section.title}
                    <ChevronRightIcon className="size-4 transition-[translate] duration-150 group-hover:translate-x-0.5" />
                  </Link>
                </Card>
              )
            })}
          </nav>
          <Card className="enter-rise gap-4 self-start px-5 py-5" style={{ "--i": sections.length } as CSSProperties}>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-lg font-bold">AI Budget</h2>
              <span className="text-xs uppercase tracking-wider text-white/40">Today</span>
            </div>
            {budget ? <AiBudget usd={budget.usd} calls={budget.calls} limit={budget.limit} /> : <p className="text-sm text-white/60">Unavailable</p>}
          </Card>
        </div>
      </div>
    </div>
  )
}
