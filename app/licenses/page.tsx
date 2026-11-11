import { srdAttribution } from "@d20/srd/attribution"
import { Heading } from "@/components/typography/heading"

// The attribution statement, as written, with its two URLs as links.
const parts = srdAttribution.split(/(https:\/\/\S+?)(?=\.(?:\s|$))/)

export default function LicensesPage() {
  return (
    <div className="container py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-12 text-center">
          <Heading variant="h1" className="mb-8">
            Licenses
          </Heading>
        </div>

        <p>
          {parts.map((part, i) =>
            i % 2 ? (
              <a key={part} href={part} className="underline underline-offset-4" target="_blank" rel="noopener noreferrer">
                {part}
              </a>
            ) : (
              part
            )
          )}
        </p>
      </div>
    </div>
  )
}
