"use client"

import { usePathname } from "next/navigation"
import { ViewTransition, type ReactNode } from "react"

/** The page under the header. On a navigation the old page fades out and the new one rises in (the `page` rules in globals.css). */
export function PageTransition({ children }: { children: ReactNode }) {
  const path = usePathname()
  return (
    <ViewTransition key={path} enter="page" exit="page" default="none">
      {children}
    </ViewTransition>
  )
}
