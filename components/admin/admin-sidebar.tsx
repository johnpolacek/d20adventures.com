"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { BoxesIcon, ClipboardListIcon, Gamepad2Icon, HomeIcon, InboxIcon, MessageSquareIcon, UsersIcon, type LucideIcon } from "lucide-react"

type Item = { href: string; label: string; icon: LucideIcon }
type Group = { label?: string; items: Item[] }

// The content queue is files on this machine, so its link shows only in development.
const groups = (local: boolean): Group[] => [
  {
    items: [
      { href: "/admin", label: "Overview", icon: HomeIcon },
      ...(local ? [{ href: "/admin/content", label: "Content Queue", icon: InboxIcon }] : []),
    ],
  },
  {
    label: "Play",
    items: [
      { href: "/admin/adventures", label: "Games", icon: Gamepad2Icon },
      { href: "/admin/users", label: "Players", icon: UsersIcon },
      { href: "/admin/feedback", label: "Feedback", icon: MessageSquareIcon },
    ],
  },
  {
    label: "Build",
    items: [
      { href: "/admin/adventure-plans", label: "Adventure Plans", icon: ClipboardListIcon },
      { href: "/settings/realm-of-myr/assets", label: "Asset Library", icon: BoxesIcon },
    ],
  },
]

export function AdminSidebar({ local }: { local: boolean }) {
  const pathname = usePathname()
  const isOn = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href))

  return (
    <nav aria-label="Admin" className="flex gap-1 overflow-x-auto border-b border-white/10 px-4 py-2 lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)] lg:flex-col lg:gap-0.5 lg:overflow-visible lg:border-r lg:border-b-0 lg:px-3 lg:py-6">
      {groups(local).map((group, i) => (
        <div key={i} className="contents lg:block">
          {group.label && <p className="mt-5 mb-1.5 hidden px-2.5 text-3xs uppercase tracking-wider text-white/40 lg:block">{group.label}</p>}
          {group.items.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={isOn(href) ? "page" : undefined}
              className="flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-sm text-white/60 transition-colors duration-150 hover:bg-white/5 hover:text-white aria-[current=page]:bg-white/10 aria-[current=page]:text-white"
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </div>
      ))}
    </nav>
  )
}
