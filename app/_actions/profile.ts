"use server"

import { auth, clerkClient } from "@clerk/nextjs/server"

// A server action is a public endpoint, so the account it changes is the signed-in one, never one the browser names.
export async function setUsername(username: string) {
  const { userId } = await auth()
  if (!userId) return { success: false, error: "Sign in to set a username" }
  const name = username.trim()
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(name)) return { success: false, error: "Use 3 to 32 letters, numbers, dashes or underscores" }
  try {
    const client = await clerkClient()
    await client.users.updateUser(userId, { username: name })
    return { success: true }
  } catch (error) {
    console.error("Error setting username:", error)
    return { success: false, error: "Failed to set username" }
  }
}
