import { expect, test } from "@playwright/test"
import { signInAsTestUser } from "./utils/auth"

test("signed-out users cannot access the admin dashboard", async ({ page }) => {
  await page.goto("/admin")
  await expect(page.getByRole("heading", { name: "Access Denied" })).toBeVisible()
})

test("signed-in admin can access the admin dashboard", async ({ page }) => {
  await signInAsTestUser(page)
  await page.goto("/admin")
  await expect(page.getByRole("heading", { name: "Admin Dashboard" })).toBeVisible()
})

test("signed-in admin returns isAdmin=true from check-admin API", async ({ page }) => {
  await signInAsTestUser(page)

  const response = await page.request.get("/api/check-admin")
  expect(response.ok()).toBeTruthy()

  const body = (await response.json()) as { isAdmin?: boolean }
  expect(body.isAdmin).toBe(true)
})
