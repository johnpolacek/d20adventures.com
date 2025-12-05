import { api, internal } from "@/convex/_generated/api"
import { ConvexClient } from "convex/browser"

export const convex = new ConvexClient(process.env.CONVEX_URL!)
export { api, internal }
