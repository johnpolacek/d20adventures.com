import { ConvexHttpClient } from "convex/browser"
import type { FunctionReference, FunctionReturnType } from "convex/server"
import { api, internal } from "@/convex/_generated/api"
import { serverSecret } from "./server-secret"

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

type AnyQueryRef = FunctionReference<"query", "public">
type AnyMutationRef = FunctionReference<"mutation", "public">
type AnyActionRef = FunctionReference<"action", "public">

// Every Convex function answers only this server (convex/serverSecret.ts), so every call carries the secret. A caller
// may still name it, as older ones do.
type Args<Ref extends FunctionReference<"query" | "mutation" | "action", "public">> = Omit<Ref["_args"], "secret"> & { secret?: string }
const signed = <A>(args: A) => ({ ...args, secret: serverSecret() })

type Http = { [K in "query" | "mutation" | "action"]: (fn: unknown, args: unknown) => Promise<unknown> }
const http = client as unknown as Http

export const convex = {
  query<Query extends AnyQueryRef>(query: Query, args: Args<Query>): Promise<FunctionReturnType<Query>> {
    return once(() => http.query(query, signed(args)) as Promise<FunctionReturnType<Query>>)
  },
  mutation<Mutation extends AnyMutationRef>(mutation: Mutation, args: Args<Mutation>): Promise<FunctionReturnType<Mutation>> {
    return once(() => http.mutation(mutation, signed(args)) as Promise<FunctionReturnType<Mutation>>)
  },
  action<Action extends AnyActionRef>(action: Action, args: Args<Action>): Promise<FunctionReturnType<Action>> {
    return once(() => http.action(action, signed(args)) as Promise<FunctionReturnType<Action>>)
  },
}

export { api, internal }
