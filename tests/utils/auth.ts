import { clerk, clerkSetup } from "@clerk/testing/playwright"
import type { Page } from "@playwright/test"

function requireEnv(name: "TEST_USER_EMAIL" | "TEST_USER_PASSWORD"): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable for auth tests: ${name}`)
  }
  return value
}

const TEST_USER_EMAIL = requireEnv("TEST_USER_EMAIL")
const TEST_USER_PASSWORD = requireEnv("TEST_USER_PASSWORD")

export async function signInAsTestUser(page: Page): Promise<void> {
  await clerkSetup()
  await page.goto("/")

  await clerk.signIn({
    page,
    signInParams: {
      strategy: "password",
      identifier: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    },
  })
}
