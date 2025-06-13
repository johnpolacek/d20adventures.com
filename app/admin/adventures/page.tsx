import { getAllAdventuresAdmin } from "@/app/_actions/admin/get-all-adventures"
import { AdminBreadcrumb } from "@/components/nav/admin-breadcrumb"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Doc } from "@/convex/_generated/dataModel"
import { clerkClient } from "@clerk/nextjs/server"
import type { User } from "@clerk/nextjs/server"

export default async function AdminAdventuresPage() {
  const adventures: Doc<"adventures">[] = await getAllAdventuresAdmin()

  // Get unique ownerIds
  const ownerIds = Array.from(new Set(adventures.map((a) => a.ownerId)))

  // Fetch user info for each ownerId
  const client = await clerkClient()
  const { data: users } = await client.users.getUserList({ userId: ownerIds })
  const userMap = new Map(users.map((user: User) => [user.id, user]))

  return (
    <div className="container py-8">
      <AdminBreadcrumb items={[{ label: "Adventures" }]} />
      <div className="mb-8">
        <h1 className="text-4xl font-bold font-display text-amber-400">Adventures</h1>
        <p className="font-mono text-primary-300">Manage and view adventure information</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Adventure ID</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Owner ID</TableHead>
            <TableHead>Owner Name</TableHead>
            <TableHead>Owner Email</TableHead>
            <TableHead>Created At</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adventures.map((adventure) => {
            const user = userMap.get(adventure.ownerId)
            return (
              <TableRow key={adventure._id}>
                <TableCell>{adventure._id}</TableCell>
                <TableCell>{adventure.title}</TableCell>
                <TableCell>{adventure.ownerId}</TableCell>
                <TableCell>{user ? user.firstName + " " + user.lastName : "Unknown"}</TableCell>
                <TableCell>{user ? user.emailAddresses[0]?.emailAddress : "Unknown"}</TableCell>
                <TableCell>{new Date(adventure.createdAt).toLocaleDateString()}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
