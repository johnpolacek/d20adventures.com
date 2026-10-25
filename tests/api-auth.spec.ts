import { expect, test } from "@playwright/test"

const protectedApiEndpoints = [
  "/api/adventure/testadventure123",
  "/api/adventure/chat/testadventure123",
  "/api/adventure/stream/testadventure123",
  "/api/user-characters?userId=test-user",
  "/api/user/active-adventure",
]

for (const endpoint of protectedApiEndpoints) {
  test(`GET ${endpoint} returns 401 when signed out`, async ({ request }) => {
    const response = await request.get(endpoint)
    expect(response.status()).toBe(401)
  })
}

test("token initialization requires authentication", async ({ request }) => {
  const response = await request.post("/api/user/tokens")
  expect(response.status()).toBe(401)
  expect(response.headers()["cache-control"]).toBe("private, no-store")
  expect(await response.json()).toMatchObject({ error: "USER_NOT_AUTHENTICATED" })
})
