import { clerk } from "@clerk/testing/playwright"
import { expect, type Request, test } from "@playwright/test"
import { signInAsTestUser } from "./utils/auth"

const activeAdventure = {
  id: "homepage-test-adventure",
  title: "Homepage Test Campaign",
  adventurePlanId: "the-midnight-summons",
  settingId: "realm-of-myr",
  runType: "campaign",
  party: [],
  turns: [],
  startedAt: "2026-09-15T00:00:00.000Z",
}

test("anonymous homepage renders the public hero without personalized requests", async ({ page }) => {
  const personalizedRequests: string[] = []
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/user/")) personalizedRequests.push(request.url())
  })
  const response = await page.goto("/")
  expect(response?.headers()["x-clerk-auth-status"]).toBeUndefined()
  await expect(page.getByRole("button", { name: "Sign In", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Quick Start" })).toBeVisible()
  await expect(page.locator("#active-adventure-card")).toHaveCount(0)
  expect(personalizedRequests).toEqual([])
})

test("signed-in welcome loads through the API and disappears after sign-out", async ({ page }) => {
  const homepagePosts: Request[] = []
  page.on("request", (request) => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/") homepagePosts.push(request)
  })
  await page.route("**/api/user/active-adventure", (route) => route.fulfill({ json: { userId: process.env.TEST_USER_ID, activeAdventure } }))
  const tokenResponse = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/user/tokens")
  await signInAsTestUser(page)
  await expect(page.getByRole("heading", { name: "Welcome Back" })).toBeVisible()
  await expect(page.getByRole("heading", { name: activeAdventure.title })).toBeVisible()
  await expect(page.getByRole("link", { name: "Continue" })).toHaveAttribute("href", "/settings/realm-of-myr/the-midnight-summons/homepage-test-adventure")
  await expect(page.getByRole("link", { name: "Your Player Page" })).toHaveAttribute("href", /^\/player(?:\/[^/]+)?$/)
  const tokens = await tokenResponse
  expect(tokens.status()).toBe(200)
  expect(tokens.request().method()).toBe("POST")
  expect(tokens.request().headers()["next-action"]).toBeUndefined()
  await expect(page.locator("#tokenCount")).toBeVisible()
  // Clerk invalidates its router cache on sign-in using a cookie-only Server Action.
  // It needs no auth() or middleware. Application data must use /api instead.
  for (const request of homepagePosts) {
    const response = await request.response()
    expect(response?.status()).toBe(200)
    expect((await response?.allHeaders())?.["set-cookie"]).toContain("__clerk_invalidate_cache_cookie_")
  }

  // Even a signed-in document request must return the same public HTML.
  const document = await page.request.get("/")
  expect(document.headers()["x-clerk-auth-status"]).toBeUndefined()
  expect(await document.text()).not.toContain(activeAdventure.title)

  await clerk.signOut({ page })
  await expect(page.getByRole("link", { name: "Quick Start" })).toBeVisible()
  await expect(page.locator("#active-adventure-card")).toHaveCount(0)
})

test("personalized API reads derive identity from the signed-in session", async ({ page }) => {
  await signInAsTestUser(page)
  const response = await page.request.get("/api/user/active-adventure?userId=another-user")
  expect(response.status()).toBe(200)
  expect(response.headers()["cache-control"]).toBe("private, no-store")
  expect(await response.json()).toMatchObject({ userId: process.env.TEST_USER_ID })

  const tokens = await page.request.post("/api/user/tokens")
  expect(tokens.status()).toBe(200)
  expect(tokens.headers()["cache-control"]).toBe("private, no-store")
  expect(await tokens.json()).toMatchObject({ tokensRemaining: expect.any(Number), error: null })
})

for (const scenario of ["empty", "failed", "different-user"] as const) {
  test(`homepage keeps the public hero for a ${scenario} adventure response`, async ({ page }) => {
    await page.route("**/api/user/active-adventure", (route) =>
      route.fulfill({
        status: scenario === "failed" ? 500 : 200,
        json: { userId: scenario === "different-user" ? "another-user" : process.env.TEST_USER_ID, activeAdventure: scenario === "empty" ? null : activeAdventure },
      })
    )
    const response = page.waitForResponse((result) => new URL(result.url()).pathname === "/api/user/active-adventure")
    await signInAsTestUser(page)
    await response
    await expect(page.locator("#tokenCount")).toBeVisible()
    await expect(page.getByRole("link", { name: "Quick Start" })).toBeVisible()
    await expect(page.locator("#active-adventure-card")).toHaveCount(0)
  })
}
