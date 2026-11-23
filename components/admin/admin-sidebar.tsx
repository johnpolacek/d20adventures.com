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
    <nav aria-label="Admin">
      {groups(local).map((group, i) => [
        group.label && (
          <p key={`label-${i}`} className="up-label">
            {group.label}
          </p>
        ),
        ...group.items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isOn(href) ? "page" : undefined}>
            <Icon />
            {label}
          </Link>
        )),
      ])}
    </nav>
  )
}
