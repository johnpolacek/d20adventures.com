"use client"

import { Heading } from "@d20/ui/typography/heading"
import { SignInButton, useUser } from "@clerk/nextjs"
import { useCallback, useEffect, useRef, useState } from "react"
import { eyebrow, Pill, panel } from "@d20/ui/stage/hud"
import { Button } from "@d20/ui/button"
import Image from "@d20/ui/native-image"
import { cn } from "@/lib/utils"
import { Input } from "@d20/ui/input"
import { Label } from "@d20/ui/label"
import { Presence, Swap } from "@d20/ui/presence"
import { served } from "@/lib/served"

type Pending = { deviceName: string; approved: boolean }
type Device = { id: string; name: string; createdAt: number; lastSeenAt?: number }
type LinkStep =
  | { kind: "enter_code"; error: string | null }
  | { kind: "looking_up" }
  | { kind: "confirm"; deviceName: string; approving: boolean; error: string | null }
  | { kind: "linked"; deviceName: string }

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
  const [step, setStep] = useState<LinkStep>({ kind: "enter_code", error: null })
  const [devices, setDevices] = useState<Device[]>([])
  // An unlinked computer stays in the list while it animates out.
  const [unlinked, setUnlinked] = useState<string[]>([])
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current)
    },
    []
  )

  const loadDevices = useCallback(async () => {
    const res = await fetch("/api/desktop/devices")
    if (res.ok) setDevices(((await res.json()) as { devices: Device[] }).devices)
  }, [])

  const lookup = useCallback(async (value: string) => {
    setStep({ kind: "looking_up" })
    try {
      const res = await fetch(`/api/desktop/link/approve?code=${encodeURIComponent(value)}`)
      const data = await res.json()
      if (res.ok) {
        const pending = data as Pending
        setStep({ kind: "confirm", deviceName: pending.deviceName, approving: false, error: null })
      } else {
        setStep({ kind: "enter_code", error: data.error ?? "This code is invalid or has expired." })
      }
    } catch {
      setStep({ kind: "enter_code", error: "Could not verify that code. Please try again." })
    }
  }, [])

  useEffect(() => {
    if (!isSignedIn) return
    void loadDevices()
    if (initialCode) void lookup(initialCode)
  }, [isSignedIn, initialCode, lookup, loadDevices])

  const approve = async () => {
    if (step.kind !== "confirm" || step.approving) return
    const { deviceName } = step
    setStep({ kind: "confirm", deviceName, approving: true, error: null })
    try {
      const res = await fetch("/api/desktop/link/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) })
      const data = await res.json()
      if (!res.ok) {
        setStep({ kind: "confirm", deviceName, approving: false, error: data.error ?? "This code is invalid or has expired." })
        return
      }
      setStep({ kind: "linked", deviceName: data.deviceName })
      if (refreshTimerRef.current !== null) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null
        void loadDevices()
      }, 4000)
    } catch {
      setStep({ kind: "confirm", deviceName, approving: false, error: "Could not link this computer. Please try again." })
    }
  }

  const revoke = async (id: string) => {
    const res = await fetch(`/api/desktop/devices?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    if (res.ok) setUnlinked((ids) => [...ids, id])
  }

  const listed = devices.filter((device) => !unlinked.includes(device.id))
  const error = step.kind === "enter_code" || step.kind === "confirm" ? step.error : null
  const swapId = !isSignedIn ? "sign-in" : step.kind === "linked" ? "linked" : step.kind === "confirm" ? "pending" : "code"

  return (
    <section className="relative grid min-h-screen place-items-center overflow-hidden px-4 pt-28 pb-16">
      <Image fill src={served("/stage/covers/welcome-to-kordavos.jpg")} alt="" className="scale-105 object-cover blur-[2px]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,#0008,#000d_70%)]" />
      <Presence show={isLoaded} asChild>
        <div className={cn(panel, "relative w-full max-w-md px-8 py-9 text-center text-foreground")}>
          <div className={eyebrow}>D20 Adventures · Desktop</div>
          <Heading variant="h2" as="h1" className="mt-3">{step.kind === "linked" ? "Linked" : "Link This Computer"}</Heading>
          <div className="mx-auto mt-5 mb-7 h-px w-32 bg-gradient-to-r from-transparent via-accent/80 to-transparent" />

          <Swap id={swapId} motion="rise" exit="fade">
            {!isSignedIn ? (
              <div className="space-y-6">
                <p className="font-serif text-foreground/85">Sign in to link the app to your account.</p>
                <SignInButton mode="modal">
                  <Button variant="epic">Sign in</Button>
                </SignInButton>
              </div>
            ) : step.kind === "linked" ? (
              <div className="space-y-2 font-serif">
                <p className="text-lg">{step.deviceName}</p>
                <p className="text-foreground/75">Return to the app. Your adventures download there.</p>
              </div>
            ) : step.kind === "confirm" ? (
              <div className="space-y-6">
                <CodeTiles code={code} />
                <div>
                  <div className={eyebrow}>Computer</div>
                  <p className="mt-1 font-serif text-lg">{step.deviceName}</p>
                </div>
                <Button variant="epic" onClick={approve} disabled={step.approving}>
                  {step.approving ? "Linking..." : "Link"}
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
                <Button type="submit" variant="epic" disabled={clean(code).length !== 8 || step.kind === "looking_up"}>
                  {step.kind === "looking_up" ? "Checking..." : "Continue"}
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
