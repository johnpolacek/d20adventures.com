import type { Metadata } from "next"
import { srdAttribution } from "@d20/srd/attribution"
import { PlainPage, plainProse } from "@/components/layout/plain-page"

export const metadata: Metadata = { title: "Licenses | D20 Adventures" }

// The attribution statement, as written, with its two URLs as links.
const parts = srdAttribution.split(/(https:\/\/\S+?)(?=\.(?:\s|$))/)

export default function LicensesPage() {
  return (
    <PlainPage title="Licenses">
      <div className={plainProse}>
        <p className="text-lg">
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
    </PlainPage>
  )
}
