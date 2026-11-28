import { playableHero } from "@d20/gm-core/character/hero-draft"
import { useCallback, useEffect, useRef, useState } from "react"
import { Presence, Swap } from "@d20/ui/presence"
import { Pill, panel } from "@d20/ui/stage/hud"
import { cn } from "@/lib/utils"
import type { HostedSummary } from "../../../lib/host/server"
import type { AdventureInfo, CatalogInfo, GameCommand } from "../runtime/game"
import type { Hero, HeroCommand, PartyChoice } from "../runtime/heroes"
import type { HostedState } from "../runtime/host-commands"
import type { Save, SaveSummary } from "../runtime/store"
import { AccountBadge, AccountNotice, FeedbackLink, LinkGate, useAccount } from "./account"
import { AppHeader } from "./app-header"
import { autopilot, mark } from "./autopilot"
import { type GmModel, gmModel, type HostWorkerState, host, hostRunning, hostStart, hostStop, isFullscreen, openSite, send, suggest, toggleFullscreen } from "./bridge"
import { partyOf } from "./carry"
import { sendFeedback } from "./feedback"
import type { FigureArt } from "./figures"
import { FullscreenButton } from "./fullscreen"
import { HeroCreator, type HeroIdea, type HeroMaking } from "./hero-creator"
import { Home } from "./home"
import { hostedArt, hostedPending, hostedSave, hostedWork, useHostedSuggest } from "./hosted"
import { HostedLobby } from "./hosted-lobby"
import { type Locked, NewGame } from "./new-game"
import { AdventuresPage, CharactersPage, type Page, SettingsPage } from "./pages"
import {
  CommandQueue,
  type CommandMode,
  type CommandQueueState,
  escapeUserRoute,
  HostedPollController,
  resolveAppRoute,
  type UserRoute,
} from "./play-machine"
import { useRealm } from "./realm"
import { StagePlay } from "./stage-play"

