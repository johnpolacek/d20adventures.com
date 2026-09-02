import { clerkMiddleware } from "@clerk/nextjs/server"

export default clerkMiddleware()

export const config = {
  matcher: ["/", "/account/:path*", "/admin/:path*", "/api/:path*", "/create", "/demo/ai", "/dev/:path*", "/mailing-list", "/player/:path*", "/settings/:path*"],
}
