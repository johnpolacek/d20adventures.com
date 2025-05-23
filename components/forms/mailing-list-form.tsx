"use client"

import { useState } from "react"
import { useUser } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { subscribe } from "@/app/_actions/mailing-list"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import Link from "next/link"

export function MailingListForm({ initialEmail }: { initialEmail?: string }) {
  const router = useRouter()
  const { user, isSignedIn, isLoaded } = useUser()
  const [isLoading, setIsLoading] = useState(false)

  if (!isLoaded) {
    return null
  }

  const handleSubscribe = async () => {
    if (!isSignedIn || !user?.emailAddresses?.[0]?.emailAddress) {
      toast.error("Please sign in to join the waitlist")
      return
    }

    try {
      setIsLoading(true)
      await subscribe({
        userId: user.id,
        email: initialEmail || user.emailAddresses[0].emailAddress,
        name: user.fullName || user.firstName || null,
        // preferences: {} // Assuming subscribe action will be updated
      })
      toast.success("Successfully joined the waitlist!")
      router.refresh()
    } catch (error) {
      console.error("Error joining waitlist:", error)
      toast.error("Failed to join the waitlist. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full max-w-[500px] p-4 md:mt-4">
      <CardHeader className="md:pt-4">
        <CardTitle className="text-lg">Join the Waitlist</CardTitle>
        <CardDescription>Be the first to know when we launch and get exclusive early access.</CardDescription>
      </CardHeader>
      <CardContent className="md:pb-4">
        <div className="space-y-4">
          {isSignedIn ? (
            <div className="flex gap-4">
              <Button onClick={handleSubscribe} disabled={isLoading || !isSignedIn}>
                Join Waitlist
              </Button>
            </div>
          ) : (
            <p className="border p-4 rounded-lg mt-6">
              Please{" "}
              <Link href="/sign-in/" className="text-primary hover:underline">
                sign in
              </Link>{" "}
              to join the waitlist.
            </p>
          )}
          <p className="text-sm text-muted-foreground pt-4">We&apos;ll notify you as soon as we&apos;re ready. You can unsubscribe at any time.</p>
        </div>
      </CardContent>
    </Card>
  )
}
