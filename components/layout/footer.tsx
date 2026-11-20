"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { siteConfig } from "@/lib/config"

const FOOTERLESS_EDITOR_PREFIXES = ["/admin/adventure-plans/", "/admin/wiki-adventures/"]

export default function SiteFooter({ currentYear }: { currentYear: number }) {
  const pathname = usePathname()

  if (FOOTERLESS_EDITOR_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null
  }

  const overlay = pathname === "/"

  return (
    <footer className={overlay ? "absolute inset-x-0 bottom-0 z-20 bg-black/50 py-6" : "relative z-10 border-t border-white/20 bg-black/50 py-6"}>
      <div className="container px-4 md:px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left text-sm">
          <p>
            © {currentYear} {siteConfig.title}. All rights reserved.
          </p>
          <nav className="flex gap-4">
            <Link href="/updates" className="hover:underline underline-offset-4">
              Updates
            </Link>
            <Link href="/terms" className="hover:underline underline-offset-4">
              Terms
            </Link>
            <Link href="/privacy" className="hover:underline underline-offset-4">
              Privacy
            </Link>
            <Link href="/licenses" className="hover:underline underline-offset-4">
              Licenses
            </Link>
            <Link href="/contact" className="hover:underline underline-offset-4">
              Contact
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
