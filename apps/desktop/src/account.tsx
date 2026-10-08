import { useCallback, useEffect, useRef, useState } from "react"
import { Pill, panel } from "@/components/stage/hud"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { AccountResponse, AccountState, LinkState } from "../runtime/account"
import { account, accountInfo, openSite } from "./bridge"

type Waiting = Extract<LinkState, { status: "waiting" }>

// The computer's link to a website account: the app shows a code, the player approves it on the website.
// Playing needs a linked account (owner, 2026-10-08). Development builds skip that unless D20_REQUIRE_ACCOUNT is set.
// Once linked, each status check downloads the story packs of owned adventures, and onPacks reloads the game's list.
export function useAccount(opts: { onPacks: () => void }) {
  // From Rust before any network call: whether play needs an account, and whether a token is stored.
  const [info, setInfo] = useState<{ required: boolean; linked: boolean } | null>(null)
  const [state, setState] = useState<AccountState | null>(null)
  const [owned, setOwned] = useState<string[]>([])
  const [failed, setFailed] = useState<string[]>([])
  const [link, setLink] = useState<Waiting | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const polling = useRef<Waiting | null>(null)

  // The parent passes a new callback each render. Keep the latest without re-running the status check.
  const onPacks = useRef(opts.onPacks)
  onPacks.current = opts.onPacks
  const settle = useCallback((res: AccountResponse) => {
    setState(res.account)
    if (res.account.linked === true) setOwned((res.adventures ?? []).filter((a) => a.owned).map((a) => a.id))
    else if (res.account.linked === false) setOwned([])
    setFailed(res.failed ?? [])
    if (res.updated?.length) onPacks.current()
    if (res.failed?.length) setError("Some adventures could not download. They will retry next time.")
  }, [])

  useEffect(() => {
    void accountInfo()
      .then(setInfo)
      .catch(() => setInfo({ required: false, linked: false }))
    void account({ kind: "accountStatus" })
      .then(settle)
      .catch(() => setState({ linked: "offline" }))
  }, [settle])

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
      return settle(res)
    }
    setTimeout(poll, current.interval * 1000)
  }, [stop, settle])

  const start = useCallback(async () => {
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
  }, [poll])

  const unlink = useCallback(async () => {
    setBusy(true)
    try {
      settle(await account({ kind: "accountUnlink" }))
    } finally {
      setBusy(false)
    }
  }, [settle])

  // A stored token lets play begin while the website check runs, so a linked player is never held up offline.
  const linkedNow = state ? state.linked !== false : info?.linked
  return {
    ready: info !== null,
    required: info?.required ?? false,
    gated: Boolean(info?.required && !linkedNow),
    state,
    owned,
    failed,
    link,
    error,
    busy,
    start,
    stop,
    unlink,
  }
}

export type Account = ReturnType<typeof useAccount>

// The code from the app, as parchment tiles, matching the website's link page.
function CodeTiles({ code }: { code: string }) {
  const c = code.replace(/[^A-Z0-9]/g, "")
  const tile = "stage-parchment grid h-12 w-9 place-items-center rounded-[3px] font-display text-2xl text-stage-ink shadow-[inset_0_-2px_0_#0003,0_2px_6px_#0008]"
  return (
    <div className="flex items-center justify-center gap-1.5" role="img" aria-label={`Code ${code}`}>
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

function Waiting({ account: a }: { account: Account }) {
  if (!a.link) return null
  return (
    <div className="space-y-4">
      <CodeTiles code={a.link.userCode} />
      <p className="font-serif text-sm text-stage-cream/80">Approve this code on the website.</p>
      <div className="flex justify-center gap-2">
        <Pill onClick={() => void openSite(a.link!.verifyPath)}>Open website</Pill>
        <Pill onClick={a.stop}>Cancel</Pill>
      </div>
    </div>
  )
}

// Top right of the title screen: the linked account with Unlink, or Link account when play does not need one.
export function AccountBadge({ account: a }: { account: Account }) {
  if (!a.ready || !a.state || a.gated) return null
  return (
    <div className="absolute right-5 top-5 z-50 flex flex-col items-end gap-2 text-left">
      {a.state.linked === true ? (
        <div className="flex items-center gap-3 text-xs text-stage-cream">
          <span>{a.state.account}</span>
          <Pill disabled={a.busy} onClick={() => void a.unlink()}>
            Unlink
          </Pill>
        </div>
      ) : a.state.linked === "offline" ? (
        <div className="text-xs text-stage-muted">Account offline</div>
      ) : a.link ? (
        <div className={cn(panel, "w-80 p-4 text-center")}>
          <Waiting account={a} />
        </div>
      ) : (
        <Pill disabled={a.busy} onClick={() => void a.start()}>
          Link account
        </Pill>
      )}
      {a.error && <div className="text-xs text-stage-cream">{a.error}</div>}
    </div>
  )
}

// In place of the title screen's choices until this computer is linked.
export function LinkGate({ account: a }: { account: Account }) {
  return (
    <div className={cn(panel, "w-[min(460px,92vw)] px-8 py-9 text-center text-stage-cream")}>
      <h1 className="font-display text-4xl leading-tight">Link your account</h1>
      <div className="mx-auto mt-5 mb-6 h-px w-32 bg-gradient-to-r from-transparent via-stage-gold/80 to-transparent" />
      {a.link ? (
        <Waiting account={a} />
      ) : (
        <div className="space-y-6">
          <p className="text-balance font-serif text-stage-cream/85">Link this computer to your D20 Adventures account to play.</p>
          <Button variant="epic" disabled={a.busy} onClick={() => void a.start()}>
            {a.busy ? "Opening…" : "Link account"}
          </Button>
        </div>
      )}
      {a.error && <p className="mt-5 font-serif text-sm text-red-300">{a.error}</p>}
    </div>
  )
}
