import { useCallback, useEffect, useRef, useState } from "react"
import { Pill, panel } from "@/components/stage/hud"
import type { AdventureInfo, CatalogInfo, GameCommand } from "../runtime/game"
import type { Hero, HeroCommand, PartyChoice } from "../runtime/heroes"
import type { Save, SaveSummary } from "../runtime/store"
import { AccountBadge, LinkGate, useAccount } from "./account"
import { send } from "./bridge"
import type { FigureArt } from "./figures"
import { HeroCreator, type HeroIdea } from "./hero-creator"
import { Home } from "./home"
import { type Locked, NewGame } from "./new-game"
import { RealmPage, useRealm } from "./realm"
import { StagePlay } from "./stage-play"

export function DesktopGame() {
  const [save, setSave] = useState<Save | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [providers, setProviders] = useState<string[]>([])
  const [provider, setProvider] = useState("claude")
  const [adventures, setAdventures] = useState<AdventureInfo[]>([])
  const [adventure, setAdventure] = useState("march-of-davos")
  // Set once the player picks an adventure, so loading never moves their choice.
  const pickedAdventure = useRef(false)
  // Every adventure for sale, for the locked ones on the new game screen.
  const [catalog, setCatalog] = useState<CatalogInfo[]>([])
  const [heroes, setHeroes] = useState<Hero[]>([])
  const [saves, setSaves] = useState<SaveSummary[]>([])
  const realm = useRealm()
  const [options, setOptions] = useState<{ races: string[]; archetypes: string[] }>({ races: [], archetypes: [] })
  // The hero creator, over the new game screen. A hero it saves joins the party there.
  const [creator, setCreator] = useState<{ editing?: Hero } | null>(null)
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
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  // Over the stage: home on launch and from the Home button, party setup for a new game, or the Realm page. Null in play.
  const [screen, setScreen] = useState<"home" | "new" | "realm" | null>("home")
  const chosen = adventures.find((a) => a.id === adventure)
  const [stageState, setStageState] = useState<{ waiting: boolean; error: string | null }>({ waiting: false, error: null })
  const stageError = stageState.error

  const saveRef = useRef(save)
  saveRef.current = save

  const invoke = useCallback(
    async (command: GameCommand | HeroCommand) => {
      if (busyRef.current) return
      busyRef.current = true
      setBusy(true)
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
        if (res.heroes) setHeroes(res.heroes)
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
        busyRef.current = false
        setBusy(false)
        setLoaded(true)
      }
    },
    [keepArt]
  )
  // Playing needs a linked account. Home holds at the link step until there is one.
  const acct = useAccount({ onPacks: () => void invoke({ kind: "load" }) })
  useEffect(() => {
    if (acct.gated) setScreen("home")
  }, [acct.gated])
  useEffect(() => {
    void invoke({ kind: "load" })
  }, [invoke])
  // Fetch painted art once for roster heroes and for the saved party.
  useEffect(() => {
    if (busy || !loaded) return
    const ids = [...new Set([...heroes.filter((h) => h.painted).map((h) => h.id), ...(save?.painted ?? [])])].filter((id) => !askedArt.current.has(id))
    if (!ids.length) return
    for (const id of ids) askedArt.current.add(id)
    void invoke({ kind: "art", ids: ids.slice(0, 24) })
  }, [busy, loaded, heroes, save?.painted, invoke])
  // A new game moves the saved adventure to the archive, where home lists it. Party setup stays open if the start fails.
  const start = async (chosenParty: PartyChoice[]) => {
    const next = (await invoke({ kind: "start", provider: provider as "claude", adventure, party: chosenParty, replace: Boolean(save) }))?.state
    if (!next || next.adventure._id === save?.adventure._id) return
    setCreated(null)
    setScreen(null)
  }
  const resume = async (archiveId: number) => {
    const res = await invoke({ kind: "resume", archiveId })
    if (!res || res.error) return
    setScreen(null)
  }
  const pickAdventure = (id: string) => {
    pickedAdventure.current = true
    setAdventure(id)
    setCreated(null)
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
  const draftHero = async (idea: HeroIdea) => (await invoke({ kind: "heroDraft", provider: provider as "claude", adventure, ...idea }))?.draft
  const saveHero = async (hero: Omit<Hero, "id"> & { id?: string }) => {
    const before = new Set(heroes.map((h) => h.id))
    const res = await invoke({ kind: "saveHero", hero })
    if (!res || res.error) return false
    setCreator(null)
    setCreated(res.heroes?.find((h) => !before.has(h.id))?.id ?? null)
    return true
  }
  const onEscape = useCallback(() => setScreen((s) => (s === "new" || s === "realm" ? "home" : saveRef.current ? null : s)), [])
  const onError = useCallback((message: string) => setError(message), [])
  return (
    <StagePlay
      save={save}
      busy={busy}
      art={art}
      fallbackEncounter={chosen?.start}
      controls={() => true}
      status={save ? `Saved locally · ${save.provider}` : ""}
      overlay={screen !== null}
      actions={<Pill onClick={() => setScreen("home")}>Home</Pill>}
      endActions={<Pill onClick={() => setScreen("home")}>Home</Pill>}
      onReply={async (turnId, characterId, text, movement) => {
        const res = await invoke({ kind: "reply", turnId, characterId, text, movement })
        return Boolean(res && !res.error)
      }}
      onRoll={(turnId, characterId, result) => void invoke({ kind: "roll", turnId, characterId, result })}
      onContinue={(turnId) => void invoke({ kind: "continue", turnId })}
      onPositions={async (turnId, positions, appliedMovement) => {
        await invoke({ kind: "positions", turnId, positions, appliedMovement })
      }}
      onEscape={onEscape}
      onError={onError}
      onStage={setStageState}
    >
      {screen !== null && (!acct.ready || acct.gated || !loaded) && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-stage-ink/55 text-center">
          <div className="text-[10px] tracking-[.3em] text-stage-gold">D20 ADVENTURES</div>
          {acct.gated && <LinkGate account={acct} />}
        </div>
      )}
      {acct.ready && !acct.gated && loaded && (
        <>
          {screen === "home" && (
            <Home
              save={save}
              saves={saves}
              adventures={adventures}
              locked={locked}
              listPrices={listPrices}
              starter={chosen}
              heroes={heroes}
              art={art}
              realm={realm}
              busy={busy}
              painting={painting}
              canCreate={providers.length > 0}
              account={<AccountBadge account={acct} />}
              onContinue={() => setScreen(null)}
              onResume={(id) => void resume(id)}
              onAdventure={(id) => {
                pickAdventure(id)
                setScreen("new")
              }}
              onCreateHero={() => setCreator({})}
              onEditHero={(hero) => setCreator({ editing: hero })}
              onPaintHero={painter ? (hero) => void paintHero(hero) : undefined}
              onDeleteHero={(hero) => void invoke({ kind: "deleteHero", id: hero.id })}
              onRealm={() => setScreen("realm")}
            />
          )}
          {screen === "realm" && realm && <RealmPage realm={realm} onClose={() => setScreen("home")} />}
          {screen === "new" && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-stage-ink/70 text-center">
              {!providers.length && <p>Install and sign in to Claude Code, Codex, Grok, or Gemini CLI.</p>}
              {adventures.length > 0 && (
                <NewGame
                  key={adventure}
                  adventures={adventures}
                  adventure={adventure}
                  onAdventure={pickAdventure}
                  heroes={heroes}
                  providers={providers}
                  provider={provider}
                  onProvider={setProvider}
                  busy={busy}
                  waiting={stageState.waiting}
                  created={created}
                  onStart={(chosenParty) => void start(chosenParty)}
                  onCreate={() => setCreator({})}
                  onEdit={(hero) => setCreator({ editing: hero })}
                  art={art}
                  painting={painting}
                  onPaint={painter ? (hero) => void paintHero(hero) : undefined}
                  onDelete={(hero) => void invoke({ kind: "deleteHero", id: hero.id })}
                  onCancel={() => setScreen("home")}
                  locked={locked}
                  listPrices={listPrices}
                  linked={acct.state?.linked ?? false}
                  onLink={() => void acct.start()}
                />
              )}
            </div>
          )}
        </>
      )}
      {creator && (
        <HeroCreator
          options={creator.editing || screen !== "new" ? options : (chosen?.options ?? options)}
          editing={creator.editing}
          painted={creator.editing ? art[creator.editing.id] : undefined}
          busy={busy}
          onDraft={draftHero}
          onSave={saveHero}
          onClose={() => setCreator(null)}
        />
      )}
      {(error || stageError) && (
        <div role="alert" className={`${panel} absolute left-1/2 top-28 z-[60] w-[min(600px,90vw)] -translate-x-1/2 p-4 text-sm`}>
          <p>{error ?? stageError}</p>
          <Pill className="mt-3" disabled={busy} onClick={() => void invoke({ kind: "load" })}>
            Reload saved state
          </Pill>
          <Pill className="ml-3" onClick={() => setError(null)}>
            Dismiss
          </Pill>
        </div>
      )}
    </StagePlay>
  )
}

function blobUrl(dataUrl: string) {
  const bytes = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (c) => c.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: "image/png" }))
}
