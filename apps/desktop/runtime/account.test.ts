import assert from "node:assert/strict"
import { test } from "node:test"
import { accountCommand } from "./account"

const SITE = "https://site.test"
type Call = { url: string; method: string; auth?: string; body?: unknown }

// A fake website: each path answers with a status and a body, and every call is recorded.
function site(routes: Record<string, [number, unknown]>) {
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>
    calls.push({ url, method: init.method ?? "GET", auth: headers.Authorization, body: init.body ? JSON.parse(String(init.body)) : undefined })
    const route = routes[url.slice(SITE.length)]
    if (!route) throw new Error("offline")
    return new Response(JSON.stringify(route[1]), { status: route[0] })
  }) as typeof fetch
  return { calls, fetchImpl }
}

const ADVENTURES = [{ id: "covert-cargo", settingId: "realm-of-myr", priceCents: 500, free: false, owned: true }]

test("status without a token is unlinked and makes no request", async () => {
  const { calls, fetchImpl } = site({})
  assert.deepEqual(await accountCommand({ kind: "accountStatus" }, SITE, fetchImpl), { account: { linked: false } })
  assert.equal(calls.length, 0)
})

test("status with a valid token returns the account and library", async () => {
  const { calls, fetchImpl } = site({ "/api/desktop/me": [200, { account: "a@b.test", device: "Mac" }], "/api/desktop/library": [200, { adventures: ADVENTURES }] })
  const res = await accountCommand({ kind: "accountStatus", token: "t".repeat(43) }, SITE, fetchImpl)
  assert.deepEqual(res, { account: { linked: true, account: "a@b.test", device: "Mac" }, adventures: ADVENTURES })
  assert.ok(calls.every((c) => c.auth === `Bearer ${"t".repeat(43)}`))
})

test("a revoked token is cleared", async () => {
  const { fetchImpl } = site({ "/api/desktop/me": [401, { error: "This computer is not linked." }] })
  assert.deepEqual(await accountCommand({ kind: "accountStatus", token: "t".repeat(43) }, SITE, fetchImpl), { account: { linked: false }, clearToken: true })
})

test("an unreachable website keeps the token", async () => {
  const { fetchImpl } = site({})
  const res = await accountCommand({ kind: "accountStatus", token: "t".repeat(43) }, SITE, fetchImpl)
  assert.deepEqual(res, { account: { linked: "offline" } })
})

test("link start returns the code and the website path to open", async () => {
  const { calls, fetchImpl } = site({
    "/api/desktop/link": [200, { userCode: "ABCD-EFGH", pollSecret: "p".repeat(43), verifyUrl: `${SITE}/desktop/link?code=ABCDEFGH`, expiresAt: 1, interval: 3 }],
  })
  const res = await accountCommand({ kind: "accountLinkStart" }, SITE, fetchImpl)
  assert.deepEqual(res.link, { status: "waiting", userCode: "ABCD-EFGH", pollSecret: "p".repeat(43), verifyPath: "/desktop/link?code=ABCDEFGH", expiresAt: 1, interval: 3 })
  assert.equal(calls[0].method, "POST")
  assert.equal(typeof (calls[0].body as { deviceName: string }).deviceName, "string")
})

test("polling stays pending until approval, then stores the token", async () => {
  const pending = site({ "/api/desktop/link/token": [200, { status: "pending" }] })
  assert.deepEqual((await accountCommand({ kind: "accountLinkPoll", pollSecret: "p".repeat(43) }, SITE, pending.fetchImpl)).link, { status: "pending" })
  const token = "n".repeat(43)
  const linked = site({
    "/api/desktop/link/token": [200, { status: "linked", token }],
    "/api/desktop/me": [200, { account: "a@b.test", device: "Mac" }],
    "/api/desktop/library": [200, { adventures: ADVENTURES }],
  })
  const res = await accountCommand({ kind: "accountLinkPoll", pollSecret: "p".repeat(43) }, SITE, linked.fetchImpl)
  assert.equal(res.storeToken, token)
  assert.deepEqual(res.account, { linked: true, account: "a@b.test", device: "Mac" })
  assert.equal(linked.calls.find((c) => c.url.endsWith("/me"))?.auth, `Bearer ${token}`)
})

test("an expired code is reported", async () => {
  const { fetchImpl } = site({ "/api/desktop/link/token": [410, { status: "expired" }] })
  assert.deepEqual((await accountCommand({ kind: "accountLinkPoll", pollSecret: "p".repeat(43) }, SITE, fetchImpl)).link, { status: "expired" })
})

test("unlink clears the token even when the website is unreachable", async () => {
  const { calls, fetchImpl } = site({})
  assert.deepEqual(await accountCommand({ kind: "accountUnlink", token: "t".repeat(43) }, SITE, fetchImpl), { account: { linked: false }, clearToken: true })
  assert.equal(calls[0].url, `${SITE}/api/desktop/unlink`)
})
