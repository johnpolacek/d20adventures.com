"use client"

import { useState } from "react"
import { unsubscribe } from "@/app/_actions/mailing-list"
import { Button } from "@d20/ui/button"
import { Input } from "@d20/ui/input"
import { Label } from "@d20/ui/label"
import { Presence, Swap } from "@d20/ui/presence"

export default function UnsubscribeForm() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  async function handleUnsubscribe(e: React.FormEvent) {
    e.preventDefault()
    setStatus("idle")
    setError(null)
    try {
      const result = await unsubscribe(email)
      if (result.success) {
        setStatus("success")
      } else {
        setStatus("error")
        setError(result.error || "Could not unsubscribe. Please check your email.")
      }
    } catch (err: unknown) {
      setStatus("error")
      setError(err instanceof Error ? err.message : "Could not unsubscribe. Please try again.")
    }
  }

  return (
    <Swap id={status === "success" ? "done" : "form"}>
      {status === "success" ? (
        <div className="text-center text-green-600 font-semibold py-6">You have been unsubscribed from our mailing list.</div>
      ) : (
        <form onSubmit={handleUnsubscribe} className="space-y-6">
          <div>
            <Label plain htmlFor="email" className="block mb-2 font-medium">
              Email address
            </Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" size="lg" variant="destructive">
            Unsubscribe
          </Button>
          <Presence show={status === "error"} asChild motion="drop">
            <div className="text-red-600 text-sm text-center mt-2">{error}</div>
          </Presence>
        </form>
      )}
    </Swap>
  )
}
