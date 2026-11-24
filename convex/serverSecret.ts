import type { RegisteredAction, RegisteredMutation, RegisteredQuery } from "convex/server"
import { type ObjectType, type PropertyValidators, v } from "convex/values"
import { type ActionCtx, action, type MutationCtx, mutation, type QueryCtx, query } from "./_generated/server"

// Convex has no auth config, so every function is public, and its address is in every visitor's browser. So every
// function answers only the Next server, which proves the caller and passes this shared secret.
export function requireServer(secret: string) {
  const expected = process.env.STORE_SERVER_SECRET
  if (!expected || secret.length !== expected.length) throw new Error("Forbidden")
  let diff = 0
  for (let i = 0; i < expected.length; i++) diff |= secret.charCodeAt(i) ^ expected.charCodeAt(i)
  if (diff !== 0) throw new Error("Forbidden")
}

// A query, mutation or action that takes the secret as one more argument and checks it before the handler runs. The
// handler sees its own arguments only. lib/convex/server.ts adds the secret to every call.
type Def<Ctx, A extends PropertyValidators, R> = { args?: A; handler: (ctx: Ctx, args: ObjectType<A>) => R }
type Signed<A extends PropertyValidators> = ObjectType<A> & { secret: string }

// ALLOW_UNSIGNED=1 in the deployment's environment lets a call without the secret through, for a site deploy still on
// its way. A wrong secret is refused all the same. Set and unset it with `npx convex env`, with no deploy.
const unsignedAllowed = () => process.env.ALLOW_UNSIGNED === "1"

function signed<Ctx, A extends PropertyValidators, R>(def: Def<Ctx, A, R>) {
  return {
    args: { ...def.args, secret: v.optional(v.string()) },
    handler: (ctx: Ctx, { secret, ...args }: Signed<A>) => {
      if (secret !== undefined || !unsignedAllowed()) requireServer(secret ?? "")
      return def.handler(ctx, args as unknown as ObjectType<A>)
    },
  } as never
}

type None = Record<never, never>
export const serverQuery = <A extends PropertyValidators = None, R = unknown>(def: Def<QueryCtx, A, R>): RegisteredQuery<"public", Signed<A>, R> => query(signed(def))
export const serverMutation = <A extends PropertyValidators = None, R = unknown>(def: Def<MutationCtx, A, R>): RegisteredMutation<"public", Signed<A>, R> => mutation(signed(def))
export const serverAction = <A extends PropertyValidators = None, R = unknown>(def: Def<ActionCtx, A, R>): RegisteredAction<"public", Signed<A>, R> => action(signed(def))
