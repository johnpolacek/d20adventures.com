// Convex has no auth config, so every function is public. Store and device functions only answer
// the Next server, which proves the caller and passes this shared secret.
export function requireServer(secret: string) {
  const expected = process.env.STORE_SERVER_SECRET
  if (!expected || secret.length !== expected.length) throw new Error("Forbidden")
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= secret.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) throw new Error("Forbidden")
}
