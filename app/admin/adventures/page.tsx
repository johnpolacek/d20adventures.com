import { getAllAdventuresAdmin } from "@/app/_actions/admin/get-all-adventures"
import { AdminBreadcrumb } from "@/components/nav/admin-breadcrumb"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { Doc } from "@/convex/_generated/dataModel"
import { clerkClient } from "@clerk/nextjs/server"
import type { User } from "@clerk/nextjs/server"
import { Button } from "@/components/ui/button"

export default async function AdminAdventuresPage() {
  const adventures: Doc<"adventures">[] = await getAllAdventuresAdmin()

  // Get unique ownerIds
  const ownerIds = Array.from(new Set(adventures.map((a) => a.ownerId)))
  // Get unique player userIds
  const playerIds = Array.from(new Set(adventures.flatMap((a) => (a.players || []).map((p) => p.userId))))
  const allUserIds = Array.from(new Set([...ownerIds, ...playerIds]))

  // Fetch user info for each owner and player
  const client = await clerkClient()
  const { data: users } = await client.users.getUserList({ userId: allUserIds })
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
            <TableHead>Email</TableHead>
            <TableHead>Players</TableHead>
            <TableHead>Created At</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {adventures.map((adventure) => {
            const user = userMap.get(adventure.ownerId)
            const players = (adventure.players || []).map((p) => {
              const playerUser = userMap.get(p.userId)
              return {
                userId: p.userId,
                name: playerUser ? `${playerUser.firstName} ${playerUser.lastName}` : "Unknown",
                email: playerUser ? playerUser.emailAddresses[0]?.emailAddress : "Unknown",
              }
            })
            return (
              <TableRow key={adventure._id}>
                <TableCell>{adventure._id}</TableCell>
                <TableCell>{adventure.title}</TableCell>
                <TableCell>{adventure.ownerId}</TableCell>
                <TableCell>{user ? user.firstName + " " + user.lastName : "Unknown"}</TableCell>
                <TableCell>{user ? user.emailAddresses[0]?.emailAddress : "Unknown"}</TableCell>
                <TableCell>
                  {players.length === 0 ? (
                    <span className="text-muted-foreground">No players</span>
                  ) : (
                    <ul className="space-y-1">
                      {players.map((p) => (
                        <li key={p.userId} className="text-xs">
                          <span className="font-mono">{p.userId}</span>
                          <br />
                          <span>{p.name}</span>
                          <br />
                          <span className="text-muted-foreground">{p.email}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
                <TableCell>{new Date(adventure.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <a href={`/settings/${adventure.settingId}/${adventure.planId}/${adventure._id}`} target="_blank" rel="noopener noreferrer">
                    <Button className="text-xs" variant="outline" size="sm">
                      View
                    </Button>
                  </a>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
