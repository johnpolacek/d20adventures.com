import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@d20/gm-core"],
  // Wiki adventures are read from dynamic filesystem paths at runtime, which
  // Next.js cannot discover through static output-file tracing on its own.
  outputFileTracingIncludes: {
    "/*": ["./content/settings/realm-of-myr/**/*"],
  },
}

export default nextConfig
