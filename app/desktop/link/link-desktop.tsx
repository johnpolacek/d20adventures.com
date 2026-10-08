"use client"

import { SignInButton, useUser } from "@clerk/nextjs"
import { useCallback, useEffect, useState } from "react"
import { eyebrow, Pill, panel } from "@/components/stage/hud"
import { Button } from "@/components/ui/button"
import Image from "@/components/ui/native-image"
import { cn } from "@/lib/utils"

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
  const tile = "stage-parchment grid h-12 w-9 place-items-center rounded-[3px] font-display text-2xl text-stage-ink shadow-[inset_0_-2px_0_#0003,0_2px_6px_#0008]"
  return (
    <div className="flex items-center justify-center gap-1.5" role="img" aria-label={`Code ${formatCode(code)}`}>
      {[...c.slice(0, 4)].map((ch, i) => (
        <span key={`a${i}`} className={tile}>
          {ch}
        </span>
      ))}
      <span className="mx-1 h-[2px] w-3 bg-stage-gold/70" />
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

  return (
    <section className="relative grid min-h-screen place-items-center overflow-hidden px-4 pt-28 pb-16">
      <Image fill src="/stage/covers/march-of-davos.jpg" alt="" className="scale-105 object-cover blur-[2px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#0008,#000d_70%)]" />
      {isLoaded && (
        <div className={cn(panel, "relative w-full max-w-md px-8 py-9 text-center text-stage-cream")}>
          <div className={eyebrow}>D20 Adventures · Desktop</div>
          <h1 className="mt-3 font-display text-3xl leading-tight">{linked ? "Linked" : "Link this computer"}</h1>
          <div className="mx-auto mt-5 mb-7 h-px w-32 bg-gradient-to-r from-transparent via-stage-gold/80 to-transparent" />

          {!isSignedIn ? (
            <div className="space-y-6">
              <p className="font-serif text-stage-cream/85">Sign in to link the app to your account.</p>
              <SignInButton mode="modal">
                <Button variant="epic">Sign in</Button>
              </SignInButton>
            </div>
          ) : linked ? (
            <div className="space-y-2 font-serif">
              <p className="text-lg">{linked}</p>
              <p className="text-stage-cream/75">Return to the app. Your adventures download there.</p>
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
              <label htmlFor="link-code" className={cn(eyebrow, "block")}>
                Code shown in the app
              </label>
              <input
                id="link-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABCD-EFGH"
                autoComplete="off"
                spellCheck={false}
                className="stage-parchment w-full rounded-[3px] px-4 py-3 text-center font-display text-2xl tracking-[0.3em] text-stage-ink uppercase placeholder:text-stage-ink/30 focus:outline-none focus:ring-2 focus:ring-stage-gold"
              />
              <Button type="submit" variant="epic" disabled={clean(code).length !== 8}>
                Continue
              </Button>
            </form>
          )}

          {error && <p className="mt-5 font-serif text-sm text-red-300">{error}</p>}

          {isSignedIn && devices.length > 0 && (
            <div className="mt-9 text-left">
              <div className="stage-rule mb-5 h-px w-full opacity-60" />
              <div className={cn(eyebrow, "mb-3")}>Linked computers</div>
              <ul className="space-y-2">
                {devices.map((device) => (
                  <li key={device.id} className="stage-leather flex items-center justify-between gap-4 rounded-[3px] border border-stage-line/20 px-3 py-2">
                    <div className="min-w-0">
                      <div className="truncate font-serif">{device.name}</div>
                      <div className="text-[11px] text-stage-muted">Linked {new Date(device.createdAt).toLocaleDateString()}</div>
                    </div>
                    <Pill onClick={() => revoke(device.id)}>Unlink</Pill>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
