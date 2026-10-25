// Native test-only IPC helper. Never run this from a terminal that records stdout.
// The single-use ticket exists only in memory between the helper, Rust, and Clerk.
import { readFileSync } from "node:fs"
import { createClerkClient } from "@clerk/backend"
import { parse } from "dotenv"

try {
  const root = new URL("../../../", import.meta.url)
  const env = {}
  for (const file of [".env", ".env.local"]) {
    try {
      Object.assign(env, parse(readFileSync(new URL(file, root))))
    } catch {}
  }
  if (!env.CLERK_SECRET_KEY?.startsWith("sk_test_") || !env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith("pk_test_") || !env.TEST_USER_EMAIL) throw new Error("Test configuration unavailable")
  const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY })
  const users = await clerk.users.getUserList({ emailAddress: [env.TEST_USER_EMAIL], limit: 2 })
  if (users.data.length !== 1) throw new Error("Test account not found")
  const token = await clerk.signInTokens.createSignInToken({ userId: users.data[0].id, expiresInSeconds: 60 })
  process.stdout.write(JSON.stringify({ ticket: token.token }))
} catch {
  process.exitCode = 1
}
