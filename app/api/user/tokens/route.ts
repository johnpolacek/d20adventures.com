import { fetchUserTokenBalance } from "@/app/_actions/user-token-actions"

// POST preserves the balance read's existing first-use token initialization.
export async function POST() {
  const result = await fetchUserTokenBalance()
  const status = result.error === "USER_NOT_AUTHENTICATED" ? 401 : result.error ? 500 : 200
  return Response.json(result, { status, headers: { "Cache-Control": "private, no-store" } })
}
