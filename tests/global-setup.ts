const REQUIRED_ENV_VARS = [
  "NEXT_PUBLIC_CONVEX_URL",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  "CLERK_SECRET_KEY",
  "TEST_USER_EMAIL",
  "TEST_USER_PASSWORD",
  "TEST_USER_ID",
  "ADMIN_USER_IDS",
] as const

function requireEnv(name: (typeof REQUIRED_ENV_VARS)[number]): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable for Playwright tests: ${name}`)
  }
  return value
}

export default async function globalSetup() {
  const missing = REQUIRED_ENV_VARS.filter((name) => !process.env[name]?.trim())
  if (missing.length > 0) {
    throw new Error(`Missing required Playwright environment variables: ${missing.join(", ")}`)
  }

  const testUserId = requireEnv("TEST_USER_ID")
  const adminUserIds = requireEnv("ADMIN_USER_IDS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)

  if (!adminUserIds.includes(testUserId)) {
    throw new Error("ADMIN_USER_IDS must include TEST_USER_ID for admin auth smoke tests.")
  }
}
