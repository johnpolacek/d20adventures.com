import type { Metadata } from "next"
import Link from "next/link"
import type { CSSProperties } from "react"
import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { Heading } from "@d20/ui/typography/heading"
import { buttonClassName, buttonStyle } from "@d20/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@d20/ui/card"
import { requireAdmin } from "@/lib/auth-utils"
import { AiBudget } from "@/components/admin/ai-budget"
import { budgetToday } from "@/lib/gm-server/budget"

export const metadata: Metadata = {
  title: "Admin Dashboard",
  description: "D20 Admin Dashboard",
}

export default async function AdminPage() {
  const { isAdmin, requiresSetup } = await requireAdmin()

  if (requiresSetup) {
    return (
      <div className="container max-w-2xl py-8 md:py-12">
        <AdminConfigMessage />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="container py-8 md:py-12">
        <div className="mx-auto max-w-2xl text-center">
          <Heading variant="h1" className="mb-4">
            Access Denied
          </Heading>
          <p className="text-white/60 text-balance mb-8">You don&apos;t have permission to access this page. Please contact an administrator if you believe this is an error.</p>
        </div>
      </div>
    )
  }

  const budget = await budgetToday().catch(() => null)

  return (
    <div className="container py-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <Heading variant="h3" className="mb-8 text-center">
          Admin Dashboard
        </Heading>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="enter-rise">
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>Manage user accounts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-white/60">View user information and manage admin access.</p>
            </CardContent>
            <CardFooter>
              <Link href="/admin/users" className={buttonClassName("outline")} style={buttonStyle("outline", undefined)}>Manage Users</Link>
            </CardFooter>
          </Card>
          <Card className="enter-rise" style={{ "--i": 1 } as CSSProperties}>
            <CardHeader>
              <CardTitle>Mailing List</CardTitle>
              <CardDescription>Manage subscribers</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-white/60">View and manage newsletter subscribers and preferences.</p>
            </CardContent>
            <CardFooter>
              <Link href="/admin/mailing-list" className={buttonClassName("outline")} style={buttonStyle("outline", undefined)}>Manage Subscribers</Link>
            </CardFooter>
          </Card>
          <Card className="enter-rise" style={{ "--i": 2 } as CSSProperties}>
            <CardHeader>
              <CardTitle>Feedback</CardTitle>
              <CardDescription>Playtest feedback</CardDescription>
            </CardHeader>
            <CardFooter>
              <Link href="/admin/feedback" className={buttonClassName("outline")} style={buttonStyle("outline", undefined)}>View Feedback</Link>
            </CardFooter>
          </Card>
          <Card className="enter-rise" style={{ "--i": 3 } as CSSProperties}>
            <CardHeader>
              <CardTitle>Adventures</CardTitle>
              <CardDescription>Manage adventures</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-white/60">View and manage adventure information.</p>
            </CardContent>
            <CardFooter>
              <Link href="/admin/adventures" className={buttonClassName("outline")} style={buttonStyle("outline", undefined)}>Manage Adventures</Link>
            </CardFooter>
          </Card>
          <Card className="enter-rise" style={{ "--i": 4 } as CSSProperties}>
            <CardHeader>
              <CardTitle>Adventure Plans</CardTitle>
              <CardDescription>Author and improve adventure plans</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-white/60">Chat with migrated adventures, edit key fields, validate source, and export restore bundles.</p>
            </CardContent>
            <CardFooter>
              <Link href="/admin/adventure-plans" className={buttonClassName("outline")} style={buttonStyle("outline", undefined)}>Open Workbench</Link>
            </CardFooter>
          </Card>
          <Card className="enter-rise" style={{ "--i": 5 } as CSSProperties}>
            <CardHeader>
              <CardTitle>AI Budget</CardTitle>
              <CardDescription>Daily limit on the site’s own AI calls</CardDescription>
            </CardHeader>
            <CardContent>{budget ? <AiBudget usd={budget.usd} calls={budget.calls} limit={budget.limit} /> : <p className="text-sm text-white/60">Unavailable</p>}</CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
