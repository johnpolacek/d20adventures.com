import { MailingListForm } from "@/components/forms/mailing-list-form"
import { Heading } from "@/components/typography/heading"
import { getSubscription, unsubscribe } from "@/app/_actions/mailing-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfigCard } from "@/components/admin/config-card"

async function handleLeaveWaitlist() {
  "use server"
  const result = await getSubscription()
  const subscription = result.success ? result.data : null
  if (!subscription?.email) return
  await unsubscribe(subscription.email) // Internally, unsubscribe still correctly removes them
}

export default async function WaitlistPage() {
  // Check if required environment variables are configured
  const missingEnvVars = [
    {
      key: "SENDGRID_API_KEY",
      description: "Your SendGrid API key (for waitlist notifications)",
      isMissing: !process.env.SENDGRID_API_KEY,
    },
  ].filter((item) => item.isMissing)

  if (missingEnvVars.length > 0) {
    return (
      <div className="container max-w-2xl py-8 md:py-12">
        <ConfigCard title="Waitlist Setup Required" description="The waitlist feature needs configuration before it can be used for notifications." configItems={missingEnvVars} />
      </div>
    )
  }

  const result = await getSubscription()
  const subscription = result.success ? result.data : null

  return (
    <div className="container relative">
      <div className="mx-auto flex max-w-[980px] flex-col items-center gap-8 py-8 md:py-12">
        <Heading variant="h2" className="text-center leading-tight">
          {subscription ? (
            <>
              {subscription.unsubscribedAt ? (
                <>
                  You&apos;ve left the <span className="text-primary">Waitlist.</span>
                </>
              ) : (
                <>
                  You&apos;re on the <span className="text-primary">Waitlist!</span>
                </>
              )}
            </>
          ) : (
            <>
              Join the <span className="text-primary">Waitlist</span>
            </>
          )}
        </Heading>

        {subscription ? (
          <Card className="w-full max-w-[500px] p-4 md:p-8 md:mt-4">
            <CardHeader className="md:pt-4">
              <CardTitle>Waitlist Status</CardTitle>
            </CardHeader>
            <CardContent className="md:pb-4">
              {subscription.unsubscribedAt ? (
                <div className="space-y-4">
                  <p>You previously joined the waitlist with {subscription.email}, but have since left. You can rejoin below.</p>
                  <MailingListForm initialEmail={subscription.email} />
                </div>
              ) : (
                <div className="space-y-4">
                  <p>You&apos;re on the waitlist with {subscription.email}. We&apos;ll notify you when access is available!</p>
                  <form action={handleLeaveWaitlist}>
                    <Button variant="destructive" type="submit">
                      Leave Waitlist
                    </Button>
                  </form>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <MailingListForm />
        )}
      </div>
    </div>
  )
}
