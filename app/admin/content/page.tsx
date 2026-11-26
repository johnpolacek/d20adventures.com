import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { LedgerHead } from "@/components/layout/ledger-page"
import { requireAdmin } from "@/lib/auth-utils"
import { listQueue } from "@/lib/content-queue/store"
import { QueueBoard } from "./queue-board"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Content Queue" }

export default async function AdminContentPage() {
  // The queue is files on this machine, synced to the private bucket, so it only exists locally.
  if (process.env.NODE_ENV !== "development") notFound()
  const { isAdmin } = await requireAdmin()
  if (!isAdmin) return <LedgerHead title="Access Denied" />

  return (
    <>
      <LedgerHead title="Content Queue" subtitle="Ideas and drafts, and what has been posted" />
      <QueueBoard items={listQueue()} />
    </>
  )
}
