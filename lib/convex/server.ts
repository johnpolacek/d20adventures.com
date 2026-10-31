import { ConvexHttpClient } from "convex/browser"
import type { FunctionReference, FunctionReturnType } from "convex/server"
import { api, internal } from "@/convex/_generated/api"

const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL
if (!convexUrl) {
  throw new Error("Missing CONVEX_URL or NEXT_PUBLIC_CONVEX_URL for server Convex client.")
}

const client = new ConvexHttpClient(convexUrl)

// A call that could not connect never reached Convex, so it runs nothing and costs nothing. It is tried once more.
// Any other failure may have run, and is thrown as is.
const UNREACHED = new Set(["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"])
async function once<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    const code = (error as { cause?: { code?: string } })?.cause?.code
    if (!code || !UNREACHED.has(code)) throw error
    await new Promise((resolve) => setTimeout(resolve, 500))
    return call()
  }
}

type AnyQueryRef = FunctionReference<"query", "public" | "internal">
type AnyMutationRef = FunctionReference<"mutation", "public" | "internal">
type AnyActionRef = FunctionReference<"action", "public" | "internal">

export const convex = {
  query<Query extends AnyQueryRef>(query: Query, args: Query["_args"]): Promise<FunctionReturnType<Query>> {
    return once(() => (client as { query: (fn: Query, fnArgs: Query["_args"]) => Promise<FunctionReturnType<Query>> }).query(query, args))
  },
  mutation<Mutation extends AnyMutationRef>(mutation: Mutation, args: Mutation["_args"]): Promise<FunctionReturnType<Mutation>> {
    return once(() => (client as { mutation: (fn: Mutation, fnArgs: Mutation["_args"]) => Promise<FunctionReturnType<Mutation>> }).mutation(mutation, args))
  },
  action<Action extends AnyActionRef>(action: Action, args: Action["_args"]): Promise<FunctionReturnType<Action>> {
    return once(() => (client as { action: (fn: Action, fnArgs: Action["_args"]) => Promise<FunctionReturnType<Action>> }).action(action, args))
  },
}

export { api, internal }
