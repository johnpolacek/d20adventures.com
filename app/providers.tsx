"use client"

import { TokenProvider } from "@/lib/context/TokenContext"
import { ClerkProvider } from "@clerk/nextjs"
import { dark } from "@clerk/themes"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import type { PropsWithChildren } from "react"

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export function Providers({ children }: PropsWithChildren) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
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
