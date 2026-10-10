import type { ReactNode } from "react"
import Parchment from "@/components/graphics/background/Parchment"
import { paper } from "@/components/graphics/styles"
import { cn } from "@/lib/utils"
import type { Page } from "./pages"

const PAGES = [
  ["adventures", "Adventures"],
  ["characters", "Characters"],
  ["settings", "Settings"],
] as const

// The website's parchment header, on every screen outside play: the logo goes home, then the pages, the account and
// fullscreen. The title screen uses the large form. Without onNavigate (before the app has loaded, or at the link
// step) it shows the logo alone.
export function AppHeader(props: { page: Page | "home" | null; big?: boolean; account?: ReactNode; trailing?: ReactNode; onNavigate?: (page: Page | "home") => void }) {
  const { big, onNavigate } = props
  return (
    <header className={cn(paper.className, "relative z-10 flex w-full shrink-0 select-none items-center border-b-8 border-[rgba(0,0,0,.25)]", big ? "px-12 py-4" : "px-8")} style={paper.style}>
      <Parchment />
      <button
        type="button"
        disabled={!onNavigate}
        onClick={() => onNavigate?.("home")}
        aria-label="D20 Adventures, home"
        className="flex items-center gap-2 font-display mix-blend-multiply disabled:cursor-default"
      >
        <img className={cn("-mt-1 inline", big ? "h-[72px] w-[72px]" : "h-8 w-8")} alt="" src="/images/d20.jpg" />
        <span aria-hidden="true" className={cn("whitespace-nowrap", !big && "-ml-12 scale-[.6] font-semibold")}>
          <span className="mr-1 text-4xl text-primary-600">D20</span>
          <span className="relative -top-px text-3xl text-primary-500">A</span>
          <span className="relative -top-[3px] text-2xl text-primary-500">dventures</span>
        </span>
      </button>
      {onNavigate && (
        <nav className={cn("flex items-center gap-6", big ? "ml-6" : "-ml-6")} aria-label="Pages">
          {PAGES.map(([page, label]) => (
            <button
              key={page}
              type="button"
              aria-current={props.page === page ? "page" : undefined}
              onClick={() => onNavigate(page)}
              className={cn(
                "font-display text-sm font-bold tracking-wide transition-all duration-500 ease-in-out",
                props.page === page ? "text-primary-600 underline decoration-2 underline-offset-8" : "text-yellow-950/80 hover:text-yellow-950"
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      )}
      <div className="flex flex-1 items-center justify-end gap-4">
        {props.account}
        {props.trailing}
      </div>
    </header>
  )
}
