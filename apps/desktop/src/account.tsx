import { useCallback, useEffect, useRef, useState } from "react"
import { textShadowSpreadLight } from "@d20/ui/typography/styles"
import { Button } from "@d20/ui/button"
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@d20/ui/menu"
import { Rule, siteOutline } from "@d20/ui/site"
import { cardVariants } from "@d20/ui/card"
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

// The code from the app, as paper tiles.
function CodeTiles({ code }: { code: string }) {
  const c = code.replace(/[^A-Z0-9]/g, "")
  const tile =
    "grid h-12 w-9 place-items-center rounded-sm bg-amber-50 bg-[url('/images/app/backgrounds/paper-texture.png')] bg-[length:120px] font-display text-2xl font-bold text-primary-700 ring-2 ring-black"
  return (
    <div className="flex items-center justify-center gap-2" role="img" aria-label={`Code ${code}`}>
      {[...c.slice(0, 4)].map((ch, i) => (
        <span key={`a${i}`} className={tile}>
          {ch}
        </span>
      ))}
      <span className="mx-1 h-[2px] w-3 bg-amber-400/70" />
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
      <p className="text-sm text-gray-300">Approve this code on the website.</p>
      <div className="flex justify-center gap-2">
        <Button variant="plain" type="button" className={cn(siteOutline, "px-3 py-1 text-sm")} onClick={() => void openSite(a.link!.verifyPath)}>
          Open website
        </Button>
        <Button variant="plain" type="button" className={cn(siteOutline, "px-3 py-1 text-sm")} onClick={a.stop}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

// In the header: the linked account's picture, as the website's user button, which opens the account menu with who
// is linked and Unlink. Otherwise Link account, when play does not need one or the link is unconfirmed.
export function AccountBadge({ account: a }: { account: Account }) {
  if (!a.ready || !a.state || a.gated) return null
  if (a.state.linked === true)
    return (
      <Menu>
        <MenuTrigger
          aria-label={`Account, ${a.state.account}`}
          // Undoes the header's paper filter, which doubles saturation and turns hues 30 degrees.
          className="my-2 grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-primary-600 font-display text-sm text-white hue-rotate-30 saturate-50"
        >
          {a.state.avatar ? <img src={a.state.avatar} alt="" className="h-full w-full object-cover" /> : a.state.account.slice(0, 1).toUpperCase()}
        </MenuTrigger>
        <MenuContent align="end" className={cn(cardVariants({ variant: "frame" }), "w-64 p-3")}>
          <p className="truncate px-1 text-sm text-gray-300">{a.state.account}</p>
          <MenuItem className={cn(siteOutline, "mt-3 w-full justify-center px-3 py-1 text-sm data-highlighted:bg-blue-950/90")} disabled={a.busy} onSelect={() => void a.unlink()}>
            Unlink
          </MenuItem>
        </MenuContent>
      </Menu>
    )
  // Offline too: a stored token the website could not confirm. Linking again replaces it.
  return (
    <Button variant="emboss" className="my-2 px-4 py-1 font-display text-sm normal-case tracking-normal" disabled={a.busy || Boolean(a.link)} onClick={() => void a.start()}>
      Link account
    </Button>
  )
}

// Below the header, at the right: the code to approve while linking, and any account error.
export function AccountNotice({ account: a }: { account: Account }) {
  if (!a.ready || a.gated || !(a.link || a.error)) return null
  return (
    <div className="absolute top-4 right-8 z-30 flex flex-col items-end gap-2">
      {a.link && (
        <div className={cn(cardVariants({ variant: "frame" }), "w-80 p-5 text-center")}>
          <Waiting account={a} />
        </div>
      )}
      {a.error && <div className="rounded bg-black/80 px-3 py-1 text-sm text-red-300">{a.error}</div>}
    </div>
  )
}

// In the feedback panel, in place of the form, until this computer is linked. Feedback is sent under the account.
export function FeedbackLink({ account: a }: { account: Account }) {
  if (a.link)
    return (
      <div className="text-center">
        <Waiting account={a} />
      </div>
    )
  return (
    <div className="space-y-4 text-center">
      <p className="font-serif text-stage-cream/80">Link this computer to your account to send feedback.</p>
      <Button variant="emboss" className="px-4 py-1 font-display text-sm normal-case tracking-normal" disabled={a.busy} onClick={() => void a.start()}>
        {a.busy ? "Opening…" : "Link Account"}
      </Button>
      {a.error && <p className="text-sm text-red-300">{a.error}</p>}
    </div>
  )
}

// In place of the title screen's choices until this computer is linked.
export function LinkGate({ account: a }: { account: Account }) {
  return (
    <div className={cn(cardVariants({ variant: "quiet" }), "w-[min(28rem,92vw)] px-8 py-9 text-center text-white")}>
      <h1 className="font-display text-3xl font-bold leading-tight text-amber-400" style={textShadowSpreadLight}>
        Link your account
      </h1>
      <Rule className="mx-auto mt-5 mb-6 w-48" />
      {a.link ? (
        <Waiting account={a} />
      ) : (
        <div className="space-y-6">
          <p className="text-balance text-lg">Link this computer to your D20 Adventures account to play.</p>
          <Button variant="epic" disabled={a.busy} onClick={() => void a.start()}>
            {a.busy ? "Opening…" : "Link account"}
          </Button>
        </div>
      )}
      {a.error && <p className="mt-5 text-sm text-red-300">{a.error}</p>}
    </div>
  )
}
