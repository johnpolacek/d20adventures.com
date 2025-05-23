import { internalAction } from "./_generated/server";
import { v } from "convex/values";

export const testInternal = internalAction({
  args: { foo: v.string() },
  handler: async (ctx, args) => {
    console.log("[testInternal] called with foo:", args.foo);
    return args.foo;
  },
}); 