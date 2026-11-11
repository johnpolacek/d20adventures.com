import { getSubscription } from "@/app/_actions/mailing-list"
import { Heading } from "@/components/typography/heading"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PlaytesterForm } from "./playtester-form"

export const dynamic = "force-dynamic"
export const metadata = { title: "Become a Playtester | D20 Adventures" }

const installCommand = "curl -fsSL https://d20adventures.com/install.sh | sh"
const installSource = "https://github.com/johnpolacek/d20adventures.com/blob/main/public/install.sh"

const steps = [
  { title: "Host", body: "Run the desktop app. The Game Master uses your own Claude, Codex or Grok account." },
  { title: "Invite", body: "Friends join your game from the website with a link. No setup for them." },
  { title: "Report", body: "Tell us what worked and what broke. D20 Adventures is in alpha." },
]

export default async function PlaytestersPage() {
  const result = await getSubscription()
  const joined = result.success && result.data && !result.data.unsubscribedAt
  // Set once `pnpm desktop:release` has published the first build.
  const released = process.env.NEXT_PUBLIC_DESKTOP_RELEASED === "1"

  return (
    <div className="container py-12">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-10">
        <Heading variant="h1" className="text-center">
          {joined ? "You’re a Playtester" : "Become a Playtester"}
        </Heading>

        <div className="grid w-full gap-4 sm:grid-cols-3">
          {steps.map((step) => (
            <Card key={step.title}>
              <CardHeader>
                <CardTitle className="text-lg">{step.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-muted-foreground">{step.body}</CardContent>
            </Card>
          ))}
        </div>

        {joined ? (
          released ? (
            <div className="flex w-full flex-col items-center gap-3">
              <p>Paste this into Terminal on an Apple Silicon Mac:</p>
              <code className="w-full max-w-xl rounded-lg border bg-muted px-4 py-3 text-center font-mono text-sm select-all">{installCommand}</code>
              <a href={installSource} className="text-sm text-muted-foreground underline underline-offset-4" target="_blank" rel="noopener noreferrer">
                View the Install Script
              </a>
            </div>
          ) : (
            <p className="text-center">We’ll email {result.data?.email} when the desktop app is ready to download.</p>
          )
        ) : (
          <PlaytesterForm />
        )}
      </div>
    </div>
  )
}
