import type { Metadata } from "next"
import { Alegreya, Crimson_Pro, EB_Garamond, Spectral } from "next/font/google"
import { Showcase } from "./showcase"

export const metadata: Metadata = {
  title: "UI | D20 Adventures",
  robots: { index: false, follow: false },
}

// Body serifs on trial against Georgia, loaded on this page only.
const alegreya = Alegreya({ subsets: ["latin"], variable: "--font-try-alegreya", style: ["normal", "italic"] })
const crimson = Crimson_Pro({ subsets: ["latin"], variable: "--font-try-crimson", style: ["normal", "italic"] })
const garamond = EB_Garamond({ subsets: ["latin"], variable: "--font-try-garamond", style: ["normal", "italic"] })
const spectral = Spectral({ subsets: ["latin"], variable: "--font-try-spectral", weight: ["300", "400", "700"], style: ["normal", "italic"] })

export default function UIPage() {
  return (
    <div className={`${alegreya.variable} ${crimson.variable} ${garamond.variable} ${spectral.variable}`}>
      <Showcase />
    </div>
  )
}
