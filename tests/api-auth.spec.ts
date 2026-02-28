import { expect, test } from "@playwright/test"

const protectedApiEndpoints = [
  "/api/adventure/testadventure123",
  "/api/adventure/chat/testadventure123",
  "/api/adventure/stream/testadventure123",
  "/api/user-characters?userId=test-user",
]

for (const endpoint of protectedApiEndpoints) {
  test(`GET ${endpoint} returns 401 when signed out`, async ({ request }) => {
    const response = await request.get(endpoint)
    expect(response.status()).toBe(401)
  })
}
