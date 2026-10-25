// Server only. Passed to Convex functions guarded by requireServer (convex/serverSecret.ts).
export function serverSecret() {
  const value = process.env.STORE_SERVER_SECRET
  if (!value) throw new Error("Missing STORE_SERVER_SECRET.")
  return value
}
