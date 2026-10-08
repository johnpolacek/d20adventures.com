import { useCallback, useEffect, useRef, useState } from "react"
import { eyebrow, Pill, panel } from "@/components/stage/hud"
import { cn } from "@/lib/utils"
import type { AccountState, LinkState } from "../runtime/account"
import { account, openSite } from "./bridge"

type Waiting = Extract<LinkState, { status: "waiting" }>

// Links this computer to a website account: the app shows a code, the player approves it on the website.
export function Account() {
  const [state, setState] = useState<AccountState | null>(null)
  const [link, setLink] = useState<Waiting | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const polling = useRef<Waiting | null>(null)

  useEffect(() => {
    void account({ kind: "accountStatus" }).then((res) => setState(res.account ?? { linked: "offline" }))
  }, [])

  const stop = useCallback(() => {
    polling.current = null
    setLink(null)
  }, [])

  const poll = useCallback(async () => {
    const current = polling.current
    if (!current) return
    if (Date.now() > current.expiresAt) {
      stop()
      return setError("The code expired. Try again.")
    }
    const res = await account({ kind: "accountLinkPoll", pollSecret: current.pollSecret }).catch(() => null)
    if (polling.current !== current) return
    if (res?.link?.status === "expired") {
      stop()
      return setError("The code expired. Try again.")
    }
    if (res?.account?.linked === true) {
      stop()
      return setState(res.account)
    }
    setTimeout(poll, current.interval * 1000)
  }, [stop])

  const start = async () => {
    setBusy(true)
    setError(null)
    try {
      const res = await account({ kind: "accountLinkStart" })
      if (res.error || res.link?.status !== "waiting") return setError(res.error ?? "Could not start linking.")
      polling.current = res.link
      setLink(res.link)
      await openSite(res.link.verifyPath)
      setTimeout(poll, res.link.interval * 1000)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  const unlink = async () => {
    setBusy(true)
    try {
      const res = await account({ kind: "accountUnlink" })
      setState(res.account ?? { linked: false })
    } finally {
      setBusy(false)
    }
  }

  if (!state) return null
  return (
    <div className="absolute right-5 top-5 z-50 flex flex-col items-end gap-2 text-left">
      {state.linked === true ? (
        <div className="flex items-center gap-3 text-xs text-stage-cream">
          <span>{state.account}</span>
          <Pill disabled={busy} onClick={() => void unlink()}>
            Unlink
          </Pill>
        </div>
      ) : link ? null : (
        <Pill disabled={busy} onClick={() => void start()}>
          {state.linked === "offline" ? "Account offline" : "Link account"}
        </Pill>
      )}
      {link && (
        <div className={cn(panel, "w-72 space-y-3 p-4")}>
          <div className={eyebrow}>Link this computer</div>
          <div className="text-center font-mono text-3xl tracking-[.2em] text-stage-cream">{link.userCode}</div>
          <div className="flex gap-2">
            <Pill onClick={() => void openSite(link.verifyPath)}>Open website</Pill>
            <Pill onClick={stop}>Cancel</Pill>
          </div>
        </div>
      )}
      {error && <div className="text-xs text-stage-cream">{error}</div>}
    </div>
  )
}
