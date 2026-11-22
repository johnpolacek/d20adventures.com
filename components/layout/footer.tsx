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
            <a
              href="https://github.com/johnpolacek/d20adventures.com"
              target="_blank"
              rel="noopener noreferrer"
              className={`group inline-flex items-center gap-1.5 ${link}`}
            >
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className="size-4 fill-current transition-transform duration-300 ease-out group-hover:-rotate-12 group-hover:scale-125"
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
              </svg>
              GitHub
            </a>
          </nav>
        </div>
      </div>
    </footer>
  )
}
