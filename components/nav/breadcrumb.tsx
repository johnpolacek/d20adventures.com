import { ChevronRight } from "lucide-react"
import Link from "next/link"

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  homeHref?: string
  homeLabel?: string
}

export function Breadcrumb({ items, homeHref = "/", homeLabel = "Home" }: BreadcrumbProps) {
  return (
    <nav className="flex items-center text-sm text-white/60">
      <Link href={homeHref} className="hover:text-white transition-colors">
        {homeLabel}
      </Link>
      {items.map((item, index) => (
        <div key={item.label} className="flex items-center">
          <ChevronRight className="h-4 w-4 mx-1" />
          {index === items.length - 1 ? (
            <span className="text-white font-medium">{item.label}</span>
          ) : (
            <Link href={item.href!} className="hover:text-white transition-colors">
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  )
}
