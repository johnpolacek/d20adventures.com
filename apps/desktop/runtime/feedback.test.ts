import assert from "node:assert/strict"
import { test } from "node:test"
import { feedbackCommand } from "./feedback"

const SITE = "https://site.test"
const TOKEN = "t".repeat(43)
const KEY = "feedback/screenshots/user_1/2026-11-11/0b0e7a52-3f6e-4d0c-9d0b-0d6c2f1f6a11.jpg"
type Call = { url: string; auth?: string; type?: string; body: unknown }

// A fake website: each path answers with a status and a body, and every call is recorded.
function site(routes: Record<string, [number, unknown]>) {
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const headers = (init.headers ?? {}) as Record<string, string>
    calls.push({ url: url.slice(SITE.length), auth: headers.Authorization, type: headers["Content-Type"], body: init.body })
    const route = routes[url.slice(SITE.length)]
    if (!route) throw new Error("offline")
    return new Response(JSON.stringify(route[1]), { status: route[0] })
  }) as typeof fetch
  return { calls, fetchImpl }
}

const note = { kind: "general", message: "The owlbear fight stalled.", context: { plan: "the-midnight-summons" } }

test("feedback without a linked account is refused and makes no request", async () => {
  const { calls, fetchImpl } = site({})
  const res = await feedbackCommand({ kind: "accountFeedback", feedback: note }, SITE, fetchImpl)
  assert.equal(res.sent, false)
  assert.match(res.error ?? "", /Link this computer/)
  assert.equal(calls.length, 0)
})

test("a note is sent with the device token", async () => {
  const { calls, fetchImpl } = site({ "/api/feedback": [200, { ok: true }] })
  assert.deepEqual(await feedbackCommand({ kind: "accountFeedback", token: TOKEN, feedback: note }, SITE, fetchImpl), { sent: true })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].auth, `Bearer ${TOKEN}`)
  assert.deepEqual(JSON.parse(String(calls[0].body)), { ...note, screenshots: [] })
})

test("a screenshot is uploaded first as a JPEG, and its key goes with the note", async () => {
  const { calls, fetchImpl } = site({ "/api/feedback/upload": [200, { key: KEY }], "/api/feedback": [200, { ok: true }] })
  const image = Buffer.from("not really a jpeg").toString("base64")
  assert.deepEqual(await feedbackCommand({ kind: "accountFeedback", token: TOKEN, feedback: note, images: [image] }, SITE, fetchImpl), { sent: true })
  assert.deepEqual(
    calls.map((c) => c.url),
    ["/api/feedback/upload", "/api/feedback"]
  )
  assert.ok(calls.every((c) => c.auth === `Bearer ${TOKEN}`))
  assert.equal(calls[0].type, "image/jpeg")
  assert.equal(String(calls[0].body), "not really a jpeg")
  assert.deepEqual(JSON.parse(String(calls[1].body)).screenshots, [KEY])
})

test("an image over the limit is refused before any request", async () => {
  const { calls, fetchImpl } = site({})
  const image = Buffer.alloc(4 * 1024 * 1024 + 1).toString("base64")
  assert.deepEqual(await feedbackCommand({ kind: "accountFeedback", token: TOKEN, feedback: note, images: [image] }, SITE, fetchImpl), { sent: false, error: "That screenshot is too large." })
  assert.equal(calls.length, 0)
})

test("the website's refusal is passed on, and an unreachable website fails plainly", async () => {
  const refused = site({ "/api/feedback": [400, { error: "Write a note, pick a rating or attach a screenshot." }] })
  assert.deepEqual(await feedbackCommand({ kind: "accountFeedback", token: TOKEN, feedback: note }, SITE, refused.fetchImpl), {
    sent: false,
    error: "Write a note, pick a rating or attach a screenshot.",
  })
  const offline = site({})
  assert.deepEqual(await feedbackCommand({ kind: "accountFeedback", token: TOKEN, feedback: note }, SITE, offline.fetchImpl), { sent: false, error: "Could not send your feedback. Try again." })
})
