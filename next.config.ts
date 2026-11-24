import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@d20/gm-core", "@d20/srd", "@d20/ui"],
  // A phone on the same Wi-Fi opens the dev site at the laptop's address, such as http://192.168.1.20:3000.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*"],
  // Wiki adventures are read from dynamic filesystem paths at runtime, which
  // Next.js cannot discover through static output-file tracing on its own.
  outputFileTracingIncludes: {
    "/*": ["./content/settings/realm-of-myr/**/*"],
  },
  poweredByHeader: false,
  // Security headers on every response. No other site may frame these pages, a browser keeps to the type a file
  // is sent as, other sites see only the origin in Referer, and the site asks for no camera, microphone or location.
  // Vercel sends Strict-Transport-Security itself. A full Content-Security-Policy would also need Clerk's, Convex's and the bucket's origins kept current.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ]
  },
  async redirects() {
    return [
      { source: "/playtesters", destination: "/playtest", permanent: true },
      { source: "/updates/2d-art-to-3d-rigged-animated-3d-figures", destination: "/updates/turn-your-character-art-into-animated-3d-figures-with-hi3d-and-blender", permanent: true },
    ]
  },
  // Deploys leave out stage art (.vercelignore), so it is served from the bucket. `pnpm stage:sync` uploads it.
  // Local files win when present, so dev serves public/ as before.
  async rewrites() {
    const cdn = process.env.CLOUDFRONT_DOMAIN
    // In development a figure is the workspace's own copy (asset-library/characters, not in git), so the one just
    // built is the one that plays. One that is not here is sent for from the bucket (app/dev/assets/file).
    const own = process.env.NODE_ENV === "development" ? [{ source: "/asset-library/characters/:path*", destination: "/dev/assets/file/characters/:path*" }] : []
    if (!cdn) return own
    return [
      ...own,
      { source: "/stage/:path*", destination: `${cdn}/stage/:path*` },
      { source: "/stage-lab/:path*", destination: `${cdn}/stage-lab/:path*` },
      // The asset library's figures (`pnpm assets:sync`), which /settings/<setting>/assets loads.
      { source: "/asset-library/:path*", destination: `${cdn}/asset-library/:path*` },
      // Any image the deploy does not carry: the backgrounds, and old images kept only in the bucket.
      { source: "/images/:path*", destination: `${cdn}/images/:path*` },
      // Guests' heroes painted by a host's image CLI. Same origin, so the stage can read them as textures.
      { source: "/hero-art/:path*", destination: `${cdn}/hero-art/:path*` },
    ]
  },
}

export default nextConfig
