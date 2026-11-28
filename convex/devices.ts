import { v } from "convex/values"
import { mutation, query } from "./_generated/server"
import { requireServer } from "./serverSecret"

// Linked devices are seen at most this often, so each desktop request is not a write.
const SEEN_EVERY_MS = 10 * 60 * 1000

export const createLink = mutation({
  args: { secret: v.string(), userCode: v.string(), pollHash: v.string(), deviceName: v.string(), installId: v.optional(v.string()), expiresAt: v.number() },
  handler: async (ctx, { secret, ...args }) => {
    requireServer(secret)
    const now = Date.now()
    // Abandoned attempts expire. Clear a few on each new one.
    const stale = await ctx.db
      .query("deviceLinks")
      .withIndex("by_expires", (q) => q.lt("expiresAt", now))
      .take(20)
    for (const row of stale) await ctx.db.delete(row._id)
    const taken = await ctx.db
      .query("deviceLinks")
      .withIndex("by_user_code", (q) => q.eq("userCode", args.userCode))
      .first()
    if (taken) return { created: false }
    await ctx.db.insert("deviceLinks", { ...args, createdAt: now })
    return { created: true }
  },
})

/** What the approval page shows for a code, or null when it is unknown or expired. */
export const linkByCode = query({
  args: { secret: v.string(), userCode: v.string() },
  handler: async (ctx, args) => {
    requireServer(args.secret)
    const link = await ctx.db
      .query("deviceLinks")
      .withIndex("by_user_code", (q) => q.eq("userCode", args.userCode))
      .first()
    if (!link || link.expiresAt < Date.now()) return null
    return { deviceName: link.deviceName, expiresAt: link.expiresAt, approved: link.userId !== undefined }
  },
})

export const approveLink = mutation({
  args: { secret: v.string(), userCode: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    requireServer(args.secret)
    const link = await ctx.db
      .query("deviceLinks")
      .withIndex("by_user_code", (q) => q.eq("userCode", args.userCode))
      .first()
    if (!link || link.expiresAt < Date.now()) return { status: "expired" as const }
    if (link.userId && link.userId !== args.userId) return { status: "expired" as const }
    if (!link.userId) await ctx.db.patch(link._id, { userId: args.userId, approvedAt: Date.now() })
    return { status: "approved" as const, deviceName: link.deviceName }
  },
})

/** The app trades its poll secret for a device token once the player approves. The link is single use. */
export const redeemLink = mutation({
  args: { secret: v.string(), pollHash: v.string(), tokenHash: v.string(), previousTokenHash: v.optional(v.string()) },
  handler: async (ctx, args) => {
    requireServer(args.secret)
    const link = await ctx.db
      .query("deviceLinks")
      .withIndex("by_poll_hash", (q) => q.eq("pollHash", args.pollHash))
      .first()
    const now = Date.now()
    if (!link || link.expiresAt < now) return { status: "expired" as const }
    if (!link.userId) return { status: "pending" as const }
    const userId = link.userId

    // Replace an existing active link for this installation (or the previous token the app is replacing)
    // instead of creating duplicate entries for the same computer.
    const sameInstall = link.installId
      ? (
          await ctx.db
            .query("devices")
            .withIndex("by_user_install", (q) => q.eq("userId", userId).eq("installId", link.installId))
            .collect()
        ).filter((row) => row.revokedAt === undefined)
      : []

    const previous = args.previousTokenHash
      ? await ctx.db
          .query("devices")
          .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.previousTokenHash!))
          .first()
      : null
    const activePrevious = previous && previous.revokedAt === undefined ? previous : null

    const reusable = [...sameInstall]
    if (activePrevious && activePrevious.userId === userId && !reusable.some((row) => row._id === activePrevious._id)) {
      reusable.push(activePrevious)
    } else if (activePrevious && activePrevious.userId !== userId) {
      // The app switched accounts; revoke the old token it is about to overwrite locally.
      await ctx.db.patch(activePrevious._id, { revokedAt: now })
    }

    if (reusable.length > 0) {
      const [primary, ...duplicates] = reusable
      await ctx.db.patch(primary._id, {
        tokenHash: args.tokenHash,
        name: link.deviceName,
        lastSeenAt: now,
        ...(link.installId ? { installId: link.installId } : {}),
      })
      for (const extra of duplicates) await ctx.db.patch(extra._id, { revokedAt: now })
    } else {
      await ctx.db.insert("devices", {
        userId,
        tokenHash: args.tokenHash,
        name: link.deviceName,
        ...(link.installId ? { installId: link.installId } : {}),
        createdAt: now,
        lastSeenAt: now,
      })
    }

    await ctx.db.delete(link._id)
    return { status: "linked" as const }
  },
})

/** The account behind a device token, or null when unknown or revoked. */
export const deviceByToken = mutation({
  args: { secret: v.string(), tokenHash: v.string() },
  handler: async (ctx, args) => {
    requireServer(args.secret)
    const device = await ctx.db
      .query("devices")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", args.tokenHash))
      .first()
    if (!device || device.revokedAt !== undefined) return null
    const now = Date.now()
    if (!device.lastSeenAt || now - device.lastSeenAt > SEEN_EVERY_MS) await ctx.db.patch(device._id, { lastSeenAt: now })
    return { deviceId: device._id, userId: device.userId, name: device.name }
  },
})

export const listDevices = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    requireServer(args.secret)
    const rows = await ctx.db
      .query("devices")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()
    return rows.filter((row) => row.revokedAt === undefined).map((row) => ({ id: row._id, name: row.name, createdAt: row.createdAt, lastSeenAt: row.lastSeenAt }))
  },
})

export const revokeDevice = mutation({
  args: { secret: v.string(), userId: v.string(), deviceId: v.id("devices") },
  handler: async (ctx, args) => {
    requireServer(args.secret)
    const device = await ctx.db.get(args.deviceId)
    if (!device || device.userId !== args.userId) return { revoked: false }
    if (device.revokedAt === undefined) await ctx.db.patch(device._id, { revokedAt: Date.now() })
    return { revoked: true }
  },
})
