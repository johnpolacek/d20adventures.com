"use client"
import { useState, useTransition } from "react"
import { setUsername } from "@/app/_actions/profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function PlayerSetUsernameForm({ userId }: { userId: string }) {
  const [username, setUsernameState] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!username.trim()) {
      setError("Username is required")
      return
    }
    startTransition(async () => {
      const res = await setUsername(userId, username.trim())
      if (res.success) {
        window.location.href = `/player/${username.trim()}`
      } else {
        setError(res.error || "Failed to set username")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 sm:p-8 border border-white/30 ring-4 ring-black/20 rounded-lg bg-gradient-to-tl from-black/70 via-black/90 to-black/50">
      <Input placeholder="Enter a username" value={username} onChange={(e) => setUsernameState(e.target.value)} disabled={pending} autoFocus />
      {error && <div className="text-red-600 text-sm">{error}</div>}
      <div className="w-full flex justify-center">
        <Button type="submit" variant="epic" size="sm" className="text-sm" disabled={pending || !username.trim()}>
          {pending ? "Saving..." : "Set Username"}
        </Button>
      </div>
    </form>
  )
}
