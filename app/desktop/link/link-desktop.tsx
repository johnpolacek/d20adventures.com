"use client"

import { Heading } from "@d20/ui/typography/heading"
import { SignInButton, useUser } from "@clerk/nextjs"
import { useCallback, useEffect, useState } from "react"
import { eyebrow, Pill, panel } from "@d20/ui/stage/hud"
import { Button } from "@d20/ui/button"
import Image from "@d20/ui/native-image"
import { cn } from "@/lib/utils"
import { Input } from "@d20/ui/input"
import { Label } from "@d20/ui/label"
import { Presence, Swap } from "@d20/ui/presence"

type Pending = { deviceName: string; approved: boolean }
type Device = { id: string; name: string; createdAt: number; lastSeenAt?: number }

const clean = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, "")
const formatCode = (code: string) => {
  const c = clean(code)
  return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : code
}

// The code from the app, as two rows of parchment tiles.
function CodeTiles({ code }: { code: string }) {
  const c = clean(code)
  const tile = "stage-parchment grid h-12 w-9 place-items-center rounded-hud font-display text-2xl text-background shadow-[inset_0_-2px_0_#0003,0_2px_6px_#0008]"
  return (
    <div className="flex items-center justify-center gap-1.5" role="img" aria-label={`Code ${formatCode(code)}`}>
      {[...c.slice(0, 4)].map((ch, i) => (
        <span key={`a${i}`} className={tile}>
          {ch}
        </span>
      ))}
      <span className="mx-1 h-[2px] w-3 bg-accent/70" />
      {[...c.slice(4)].map((ch, i) => (
        <span key={`b${i}`} className={tile}>
          {ch}
        </span>
      ))}
    </div>
  )
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
  // An unlinked computer stays in the list while it animates out.
  const [unlinked, setUnlinked] = useState<string[]>([])

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
    if (res.ok) setUnlinked((ids) => [...ids, id])
  }

  const listed = devices.filter((device) => !unlinked.includes(device.id))

  return (
    <section className="relative grid min-h-screen place-items-center overflow-hidden px-4 pt-28 pb-16">
      <Image fill src="/stage/covers/welcome-to-kordavos.jpg" alt="" className="scale-105 object-cover blur-[2px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#0008,#000d_70%)]" />
      <Presence show={isLoaded} asChild>
        <div className={cn(panel, "relative w-full max-w-md px-8 py-9 text-center text-foreground")}>
          <div className={eyebrow}>D20 Adventures · Desktop</div>
          <Heading variant="h2" as="h1" className="mt-3">{linked ? "Linked" : "Link This Computer"}</Heading>
          <div className="mx-auto mt-5 mb-7 h-px w-32 bg-gradient-to-r from-transparent via-accent/80 to-transparent" />

          <Swap id={!isSignedIn ? "sign-in" : linked ? "linked" : pending ? "pending" : "code"} motion="rise" exit="fade">
            {!isSignedIn ? (
              <div className="space-y-6">
                <p className="font-serif text-foreground/85">Sign in to link the app to your account.</p>
                <SignInButton mode="modal">
                  <Button variant="epic">Sign in</Button>
                </SignInButton>
              </div>
            ) : linked ? (
              <div className="space-y-2 font-serif">
                <p className="text-lg">{linked}</p>
                <p className="text-foreground/75">Return to the app. Your adventures download there.</p>
              </div>
            ) : pending ? (
              <div className="space-y-6">
                <CodeTiles code={code} />
                <div>
                  <div className={eyebrow}>Computer</div>
                  <p className="mt-1 font-serif text-lg">{pending.deviceName}</p>
                </div>
                <Button variant="epic" onClick={approve} disabled={busy}>
                  {busy ? "Linking..." : "Link"}
                </Button>
              </div>
            ) : (
              <form
                className="space-y-6"
                onSubmit={(e) => {
                  e.preventDefault()
                  void lookup(code)
                }}
              >
                <Label plain htmlFor="link-code" className={cn(eyebrow, "block")}>
                  Code shown in the app
                </Label>
                <Input
                  plain
                  id="link-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="ABCD-EFGH"
                  autoComplete="off"
                  spellCheck={false}
                  className="stage-parchment w-full rounded-hud px-4 py-3 text-center font-display text-2xl tracking-label text-background uppercase placeholder:text-background/30 focus:outline-none focus:ring-2 focus:ring-accent"
                />
                <Button type="submit" variant="epic" disabled={clean(code).length !== 8}>
                  Continue
                </Button>
              </form>
            )}
          </Swap>

          <Presence show={Boolean(error)} asChild motion="drop">
            {error && <p className="mt-5 font-serif text-sm text-red-300">{error}</p>}
          </Presence>

          <Presence show={Boolean(isSignedIn) && listed.length > 0} asChild motion="fade">
            <div className="mt-9 text-left">
              <div className="stage-rule mb-5 h-px w-full opacity-60" />
              <div className={cn(eyebrow, "mb-3")}>Linked computers</div>
              <ul className="space-y-2">
                {devices.map((device, i) => (
                  <Presence key={device.id} show={!unlinked.includes(device.id)} asChild motion="rise" exit="left" index={i}>
                    <li className="stage-navy flex items-center justify-between gap-4 rounded-hud border border-foreground/20 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate font-serif">{device.name}</div>
                        <div className="text-3xs text-muted-foreground">Linked {new Date(device.createdAt).toLocaleDateString()}</div>
                      </div>
                      <Pill onClick={() => revoke(device.id)}>Unlink</Pill>
                    </li>
                  </Presence>
                ))}
              </ul>
            </div>
          </Presence>
        </div>
      </Presence>
    </section>
  )
}
