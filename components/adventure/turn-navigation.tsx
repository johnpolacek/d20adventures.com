"use client"

import { useParams } from "next/navigation"
import { ChevronFirst, ChevronLast } from "lucide-react"
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext, PaginationEllipsis } from "@/components/ui/pagination"

interface TurnNavigationProps {
  currentTurnOrder: number
  totalTurns: number
  isLatestTurn: boolean
}

export default function TurnNavigation({ currentTurnOrder, totalTurns, isLatestTurn }: TurnNavigationProps) {
  const params = useParams()
  const { settingId, adventurePlanId, adventureId } = params

  const basePath = `/${settingId}/${adventurePlanId}/${adventureId}`

  // currentTurnOrder is already the 1-based pagination number from URL
  const currentPaginationNumber = currentTurnOrder
  const hasPrevious = currentPaginationNumber > 1
  const hasNext = currentPaginationNumber < totalTurns
  const isFirstTurn = currentPaginationNumber === 1

  // Generate turn numbers to show (current +/- 2) - using 1-based pagination numbers
  const generateTurnNumbers = () => {
    const numbers = []
    const start = Math.max(1, currentPaginationNumber - 2)
    const end = Math.min(totalTurns, currentPaginationNumber + 2)

    // Add first turn if not in range
    if (start > 1) {
      numbers.push(1)
      if (start > 2) {
        numbers.push("ellipsis")
      }
    }

    // Add range around current turn
    for (let i = start; i <= end; i++) {
      numbers.push(i)
    }

    // Add last turn if not in range
    if (end < totalTurns) {
      if (end < totalTurns - 1) {
        numbers.push("ellipsis")
      }
      numbers.push(totalTurns)
    }

    return numbers
  }

  const turnNumbers = generateTurnNumbers()

  return (
    <div className="flex flex-col items-center gap-2 scale-90">
      <Pagination>
        <PaginationContent>
          {/* First Turn Button */}
          <PaginationItem>
            {!isFirstTurn ? (
              <PaginationLink href={`${basePath}/1`} aria-label="Go to first turn" className="gap-1 px-1.5">
                <ChevronFirst className="h-4 w-4" />
              </PaginationLink>
            ) : (
              <PaginationLink aria-label="Go to first turn" className="gap-1 px-1.5 pointer-events-none opacity-50">
                <ChevronFirst className="h-4 w-4" />
              </PaginationLink>
            )}
          </PaginationItem>

          {/* Previous Button */}
          <PaginationItem className="flex items-center justify-center px-0">
            {hasPrevious ? <PaginationPrevious href={`${basePath}/${currentPaginationNumber - 1}`} /> : <PaginationPrevious className="pointer-events-none opacity-50 px-0" />}
          </PaginationItem>

          {/* Turn Numbers */}
          {turnNumbers.map((turn, index) => (
            <PaginationItem key={index}>
              {turn === "ellipsis" ? (
                <PaginationEllipsis />
              ) : (
                <PaginationLink href={`${basePath}/${turn}`} isActive={turn === currentPaginationNumber}>
                  {turn}
                </PaginationLink>
              )}
            </PaginationItem>
          ))}

          {/* Next Button */}
          <PaginationItem>{hasNext ? <PaginationNext href={`${basePath}/${currentPaginationNumber + 1}`} /> : <PaginationNext className="pointer-events-none opacity-50" />}</PaginationItem>

          {/* Latest Turn Button */}
          <PaginationItem>
            {!isLatestTurn ? (
              <PaginationLink href={basePath} aria-label="Go to latest turn" className="gap-1 px-1.5">
                <ChevronLast className="h-4 w-4" />
              </PaginationLink>
            ) : (
              <PaginationLink aria-label="Go to latest turn" className="gap-1 px-1.5 pointer-events-none opacity-50">
                <ChevronLast className="h-4 w-4" />
              </PaginationLink>
            )}
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
