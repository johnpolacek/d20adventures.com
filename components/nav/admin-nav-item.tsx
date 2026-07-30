"use client"

import { useUser } from "@clerk/nextjs"
import { ClipboardListIcon, ShieldCheckIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"

export function AdminNavItem() {
  const pathname = usePathname()
  const { user, isSignedIn, isLoaded } = useUser()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    // Check if the user is an admin when the component mounts or user changes
    const checkAdminStatus = async () => {
      if (!isLoaded || !isSignedIn || !user?.id) {
        setIsAdmin(false)
        return
      }

      try {
        // Fetch admin status from the server
        const response = await fetch("/api/check-admin")
        if (response.ok) {
          const data = await response.json()
          setIsAdmin(data.isAdmin)
        } else {
          setIsAdmin(false)
        }
      } catch (error) {
        console.error("Error checking admin status:", error)
        setIsAdmin(false)
      }
    }

    checkAdminStatus()
  }, [isLoaded, isSignedIn, user?.id])

  // Only render the admin link if the user is an admin
  if (!isAdmin) {
    return null
  }

  const links = [
    { href: "/admin", label: "Admin", icon: ShieldCheckIcon, isActive: pathname === "/admin" },
    { href: "/admin/adventure-plans", label: "Plans", icon: ClipboardListIcon, isActive: pathname.startsWith("/admin/adventure-plans") },
  ]

  return (
    <nav className="flex items-center gap-2 sm:gap-3" aria-label="Admin navigation">
      {links.map((item) => {
        const Icon = item.icon

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("text-xs sm:text-sm font-bold font-display transition-colors hover:text-yellow-950 flex items-center gap-1", item.isActive ? "text-yellow-950" : "text-yellow-950/70")}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
