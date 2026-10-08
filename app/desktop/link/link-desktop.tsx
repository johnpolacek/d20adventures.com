"use client"

import { SignInButton, useUser } from "@clerk/nextjs"
import { useCallback, useEffect, useState } from "react"
import { Heading } from "@/components/typography/heading"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Pending = { deviceName: string; approved: boolean }
type Device = { id: string; name: string; createdAt: number; lastSeenAt?: number }

const formatCode = (code: string) => {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "")
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : code
}

// The player confirms the code their desktop app shows. The app finishes linking on its own.
export function LinkDesktop({ initialCode }: { initialCode: string }) {
  const { isSignedIn, isLoaded } = useUser()
  const [code, setCode] = useState(formatCode(initialCode))
  const [pending, setPending] = useState<Pending | null>(null)
  const [linked, setLinked] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [devices, setDevices] = useState<Device[]>([])

  const loadDevices = useCallback(async () => {
    const res = await fetch("/api/desktop/devices")
    if (res.ok) setDevices(((await res.json()) as { devices: Device[] }).devices)
  }, [])

  const lookup = useCallback(async (value: string) => {
    setError(null)
    setPending(null)
    const res = await fetch(`/api/desktop/link/approve?code=${encodeURIComponent(value)}`)
    const data = await res.json()
    if (res.ok) setPending(data as Pending)
    else setError(data.error ?? "This code is invalid or has expired.")
  }, [])

  useEffect(() => {
    if (!isSignedIn) return
    void loadDevices()
    if (initialCode) void lookup(initialCode)
  }, [isSignedIn, initialCode, lookup, loadDevices])

  const approve = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/desktop/link/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) })
      const data = await res.json()
      if (!res.ok) return setError(data.error ?? "This code is invalid or has expired.")
      setLinked(data.deviceName)
      setPending(null)
      setTimeout(loadDevices, 4000)
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (id: string) => {
    const res = await fetch(`/api/desktop/devices?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (res.ok) setDevices((d) => d.filter((device) => device.id !== id))
  }

  if (!isLoaded) return null

  return (
    <div className="container py-8 md:py-12">
      <div className="mx-auto max-w-md space-y-6">
        <Heading variant="h2" className="font-heading text-3xl md:text-4xl font-bold text-center">
          Link the desktop app
        </Heading>
        <Card className="p-6 space-y-4">
          {!isSignedIn ? (
            <div className="space-y-4 text-center">
              <p className="text-muted-foreground">Sign in to link this computer to your account.</p>
              <SignInButton mode="modal">
                <Button variant="epic">Sign in</Button>
              </SignInButton>
            </div>
          ) : linked ? (
            <div className="space-y-2 text-center">
              <p className="text-lg font-medium">{linked} is linked.</p>
              <p className="text-muted-foreground">Return to the app.</p>
            </div>
          ) : pending ? (
            <div className="space-y-4 text-center">
              <p className="text-muted-foreground">Code {formatCode(code)}</p>
              <p className="text-lg font-medium">Link {pending.deviceName}?</p>
              <div className="flex justify-center">
                <Button variant="epic" onClick={approve} disabled={busy}>
                  {busy ? "Linking..." : "Link this computer"}
                </Button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                void lookup(code)
              }}
            >
              <label htmlFor="link-code" className="text-sm text-muted-foreground">
                Code shown in the app
              </label>
              <Input id="link-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EFGH" autoComplete="off" className="text-center text-lg tracking-widest uppercase" />
              <div className="flex justify-center">
                <Button type="submit" variant="epic" disabled={!code.trim()}>
                  Continue
                </Button>
              </div>
            </form>
          )}
          {error && <p className="text-sm text-destructive text-center">{error}</p>}
        </Card>
        {isSignedIn && devices.length > 0 && (
          <Card className="p-6 space-y-3">
            <h3 className="font-medium">Linked computers</h3>
            {devices.map((device) => (
              <div key={device.id} className="flex items-center justify-between gap-4 text-sm">
                <span>
                  {device.name}
                  <span className="text-muted-foreground"> · since {new Date(device.createdAt).toLocaleDateString()}</span>
                </span>
                <Button variant="outline" className="text-sm text-white" onClick={() => revoke(device.id)}>
                  Unlink
                </Button>
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  )
}
