import { ConvexClient } from "convex/browser";
import { api, internal } from "@/convex/_generated/api";

export const convex = new ConvexClient(process.env.CONVEX_URL!);
export { api, internal }; 