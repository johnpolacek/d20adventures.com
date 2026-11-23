"use client"

import { useUser } from "@clerk/nextjs"
import { Copy, ShieldUser } from "lucide-react"
import { toast } from "@d20/ui/toast"
import { Button } from "@d20/ui/button"
import { Swap } from "@d20/ui/presence"

// Shown in Admin's place until ADMIN_USER_IDS is set: the signed-in user's id, ready to copy into .env.
export function AdminConfigMessage() {
  const { user } = useUser()

  const handleCopyId = () => {
    if (user?.id) {
      navigator.clipboard.writeText(user.id)
      toast.success("User ID copied to clipboard!")
    }
  }

  return (
    <section className="up-panel up-panel-body space-y-4">
      <div className="flex justify-center" style={{ color: "var(--up-accent)" }}>
        <ShieldUser className="h-8 w-8" />
      </div>
      <h2 className="text-center text-xl font-semibold" style={{ color: "var(--up-strong)" }}>
        Configure Admin Access
      </h2>
      <p className="text-balance text-center text-sm" style={{ color: "var(--up-muted)" }}>
        To access admin features, you need to add your Clerk User ID to the <code className="up-code">ADMIN_USER_IDS</code> environment variable.
      </p>
      <div className="up-well space-y-4 p-4">
        <div className="space-y-2">
          <p className="up-label !mb-0">Your Clerk User ID</p>
          <div className="flex items-center gap-2">
            <code className="up-code flex-1 !px-3 !py-2">
              <Swap id={user?.id || "none"} as="span">
                {user?.id || "Not signed in"}
              </Swap>
            </code>
            <Button variant="plain" className="up-btn" aria-label="Copy User ID" onClick={handleCopyId} disabled={!user?.id}>
              <Copy />
            </Button>
          </div>
        </div>
        <div className="space-y-2">
          <p className="up-label !mb-0">Add to Your .env File</p>
          <code className="up-code block !px-3 !py-2 text-sm">
            <Swap id={user?.id || "none"} as="span">
              ADMIN_USER_IDS={user?.id || "your_user_id"}
            </Swap>
          </code>
        </div>
      </div>
      <p className="up-small text-center">After updating your .env file, restart your development server for changes to take effect.</p>
    </section>
  )
}
