import type { User } from "@clerk/nextjs/server"
import { clerkClient } from "@clerk/nextjs/server"
import { AdminUserList } from "@/components/admin/user-list"
import { LedgerHead } from "@/components/layout/ledger-page"
import { requireAdmin } from "@/lib/auth-utils"

async function getInitialUsers() {
  const client = await clerkClient()
  const { data: users } = await client.users.getUserList()
  const adminUserIds = process.env.ADMIN_USER_IDS?.split(",") || []

  return users.map((user: User) => ({
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress,
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    imageUrl: user.imageUrl,
    createdAt: new Date(user.createdAt).toLocaleDateString(),
    isAdmin: adminUserIds.includes(user.id),
    banned: user.banned,
    publicMetadata: user.publicMetadata,
  }))
}

export default async function AdminUsersPage() {
  // Check if the user is an admin
  await requireAdmin()

  // Fetch initial users data
  const initialUsers = await getInitialUsers()

  return (
    <>
      <LedgerHead title="Players" subtitle={`${initialUsers.length} signed up`} />
      <AdminUserList initialUsers={initialUsers} />
    </>
  )
}
