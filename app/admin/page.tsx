import { Metadata } from "next"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { requireAdmin } from "@/lib/auth-utils"
import { AdminConfigMessage } from "@/components/admin/admin-config-message"
import { Heading } from "@/components/typography/heading"

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
          <p className="text-muted-foreground text-balance mb-8">You don&apos;t have permission to access this page. Please contact an administrator if you believe this is an error.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container py-8 md:py-24">
      <div className="mx-auto max-w-6xl">
        <Heading variant="h3" className="mb-8 text-center text-amber-400">
          Admin Dashboard
        </Heading>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Users</CardTitle>
              <CardDescription>Manage user accounts</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">View user information and manage admin access.</p>
            </CardContent>
            <CardFooter>
              <Link href="/admin/users" className="w-full">
                <Button variant="outline">Manage Users</Button>
              </Link>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Mailing List</CardTitle>
              <CardDescription>Manage subscribers</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">View and manage newsletter subscribers and preferences.</p>
            </CardContent>
            <CardFooter>
              <Link href="/admin/mailing-list" className="w-full">
                <Button variant="outline">Manage Subscribers</Button>
              </Link>
            </CardFooter>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Adventures</CardTitle>
              <CardDescription>Manage adventures</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">View and manage adventure information.</p>
            </CardContent>
            <CardFooter>
              <Link href="/admin/adventures" className="w-full">
                <Button variant="outline">Manage Adventures</Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}
