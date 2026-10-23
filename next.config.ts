import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@d20/gm-core"],
  // Wiki adventures are read from dynamic filesystem paths at runtime, which
  // Next.js cannot discover through static output-file tracing on its own.
  outputFileTracingIncludes: {
    "/*": ["./content/settings/realm-of-myr/**/*"],
  },
  // Deploys leave out stage art (.vercelignore), so it is served from the bucket. `pnpm stage:sync` uploads it.
  // Local files win when present, so dev serves public/ as before.
  async rewrites() {
    const cdn = process.env.CLOUDFRONT_DOMAIN
    if (!cdn) return []
    return [
      { source: "/stage/:path*", destination: `${cdn}/stage/:path*` },
      { source: "/stage-lab/:path*", destination: `${cdn}/stage-lab/:path*` },
    ]
  },
}

export default nextConfig
