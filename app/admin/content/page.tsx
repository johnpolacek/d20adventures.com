import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { AdminBreadcrumb } from "@/components/nav/admin-breadcrumb"
import { requireAdmin } from "@/lib/auth-utils"
import { listQueue } from "@/lib/content-queue/store"
import { getPosts } from "@/lib/updates"
import { QueueBoard } from "./queue-board"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "Content Queue" }

export default async function AdminContentPage() {
  // The queue is files on this machine, synced to the private bucket, so it only exists locally.
  if (process.env.NODE_ENV !== "development") notFound()
  const { isAdmin } = await requireAdmin()
  if (!isAdmin) return <div className="container py-8">Access Denied</div>

  return (
    <div className="container max-w-7xl py-8">
      <AdminBreadcrumb items={[{ label: "Content Queue" }]} />
      <QueueBoard items={listQueue()} posts={(await getPosts()).map((p) => ({ slug: p.slug, title: p.title, date: p.date, draft: p.draft }))} />
    </div>
  )
}
