import { getSubscription } from "@/app/_actions/mailing-list"
import { Heading } from "@/components/typography/heading"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PlaytesterForm } from "./playtester-form"

export const dynamic = "force-dynamic"
export const metadata = { title: "Become a Playtester | D20 Adventures" }

const steps = [
  { title: "Host", body: "Run the desktop app. The Game Master uses your own Claude, Codex or Grok account." },
  { title: "Invite", body: "Friends join your game from the website with a link. No setup for them." },
  { title: "Report", body: "Tell us what worked and what broke. D20 Adventures is in alpha." },
]

export default async function PlaytestersPage() {
  const result = await getSubscription()
  const joined = result.success && result.data && !result.data.unsubscribedAt
  const download = process.env.NEXT_PUBLIC_DESKTOP_DOWNLOAD_URL

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
          download ? (
            <Button asChild variant="epic" size="lg">
              <a href={download}>Download for Mac</a>
            </Button>
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
