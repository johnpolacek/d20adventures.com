"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { siteConfig } from "@/lib/config"

const link = "hover:underline underline-offset-4 transition-opacity duration-150 active:opacity-60"
const FOOTERLESS = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/")

export default function SiteFooter({ currentYear }: { currentYear: number }) {
  const pathname = usePathname()

  if (FOOTERLESS(pathname)) {
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
            <Link href="/updates" className={link}>
              Updates
            </Link>
            <Link href="/terms" className={link}>
              Terms
            </Link>
            <Link href="/privacy" className={link}>
              Privacy
            </Link>
            <Link href="/licenses" className={link}>
              Licenses
            </Link>
            <Link href="/contact" className={link}>
              Contact
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  )
}
