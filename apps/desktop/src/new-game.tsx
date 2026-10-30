import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Chip, Option, siteCard, siteLabel, siteOutline, sitePanel } from "@/components/ui/site"
import { cn } from "@/lib/utils"
import type { AdventureInfo, CatalogInfo } from "../runtime/game"
import type { Hero, PartyChoice } from "../runtime/heroes"
import type { GmModel } from "./bridge"
import { joinAs, openingParty, type Seat, seatCreated } from "./carry"
import { type FigureArt, STOCK_FIGURES } from "./figures"
import { ModuleCover } from "./module-cover"
import { portraitFor } from "./scenes"

type Pick = { id: string; name: string; race: string; archetype: string; portrait?: string; hero?: Hero }
// The small controls over a roster hero's card.
const mini = cn(siteOutline, "px-2 py-0.5 font-mono text-xxs")
// A text-only control: the quiet way out beside the main action.
const ghost = "rounded-md px-4 py-2 text-sm text-blue-50/80 transition-colors hover:text-white disabled:pointer-events-none disabled:opacity-50"
// A CLI by name, until its model is known and when it will not say.
const CLI: Record<string, string> = { claude: "Claude", codex: "Codex", grok: "Grok", antigravity: "Antigravity" }
// An adventure for sale that this app cannot play yet. Owned ones are downloading, or failed to.
export type Locked = CatalogInfo & { owned: boolean; failed: boolean }

const WHO = [
  ["you", "You"],
  ["ai", "AI"],
  ["invite", "Invite"],
] as const

