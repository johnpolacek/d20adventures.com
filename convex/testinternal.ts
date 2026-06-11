import { v } from "convex/values"
import { internalAction } from "./_generated/server"

export const testInternal = internalAction({
  args: { foo: v.string() },
  handler: async (_ctx, args) => {
    return args.foo
  },
})