export function DesktopGame() {
  const [save, setSave] = useState<Save | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [providers, setProviders] = useState<string[]>([])
  const [provider, setProvider] = useState("claude")
  // Per-provider model picked for the GM (Claude alias or Antigravity slug). Kept between launches.
  const [pickedModels, setPickedModels] = useState<Record<string, string>>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("gm-picked-models") ?? "{}") as Record<string, string>
      const legacy = localStorage.getItem("gm-claude-model")
      if (legacy && !saved.claude) saved.claude = legacy
      return saved
    } catch {
      return {}
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem("gm-picked-models", JSON.stringify(pickedModels))
      if (pickedModels.claude) localStorage.setItem("gm-claude-model", pickedModels.claude)
    } catch {}
  }, [pickedModels])
  const pickedModel = pickedModels[provider]
  const pickGm = (p: string, model?: string) => {
    setProvider(p)
    if (model) setPickedModels((cur) => ({ ...cur, [p]: model }))
  }
  // What each installed CLI runs as the GM. Each is asked once and answers in its own time, so a slow one holds up
  // no other. The last answers are kept, so the picker has them at once the next time the app opens.
  const [models, setModels] = useState<Record<string, GmModel>>(() => {
    try {
      return JSON.parse(localStorage.getItem("gm-models") ?? "{}")
    } catch {
      return {}
    }
  })
  useEffect(() => localStorage.setItem("gm-models", JSON.stringify(models)), [models])
  const askedModels = useRef(new Set<string>())
  useEffect(() => {
    for (const p of providers) {
      if (askedModels.current.has(p)) continue
      askedModels.current.add(p)
      gmModel(p).then(
        (res) => setModels((cur) => ({ ...cur, [p]: res.model ?? {} })),
        () => {}
      )
    }
  }, [providers])
  const [adventures, setAdventures] = useState<AdventureInfo[]>([])
  const [adventure, setAdventure] = useState("welcome-to-kordavos")
  // Set once the player picks an adventure, so loading never moves their choice.
  const pickedAdventure = useRef(false)
  // Every adventure for sale, for the locked ones on the new game screen.
  const [catalog, setCatalog] = useState<CatalogInfo[]>([])
  const [heroes, setHeroes] = useState<Hero[]>([])
  const [saves, setSaves] = useState<SaveSummary[]>([])
  const realm = useRealm()
  const [options, setOptions] = useState<{ races: string[]; archetypes: string[] }>({ races: [], archetypes: [] })
  // The hero creator, over the new game screen. A hero it saves joins the party there. It stays mounted, closed, while
  // it goes, and each opening is a new one.
  const [creator, setCreator] = useState<{ editing?: Hero; open: boolean; n: number } | null>(null)
  const openCreator = (editing?: Hero) => setCreator((c) => ({ editing, open: true, n: (c?.n ?? 0) + 1 }))
  const closeCreator = () => setCreator((c) => c && { ...c, open: false })
  const [created, setCreated] = useState<string | null>(null)
  // Painted hero art, kept as blob URLs, which the stage and the app's content policy accept.
  const [art, setArt] = useState<Record<string, FigureArt>>({})
  const [painting, setPainting] = useState<string | null>(null)
  const askedArt = useRef(new Set<string>())
  const keepArt = useCallback((incoming: Record<string, FigureArt>) => {
    setArt((current) => {
      const next = { ...current }
      for (const [id, urls] of Object.entries(incoming)) {
        for (const url of Object.values(current[id] ?? {})) URL.revokeObjectURL(url)
        next[id] = { front: blobUrl(urls.front), back: blobUrl(urls.back), portrait: blobUrl(urls.portrait) }
      }
      return next
    })
  }, [])
  const [queueState, setQueueState] = useState<CommandQueueState>({ phase: "idle", shown: false, writing: false })
  const queueRef = useRef<CommandQueue | null>(null)
  if (!queueRef.current) queueRef.current = new CommandQueue(setQueueState)
  const busy = queueState.shown
  // Continue in local play: the GM writes the next NPC's or AI hero's turn, often while the story before it is read.
  const writing = queueState.writing
  const working = busy || writing
  const [error, setError] = useState<string | null>(null)
  // Explicit user route behind account/boot resolution (AppRoute: booting | gate | menu | setup | local_play | hosted).
  const [userRoute, setUserRoute] = useState<UserRoute>({ kind: "menu", page: "home" })
  const navigate = (page: Page | "home") => setUserRoute({ kind: "menu", page })
  const chosen = adventures.find((a) => a.id === adventure)
  const [stageState, setStageState] = useState<{ waiting: boolean; progress: number | null; error: string | null }>({ waiting: false, progress: null, error: null })
  const stageError = stageState.error

  const saveRef = useRef(save)
  saveRef.current = save

  // Every command waits its turn behind the one running. A written turn shows the GM at work only once the story before
  // it has been read. A shown command asked while another is waiting or running is dropped, as a second click. A quiet
  // one, such as a hero's standing orders, shows nothing at work.
  const invoke = useCallback(
    (command: GameCommand | HeroCommand, how: CommandMode = "shown") =>
      queueRef.current!.run(how, async () => {
        setError(null)
        try {
          const res = await send(command)
          setSave(res.state)
          if (res.adventures) {
            const playable = res.adventures
            setAdventures(playable)
            if (!pickedAdventure.current && playable.length) setAdventure((cur) => (playable.some((a) => a.id === cur) ? cur : playable[0].id))
          }
          if (res.catalog) setCatalog(res.catalog)
          if (res.heroes) setHeroes(res.heroes.filter(playableHero))
          if (res.saves) setSaves(res.saves)
          if (res.art && Object.keys(res.art).length) keepArt(res.art)
          if (res.options) setOptions(res.options)
          if (res.providers) {
            setProviders(res.providers)
            setProvider((p) => (res.providers!.includes(p) ? p : (res.providers![0] ?? "claude")))
          }
          if (res.error) setError(res.error)
          return res
        } catch (e) {
          setError(String(e))
          return null
        } finally {
          setLoaded(true)
        }
      }),
    [keepArt]
  )
  // Playing needs a linked account. Home holds at the link step until there is one.
  const acct = useAccount({ onPacks: () => void invoke({ kind: "load" }) })
  const route = resolveAppRoute(userRoute, { accountReady: acct.ready, gated: acct.gated, loaded })
  const routeRef = useRef(route)
  routeRef.current = route
  // The title screen and its pages wait for the account check and the first load.
  const ready = route.kind !== "booting" && route.kind !== "gate"
  // Derived screen key for the menu/setup/gate overlay shell (null while in local_play or hosted).
  const screen: "home" | Page | "new" | null =
    route.kind === "menu" ? route.page : route.kind === "setup" ? "new" : route.kind === "booting" || route.kind === "gate" ? "home" : null
  const hosting = route.kind === "hosted" ? route.adventureId : null
  useEffect(() => {
    if (acct.gated) {
      setHosted(null)
      setUserRoute({ kind: "menu", page: "home" })
    }
  }, [acct.gated])
  useEffect(() => {
    void invoke({ kind: "load" })
  }, [invoke])
  // Fetch painted art once for roster heroes, the saved party and the parties of archived saves.
  useEffect(() => {
    if (working || !loaded) return
    const ids = [...new Set([...heroes.filter((h) => h.painted).map((h) => h.id), ...(save?.painted ?? []), ...saves.flatMap((s) => s.painted ?? [])])].filter(
      (id) => !askedArt.current.has(id)
    )
    if (!ids.length) return
    for (const id of ids) askedArt.current.add(id)
    void invoke({ kind: "art", ids: ids.slice(0, 24) }, "quiet")
  }, [working, loaded, heroes, save?.painted, saves, invoke])
  // A new game moves the saved adventure to the archive, where home lists it. Party setup stays open if the start fails.
  const start = async (chosenParty: PartyChoice[]) => {
    const next = (await invoke({ kind: "start", provider: provider as "claude", model: pickedModel, adventure, party: chosenParty, replace: Boolean(save), continues: Boolean(carried) }))?.state
    if (!next || next.adventure._id === save?.adventure._id) return
    setCreated(null)
    setCarried(null)
    setUserRoute({ kind: "local_play" })
  }
  // The development autopilot starts its play full screen, once the recorder has had a moment to start.
  const piloted = useRef(false)
  useEffect(() => {
    if (!autopilot || !ready || !providers.includes(provider) || piloted.current) return
    piloted.current = true
    const play = autopilot
    void (async () => {
      if (!(await isFullscreen())) await toggleFullscreen()
      await mark("ready", { at: Date.now() })
      await new Promise((r) => setTimeout(r, 4000))
      const res = await invoke({ kind: "start", provider: provider as "claude", model: pickedModel, adventure: play.adventure, party: play.party.map((id) => ({ id, ai: false })), replace: true })
      if (res?.state) setUserRoute({ kind: "local_play" })
      else await mark("done", { spans: [], problems: [res?.error ?? "The game did not start."], at: Date.now() })
    })()
  }, [ready, providers, provider, pickedModel, invoke])
  const resume = async (archiveId: number) => {
    const res = await invoke({ kind: "resume", archiveId })
    if (!res || res.error) return
    setUserRoute({ kind: "local_play" })
  }
  // The heroes of the adventure just finished, offered to the next one's party when the player continues the story.
  const [carried, setCarried] = useState<PartyChoice[] | null>(null)
  const pickAdventure = (id: string) => {
    pickedAdventure.current = true
    setAdventure(id)
    setCreated(null)
    setCarried(null)
  }
  const locked = catalog.filter((c) => !adventures.some((a) => a.id === c.id)).map((c): Locked => ({ ...c, owned: acct.owned.includes(c.id), failed: acct.failed.includes(c.id) }))
  const listPrices: Record<string, number> = Object.fromEntries(catalog.flatMap((c) => (c.free && c.listPriceCents ? [[c.id, c.listPriceCents]] : [])))
  // Painting uses the Game Master's CLI when it can paint, else Grok, then Codex.
  const painters: string[] = providers.filter((p) => p === "grok" || p === "codex")
  const painter = (painters.includes(provider) ? provider : painters[0]) as "grok" | "codex" | undefined
  const paintHero = async (hero: Hero) => {
    if (!painter) return
    setPainting(hero.id)
    await invoke({ kind: "paintHero", provider: painter, id: hero.id })
    setPainting(null)
  }
  // A hero made from a party screen is made for that adventure. One made from the Characters page is not.
  const generateHero = async (input: { race: string; archetype: string; gender?: string; hook?: string }) =>
    (await invoke({ kind: "heroConcept", provider: provider as "claude", model: pickedModel, ...input, ...(route.kind === "setup" ? { adventure } : {}) }))?.concept
  const draftHero = async ({ hook, ...idea }: HeroIdea, making: HeroMaking) =>
    (await invoke({ kind: "heroDraft", provider: provider as "claude", model: pickedModel, ...idea, making, ...(route.kind === "setup" ? { adventure, ...(hook.trim() ? { hook } : {}) } : {}) }))?.draft
  const saveHero = async (hero: Omit<Hero, "id"> & { id?: string }, making?: HeroMaking) => {
    const before = new Set(heroes.map((h) => h.id))
    const res = await invoke({ kind: "saveHero", hero, ...(making ? { making } : {}) })
    if (!res || res.error) return false
    closeCreator()
    setCreated(res.heroes?.find((h) => !before.has(h.id))?.id ?? null)
    return true
  }
  // Hosted games: state from the website, and every game this account hosts. While route.kind === "hosted"
  // the app polls it sequentially (AbortController-backed), and the host worker runs its GM jobs.
  const [hosted, setHosted] = useState<HostedState | null>(null)
  const [hostedList, setHostedList] = useState<HostedSummary[]>([])
  const pollRef = useRef<HostedPollController<HostedState, HostWorkerState> | null>(null)
  if (!pollRef.current) pollRef.current = new HostedPollController<HostedState, HostWorkerState>()
  // Guests' heroes the worker painted are read from the data folder, as the app shows only local pictures.
  const guestArt = hosted ? Object.keys(hostedArt(hosted)).join() : ""
  useEffect(() => {
    if (working || !guestArt) return
    const ids = guestArt.split(",").filter((id) => !askedArt.current.has(id))
    if (!ids.length) return
    for (const id of ids) askedArt.current.add(id)
    void invoke({ kind: "art", ids: ids.slice(0, 24) }, "quiet")
  }, [working, guestArt, invoke])
  const [worker, setWorker] = useState<HostWorkerState | null>(null)
  const [sending, setSending] = useState(false)
  const shownFailure = useRef<string | null>(null)
  const linked = acct.state?.linked === true
  useEffect(() => {
    if (!linked || route.kind !== "menu" || route.page !== "home") return
    void host({ kind: "hostList" }).then((r) => r.hosted && setHostedList(r.hosted))
  }, [linked, route.kind, route.kind === "menu" ? route.page : null])
  // Sequential host poll loop: active ONLY when route.kind === "hosted" (stops immediately on acct.gated or route exit).
  useEffect(() => {
    const poller = pollRef.current!
    if (!hosting) {
      poller.stop()
      return
    }
    poller.start(hosting, {
      intervalMs: 1500,
      maxIntervalMs: 8000,
      busy: hostedPending,
      poll: async (adventureId) => {
        const [res, w] = await Promise.all([host({ kind: "hostState", adventureId }), hostRunning().catch(() => null)])
        return { state: res.state, error: res.error, worker: w }
      },
      onState: setHosted,
      onWorker: setWorker,
      onError: setError,
    })
    return () => poller.stop()
  }, [hosting])
  const work = hosting && hosted ? hostedWork(hosted) : null
  useEffect(() => {
    if (work?.failed && shownFailure.current !== work.failed.id) {
      shownFailure.current = work.failed.id
      setError(work.failed.error)
    }
  }, [work?.failed])
  const openHosted = async (adventureId: string) => {
    setHosted(null)
    setUserRoute({ kind: "hosted", adventureId })
    await hostStart(adventureId, provider, pickedModel).catch((e) => setError(String(e)))
  }
  const hostGame = async (you: string[], invites: string[], ais: string[], open: number, approve: boolean, watch: boolean, each?: number, bring?: number, flex = false) => {
    setSending(true)
    const res = await host({ kind: "hostCreate", planId: adventure, characterIds: you, invites, ais, open, flex, approve, watch, each, bring })
    setSending(false)
    if (res.error || !res.created) return setError(res.error ?? "Could not host the game.")
    await openHosted(res.created.adventureId)
  }
  // Deletes a hosted game from the website, after stopping its GM if this app runs it.
  const removeHosted = async (adventureId: string) => {
    if (worker?.adventureId === adventureId) await hostStop().catch(() => {})
    const res = await host({ kind: "hostDelete", adventureId })
    if (res.hosted) setHostedList(res.hosted)
    if (res.error) setError(res.error)
  }
  const act = async (fn: () => ReturnType<typeof host>) => {
    pollRef.current?.beginMutation()
    setSending(true)
    const res = await fn()
    setSending(false)
    pollRef.current?.wake()
    if (res.state) setHosted(res.state)
    if (res.error) setError(res.error)
    return !res.error
  }
  // A line in the table chat. It does not mark the GM busy, as an action does.
  const say = async (text: string) => {
    if (!hosting) return false
    pollRef.current?.beginMutation()
    const res = await host({ kind: "hostChat", adventureId: hosting, text })
    pollRef.current?.wake()
    if (res.state) setHosted(res.state)
    if (res.error) setError(res.error)
    return !res.error
  }
  // Suggested replies for the host's own hero. Asking does not mark the GM busy, as an action does.
  const suggestHosted = useHostedSuggest(hosting ? hosted : null, async (turnId, characterId) => {
    if (!hosting) return undefined
    const res = await host({ kind: "hostAct", adventureId: hosting, turnId, action: { kind: "suggest", characterId } })
    if (res.error) throw new Error(res.error)
    // The replies come with a poll, so it runs now rather than at an idle pace.
    pollRef.current?.wake()
    return res.jobId
  })
  const goHome = () => {
    setHosted(null)
    setUserRoute({ kind: "menu", page: "home" })
  }
  // Where the story goes after a finished local adventure: the next adventure's party setup, with its heroes.
  const nextId = !hosting && save?.adventure.status === "completed" ? adventures.find((a) => a.id === save.adventure.planId)?.next : null
  const nextUp = nextId ? (adventures.find((a) => a.id === nextId) ?? locked.find((a) => a.id === nextId)) : undefined
  const continueStory = () => {
    if (!save || !nextUp) return
    pickAdventure(nextUp.id)
    setCarried(partyOf(save))
    setUserRoute({ kind: "setup" })
  }
  const gmLabel = (() => {
    if (!hosting) return ""
    if (worker?.adventureId !== hosting) return "GM stopped"
    const type = worker.event?.type
    return type === "working" ? "GM working" : type === "offline" ? "GM offline" : type === "stopped" ? "GM stopped" : "GM ready"
  })()
  const hostedView = hosting && hosted ? hostedSave(hosted) : null
  // Escape steps back: party setup to Adventures, a page to the title screen, then into play.
  const onEscape = useCallback(() => {
    const next = escapeUserRoute(routeRef.current, Boolean(saveRef.current))
    if (next) setUserRoute(next)
  }, [])
  const onError = useCallback((message: string) => setError(message), [])
  return (
    <StagePlay
      save={hosting ? hostedView : save}
      busy={hosting ? sending || Boolean(work?.busy) : busy}
      writing={!hosting && writing}
      art={art}
      fallbackEncounter={chosen?.start}
      controls={hosting ? (c) => (c as { userId?: string }).userId === hosted?.userId && (c as { controlledBy?: string }).controlledBy !== "ai" : () => true}
      status={hosting ? `Hosting · ${hosted?.summary.watching ? "watching" : `${hosted?.summary.players ?? 1} at the table`} · ${gmLabel}` : undefined}
      overlay={screen !== null || Boolean(hosting && !hostedView)}
      actions={<Pill onClick={goHome}>Home</Pill>}
      chat={hosting ? hosted?.chat : undefined}
      onChat={hosting && hosted?.chat ? say : undefined}
      trailingActions={<FullscreenButton />}
      feedbackGate={acct.state && acct.state.linked !== true ? <FeedbackLink account={acct} /> : undefined}
      onFeedback={hosting ? (draft) => sendFeedback({ ...draft, context: { ...draft.context, hosted: "host" } }) : sendFeedback}
      endActions={
        <>
          {nextUp && (
            <Pill className="mr-2" onClick={continueStory}>
              Continue: {nextUp.title}
            </Pill>
          )}
          <Pill onClick={goHome}>Home</Pill>
        </>
      }
      onReply={async (turnId, characterId, text) => {
        if (hosting) return act(() => host({ kind: "hostAct", adventureId: hosting, turnId, action: { kind: "reply", characterId, text } }))
        const res = await invoke({ kind: "reply", turnId, characterId, text })
        return Boolean(res && !res.error)
      }}
      onSkip={async (turnId, characterId) => {
        if (hosting) return act(() => host({ kind: "hostAct", adventureId: hosting, turnId, action: { kind: "skip", characterId } }))
        const res = await invoke({ kind: "skip", turnId, characterId })
        return Boolean(res && !res.error)
      }}
      onSuggest={hosting ? suggestHosted : async (turnId, characterId) => (await suggest(turnId, characterId)).suggestions ?? []}
      onRoll={async (turnId, characterId, result, second) => {
        if (hosting) return act(() => host({ kind: "hostAct", adventureId: hosting, turnId, action: { kind: "roll", characterId, result, second } }))
        const res = await invoke({ kind: "roll", turnId, characterId, result, second })
        return Boolean(res && !res.error)
      }}
      onReact={async (turnId, characterId, take) => {
        if (hosting) return act(() => host({ kind: "hostAct", adventureId: hosting, turnId, action: { kind: "react", characterId, take } }))
        const res = await invoke({ kind: "react", turnId, characterId, take })
        return Boolean(res && !res.error)
      }}
      // A hosted game's heroes keep the default orders: no job carries orders to the host's GM yet.
      onOrders={
        hosting
          ? undefined
          : async (turnId, characterId, orders) => {
              const res = await invoke({ kind: "orders", turnId, characterId, orders }, "quiet")
              return Boolean(res && !res.error)
            }
      }
      // A hosted game's heroes level on the website, where their players' accounts keep them.
      onLevel={
        hosting
          ? undefined
          : async (turnId, characterId, choices) => {
              const res = await invoke({ kind: "level", turnId, characterId, choices }, "quiet")
              return res ? (res.error ?? undefined) : "The level could not be taken."
            }
      }
      autoContinue={!hosting}
      onContinue={(turnId) => {
        if (hosting) void act(() => host({ kind: "hostAct", adventureId: hosting, turnId, action: { kind: "continue" } }))
        else void invoke({ kind: "continue", turnId }, "writing")
      }}
      onEscape={onEscape}
      onError={onError}
      onStage={setStageState}
    >
      <Presence show={Boolean(hosting && hosted && !hosted.turn && screen === null)} motion="fade" className="absolute inset-0 z-panel">
        {hosting && hosted && !hosted.turn && screen === null && (
          <HostedLobby
            summary={hosted.summary}
            chat={hosted.chat}
            onChat={say}
            busy={sending}
            onAnswer={(userId, approve, note, characterId) => void act(() => host({ kind: "hostAnswer", adventureId: hosting, userId, characterId, approve, note }))}
            onSheet={(userId, characterId) => host({ kind: "hostSheet", adventureId: hosting, userId, characterId }).then((r) => r.sheet ?? null)}
            onRemove={(userId, note) => void act(() => host({ kind: "hostRemove", adventureId: hosting, userId, note }))}
            onStart={(ais) => void act(() => host({ kind: "hostStart", adventureId: hosting, ais }))}
            onHome={goHome}
          />
        )}
      </Presence>
      {/* Every screen outside play sits under the website's header, which stays put while the screens under it change. */}
      <Presence show={screen !== null} motion="fade" initial={false} asChild>
        {screen !== null && (
          <div className="absolute inset-0 z-panel flex flex-col font-serif text-white">
            {/* Black behind every screen, so the stage loading behind never flashes through before the title screen or
                between two screens. Party setup alone lets the opening scene show. */}
            <div className={cn("absolute inset-0 bg-black transition-opacity duration-150 ease-snap", screen === "new" && "opacity-70")} />
            <AppHeader
              page={screen === "new" ? "adventures" : screen}
              big={screen === "home"}
              account={<AccountBadge account={acct} />}
              trailing={<FullscreenButton className="text-accent-950 opacity-70 drop-shadow-none" />}
              onNavigate={ready ? navigate : undefined}
            />
            <div className="relative min-h-0 flex-1">
              <Swap id={ready ? screen : "gate"} motion="rise" exit="fade" className="absolute inset-0">
                {!ready && (
                  <Presence show={acct.gated} motion="fade" className="absolute inset-0 grid place-items-center">
                    <img src="/images/app/backgrounds/d20-hero.webp" alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
                    <div className="enter-pop relative">
                      <LinkGate account={acct} />
                    </div>
                  </Presence>
                )}
                {ready && (
                  <>
                    {screen === "home" && (
                      <Home save={save} art={art} busy={working} next={nextUp?.title} onContinue={() => setUserRoute({ kind: "local_play" })} onNext={continueStory} onBegin={() => setUserRoute({ kind: "menu", page: "adventures" })} />
                    )}
                    {screen === "adventures" && (
                      <AdventuresPage
                        saves={saves}
                        art={art}
                        adventures={adventures}
                        locked={locked}
                        listPrices={listPrices}
                        busy={working}
                        onContinue={() => setUserRoute({ kind: "local_play" })}
                        onResume={(id) => void resume(id)}
                        onRemove={(archiveId) => void invoke({ kind: "remove", archiveId })}
                        onArchive={(archiveId, restore) => void invoke({ kind: "archive", archiveId, restore })}
                        onAdventure={(id) => {
                          pickAdventure(id)
                          setUserRoute({ kind: "setup" })
                        }}
                        hosted={hostedList}
                        hostingNow={worker?.adventureId ?? null}
                        onOpenHosted={(id) => void openHosted(id)}
                        onRemoveHosted={(id) => void removeHosted(id)}
                      />
                    )}
                    {screen === "characters" && (
                      <CharactersPage
                        heroes={heroes}
                        art={art}
                        busy={working}
                        painting={painting}
                        canCreate={providers.length > 0}
                        onCreate={() => openCreator()}
                        onEdit={openCreator}
                        onPaint={painter ? (hero) => void paintHero(hero) : undefined}
                        onDelete={(hero) => void invoke({ kind: "deleteHero", id: hero.id })}
                      />
                    )}
                    {screen === "settings" && <SettingsPage realm={realm} onRealm={() => void openSite(`/settings/${realm?.id ?? "realm-of-myr"}`)} />}
                    {screen === "new" && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 text-center">
                        {!providers.length && <p>Install and sign in to Claude Code, Codex, Grok, or Antigravity.</p>}
                        {adventures.length > 0 && (
                          <NewGame
                            key={carried ? `${adventure}:continued` : adventure}
                            adventures={adventures}
                            adventure={adventure}
                            heroes={heroes}
                            providers={providers}
                            models={models}
                            provider={provider}
                            pickedModel={pickedModel}
                            onProvider={pickGm}
                            busy={working || sending}
                            waiting={stageState.waiting}
                            stageProgress={stageState.progress}
                            created={created}
                            carried={carried ?? undefined}
                            onStart={(chosenParty) => void start(chosenParty)}
                            onCreate={() => openCreator()}
                            onEdit={openCreator}
                            art={art}
                            painting={painting}
                            onPaint={painter ? (hero) => void paintHero(hero) : undefined}
                            onDelete={(hero) => void invoke({ kind: "deleteHero", id: hero.id })}
                            onCancel={() => setUserRoute({ kind: "menu", page: "adventures" })}
                            locked={locked}
                            listPrices={listPrices}
                            linked={acct.state?.linked ?? false}
                            onLink={() => void acct.start()}
                            onHost={(you, invites, ais, open, approve, watch, each, bring, flex) => void hostGame(you, invites, ais, open, approve, watch, each, bring, flex)}
                          />
                        )}
                      </div>
                    )}
                  </>
                )}
              </Swap>
              <AccountNotice account={acct} />
            </div>
          </div>
        )}
      </Presence>
      {creator && (
        <HeroCreator
          key={creator.n}
          open={creator.open}
          options={creator.editing || screen !== "new" ? options : (chosen?.options ?? options)}
          adventure={screen === "new" && chosen ? { id: chosen.id, hooks: chosen.hooks } : undefined}
          editing={creator.editing}
          painted={creator.editing ? art[creator.editing.id] : undefined}
          busy={working}
          onGenerate={generateHero}
          onDraft={draftHero}
          onSave={saveHero}
          onClose={closeCreator}
          onClosed={() => setCreator((c) => (c && !c.open ? null : c))}
        />
      )}
      <Presence show={Boolean(error || stageError)} motion="drop" asChild>
        <div role="alert" className={`${panel} absolute left-1/2 top-28 z-alert w-[min(600px,90vw)] -translate-x-1/2 p-4 text-sm`}>
          <p>{error ?? stageError}</p>
          <Pill className="mt-3" disabled={working} onClick={() => void invoke({ kind: "load" })}>
            Reload saved state
          </Pill>
          <Pill className="ml-3" onClick={() => setError(null)}>
            Dismiss
          </Pill>
        </div>
      </Presence>
    </StagePlay>
  )
}

function blobUrl(dataUrl: string) {
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (c) => c.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: "image/png" }))
}
