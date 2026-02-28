import { expect, test } from "@playwright/test"

const protectedAdventureEndpoints = ["/api/adventure/testadventure123", "/api/adventure/chat/testadventure123", "/api/adventure/stream/testadventure123"]

for (const endpoint of protectedAdventureEndpoints) {
  test(`GET ${endpoint} returns 401 when signed out`, async ({ request }) => {
    const response = await request.get(endpoint)
    expect(response.status()).toBe(401)
  })
}
