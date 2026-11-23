import type { ReactNode } from "react"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { LedgerDesk } from "@/components/layout/ledger-page"
import { requireAdmin } from "@/lib/auth-utils"
import "./admin.css"

// Admin is used, not read, so it sits on Ledger's desk, light or dark as the header's switch sets it.
// Admins get the section sidebar beside every page. Each page still checks access itself.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { isAdmin } = await requireAdmin()
  return <LedgerDesk side={isAdmin ? <AdminSidebar local={process.env.NODE_ENV === "development"} /> : undefined}>{children}</LedgerDesk>
}