export const price = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`

export function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="-mt-0.5 mr-1.5 inline h-3 w-3 fill-current">
      <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm2 0h4V5a2 2 0 1 0-4 0v2Z" />
    </svg>
  )
}

// Party setup for the adventure chosen on the Adventures page: who goes, who plays each hero, and which CLI runs the
// GM. The first hero is the player's, the rest default to AI. A hero set to Invite makes it a game hosted on the
// website, with that hero held for a friend. With every hero on Invite, guests choose first and the player gets a
// hero they leave. A party of one invited hero leaves the player none, so they watch. Roster heroes appear only where
// the adventure accepts their race and class. Keyed by adventure, so each starts from its own suggested party, or
// from the heroes of the adventure just finished when the player continues the story.
export function NewGame(props: {
  adventures: AdventureInfo[]
  adventure: string
  heroes: Hero[]
  providers: string[]
  // What each CLI runs as the GM, by CLI. Empty until they answer.
  models: Record<string, GmModel>
  provider: string
  onProvider: (p: string) => void
  busy: boolean
  // The opening scene is still loading.
  waiting: boolean
  created: string | null
  // The party of the adventure just finished, when the player continues the story from its ending.
  carried?: PartyChoice[]
  onStart: (party: PartyChoice[]) => void
  onCreate: () => void
  onEdit: (hero: Hero) => void
  // Painting a hero's art, when an image-capable CLI is installed.
  art: Record<string, FigureArt>
  painting: string | null
  onPaint?: (hero: Hero) => void
  onDelete: (hero: Hero) => void
  onCancel?: () => void
  // Adventures for sale that are not playable here yet, and whether this computer is linked to an account.
  locked: Locked[]
  // Usual prices of free adventures, by id, shown crossed out.
  listPrices: Record<string, number>
  linked: boolean | "offline"
  onLink?: () => void
  // Hosting the adventure on the website for friends instead: the player's heroes, and the heroes held for guests.
  // Needs a linked account, so Invite links first. Without a hero for the player, guests choose first, or with
  // watch the player has no hero at all. open is how many more seats take a guest's own hero, and approve whether
  // the host answers each of those.
  onHost?: (you: string[], invites: string[], ais: string[], open: number, approve: boolean, watch: boolean) => void
}) {
  const info = props.adventures.find((a) => a.id === props.adventure)
  const lockedInfo = info ? undefined : props.locked.find((a) => a.id === props.adventure)
  const [party, setParty] = useState<Seat[]>(() => openingParty(info, props.heroes, props.carried).map((c) => ({ id: c.id, who: c.ai ? "ai" : "you" })))
  const [deleting, setDeleting] = useState<string | null>(null)
  // Whether the host approves each hero a guest brings to an open seat. Off, the guest is seated at once.
  const [askFirst, setAskFirst] = useState(false)
  // The hero the player last held, so leaving a guest's choice of hero gives it back.
  const [lastYou, setLastYou] = useState<string | null>(null)
  const fits = (h: Hero) => Boolean(info?.options?.races.includes(h.race) && info.options.archetypes.includes(h.archetype))
  const picks: Pick[] = [
    ...(info?.premades ?? []).map((p) => ({ ...p, portrait: portraitFor(undefined, { ...p, type: "pc" }) })),
    ...props.heroes
      .filter(fits)
      .map((h) => ({ id: h.id, name: h.name, race: h.race, archetype: h.archetype, portrait: (h.painted && props.art[h.id]?.portrait) || STOCK_FIGURES[h.figure]?.art.portrait, hero: h })),
  ]
  const [min, max] = info?.players ?? [1, 1]
  // A hero just made from this screen joins the party as the player's, if they fit.
  const joining = props.created && picks.some((p) => p.id === props.created) ? props.created : null
  useEffect(() => {
    if (joining) setParty((p) => seatCreated(p, joining, max))
  }, [joining, max])
  if (lockedInfo) return <LockedAdventure info={lockedInfo} linked={props.linked} onLink={props.onLink} onCancel={props.onCancel} busy={props.busy} />
  if (!info) return null
  const sized = party.length >= min && party.length <= max
  const yours = party.filter((c) => c.who === "you")
  const invites = party.filter((c) => c.who === "invite" && !c.open).map((c) => c.id)
  const open = party.filter((c) => c.open).length
  // Any invited seat makes it a hosted game, with the player's heroes and AI heroes beside the guests.
  // With every hero invited, guests choose first and the player gets a hero they leave. A party of one invited seat
  // and AI heroes leaves none, and the player watches.
  const hosting = invites.length + open > 0
  const guestsChoose = yours.length === 0 && invites.length > 1
  const ais = party.filter((c) => c.who === "ai").map((c) => c.id)
  const watching = hosting && party.length - ais.length === 1
  const hostable = yours.length > 0 || guestsChoose || watching
  const ready = sized && (hosting ? hostable : yours.length > 0)
  const canInvite = Boolean(props.onHost)
  const seat = (id: string, who: Seat["who"]) => {
    if (who !== "you" && yours[0]?.id === id) setLastYou(id)
    setParty((cur) => cur.map((c) => (c.id === id ? { ...c, who } : c)))
  }
  // Which hero a guest plays: the one invited, or their choice among them all, with the player on the hero left.
  const held = party.filter((c) => !c.open)
  const back = held.find((c) => c.id === lastYou) ?? held[0]
  const theirs = guestsChoose ? held.filter((c) => c.id !== back?.id) : held.filter((c) => c.who === "invite")
  const guestPlays = canInvite && invites.length > 0 && yours.length < 2 && held.length > 1 && !party.some((c) => c.who === "ai")
  const chooseAny = (on: boolean) => {
    if (on) setLastYou(yours[0]?.id ?? null)
    setParty((cur) => cur.map((c) => (c.open ? c : on ? { ...c, who: "invite" } : c.id === back?.id ? { ...c, who: "you" } : c)))
  }
  const toggle = (id: string) =>
    setParty((p) => {
      if (p.some((c) => c.id === id)) {
        const rest = p.filter((c) => c.id !== id)
        const first = rest.findIndex((c) => !c.open)
        return first >= 0 && !rest.some((c) => c.who === "you") ? rest.map((c, i) => (i === first ? { ...c, who: "you" } : c)) : rest
      }
      return p.length < max ? [...p, { id, who: joinAs(p) }] : p
    })
  const range = min === max ? `${min}` : `${min}–${max}`
  return (
    <section className={cn(siteCard, "flex max-h-[94%] w-[min(72rem,96vw)] flex-col text-left backdrop-blur-xl")}>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-7 pb-5">
        <div className="grid gap-7 md:grid-cols-[minmax(240px,330px)_1fr]">
          <div className="relative md:sticky md:top-0 md:self-start">
            <ModuleCover id={info.id} title={info.title} players={info.players} />
            {props.listPrices[info.id] && (
              <Chip tone="amber" className="absolute bottom-3 left-3">
                <s className="mr-1.5 font-normal opacity-70">{price(props.listPrices[info.id])}</s>
                FREE
              </Chip>
            )}
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            {info.teaser && (
              <div>
                <div className={cn(siteLabel, "mb-2")}>The adventure</div>
                <p className="max-w-[70ch] text-base text-gray-300">{info.teaser}</p>
              </div>
            )}
            <div>
              <div className={cn(siteLabel, "mb-2")}>
                Party · {party.length} of {range}
              </div>
              {/* One column when seats can be invited: three choices leave no room for a second. */}
              <ul className={cn("grid gap-2", !canInvite && "sm:grid-cols-2")}>
                {party.map((choice) => {
                  if (choice.open)
                    return (
                      <li key={choice.id} className="flex items-center gap-3 rounded-lg border border-dashed border-white/20 bg-black/50 p-2">
                        <span className="grid h-12 w-10 shrink-0 place-items-center rounded border border-white/10 bg-white/5 font-display text-lg text-white/40">?</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-display text-base">Any hero</div>
                          <div className="text-xs text-white/70">A guest's own hero</div>
                        </div>
                        <fieldset className="flex" aria-label="Approving a guest's hero">
                          <Option active={!askFirst} aria-pressed={!askFirst} className="rounded-r-none" onClick={() => setAskFirst(false)}>
                            Auto-approve
                          </Option>
                          <Option active={askFirst} aria-pressed={askFirst} className="-ml-0.5 rounded-l-none" onClick={() => setAskFirst(true)}>
                            Ask me
                          </Option>
                        </fieldset>
                        <button type="button" aria-label="Remove the open seat" onClick={() => toggle(choice.id)} className="px-2 text-xl leading-none text-white/50 hover:text-white">
                          ×
                        </button>
                      </li>
                    )
                  const p = picks.find((x) => x.id === choice.id)
                  if (!p) return null
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/50 p-2">
                      <Face pick={p} size="h-12 w-10" />
                      <div className="min-w-0 flex-1">
                        <div className={cn("truncate font-display text-base", choice.who === "you" && "text-amber-400")}>{p.name}</div>
                        <div className="text-xs text-white/70">
                          {p.race} {p.archetype}
                        </div>
                      </div>
                      <fieldset className="flex" aria-label={`Who plays ${p.name}`}>
                        {(canInvite ? WHO : WHO.slice(0, 2)).map(([who, label], i, all) => (
                          <Option
                            key={who}
                            active={choice.who === who}
                            aria-pressed={choice.who === who}
                            className={cn(i > 0 && "-ml-0.5 rounded-l-none", i < all.length - 1 && "rounded-r-none")}
                            // The party keeps a hero for the player, unless another hero is invited or this is the
                            // only one: then this one can be invited too.
                            disabled={who !== "you" && choice.who === "you" && yours.length === 1 && !(who === "invite" && (invites.length > 0 || party.length === 1))}
                            onClick={() => seat(p.id, who)}
                          >
                            {label}
                          </Option>
                        ))}
                      </fieldset>
                      <button type="button" aria-label={`Remove ${p.name}`} onClick={() => toggle(p.id)} className="px-2 text-xl leading-none text-white/50 hover:text-white">
                        ×
                      </button>
                    </li>
                  )
                })}
              </ul>
              {guestPlays && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <span className={siteLabel}>{theirs.length > 1 ? "Guests play" : "Guest plays"}</span>
                  <fieldset className="flex" aria-label="Which hero a guest plays">
                    <Option active={!guestsChoose} aria-pressed={!guestsChoose} className="rounded-r-none" onClick={() => guestsChoose && chooseAny(false)}>
                      {theirs.length > 1 ? "Invited heroes" : (picks.find((p) => p.id === theirs[0]?.id)?.name ?? "Invited hero")}
                    </Option>
                    <Option active={guestsChoose} aria-pressed={guestsChoose} className="-ml-0.5 rounded-l-none" onClick={() => guestsChoose || chooseAny(true)}>
                      {held.length > 2 ? "Their choice" : "Either hero"}
                    </Option>
                  </fieldset>
                  {guestsChoose && <span className="text-sm text-white/70">{held.length > 2 ? "You choose who plays the rest at Start." : "You play the other."}</span>}
                </div>
              )}
              {watching && <p className="mt-3 text-sm text-white/70">You watch your guest play.</p>}
            </div>
            <div>
              <div className={cn(siteLabel, "mb-2")}>Heroes</div>
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
                {picks.map((p) => {
                  const chosen = party.some((c) => c.id === p.id)
                  return (
                    <li key={p.id} className="relative">
                      <button
                        type="button"
                        aria-pressed={chosen}
                        disabled={!chosen && party.length >= max}
                        onClick={() => toggle(p.id)}
                        className={cn(
                          "flex w-full flex-col items-stretch gap-2 rounded-lg border bg-black p-2 text-left transition-all duration-300 disabled:cursor-default disabled:opacity-40",
                          chosen ? "border-primary-400 ring-2 ring-primary-500" : "border-white/10 hover:border-white/40"
                        )}
                      >
                        <Face pick={p} size="h-24 w-full" />
                        <span className={cn("truncate font-display text-sm", chosen && "text-amber-400")}>{p.name}</span>
                        <span className="-mt-2 truncate text-xs text-white/70">
                          {p.race} {p.archetype}
                        </span>
                      </button>
                      {p.hero && (
                        <div className="absolute top-3 right-3 flex gap-1">
                          <button type="button" className={mini} disabled={props.busy} onClick={() => props.onEdit(p.hero!)} aria-label={`Edit ${p.name}`}>
                            Edit
                          </button>
                          {props.onPaint && (
                            <button type="button" className={mini} disabled={props.busy} onClick={() => props.onPaint!(p.hero!)} aria-label={`Paint ${p.name}`}>
                              {props.painting === p.id ? "Painting…" : "Paint"}
                            </button>
                          )}
                          <button
                            type="button"
                            className={cn(mini, deleting === p.id && "border-red-400/60 bg-red-600/80 text-white hover:bg-red-600")}
                            disabled={props.busy}
                            aria-label={deleting === p.id ? `Confirm deleting ${p.name}` : `Delete ${p.name}`}
                            onBlur={() => setDeleting(null)}
                            onClick={() => {
                              if (deleting !== p.id) return setDeleting(p.id)
                              setDeleting(null)
                              setParty((cur) => cur.filter((c) => c.id !== p.id))
                              props.onDelete(p.hero!)
                            }}
                          >
                            {deleting === p.id ? "Confirm" : "Delete"}
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
                {info.options && (
                  <li>
                    <button
                      type="button"
                      onClick={props.onCreate}
                      disabled={props.busy || !props.providers.length}
                      className="grid h-full min-h-[10rem] w-full place-items-center rounded-lg border border-dashed border-white/30 bg-black p-2 font-display text-sm text-white/60 transition-colors hover:border-sky-300/60 hover:text-sky-200 disabled:cursor-default disabled:opacity-40"
                    >
                      New hero
                    </button>
                  </li>
                )}
                {info.options && canInvite && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setParty((p) => (p.length < max ? [...p, { id: `open-${Date.now()}`, who: "invite", open: true }] : p))}
                      disabled={props.busy || party.length >= max}
                      className="grid h-full min-h-[10rem] w-full place-items-center rounded-lg border border-dashed border-white/30 bg-black p-2 font-display text-sm text-white/60 transition-colors hover:border-sky-300/60 hover:text-white disabled:cursor-default disabled:opacity-40"
                    >
                      Any hero
                    </button>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-white/10 px-7 py-5">
        <GameMaster providers={props.providers} models={props.models} provider={props.provider} onProvider={props.onProvider} />
        <div className="flex-1" />
        {hosting && sized && !hostable && <p className="text-sm text-amber-300">Play a hero, or invite at least two.</p>}
        {props.onCancel && (
          <button type="button" className={ghost} disabled={props.busy} onClick={props.onCancel}>
            Cancel
          </button>
        )}
        {hosting ? (
          <Button
            variant="epic"
            className="text-xl"
            disabled={props.busy || !ready || !props.providers.length}
            onClick={() =>
              props.linked === true
                ? props.onHost?.(
                    yours.map((c) => c.id),
                    invites,
                    ais,
                    open,
                    askFirst,
                    watching
                  )
                : props.onLink?.()
            }
          >
            {props.busy ? "Inviting…" : "Invite"}
          </Button>
        ) : (
          <Button
            variant="epic"
            className="text-xl"
            disabled={props.busy || props.waiting || !ready || !props.providers.length}
            onClick={() => props.onStart(party.map((c) => ({ id: c.id, ai: c.who === "ai" })))}
          >
            {props.busy ? "Starting…" : "Play"}
          </Button>
        )}
      </div>
    </section>
  )
}

// Which CLI runs the GM, each named by the model it runs and its effort. One installed CLI is stated, not chosen.
function GameMaster(props: { providers: string[]; models: Record<string, GmModel>; provider: string; onProvider: (p: string) => void }) {
  if (!props.providers.length) return null
  const line = (p: string) => (
    <>
      {props.models[p]?.name ?? CLI[p] ?? p}
      {props.models[p]?.effort && <span className="text-sm text-white/60">{props.models[p].effort} effort</span>}
    </>
  )
  return (
    <div className="flex items-center gap-3">
      <span className={siteLabel}>Game Master</span>
      {props.providers.length === 1 ? (
        <span className="flex items-baseline gap-2 text-base">{line(props.providers[0])}</span>
      ) : (
        <Select value={props.provider} onValueChange={props.onProvider}>
          <SelectTrigger aria-label="Game Master" className={cn(siteOutline, "h-auto gap-3 py-2 text-base shadow-none focus-visible:border-primary-400 focus-visible:ring-primary-400/50")}>
            <SelectValue />
          </SelectTrigger>
          {/* Over the app's shell, which is its own layer at 100. */}
          <SelectContent className="z-[110] border-white/20 bg-black text-white ring-[6px] ring-black">
            {props.providers.map((p) => (
              <SelectItem key={p} value={p} className="py-2 pl-3 text-base focus:bg-primary-600 focus:text-white">
                {line(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

// A locked adventure: its cover under a lock, its teaser, and how to get it.
function LockedAdventure(props: { info: Locked; linked: boolean | "offline"; onLink?: () => void; onCancel?: () => void; busy: boolean }) {
  const { info } = props
  const status = info.owned
    ? info.failed
      ? "The download failed. It tries again next time the app opens."
      : "Downloading…"
    : props.linked === "offline"
      ? "D20 Adventures cannot be reached. Adventures you own download when it can."
      : props.linked
        ? "The store opens soon."
        : "Already own it? Link your account to download it."
  return (
    <section className={cn(siteCard, "flex max-h-[94%] w-[min(72rem,96vw)] flex-col text-left backdrop-blur-xl")}>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-7 pb-5">
        <div className="grid gap-7 md:grid-cols-[minmax(240px,330px)_1fr]">
          <div className="relative md:sticky md:top-0 md:self-start">
            <ModuleCover id={info.id} title={info.title} players={info.players} className="[filter:grayscale(.55)_brightness(.7)]" />
            <div className="absolute inset-0 grid place-items-center">
              <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-white/30 bg-black/70 text-amber-300">
                <svg aria-hidden="true" viewBox="0 0 16 16" className="h-7 w-7 fill-current">
                  <path d="M4 7V5a4 4 0 1 1 8 0v2h.5A1.5 1.5 0 0 1 14 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 13.5v-5A1.5 1.5 0 0 1 3.5 7H4Zm2 0h4V5a2 2 0 1 0-4 0v2Z" />
                </svg>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-5">
            {info.teaser && (
              <div>
                <div className={cn(siteLabel, "mb-2")}>The adventure</div>
                <p className="max-w-[70ch] text-base text-gray-300">{info.teaser}</p>
              </div>
            )}
            <div className={cn(sitePanel, "max-w-md p-5")}>
              <div className={siteLabel}>{info.owned ? "In your library" : "Not in your library"}</div>
              {!info.owned && <div className="mt-2 font-display text-4xl text-amber-300">{price(info.priceCents)}</div>}
              <p className="mt-3 text-base text-gray-300">{status}</p>
              {!info.owned && !props.linked && props.onLink && (
                <button type="button" className={cn(siteOutline, "mt-4 px-4 py-1.5 text-sm")} onClick={props.onLink}>
                  Link account
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 border-t border-white/10 px-7 py-5">
        <div className="flex-1" />
        {props.onCancel && (
          <button type="button" className={ghost} disabled={props.busy} onClick={props.onCancel}>
            Cancel
          </button>
        )}
        <Button variant="epic" className="text-xl" disabled>
          Locked
        </Button>
      </div>
    </section>
  )
}

function Face({ pick, size }: { pick: Pick; size: string }) {
  return pick.portrait ? (
    <img src={pick.portrait} alt="" className={cn(size, "block shrink-0 rounded-md border border-white/30 object-cover object-[50%_15%]")} />
  ) : (
    <span aria-hidden="true" className={cn(size, "grid shrink-0 place-items-center rounded-md border border-white/30 font-display text-amber-400")}>
      {pick.name[0]}
    </span>
  )
}
