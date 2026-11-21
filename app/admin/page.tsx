import type { Metadata } from "next"
import Link from "next/link"
import type { CSSProperties } from "react"
import { BookOpenIcon, ChevronRightIcon, ClipboardListIcon, InboxIcon, MailIcon, MessageSquareIcon, UsersIcon, type LucideIcon } from "lucide-react"
import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { Heading } from "@d20/ui/typography/heading"
import { Card } from "@d20/ui/card"
import { requireAdmin } from "@/lib/auth-utils"
import { AiBudget } from "@/components/admin/ai-budget"
import { budgetToday } from "@/lib/gm-server/budget"

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "D20 Admin Dashboard",
}

type Section = { href: string; title: string; note: string; icon: LucideIcon }

const SECTIONS: Section[] = [
  { href: "/admin/adventure-plans", title: "Adventure Plans", note: "Workbench", icon: ClipboardListIcon },
  { href: "/admin/adventures", title: "Adventures", note: "Catalog", icon: BookOpenIcon },
  { href: "/admin/feedback", title: "Feedback", note: "Playtests", icon: MessageSquareIcon },
  { href: "/admin/users", title: "Users", note: "Accounts", icon: UsersIcon },
  { href: "/admin/mailing-list", title: "Mailing List", note: "Subscribers", icon: MailIcon },
]

// The content queue is files on this machine, so it only opens in development.
const LOCAL_SECTIONS: Section[] = [{ href: "/admin/content", title: "Content Queue", note: "Local", icon: InboxIcon }]

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

  const budget = await budgetToday().catch(() => null)
  const sections = process.env.NODE_ENV === "development" ? [...SECTIONS, ...LOCAL_SECTIONS] : SECTIONS

  return (
    <div className="container py-10 md:py-16">
      <div className="mx-auto max-w-5xl">
        <Heading variant="h3" className="mb-8">
          Admin
        </Heading>
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <nav aria-label="Admin Sections" className="grid gap-3 sm:grid-cols-2 content-start">
            {sections.map((section, i) => {
              const Icon = section.icon
              return (
                <Link
                  key={section.href}
                  href={section.href}
                  className="enter-rise group flex items-center gap-4 rounded-xl border border-white/15 bg-black/60 px-4 py-4 transition-[background-color,border-color,scale] duration-150 ease-snap hover:border-primary-400/60 hover:bg-black/80 active:scale-[0.98]"
                  style={{ "--i": i } as CSSProperties}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/5 text-white/70 ring-1 ring-white/10 transition-colors duration-150 group-hover:bg-primary-500/15 group-hover:text-primary-300 group-hover:ring-primary-400/40">
                    <Icon className="size-5" />
                  </span>
                  <span className="flex min-w-0 grow flex-col">
                    <span className="font-display text-lg font-bold leading-tight">{section.title}</span>
                    <span className="text-xs uppercase tracking-wider text-white/40">{section.note}</span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-white/30 transition-[color,translate] duration-150 group-hover:translate-x-0.5 group-hover:text-white/70" />
                </Link>
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
