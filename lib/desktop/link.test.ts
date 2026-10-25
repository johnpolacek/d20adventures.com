import assert from "node:assert/strict"
import { test } from "node:test"
import { bearerToken, cleanDeviceName, displayUserCode, newSecret, newUserCode, normalizeUserCode, sha256 } from "./link"

test("user codes are eight unambiguous characters and survive how people type them", () => {
  for (let i = 0; i < 200; i++) {
    const code = newUserCode()
    assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/)
    assert.equal(normalizeUserCode(displayUserCode(code).toLowerCase()), code)
    assert.equal(normalizeUserCode(` ${code.slice(0, 4)} ${code.slice(4)} `), code)
  }
  assert.equal(normalizeUserCode("ABCD-EFG0"), null)
  assert.equal(normalizeUserCode("ABCD"), null)
})

test("secrets are long, random, and only their hashes are stable", () => {
  const a = newSecret()
  assert.match(a, /^[A-Za-z0-9_-]{43}$/)
  assert.notEqual(a, newSecret())
  assert.equal(sha256(a), sha256(a))
  assert.match(sha256(a), /^[0-9a-f]{64}$/)
})

test("bearer tokens are read only from a well-formed header", () => {
  const token = newSecret()
  assert.equal(bearerToken(`Bearer ${token}`), token)
  assert.equal(bearerToken(`bearer ${token}`), null)
  assert.equal(bearerToken("Bearer short"), null)
  assert.equal(bearerToken(null), null)
})

test("device names are trimmed, stripped of control characters, and capped", () => {
  assert.equal(cleanDeviceName("  Mac\u0007 Studio "), "Mac Studio")
  assert.equal(cleanDeviceName("x".repeat(100)).length, 60)
  assert.equal(cleanDeviceName(42), "Desktop app")
  assert.equal(cleanDeviceName(""), "Desktop app")
})
