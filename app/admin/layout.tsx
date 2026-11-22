import type { ReactNode } from "react"
import { AdminSidebar } from "@/components/admin/admin-sidebar"
import { requireAdmin } from "@/lib/auth-utils"

// Admin pages start below the fixed header, and sit on dark stone: the buried texture multiplied into a deep ink, with a vignette pulling in from the edges.
// Admins get the section sidebar beside every page. Each page still checks access itself.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { isAdmin } = await requireAdmin()
  return (
    <div className="relative isolate min-h-dvh pt-14">
      <div aria-hidden className="tex-buried pointer-events-none fixed inset-0 -z-10 bg-[#24212e] bg-[length:350px] bg-blend-multiply" />
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_at_50%_0%,rgb(59_48_110/0.25),transparent_60%),radial-gradient(ellipse_at_center,transparent_40%,rgb(0_0_0/0.7))]" />
      {isAdmin ? (
        <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
          <AdminSidebar local={process.env.NODE_ENV === "development"} />
          <div className="min-w-0">{children}</div>
        </div>
      ) : (
        children
      )}
    </div>
  )
}
