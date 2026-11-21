"use server"

import { revalidatePath } from "next/cache"
import { requireAdmin } from "@/lib/auth-utils"
import { listQueue, readItem, STATUSES, writeItem, writeOrder } from "@/lib/content-queue/store"
import { syncQueue } from "@/lib/content-queue/sync"

// The queue is files on this machine, so it only exists in development.
async function guard() {
  if (process.env.NODE_ENV !== "development") throw new Error("Not available")
  const { isAdmin } = await requireAdmin()
  if (!isAdmin) throw new Error("Access denied")
}

export async function saveQueueItem(input: {
  slug: string
  title: string
  status: string
  sections: { name: string; body: string }[]
  posted: Record<string, string>
}) {
  await guard()
  const item = readItem(input.slug)
  const status = (STATUSES as readonly string[]).includes(input.status) ? (input.status as (typeof STATUSES)[number]) : item.status
  // Folded and cut ideas drop out of the running order, at 90 and up. One brought back joins the end.
  const parked = status === "folded" || status === "cut"
  const lastLive = listQueue().filter((q) => q.rank < 90).reduce((m, q) => Math.max(m, q.rank), 0)
  const rank = parked && item.rank < 90 ? 90 : !parked && item.rank >= 90 ? lastLive + 1 : item.rank
  writeItem({ ...item, title: input.title.trim() || item.title, status, rank, sections: input.sections, posted: input.posted })
  revalidatePath("/admin/content")
}

export async function reorderQueue(slugs: string[]) {
  await guard()
  writeOrder(slugs)
  revalidatePath("/admin/content")
}

export async function syncContentQueue() {
  await guard()
  const summary = await syncQueue(() => {})
  revalidatePath("/admin/content")
  return summary
}
