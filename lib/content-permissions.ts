import { isUserAdmin } from "@/lib/auth-utils"

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function getResourceOwnerId(resource: unknown): string | null {
  if (!resource || typeof resource !== "object") return null

  const data = resource as {
    ownerId?: unknown
    createdById?: unknown
    userId?: unknown
  }

  return readString(data.ownerId) ?? readString(data.createdById) ?? readString(data.userId)
}

export function canManageResource(userId: string | null | undefined, resource: unknown): boolean {
  if (!userId) return false
  if (isUserAdmin(userId)) return true

  const ownerId = getResourceOwnerId(resource)
  return ownerId !== null && ownerId === userId
}
