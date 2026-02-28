import { api, internal } from "@/convex/_generated/api"
import { ConvexHttpClient } from "convex/browser"
import type { FunctionReference, FunctionReturnType } from "convex/server"

const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL
if (!convexUrl) {
  throw new Error("Missing CONVEX_URL or NEXT_PUBLIC_CONVEX_URL for server Convex client.")
}

const client = new ConvexHttpClient(convexUrl)

type AnyQueryRef = FunctionReference<"query", "public" | "internal">
type AnyMutationRef = FunctionReference<"mutation", "public" | "internal">
type AnyActionRef = FunctionReference<"action", "public" | "internal">

export const convex = {
  query<Query extends AnyQueryRef>(query: Query, args: Query["_args"]): Promise<FunctionReturnType<Query>> {
    return (client as { query: (fn: Query, fnArgs: Query["_args"]) => Promise<FunctionReturnType<Query>> }).query(query, args)
  },
  mutation<Mutation extends AnyMutationRef>(mutation: Mutation, args: Mutation["_args"]): Promise<FunctionReturnType<Mutation>> {
    return (client as { mutation: (fn: Mutation, fnArgs: Mutation["_args"]) => Promise<FunctionReturnType<Mutation>> }).mutation(mutation, args)
  },
  action<Action extends AnyActionRef>(action: Action, args: Action["_args"]): Promise<FunctionReturnType<Action>> {
    return (client as { action: (fn: Action, fnArgs: Action["_args"]) => Promise<FunctionReturnType<Action>> }).action(action, args)
  },
}

export { api, internal }
