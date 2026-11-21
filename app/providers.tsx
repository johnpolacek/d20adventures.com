"use client"

import { ClerkProvider } from "@clerk/nextjs"
import { serveFrom } from "@d20/stage/served"
import { dark } from "@clerk/themes"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import type { PropsWithChildren } from "react"
import { IMAGE_HOST } from "@/lib/config"
import { TokenProvider } from "@/lib/context/TokenContext"

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

// On the live site a visitor's browser fetches the stage's art from the bucket's own address, not through this deploy.
// In development the files are the workspace's own. NEXT_PUBLIC_ASSET_HOST names another host, or none when set empty.
const assetHost = process.env.NEXT_PUBLIC_ASSET_HOST ?? (process.env.NODE_ENV === "production" ? IMAGE_HOST : "")
if (assetHost) serveFrom(assetHost)

export function Providers({ children }: PropsWithChildren) {
  return (
    <ClerkProvider
      appearance={{
        theme: dark,
        variables: {
          fontFamily: "var(--font-rethink-sans)",
          colorBackground: "#1C1934",
          colorForeground: "#FFFFFF",
          colorInputForeground: "#FFFFFF",
          colorNeutral: "#FFFFFF",
        },
        elements: {
          card: "text-white",
          headerTitle: "text-white",
          headerSubtitle: "text-white/80",
          formFieldLabel: "text-white",
          formFieldInput: "text-white placeholder:text-white/60",
          footerActionText: "text-white/80",
          footerActionLink: "text-white hover:text-white/80",
          socialButtonsBlockButtonText: "text-white",
        },
      }}
      afterSignOutUrl="/"
    >
      <ConvexProvider client={convex}>
        <TokenProvider>{children}</TokenProvider>
      </ConvexProvider>
    </ClerkProvider>
  )
}
