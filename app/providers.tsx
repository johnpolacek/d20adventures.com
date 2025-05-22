"use client"

import { ClerkProvider } from "@clerk/nextjs"
import { ConvexProvider, ConvexReactClient } from "convex/react"
import { PropsWithChildren } from "react"
import { dark } from "@clerk/themes"
const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!)

export function Providers({ children }: PropsWithChildren) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: {
          fontFamily: "var(--font-rethink-sans)",
          colorBackground: "#1C1934",
        },
      }}
      afterSignOutUrl="/"
    >
      <ConvexProvider client={convex}>{children}</ConvexProvider>
    </ClerkProvider>
  )
}
