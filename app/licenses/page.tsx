import type { Metadata } from "next"
import { srdAttribution } from "@d20/srd/attribution"
import { ReadingPage } from "@/components/layout/reading-page"

export const metadata: Metadata = { title: "Licenses | D20 Adventures" }

// The attribution statement, as written, with its two URLs as links.
const parts = srdAttribution.split(/(https:\/\/\S+?)(?=\.(?:\s|$))/)

export default function LicensesPage() {
  return (
    <ReadingPage title="Licenses">
      <div className="up-prose">
        <p>
          {parts.map((part, i) =>
            i % 2 ? (
              <a key={part} href={part} target="_blank" rel="noopener noreferrer">
                {part}
              </a>
            ) : (
              part
            )
          )}
        </p>
      </div>
    </ReadingPage>
  )
}
