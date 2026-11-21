"use client"

import { ChevronLastIcon } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import type { ComponentProps } from "react"
import {
  Pagination,
  PaginationEllipsis,
  PaginationFirst,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
  paginationLinkClass,
} from "@d20/ui/pagination"
import { cn } from "@/lib/utils"

// A page link through the Next router. A step at its end has no href, so it stays a plain anchor.
function routerLink(props: ComponentProps<"a">) {
  return props.href ? <Link {...props} href={props.href} /> : <a {...props} />
}

interface TurnNavigationProps {
  currentTurnOrder: number
  totalTurns: number
  isLatestTurn: boolean
}

export default function TurnNavigation({ currentTurnOrder, totalTurns, isLatestTurn }: TurnNavigationProps) {
  const { settingId, adventurePlanId, adventureId } = useParams()
  const basePath = `/settings/${settingId}/${adventurePlanId}/${adventureId}`

  if (totalTurns <= 1) return null

  return (
    <div className="flex flex-col items-center gap-2 scale-90">
      <Pagination aria-label="Turns" pageCount={totalTurns} page={currentTurnOrder} siblings={2} getHref={(turn) => `${basePath}/${turn}`}>
        <PaginationList>
          {({ items }) => (
            <>
              <PaginationItem>
                <PaginationFirst aria-label="Go to first turn" render={routerLink} />
              </PaginationItem>
              <PaginationItem>
                <PaginationPrevious aria-label="Go to previous turn" render={routerLink} />
              </PaginationItem>
              {items.map((item) => (
                <PaginationItem key={item}>{typeof item === "number" ? <PaginationLink page={item} render={routerLink} /> : <PaginationEllipsis />}</PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext aria-label="Go to next turn" render={routerLink} />
              </PaginationItem>
              {/* The latest turn lives at the adventure's own path, not at a turn number. */}
              <PaginationItem>
                <Link href={basePath} aria-label="Go to latest turn" aria-disabled={isLatestTurn || undefined} tabIndex={isLatestTurn ? -1 : undefined} className={cn(paginationLinkClass, "size-8 [&_svg]:size-5")}>
                  <ChevronLastIcon />
                </Link>
              </PaginationItem>
            </>
          )}
        </PaginationList>
      </Pagination>
    </div>
  )
}
