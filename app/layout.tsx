import Link from "next/link"
import type { Metadata } from "next"
import { Rethink_Sans, Cinzel_Decorative, Syne_Mono } from "next/font/google"
import { ThemeProvider } from "@/components/layout/theme-provider"
import { cn } from "@/lib/utils"
import { Toaster } from "sonner"
import { headers } from "next/headers"
import { trackVisit } from "@/app/_actions/track-visit"
import { siteConfig } from "@/lib/config"
import "./globals.css"
import { Providers } from "./providers"
import Header from "@/components/layout/header"

const rethinkSans = Rethink_Sans({
  subsets: ["latin"],
  variable: "--font-rethink-sans",
})

const cinzel = Cinzel_Decorative({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: "400",
})

const syne = Syne_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
  weight: "400",
})

export const metadata: Metadata = {
  title: siteConfig.title,
  description: siteConfig.description,
  icons: {
    icon: "/images/favicon.svg",
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Track the visit
  const headersList = await headers()
  const path = headersList.get("x-pathname") || "/"
  await trackVisit(path)

  const currentYear = new Date().getFullYear()

  return (
    <html lang="en" suppressHydrationWarning className={`${rethinkSans.variable} ${cinzel.variable} ${syne.variable}`}>
      <body className={cn("min-h-screen bg-black text-white font-serif antialiased")}>
        <Providers>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <div className="relative flex min-h-screen flex-col">
              <Header path={path} />
              <main className="flex-1">{children}</main>
              <footer className="border-t border-white/20 py-6">
                <div className="container px-4 md:px-6">
                  <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left text-sm">
                    <p>
                      © {currentYear} {siteConfig.title}. All rights reserved.
                    </p>
                    <nav className="flex gap-4">
                      <Link href="/terms" className="hover:underline underline-offset-4">
                        Terms
                      </Link>
                      <Link href="/privacy" className="hover:underline underline-offset-4">
                        Privacy
                      </Link>
                      <Link href="#" className="hover:underline underline-offset-4">
                        Contact
                      </Link>
                    </nav>
                  </div>
                </div>
              </footer>
            </div>
            <Toaster position="top-center" />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  )
}
