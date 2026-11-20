import type { Metadata } from "next"
import { Gelasio, Literata, Merriweather, Vollkorn } from "next/font/google"
import { Showcase } from "./showcase"

export const metadata: Metadata = {
  title: "UI | D20 Adventures",
  robots: { index: false, follow: false },
}

// Body serifs on trial against Georgia, loaded on this page only.
const vollkorn = Vollkorn({ subsets: ["latin"], variable: "--font-try-vollkorn", style: ["normal", "italic"] })
const literata = Literata({ subsets: ["latin"], variable: "--font-try-literata", style: ["normal", "italic"] })
const merriweather = Merriweather({ subsets: ["latin"], variable: "--font-try-merriweather", style: ["normal", "italic"] })
const gelasio = Gelasio({ subsets: ["latin"], variable: "--font-try-gelasio", style: ["normal", "italic"] })

export default function UIPage() {
  return (
    <div className={`${vollkorn.variable} ${literata.variable} ${merriweather.variable} ${gelasio.variable}`}>
      <Showcase />
    </div>
  )
}
