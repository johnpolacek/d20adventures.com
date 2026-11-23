import type { Metadata } from "next"
import { Cinzel_Decorative, Literata, Rethink_Sans, Syne_Mono } from "next/font/google"
import { Toaster } from "@d20/ui/toast"
import SiteFooter from "@/components/layout/footer"
import Header from "@/components/layout/header"
import { PageTransition } from "@/components/layout/page-transition"
import { SITE_URL, siteConfig } from "@/lib/config"
import { textures } from "@/lib/served"
import { updateThemeScript } from "@/lib/update-theme"
import { cn } from "@/lib/utils"
import "./globals.css"
import { Providers } from "./providers"

const rethinkSans = Rethink_Sans({
  subsets: ["latin"],
  variable: "--font-rethink-sans",
})

// The body and narration face. Its optical sizes keep small text sturdy on black.
const literata = Literata({
  subsets: ["latin"],
  variable: "--font-literata",
  style: ["normal", "italic"],
  axes: ["opsz"],
})

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap",
  weight: "400",
})

const syne = Syne_Mono({
  subsets: ["latin"],
  variable: "--font-syne-mono",
  display: "swap",
  weight: "400",
})

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Each page names itself as the one true address, without its query string.
  alternates: { canonical: "./" },
  title: siteConfig.title,
  description: siteConfig.description,
  icons: {
    // The desktop app's die, cut from its tile (lab/favicon-designs). Apple's icon keeps a tile, since iOS fills
    // transparency with black.
    icon: [
      { url: "/images/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/images/favicon.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/images/apple-touch-icon.png",
  },
  openGraph: {
    title: siteConfig.title,
    description: siteConfig.description,
    images: [
      {
        url: siteConfig.shareImage,
        width: 1200,
        height: 630,
        alt: `${siteConfig.title} screenshot`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
    images: [siteConfig.shareImage],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const currentYear = new Date().getFullYear()

  return (
    // The script below sets the Updates pages' light or dark look on <html> before React takes over, hence the suppression.
    <html lang="en" className={`${rethinkSans.variable} ${literata.variable} ${cinzel.variable} ${syne.variable}`} style={textures} suppressHydrationWarning>
      <body className={cn("min-h-screen bg-black text-white font-serif antialiased")}>
        <script dangerouslySetInnerHTML={{ __html: updateThemeScript }} />
        <Providers>
          <div className="relative flex min-h-screen flex-col">
            <a
              href="#main"
              className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[9999] focus:rounded-md focus:bg-black focus:px-4 focus:py-2 focus:font-sans focus:text-sm focus:text-white focus:outline-none focus:ring-2 focus:ring-primary-400"
            >
              Skip to Content
            </a>
            <Header />
            <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
              <PageTransition>{children}</PageTransition>
            </main>
            <SiteFooter currentYear={currentYear} />
          </div>
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
