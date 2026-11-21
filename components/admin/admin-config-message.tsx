"use client"

import { Heading } from "@d20/ui/typography/heading"
import { useUser } from "@clerk/nextjs"
import { Copy, ShieldUser } from "lucide-react"
import { toast } from "@d20/ui/toast"
import { Button } from "@d20/ui/button"
import { Card } from "@d20/ui/card"
import { Swap } from "@d20/ui/presence"

export function AdminConfigMessage() {
  const { user } = useUser()

  const handleCopyId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id)
      toast.success("User ID copied to clipboard!")
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex justify-center mb-4">
          <div className="p-2 rounded-full bg-accent-500/10">
            <ShieldUser className="w-8 h-8 text-accent-600" />
          </div>
        </div>
        <Heading variant="h4" as="h3" className="text-center">Configure Admin Access</Heading>
        <p className="text-sm text-white/60 text-center text-balance">
          To access admin features, you need to add your Clerk User ID to the <code className="px-1.5 py-0.5 rounded-md bg-zinc-800">ADMIN_USER_IDS</code> environment variable.
        </p>
        <div className="p-4 rounded-lg bg-zinc-800 space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">Your Clerk User ID:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded bg-black">
                <Swap id={user?.id || "none"} as="span">
                  {user?.id || "Not signed in"}
                </Swap>
              </code>
              <Button size="icon" variant="outline" onClick={handleCopyId} disabled={!user?.id}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Add to your .env file:</p>
            <code className="block px-3 py-2 rounded bg-black text-sm">
              <Swap id={user?.id || "none"} as="span">
                ADMIN_USER_IDS={user?.id || "your_user_id"}
              </Swap>
            </code>
          </div>
        </div>
        <p className="text-xs text-white/60 text-center">After updating your .env file, restart your development server for changes to take effect.</p>
      </div>
    </Card>
  )
}
