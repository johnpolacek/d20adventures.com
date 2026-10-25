import { NextResponse } from "next/server"
import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { convex } from "@/lib/convex/server"
import { serverSecret } from "@/lib/convex/server-secret"
import { bearerToken, LINK_TTL_MS, newSecret, newUserCode, sha256 } from "./link"

// Server only. Raw codes and tokens never reach Convex, only their hashes.
export async function startLink(deviceName: string) {
  const pollSecret = newSecret()
  const expiresAt = Date.now() + LINK_TTL_MS
  for (let attempt = 0; attempt < 3; attempt++) {
    const userCode = newUserCode()
    const { created } = await convex.mutation(api.devices.createLink, { secret: serverSecret(), userCode, pollHash: sha256(pollSecret), deviceName, expiresAt })
    if (created) return { userCode, pollSecret, expiresAt }
  }
  throw new Error("Could not allocate a link code.")
}

export const lookupLink = (userCode: string) => convex.query(api.devices.linkByCode, { secret: serverSecret(), userCode })

export const approveLink = (userCode: string, userId: string) => convex.mutation(api.devices.approveLink, { secret: serverSecret(), userCode, userId })

/** Pending until the player approves. On approval the device token is returned once and only its hash is kept. */
export async function redeemLink(pollSecret: string) {
  const token = newSecret()
  const result = await convex.mutation(api.devices.redeemLink, { secret: serverSecret(), pollHash: sha256(pollSecret), tokenHash: sha256(token) })
  return result.status === "linked" ? { status: "linked" as const, token } : result
}

export const listDevices = (userId: string) => convex.query(api.devices.listDevices, { secret: serverSecret(), userId })

export const revokeDevice = (userId: string, deviceId: string) => convex.mutation(api.devices.revokeDevice, { secret: serverSecret(), userId, deviceId: deviceId as Id<"devices"> })

/** The linked device behind a request's bearer token, or a 401 response. */
export async function deviceFromRequest(request: Request) {
  const token = bearerToken(request.headers.get("authorization"))
  const device = token ? await convex.mutation(api.devices.deviceByToken, { secret: serverSecret(), tokenHash: sha256(token) }) : null
  if (!device) return { error: NextResponse.json({ error: "This computer is not linked." }, { status: 401 }) }
  return { device }
}
