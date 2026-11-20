import {
  Pagination as BasePagination,
  PaginationEllipsis as BasePaginationEllipsis,
  PaginationFirst as BasePaginationFirst,
  PaginationItem as BasePaginationItem,
  PaginationLast as BasePaginationLast,
  PaginationLink as BasePaginationLink,
  PaginationList as BasePaginationList,
  PaginationNext as BasePaginationNext,
  PaginationPrevious as BasePaginationPrevious,
} from "@ui-sdk/react/pagination"
import { ChevronFirstIcon, ChevronLastIcon, ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import type { ComponentProps, ReactNode } from "react"
import { cn } from "./utils"

type WithClass<T> = Omit<T, "className"> & { className?: string }
type WithNodes<T> = Omit<T, "className" | "children"> & { className?: string; children?: ReactNode }

/** A page link or step: a small dark mono control. The current page gets a hairline border. */
export const paginationLinkClass =
  "inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-md border border-transparent px-1.5 font-mono text-sm font-bold text-white transition-all duration-700 ease-in-out select-none hover:bg-black/70 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring data-current:border-white/30 data-disabled:pointer-events-none data-disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50"

function Pagination({ className, ...props }: WithClass<ComponentProps<typeof BasePagination>>) {
  return <BasePagination className={cn("mx-auto flex w-full justify-center", className)} {...props} />
}

function PaginationList({ className, ...props }: WithClass<ComponentProps<typeof BasePaginationList>>) {
  return <BasePaginationList className={cn("flex flex-row items-center gap-1 rounded-lg bg-gradient-to-tl from-black/50 to-black/30 p-1.5", className)} {...props} />
}

function PaginationItem({ className, ...props }: WithNodes<ComponentProps<typeof BasePaginationItem>>) {
  return <BasePaginationItem className={cn("flex items-center justify-center", className)} {...props} />
}

function PaginationLink({ className, ...props }: WithClass<ComponentProps<typeof BasePaginationLink>>) {
  return <BasePaginationLink className={cn(paginationLinkClass, className)} {...props} />
}

const stepIcon = "size-6 [&_svg]:size-5"

function PaginationFirst({ className, children, ...props }: WithNodes<ComponentProps<typeof BasePaginationFirst>>) {
  return (
    <BasePaginationFirst aria-label="Go to first page" className={cn(paginationLinkClass, stepIcon, className)} {...props}>
      {children ?? <ChevronFirstIcon />}
    </BasePaginationFirst>
  )
}

function PaginationPrevious({ className, children, ...props }: WithNodes<ComponentProps<typeof BasePaginationPrevious>>) {
  return (
    <BasePaginationPrevious aria-label="Go to previous page" className={cn(paginationLinkClass, stepIcon, className)} {...props}>
      {children ?? <ChevronLeftIcon />}
    </BasePaginationPrevious>
  )
}

function PaginationNext({ className, children, ...props }: WithNodes<ComponentProps<typeof BasePaginationNext>>) {
  return (
    <BasePaginationNext aria-label="Go to next page" className={cn(paginationLinkClass, stepIcon, className)} {...props}>
      {children ?? <ChevronRightIcon />}
    </BasePaginationNext>
  )
}

function PaginationLast({ className, children, ...props }: WithNodes<ComponentProps<typeof BasePaginationLast>>) {
  return (
    <BasePaginationLast aria-label="Go to last page" className={cn(paginationLinkClass, stepIcon, className)} {...props}>
      {children ?? <ChevronLastIcon />}
    </BasePaginationLast>
  )
}

function PaginationEllipsis({ className, ...props }: WithNodes<ComponentProps<typeof BasePaginationEllipsis>>) {
  return (
    <BasePaginationEllipsis className={cn("flex size-6 items-center justify-center", className)} {...props}>
      <MoreHorizontalIcon className="size-4" />
    </BasePaginationEllipsis>
  )
}

export { Pagination, PaginationList, PaginationItem, PaginationLink, PaginationFirst, PaginationPrevious, PaginationNext, PaginationLast, PaginationEllipsis }
