import type { Metadata } from "next"
import { Cinzel_Decorative, Rethink_Sans, Syne_Mono } from "next/font/google"
import { Toaster } from "sonner"
import SiteFooter from "@/components/layout/footer"
import Header from "@/components/layout/header"
import { ThemeProvider } from "@/components/layout/theme-provider"
import { siteConfig } from "@/lib/config"
import { cn } from "@/lib/utils"
import "./globals.css"
import { Providers } from "./providers"

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const currentYear = new Date().getFullYear()

  return (
    <html lang="en" suppressHydrationWarning className={`${rethinkSans.variable} ${cinzel.variable} ${syne.variable}`}>
      <body className={cn("min-h-screen bg-black text-white font-serif antialiased")}>
        <Providers>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
            <div className="relative flex min-h-screen flex-col">
              <Header />
              <main className="flex-1">{children}</main>
              <SiteFooter currentYear={currentYear} />
            </div>
            <Toaster position="top-center" />
          </ThemeProvider>
        </Providers>
      </body>
    </html>
  )
}
