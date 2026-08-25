import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // Wiki adventures are read from dynamic filesystem paths at runtime, which
  // Next.js cannot discover through static output-file tracing on its own.
  outputFileTracingIncludes: {
    "/*": ["./content/settings/realm-of-myr/**/*"],
  },
}

export default nextConfig
