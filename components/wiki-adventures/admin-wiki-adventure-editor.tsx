"use client"

import { ClipboardList, Clock3, ImageIcon, Menu, MessageSquare, PanelLeftClose, RotateCcw, Search, ShieldCheck, Wand2 } from "lucide-react"
import Link from "next/link"
import * as React from "react"
import { toast } from "@d20/ui/toast"
import {
  loadAdminWikiAdventureStateAction,
  restoreAdminWikiAdventureRevisionAction,
  saveAdminWikiAdventureFileAction,
  sendAdminWikiAdventureChatAction,
} from "@/app/_actions/wiki-adventures/admin-authoring-actions"
import { Button } from "@d20/ui/button"
import { Tip } from "@d20/ui/tooltip"
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "@d20/ui/drawer"
import { ImageUpload } from "@/components/forms/image-upload"
import { Input } from "@d20/ui/input"
import Image from "@d20/ui/native-image"
import { Textarea } from "@d20/ui/textarea"
import { IMAGE_HOST } from "@/lib/config"
import type { RuntimeEncounter, RuntimeManifest, SourceFile } from "@/lib/wiki-adventures"
import { Label } from "@d20/ui/label"
import { Presence, Swap } from "@d20/ui/presence"

type EditorState = Awaited<ReturnType<typeof loadAdminWikiAdventureStateAction>>

type ChatMessage = {
  role: "admin" | "wiki"
  content: string
}

type RevisionSummary = EditorState["revisions"][number]

type EditableNpcRef = {
  id: string
  behavior: string
  initialInitiative: string
}

type NpcLookupRecord = {
  id: string
  name: string
  image: string
  race: string
  archetype: string
  gender: string
  summary: string
  sheetPath?: string
  profilePath?: string
}

export function AdminWikiAdventureEditor({ initialState }: { initialState: EditorState }) {
  const [state, setState] = React.useState(initialState)
  const [selectedPath, setSelectedPath] = React.useState(initialState.files.find((file) => file.path.endsWith("/adventure.md"))?.path ?? initialState.files[0]?.path ?? "")
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [prompt, setPrompt] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [chatPending, setChatPending] = React.useState(false)
  const [sectionsSidebarOpen, setSectionsSidebarOpen] = React.useState(true)
  const pendingScrollPathRef = React.useRef<string | null>(null)
  const selectedFile = state.files.find((file) => file.path === selectedPath) ?? state.files[0]
  const wiki = React.useMemo(() => buildWikiModel(state.files, state.encounters), [state.files, state.encounters])
  const selectedPage = wiki.pagesByPath.get(selectedFile?.path ?? "")
  const selectedSceneLocation = React.useMemo(() => sceneLocationForPath(wiki, selectedPath), [wiki, selectedPath])
  const selectedScene = selectedSceneLocation ? wiki.moduleSections[selectedSceneLocation.sectionIndex]?.scenes[selectedSceneLocation.sceneIndex] : undefined
  const sectionCount = wiki.moduleSections.length
  const encounterCount = Object.keys(state.encounters).length
  const npcCount = Object.keys(state.characterSheets.npcs).length
  const hasChatStarted = messages.length > 0
  // One key per pane: a scene keeps its key while the scroll moves the selection between its encounters.
  const paneKey =
    selectedPage?.kind === "encounter" && selectedScene && selectedSceneLocation ? `scene:${selectedSceneLocation.sectionIndex}:${selectedSceneLocation.sceneIndex}` : `page:${selectedFile?.path ?? ""}`

  React.useEffect(() => {
    const pendingPath = pendingScrollPathRef.current
    if (!pendingPath) return
    pendingScrollPathRef.current = null
    window.requestAnimationFrame(() => {
      document.getElementById(encounterDomId(pendingPath))?.scrollIntoView({ behavior: "smooth", block: "start", inline: "nearest" })
    })
  }, [selectedPath])

  async function refresh() {
    const next = await loadAdminWikiAdventureStateAction(state.definition.settingId, state.definition.planId)
    setState(next)
  }

  async function sendMessage() {
    if (!prompt.trim()) return
    const message = prompt.trim()
    setPrompt("")
    setMessages((current) => [...current, { role: "admin", content: message }])
    setBusy(true)
    setChatPending(true)
    try {
      const result = await sendAdminWikiAdventureChatAction({ settingId: state.definition.settingId, planId: state.definition.planId, message })
      setMessages((current) => [
        ...current,
        {
          role: "wiki",
          content: `${result.reply}\n\nChanged: ${result.changedPaths.length ? result.changedPaths.join(", ") : "none"}\nValidation: ${result.validation.status}`,
        },
      ])
      await refresh()
      toast.success("Wiki source updated")
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI edit failed"
      setMessages((current) => [...current, { role: "wiki", content: message }])
      toast.error(message)
    } finally {
      setChatPending(false)
      setBusy(false)
    }
  }

  async function saveFile(path: string, content: string) {
    setBusy(true)
    try {
      const result = await saveAdminWikiAdventureFileAction({ settingId: state.definition.settingId, planId: state.definition.planId, path, content, intent: "Admin key-field edit" })
      await refresh()
      toast.success(`Saved ${result.changedPaths[0] ?? path}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed")
    } finally {
      setBusy(false)
    }
  }

  async function restoreRevision(revisionId: string, path?: string) {
    setBusy(true)
    try {
      const result = await restoreAdminWikiAdventureRevisionAction({ settingId: state.definition.settingId, planId: state.definition.planId, revisionId, path })
      await refresh()
      toast.success(result.reply)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore failed")
    } finally {
      setBusy(false)
    }
  }

  function selectPath(path: string, options?: { scroll?: boolean }) {
    if (options?.scroll) {
      pendingScrollPathRef.current = path
    }
    setSelectedPath(path)
  }

  function selectSection(sectionIndex: number) {
    const firstPage = wiki.moduleSections[sectionIndex]?.scenes[0]?.pages[0]
    if (firstPage) {
      selectPath(firstPage.path, { scroll: true })
    }
  }

  function selectScene(sectionIndex: number, sceneIndex: number) {
    const firstPage = wiki.moduleSections[sectionIndex]?.scenes[sceneIndex]?.pages[0]
    if (firstPage) {
      selectPath(firstPage.path, { scroll: true })
    }
  }

  return (
    <div className="up-plan-editor sticky top-[59px] flex h-[calc(100dvh-59px)] flex-col overflow-hidden border-x border-(--up-line) bg-(--up-bg) text-(--up-text)">
      <header className="shrink-0 border-b border-(--up-line) bg-(--up-bg) px-6 pt-4 pb-3">
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="min-w-0 max-w-full truncate !m-0 !text-2xl leading-none md:!text-3xl">{state.manifest.title}</h1>
            <div className="flex shrink-0 items-center gap-1.5">
              <HeaderCountBadge value={sectionCount} label="sections" />
              <HeaderCountBadge value={encounterCount} label="encounters" />
              <HeaderCountBadge value={npcCount} label="NPCs" />
            </div>
          </div>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href="/admin"
              className="up-btn is-xs"
            >
              <ShieldCheck className="size-3.5" />
              Admin
            </Link>
            <Link
              href="/admin/adventure-plans"
              className="up-btn is-xs"
            >
              <ClipboardList className="size-3.5" />
              Plans
            </Link>
          </div>
        </div>
      </header>

      {/* The columns follow the sidebar being in the page, so they hold while it leaves. */}
      <main className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_400px] xl:has-[>[data-sections-sidebar]]:grid-cols-[320px_minmax(0,1fr)_400px]">
        <Presence show={sectionsSidebarOpen} motion="left" initial={false} asChild>
          <aside data-sections-sidebar className="min-h-0 overflow-hidden border-b border-(--up-line) bg-(--up-bg) xl:border-r xl:border-b-0">
            <WikiNavigator
              wiki={wiki}
              selectedPath={selectedPath}
              activeSectionIndex={selectedSceneLocation?.sectionIndex ?? 0}
              activeSceneIndex={selectedSceneLocation?.sceneIndex ?? 0}
              onSelect={(path) => selectPath(path, { scroll: true })}
              onSectionSelect={selectSection}
              onSceneSelect={selectScene}
              onCollapse={() => setSectionsSidebarOpen(false)}
            />
          </aside>
        </Presence>

        <section className="min-h-0 min-w-0 overflow-hidden border-b border-(--up-line) bg-(--up-raise) xl:border-r xl:border-b-0">
          <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
            <div key={paneKey} className="enter-fade">
              {selectedPage?.kind === "encounter" && selectedScene ? (
                <ScenePageHeader scene={selectedScene} sectionsSidebarOpen={sectionsSidebarOpen} onRestoreSectionsSidebar={() => setSectionsSidebarOpen(true)} />
              ) : (
                <WikiPageHeader page={selectedPage} sectionsSidebarOpen={sectionsSidebarOpen} onRestoreSectionsSidebar={() => setSectionsSidebarOpen(true)} />
              )}
            </div>
            <div className="@container min-h-0 overflow-y-auto">
              <div key={paneKey} className="enter-fade">
                {selectedScene && selectedPage?.kind === "encounter" ? (
                  <SceneEncounterEditor
                    scene={selectedScene}
                    selectedPath={selectedPath}
                    files={state.files}
                    manifest={state.manifest}
                    encounters={state.encounters}
                    disabled={busy}
                    onActivePathChange={setSelectedPath}
                    onSave={saveFile}
                  />
                ) : (
                  <ModulePageEditor file={selectedFile} files={state.files} manifest={state.manifest} encounters={state.encounters} page={selectedPage} disabled={busy} onSave={saveFile} />
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="relative min-h-0 overflow-hidden bg-(--up-bg)">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-(--up-line) bg-(--up-raise) px-5">
              <MessageSquare className="size-3.5 text-(--up-strong)" />
              <h2 className="font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-strong)">Chat</h2>
            </div>

            {hasChatStarted && (
              <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-5">
                {messages.map((message, index) => (
                  <div key={index} className={message.role === "admin" ? "enter-rise flex justify-end" : "enter-rise flex justify-start"}>
                    <div
                      className={`max-w-[94%] whitespace-pre-wrap text-pretty text-base leading-7 ${
                        message.role === "admin" ? "rounded-[1.35rem] rounded-br-none bg-(--up-accent) px-5 py-4 text-(--up-on-accent)" : "font-serif text-(--up-strong)"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
                <Presence show={chatPending} motion="rise">
                  <TypingIndicator />
                </Presence>
              </div>
            )}

            <div className={hasChatStarted ? "shrink-0 px-5 pb-4" : "flex min-h-0 flex-1 items-center px-5 py-8"}>
              <div className={hasChatStarted ? "enter-drop w-full" : "w-full"}>
                {!hasChatStarted && (
                  <p className="mb-4 text-center font-serif text-xl leading-7 text-(--up-strong)" style={{ textWrap: "balance" }}>
                    Begin a chat session to update this adventure plan
                  </p>
                )}
                <Textarea
                  id="wiki-chat-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Tighten the opening scene, add a stronger clue, and flag any transition risks..."
                  rows={5}
                  disabled={busy}
                  plain
                  className="up-field !min-h-32 resize-none !font-serif !leading-6 placeholder:text-(--up-faint)"
                />
                <Button
                  variant="plain"
                  onClick={sendMessage}
                  disabled={busy || !prompt.trim()}
                  className="up-btn is-primary is-lg mt-3 w-full"
                >
                  <Wand2 className="size-4" />
                  <Swap id={busy ? "busy" : "idle"} as="span">
                    {busy ? "Applying..." : "Send"}
                  </Swap>
                </Button>
              </div>
            </div>

            <Drawer side="bottom">
              <DrawerTrigger className="flex h-12 shrink-0 items-center justify-between border-t border-(--up-line) bg-(--up-raise) px-5 text-left transition-[background-color] duration-150 ease-snap hover:bg-(--up-bg) active:bg-(--up-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--up-accent-line)">
                <span className="flex items-center gap-2 font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-accent)">
                  <Clock3 className="size-3.5" />
                  Revision Log
                </span>
                <Swap id={state.revisions.length} as="span" className="font-sans text-2xs uppercase tracking-[0.08em] text-(--up-muted)">
                  {state.revisions.length} revisions
                </Swap>
              </DrawerTrigger>
              {/* The sheet sits over the right column on wide screens, where the trigger lives. */}
              <DrawerContent className="max-h-[62vh] overflow-hidden border-t border-(--up-line) bg-(--up-bg) text-(--up-text) data-[side=bottom]:rounded-none xl:ml-auto xl:w-[400px]">
                <div className="flex h-12 shrink-0 items-center justify-between px-5">
                  <div>
                    <DrawerTitle className="font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-accent)">Revision Log</DrawerTitle>
                    <DrawerDescription className="font-sans text-2xs uppercase tracking-[0.08em] text-(--up-faint)">{state.revisions.length} saved revisions</DrawerDescription>
                  </div>
                  <DrawerClose className="h-10 px-3 font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-muted) transition-[color,scale] duration-150 ease-snap hover:text-(--up-strong) active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--up-accent-line)">
                    Close
                  </DrawerClose>
                </div>
                <div className="min-h-0 flex-1 overflow-auto px-5 pb-5">
                  <RevisionHistory revisions={state.revisions} selectedPath={selectedPath} disabled={busy} onRestore={restoreRevision} />
                </div>
              </DrawerContent>
            </Drawer>
          </div>
        </aside>
      </main>
    </div>
  )
}

function TypingIndicator() {
  return (
    <output className="flex justify-start" aria-label="Response is being processed">
      <div className="inline-flex items-center gap-1.5 rounded-[1.35rem] rounded-bl-none bg-(--up-raise) px-4 py-3">
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-2 rounded-full bg-(--up-accent) motion-safe:animate-bounce"
            style={{
              animationDelay: `${index * 140}ms`,
              animationDuration: "820ms",
            }}
          />
        ))}
      </div>
    </output>
  )
}

function SceneEncounterEditor({
  scene,
  selectedPath,
  files,
  manifest,
  encounters,
  disabled,
  onActivePathChange,
  onSave,
}: {
  scene: ModuleSection["scenes"][number]
  selectedPath: string
  files: SourceFile[]
  manifest: RuntimeManifest
  encounters: Record<string, RuntimeEncounter>
  disabled: boolean
  onActivePathChange: (path: string) => void
  onSave: (path: string, content: string) => void
}) {
  React.useEffect(() => {
    const scrollContainer = document.querySelector("main section .overflow-y-auto")
    if (!scrollContainer) return
    const targets = scene.pages.map((page) => document.getElementById(encounterDomId(page.path))).filter((element): element is HTMLElement => Boolean(element))
    if (targets.length === 0) return
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => Math.abs(a.boundingClientRect.top - scrollContainer.getBoundingClientRect().top) - Math.abs(b.boundingClientRect.top - scrollContainer.getBoundingClientRect().top))[0]
        const path = scene.pages.find((page) => encounterDomId(page.path) === (visible?.target as HTMLElement | undefined)?.id)?.path
        if (path) onActivePathChange(path)
      },
      { root: scrollContainer, threshold: [0.25, 0.55] }
    )
    targets.forEach((target) => {
      observer.observe(target)
    })
    return () => observer.disconnect()
  }, [scene.pages, onActivePathChange])

  return (
    <div className="mx-auto max-w-6xl">
      {scene.pages.map((page) => {
        const file = files.find((item) => item.path === page.path)
        return (
          <div key={page.path} id={encounterDomId(page.path)} className={selectedPath === page.path ? "scroll-mt-6 ring-2 ring-(--up-accent-line) ring-offset-4 ring-offset-(--up-raise)" : "scroll-mt-6"}>
            <ModulePageEditor file={file} files={files} manifest={manifest} encounters={encounters} page={page} disabled={disabled} hideEncounterContext onSave={onSave} />
          </div>
        )
      })}
    </div>
  )
}

function ScenePageHeader({ scene, sectionsSidebarOpen, onRestoreSectionsSidebar }: { scene: ModuleSection["scenes"][number]; sectionsSidebarOpen: boolean; onRestoreSectionsSidebar: () => void }) {
  return (
    <header className="bg-(--up-bg) px-6 py-5">
      <div className="flex items-start gap-4">
        <ShowSectionsButton show={!sectionsSidebarOpen} onClick={onRestoreSectionsSidebar} />
        <div className="min-w-0 flex-1">
          <span className="rounded border border-(--up-line) bg-(--up-raise) px-2 py-1 font-sans text-2xs uppercase text-(--up-text)">Scene</span>
          <h2 className="mt-2 text-2xl font-semibold leading-tight text-(--up-strong)">{scene.title}</h2>
        </div>
      </div>
    </header>
  )
}

// It waits for the sidebar to leave, then comes in where the wider page puts it.
function ShowSectionsButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  return (
    <Presence show={show} motion="left" index={5} initial={false} className="hidden shrink-0 xl:block">
      <Tip label="Show sections">
        <Button
          variant="plain"
          type="button"
          onClick={onClick}
          className="grid size-7 place-items-center rounded-md border border-(--up-line) bg-(--up-bg) p-px text-(--up-accent) transition-[background-color,border-color,scale] duration-150 ease-snap hover:border-(--up-line) hover:bg-(--up-raise) active:scale-[0.96]"
          aria-label="Show adventure sections sidebar"
        >
          <Menu className="size-4" strokeWidth={1.35} />
        </Button>
      </Tip>
    </Presence>
  )
}

function HeaderCountBadge({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-(--up-line) bg-(--up-raise) px-2 font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-text)">
      <Swap id={value} as="span" className="text-xs text-(--up-accent)">
        {value}
      </Swap>
      {label}
    </span>
  )
}

function RevisionHistory({
  revisions,
  selectedPath,
  disabled,
  onRestore,
}: {
  revisions: RevisionSummary[]
  selectedPath: string
  disabled: boolean
  onRestore: (revisionId: string, path?: string) => void
}) {
  if (revisions.length === 0) {
    return <div className="py-4 text-xs leading-5 text-(--up-muted)">Revision history will appear here after chat or prose edits auto-save.</div>
  }
  return (
    <div className="space-y-5 pb-3">
      {revisions.slice(0, 8).map((revision, index) => {
        const includesSelectedPath = revision.changedPaths.includes(selectedPath)
        return (
          <div key={revision.id} className="enter-rise" style={{ "--i": index } as React.CSSProperties}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-serif text-xl font-semibold leading-tight text-(--up-strong) text-balance">{revision.summary}</div>
                <div className="mt-2 font-sans text-2xs uppercase tracking-[0.08em] text-(--up-faint)">
                  {revision.source} · {new Date(revision.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="up-tag">{revision.validation.status}</div>
            </div>
            <div className="mt-2 line-clamp-2 break-all font-sans text-2xs text-(--up-faint)">{revision.changedPaths.join(", ")}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="plain" onClick={() => onRestore(revision.id)} disabled={disabled} className="up-btn is-xs">
                <RotateCcw className="size-3" /> Restore Draft
              </Button>
              <Button
                variant="plain"
                onClick={() => onRestore(revision.id, selectedPath)}
                disabled={disabled || !includesSelectedPath}
                className="up-btn is-xs"
              >
                <RotateCcw className="size-3" /> Restore File
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ModulePageEditor({
  file,
  files,
  manifest,
  encounters,
  page,
  disabled,
  onSave,
  hideEncounterContext = false,
}: {
  file?: SourceFile
  files: SourceFile[]
  manifest: RuntimeManifest
  encounters: Record<string, RuntimeEncounter>
  page?: WikiPage
  disabled: boolean
  onSave: (path: string, content: string) => void
  hideEncounterContext?: boolean
}) {
  const fields = React.useMemo(() => parseEditableFields(file), [file])
  const npcLookup = React.useMemo(() => buildNpcLookup(files), [files])
  const [title, setTitle] = React.useState(fields.title)
  const [summary, setSummary] = React.useState(fields.summary)
  const [intro, setIntro] = React.useState(fields.intro)
  const [gmNotes, setGmNotes] = React.useState(fields.gmNotes)
  const [transitions, setTransitions] = React.useState(fields.transitions)
  const [image, setImage] = React.useState(fields.image)
  const isJson = Boolean(file?.path.endsWith(".json"))
  const isCharacter = Boolean(file && (markdownKind(file) === "npc" || markdownKind(file) === "character"))
  const nextContent = file && !isJson && !isCharacter ? updateMarkdownFields(file.content, { title, summary, intro, gmNotes, transitions, image }) : (file?.content ?? "")
  useDebouncedAutoSave(file?.path ?? "", nextContent, file?.content ?? "", disabled || !file || isJson || isCharacter, onSave)

  React.useEffect(() => {
    setTitle(fields.title)
    setSummary(fields.summary)
    setIntro(fields.intro)
    setGmNotes(fields.gmNotes)
    setTransitions(fields.transitions)
    setImage(fields.image)
  }, [fields])

  if (!file) return null
  if (isJson) return <JsonKeyFieldEditor file={file} disabled={disabled} onSave={onSave} />

  if (isCharacter) {
    return (
      <CharacterProfileEditor
        file={file}
        files={files}
        manifest={manifest}
        title={title}
        summary={summary}
        image={image}
        disabled={disabled}
        onTitleChange={setTitle}
        onSummaryChange={setSummary}
        onImageChange={setImage}
        onSave={onSave}
      />
    )
  }

  const isEncounter = file.path.includes("/encounters/")
  const encounter = Object.values(encounters).find((item) => item.sourcePath === file.path)

  if (isEncounter) {
    return (
      <div className="mx-auto max-w-6xl">
        <article
          className={hideEncounterContext ? "overflow-hidden text-(--up-strong)" : "overflow-hidden rounded-md border border-(--up-line) bg-(--up-bg) text-(--up-strong)"}
        >
          <div className="relative bg-(--up-raise)">
            <ImageUpload
              id={`wiki-image-${file.path}`}
              value={image}
              onChange={(url) => setImage(normalizeUploadedImageUrl(url))}
              onRemove={() => setImage("")}
              folder={`images/settings/${manifest.settingId}/${manifest.planId}`}
              className="aspect-[21/9] rounded-none border-0"
            />
            <div className="absolute left-4 top-4 rounded bg-black/65 px-2 py-1 text-2xs font-semibold uppercase tracking-[0.08em] text-white">
              <ImageIcon className="mr-1 inline size-3" />
              Module Art
            </div>
          </div>

          <div className={hideEncounterContext ? "bg-(--up-bg) px-7 py-7" : "px-7 py-7 @3xl:px-10 @3xl:py-9"}>
            <div className="font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-muted)">Encounter {encounter?.id ?? ""}</div>
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={disabled}
              plain
              className="up-field mt-3 !font-serif !text-3xl !font-semibold"
            />

            {!hideEncounterContext && (
              <div className="mt-5 grid gap-x-10 gap-y-3 @xl:grid-cols-2">
                <ReadonlyField label="Section" value={fields.sectionTitle || "Encounter graph"} />
                <ReadonlyField label="Scene" value={fields.sceneTitle || "Encounter file"} />
              </div>
            )}

            <Presence show={Boolean(page?.summary)} motion="fade" asChild>
              {page?.summary && <p className="mt-5 text-pretty text-lg leading-8 text-(--up-muted)">{page.summary}</p>}
            </Presence>

            <div className="mt-8 space-y-8">
              <ModuleBlock title="Summary">
                <Block label="Summary" value={summary} onChange={setSummary} disabled={disabled} rows={4} tone="paper" hideLabel />
              </ModuleBlock>
              <ModuleBlock title="Read Aloud">
                <Block label="Intro" value={intro} onChange={setIntro} disabled={disabled} rows={7} tone="paper" hideLabel />
              </ModuleBlock>
              <ModuleBlock title="GM Notes">
                <Block label="GM Notes" value={gmNotes} onChange={setGmNotes} disabled={disabled} rows={5} tone="paper" hideLabel />
              </ModuleBlock>
              <ModuleBlock title="Encounter NPCs">
                <EncounterNpcEditor refs={fields.npcRefs} npcLookup={npcLookup} />
              </ModuleBlock>
              <ModuleBlock title="Exits">
                <Block label="Transitions" value={transitions} onChange={setTransitions} disabled={disabled} rows={6} tone="paper" hideLabel />
              </ModuleBlock>
            </div>
          </div>
        </article>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="overflow-hidden border-b border-(--up-line) bg-(--up-bg) text-(--up-strong)">
        <div className="relative bg-(--up-raise)">
          <ImageUpload
            id={`wiki-image-${file.path}`}
            value={image}
            onChange={(url) => setImage(normalizeUploadedImageUrl(url))}
            onRemove={() => setImage("")}
            folder={`images/settings/${manifest.settingId}/${manifest.planId}`}
            className="aspect-[21/9] rounded-none border-0"
          />
          <div className="absolute left-4 top-4 rounded bg-black/65 px-2 py-1 text-2xs font-semibold uppercase tracking-[0.08em] text-white">
            <ImageIcon className="mr-1 inline size-3" />
            Module Art
          </div>
        </div>
        <div className="p-6">
          <div className="font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-muted)">Adventure {manifest.planId}</div>
          <Input plain value={title} onChange={(event) => setTitle(event.target.value)} disabled={disabled} className="up-field mt-2 !font-serif !text-3xl !font-semibold" />
          <p className="mt-4 text-sm leading-6 text-(--up-muted)">{page?.summary || file.path}</p>
        </div>
      </div>

      <div className="bg-(--up-bg) p-6 text-(--up-strong)">
        <Block label="Summary" value={summary} onChange={setSummary} disabled={disabled} rows={5} tone="paper" />
      </div>
    </div>
  )
}

function CharacterProfileEditor({
  file,
  files,
  manifest,
  title,
  summary,
  image,
  disabled,
  onTitleChange,
  onSummaryChange,
  onImageChange,
  onSave,
}: {
  file: SourceFile
  files: SourceFile[]
  manifest: RuntimeManifest
  title: string
  summary: string
  image: string
  disabled: boolean
  onTitleChange: (value: string) => void
  onSummaryChange: (value: string) => void
  onImageChange: (value: string) => void
  onSave: (path: string, content: string) => void
}) {
  const sheet = React.useMemo(() => characterSheetForProfile(file, files), [file, files])
  const details = [sheet.gender, sheet.race, sheet.archetype].filter(Boolean)
  const abilities = [
    sheet.attributes ? "attributes" : "",
    sheet.skills.length ? `${sheet.skills.length} skills` : "",
    sheet.spells.length ? `${sheet.spells.length} spells` : "",
    sheet.specialAbilities.length ? `${sheet.specialAbilities.length} abilities` : "",
  ].filter(Boolean)
  const characterDetails = [
    { title: "Appearance", value: sheet.appearance },
    { title: "Personality", value: sheet.personality },
    { title: "Background", value: sheet.background },
    { title: "Motivation", value: sheet.motivation },
    { title: "Behavior", value: sheet.behavior },
  ].filter((detail) => detail.value)
  const nextContent = updateCharacterMarkdownFields(file.content, { title, image, summary })
  useDebouncedAutoSave(file.path, nextContent, file.content, disabled, onSave)
  return (
    <div className="mx-auto max-w-6xl">
      <div className="overflow-hidden rounded-md border border-(--up-line) bg-(--up-bg) text-(--up-strong)">
        <div className="grid gap-0 @3xl:grid-cols-[300px_minmax(0,1fr)]">
          <div className="bg-(--up-raise) p-5 @3xl:border-r @3xl:border-(--up-line)">
            <div className="overflow-hidden rounded-md border border-(--up-line) bg-(--up-bg)">
              <ImageUpload
                id={`wiki-character-image-${file.path}`}
                value={image}
                onChange={(url) => onImageChange(normalizeUploadedImageUrl(url))}
                onRemove={() => onImageChange("")}
                folder={`images/settings/${manifest.settingId}/${manifest.planId}/characters`}
                className="aspect-square rounded-none border-0"
              />
            </div>
            {sheet.attributes && <AttributeGrid attributes={sheet.attributes} />}
          </div>

          <div className="p-6 @3xl:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-(--up-line-strong) bg-(--up-btn) px-2 py-1 font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-muted)">Character</span>
            </div>

            <Input plain value={title} onChange={(event) => onTitleChange(event.target.value)} disabled={disabled} className="up-field mt-3 !font-serif !text-3xl !font-semibold" />

            {(details.length > 0 || abilities.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {[...details, ...abilities].map((detail) => (
                  <span key={detail} className="rounded border border-(--up-line) bg-(--up-btn) px-2.5 py-1 font-sans text-2xs uppercase tracking-[0.08em] text-(--up-muted)">
                    {detail}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6">
              <Block label="Summary" value={summary} onChange={onSummaryChange} disabled={disabled} rows={8} tone="paper" />
            </div>

            <div className="mt-6 grid gap-4 @4xl:grid-cols-2">
              {characterDetails.map((detail) => (
                <CharacterDetail key={detail.title} title={detail.title} value={detail.value} />
              ))}
            </div>

            <div className="mt-6 grid gap-4 @4xl:grid-cols-2">
              <CharacterList title="Skills" values={sheet.skills} />
              <CharacterObjectList title="Equipment" values={sheet.equipment} />
              <CharacterObjectList title="Spells" values={sheet.spells} />
              <CharacterMixedList title="Special Abilities" values={sheet.specialAbilities} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AttributeGrid({ attributes }: { attributes: Record<string, unknown> }) {
  const entries = Object.entries(attributes).filter(([, value]) => typeof value === "number" || typeof value === "string")
  if (entries.length === 0) return null
  return (
    <div className="mt-4 rounded-md border border-(--up-line) bg-(--up-bg) p-3">
      <div className="mb-3 font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-accent)">Attributes</div>
      <div className="grid grid-cols-3 gap-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded border border-(--up-line) bg-(--up-raise) px-2 py-2 text-center">
            <div className="font-serif text-2xl font-semibold leading-none text-(--up-strong)">{String(value)}</div>
            <div className="mt-1 truncate font-sans text-2xs uppercase tracking-[0.08em] text-(--up-muted)">{key.slice(0, 3)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CharacterDetail({ title, value }: { title: string; value: unknown }) {
  if (typeof value !== "string" || !value.trim()) return null
  return (
    <section className="rounded border border-(--up-line) bg-(--up-btn) p-4">
      <h3 className="mb-2 font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-muted)">{title}</h3>
      <p className="text-base leading-7 text-(--up-text)">{value}</p>
    </section>
  )
}

function CharacterList({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null
  return (
    <section className="rounded border border-(--up-line) bg-(--up-btn) p-4">
      <h3 className="mb-3 font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-muted)">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span key={value} className="rounded border border-(--up-line) bg-(--up-btn) px-2.5 py-1 text-sm text-(--up-text)">
            {value}
          </span>
        ))}
      </div>
    </section>
  )
}

function CharacterObjectList({ title, values }: { title: string; values: Array<{ name?: unknown; description?: unknown }> }) {
  if (values.length === 0) return null
  return (
    <section className="rounded border border-(--up-line) bg-(--up-btn) p-4">
      <h3 className="mb-3 font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-muted)">{title}</h3>
      <div className="space-y-3">
        {values.map((value, index) => (
          <div key={`${String(value.name ?? title)}-${index}`} className="pb-2 last:pb-0">
            <div className="font-serif text-lg font-bold leading-tight text-(--up-strong)">{String(value.name ?? "Untitled")}</div>
            {typeof value.description === "string" && value.description.trim() && <p className="mt-1 text-sm leading-6 text-(--up-muted)">{value.description}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

function CharacterMixedList({ title, values }: { title: string; values: Array<string | { name?: unknown; description?: unknown }> }) {
  if (values.length === 0) return null
  const stringValues = values.filter((value): value is string => typeof value === "string")
  const objectValues = values.filter((value): value is { name?: unknown; description?: unknown } => typeof value === "object" && value !== null)
  return (
    <>
      {stringValues.length > 0 && <CharacterList title={title} values={stringValues} />}
      {objectValues.length > 0 && <CharacterObjectList title={stringValues.length > 0 ? `${title} Details` : title} values={objectValues} />}
    </>
  )
}

function EncounterNpcEditor({ refs, npcLookup }: { refs: EditableNpcRef[]; npcLookup: Map<string, NpcLookupRecord> }) {
  return (
    <div className="space-y-4">
      {refs.length === 0 && <p className="text-sm text-(--up-muted)">No NPCs assigned to this encounter. Ask the authoring chat to add or connect an NPC.</p>}
      {refs.map((ref, index) => {
        const npc = npcLookup.get(ref.id)
        const image = npcImageUrl(npc?.image ?? "")
        const details = [npc?.gender, npc?.race, npc?.archetype].filter(Boolean).join(" ")
        return (
          <div key={index} className="rounded-md border border-(--up-line) bg-(--up-btn) p-4">
            <div className="grid gap-5 @lg:grid-cols-[176px_minmax(0,1fr)]">
              <div className="size-[176px] overflow-hidden rounded border border-(--up-line-strong) bg-(--up-bg) shadow-sm">
                {image ? (
                  <Image src={image} alt={npc?.name ?? "NPC"} width={176} height={176} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-(--up-bg) font-sans text-3xl font-semibold uppercase text-(--up-faint)">{initials(npc?.name ?? "NPC")}</div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate font-serif text-2xl font-semibold leading-tight text-(--up-strong)">{npc?.name ?? titleFromId(ref.id || "Unknown NPC")}</h4>
                    <p className="mt-1 font-sans text-2xs uppercase tracking-[0.08em] text-(--up-faint)">{details || "NPC reference"}</p>
                  </div>
                </div>
                {npc?.summary ? (
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-(--up-muted)">{npc.summary}</p>
                ) : (
                  <p className="mt-3 text-sm italic text-(--up-faint)">No NPC sheet details found for this reference.</p>
                )}
              </div>
            </div>
            <div className="mt-4 rounded border border-(--up-line) bg-(--up-btn) p-3">
              <div className="font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-faint)">Encounter Role</div>
              <p className="mt-2 text-sm leading-6 text-(--up-muted)">{ref.behavior || "No behavior note yet. Ask the authoring chat to revise this NPC's role in the encounter."}</p>
              {ref.initialInitiative && <p className="mt-2 font-sans text-2xs uppercase tracking-[0.08em] text-(--up-faint)">Initial initiative: {ref.initialInitiative}</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function JsonKeyFieldEditor({ file, disabled, onSave }: { file: SourceFile; disabled: boolean; onSave: (path: string, content: string) => void }) {
  const parsed = React.useMemo(() => safeJson(file.content), [file.content])
  const [name, setName] = React.useState(String(parsed.name ?? ""))
  const [race, setRace] = React.useState(String(parsed.race ?? ""))
  const [archetype, setArchetype] = React.useState(String(parsed.archetype ?? ""))
  const [appearance, setAppearance] = React.useState(String(parsed.appearance ?? ""))
  React.useEffect(() => {
    setName(String(parsed.name ?? ""))
    setRace(String(parsed.race ?? ""))
    setArchetype(String(parsed.archetype ?? ""))
    setAppearance(String(parsed.appearance ?? ""))
  }, [parsed])
  const nextContent = `${JSON.stringify({ ...parsed, name, race, archetype, appearance }, null, 2)}\n`
  useDebouncedAutoSave(file.path, nextContent, file.content, disabled, onSave)
  return (
    <div className="space-y-4">
      <h2 className="break-all [font-family:var(--up-mono)] text-sm font-bold text-(--up-strong)">{file.path}</h2>
      <Field label="Name" value={name} onChange={setName} disabled={disabled} />
      <Field label="Race" value={race} onChange={setRace} disabled={disabled} />
      <Field label="Archetype" value={archetype} onChange={setArchetype} disabled={disabled} />
      <Block label="Appearance" value={appearance} onChange={setAppearance} disabled={disabled} rows={6} />
    </div>
  )
}

type WikiLink = {
  type: string
  id: string
  label: string
  path?: string
}

type WikiPage = {
  path: string
  id: string
  title: string
  kind: "adventure" | "encounter" | "npc" | "character" | "other" | "sheet"
  summary: string
  sectionTitle?: string
  sceneTitle?: string
  moduleOrder: number
  links: WikiLink[]
  outgoingEncounterIds: string[]
}

type WikiModel = {
  pages: WikiPage[]
  pagesByPath: Map<string, WikiPage>
  pathById: Map<string, string>
  groups: Array<{ key: string; title: string; pages: WikiPage[] }>
  moduleSections: ModuleSection[]
  linkCount: number
}

type ModuleSection = {
  title: string
  scenes: Array<{ title: string; pages: WikiPage[] }>
}

function WikiNavigator({
  wiki,
  selectedPath,
  activeSectionIndex,
  activeSceneIndex,
  onSelect,
  onSectionSelect,
  onSceneSelect,
  onCollapse,
}: {
  wiki: WikiModel
  selectedPath: string
  activeSectionIndex: number
  activeSceneIndex: number
  onSelect: (path: string) => void
  onSectionSelect: (sectionIndex: number) => void
  onSceneSelect: (sectionIndex: number, sceneIndex: number) => void
  onCollapse: () => void
}) {
  const [query, setQuery] = React.useState("")
  const normalizedQuery = query.trim().toLowerCase()
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] bg-(--up-bg)">
      <div className="grid h-11 grid-cols-[38px_minmax(0,1fr)_42px] border-b border-(--up-line) bg-(--up-raise)">
        <div className="grid place-items-center text-(--up-faint)">
          <Search className="size-4" />
        </div>
        <Input
          plain
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find Encounter"
          className="min-w-0 border-x border-(--up-line) bg-transparent px-3 text-sm text-(--up-strong) outline-none placeholder:text-(--up-faint) focus:bg-(--up-bg)"
        />
        <Tip label="Hide sections">
          <Button
            variant="plain"
            type="button"
            onClick={onCollapse}
            className="hidden place-items-center bg-transparent px-2 py-0.5 text-(--up-accent) transition-[background-color,color,scale] duration-150 ease-snap hover:bg-(--up-raise) active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-(--up-accent-line) xl:grid"
            aria-label="Hide adventure sections sidebar"
          >
            <PanelLeftClose className="size-full" strokeWidth={0.75} />
          </Button>
        </Tip>
      </div>
      <div className="min-h-0 overflow-y-auto px-3 py-3">
        <Swap id={normalizedQuery ? "results" : "outline"}>
          {normalizedQuery ? (
            wiki.groups.map((group) => {
              const pages = group.pages.filter((page) => `${page.title} ${page.id} ${page.summary}`.toLowerCase().includes(normalizedQuery))
              if (pages.length === 0) return null
              return <PageGroup key={group.key} title={group.title} pages={pages} selectedPath={selectedPath} onSelect={onSelect} />
            })
          ) : (
            <>
              {wiki.groups.find((group) => group.key === "adventure") && (
                <PageGroup title="Adventure" pages={wiki.groups.find((group) => group.key === "adventure")!.pages} selectedPath={selectedPath} onSelect={onSelect} />
              )}
              <section className="mb-4">
                <h3 className="mb-1.5 px-2 font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-faint)">Module Outline</h3>
                <div className="space-y-3">
                  {wiki.moduleSections.map((section, sectionIndex) => (
                    <div key={section.title}>
                      <OutlineButton
                        active={sectionIndex === activeSectionIndex}
                        label={section.title}
                        meta={`${section.scenes.length} scenes`}
                        level="section"
                        onClick={() => onSectionSelect(sectionIndex)}
                      />
                      <div className="mt-1 space-y-2 pl-3">
                        {section.scenes.map((scene, sceneIndex) => (
                          <div key={`${section.title}-${scene.title}`}>
                            <OutlineButton
                              active={sectionIndex === activeSectionIndex && sceneIndex === activeSceneIndex}
                              label={scene.title}
                              meta={`${scene.pages.length} encounters`}
                              level="scene"
                              onClick={() => onSceneSelect(sectionIndex, sceneIndex)}
                            />
                            <div className="mt-0.5 space-y-0.5 pl-4">
                              {scene.pages.map((page) => (
                                <PageButton key={page.path} page={page} selectedPath={selectedPath} onSelect={onSelect} level="encounter" />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              {wiki.groups
                .filter((group) => !["adventure", "encounter"].includes(group.key))
                .map((group) => (
                  <PageGroup key={group.key} title={group.title} pages={group.pages} selectedPath={selectedPath} onSelect={onSelect} />
                ))}
            </>
          )}
        </Swap>
      </div>
    </div>
  )
}

function OutlineButton({ active, label, meta, level, onClick }: { active: boolean; label: string; meta: string; level: "section" | "scene"; onClick: () => void }) {
  return (
    <Button
      variant="plain"
      type="button"
      onClick={onClick}
      className={`group relative flex w-full items-center justify-between gap-3 rounded-r rounded-l-none pr-2.5 pl-4 text-left transition-[background-color,color,scale] duration-150 ease-snap active:scale-[0.96] ${
        active ? "up-marked font-semibold text-(--up-strong)" : "text-(--up-muted) hover:bg-(--up-raise) hover:text-(--up-strong)"
      } ${level === "section" ? "min-h-10" : "min-h-8"}`}
    >
      <span className={`min-w-0 truncate leading-5 ${level === "section" ? "font-serif text-sm font-semibold" : "font-sans text-2xs font-semibold uppercase tracking-[0.08em]"}`}>{label}</span>
      <span className="shrink-0 font-sans text-2xs uppercase tracking-[0.08em] text-(--up-faint)">{meta}</span>
    </Button>
  )
}

function PageGroup({ title, pages, selectedPath, onSelect }: { title: string; pages: WikiPage[]; selectedPath: string; onSelect: (path: string) => void }) {
  return (
    <section className="mb-4">
      <h3 className="mb-1.5 px-2 font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-faint)">{title}</h3>
      <div className="space-y-0.5">
        {pages.map((page) => (
          <PageButton key={page.path} page={page} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}

function PageButton({ page, selectedPath, onSelect, level = "root" }: { page: WikiPage; selectedPath: string; onSelect: (path: string) => void; level?: "root" | "encounter" }) {
  const isSelected = page.path === selectedPath
  const isEncounter = page.kind === "encounter"
  return (
    <Button
      variant="plain"
      type="button"
      onClick={() => onSelect(page.path)}
      className={`group relative flex w-full items-center rounded-r rounded-l-none pr-2.5 pl-4 text-left transition-[background-color,color,scale] duration-150 ease-snap active:scale-[0.96] ${
        isSelected ? "up-marked font-semibold text-(--up-strong)" : "text-(--up-muted) hover:bg-(--up-raise) hover:text-(--up-strong)"
      } ${level === "encounter" ? "min-h-8" : "min-h-9"}`}
    >
      <span className="min-w-0">
        <span className={`block truncate ${isEncounter ? "text-xs leading-5" : "text-sm leading-5"}`}>{page.title}</span>
        {!isEncounter && page.kind !== "adventure" && (
          <span className="block truncate font-sans text-2xs leading-4 text-(--up-faint)">{page.kind === "npc" || page.kind === "character" || page.kind === "sheet" ? "character" : page.id}</span>
        )}
      </span>
    </Button>
  )
}

function WikiPageHeader({ page, sectionsSidebarOpen, onRestoreSectionsSidebar }: { page?: WikiPage; sectionsSidebarOpen: boolean; onRestoreSectionsSidebar: () => void }) {
  if (!page) return null
  return (
    <header className="bg-(--up-bg) px-6 py-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <ShowSectionsButton show={!sectionsSidebarOpen} onClick={onRestoreSectionsSidebar} />
            <span className="rounded border border-(--up-line) bg-(--up-raise) px-2 py-1 font-sans text-2xs uppercase text-(--up-text)">{pageKindLabel(page)}</span>
            {page.kind !== "npc" && page.kind !== "character" && page.kind !== "sheet" && <span className="font-sans text-2xs text-(--up-muted)">{page.id}</span>}
          </div>
          <h2 className="mt-2 text-2xl font-semibold leading-tight text-(--up-strong)">{page.title}</h2>
          <p className="mt-1 line-clamp-2 max-w-4xl text-sm text-(--up-muted)">{page.summary || page.path}</p>
        </div>
      </div>
    </header>
  )
}

function buildWikiModel(files: SourceFile[], encounters: Record<string, RuntimeEncounter>): WikiModel {
  const pagesWithoutResolvedLinks = files.map((file) => pageFromSource(file, encounters))
  const pathById = new Map<string, string>()
  for (const page of pagesWithoutResolvedLinks) {
    const existingPath = pathById.get(page.id)
    if (!existingPath || page.kind !== "sheet") pathById.set(page.id, page.path)
    pathById.set(`${page.kind}:${page.id}`, page.path)
    if (page.kind === "npc" || page.kind === "character") pathById.set(`character:${page.id}`, page.path)
  }
  for (const encounter of Object.values(encounters)) {
    pathById.set(`encounter:${encounter.id}`, encounter.sourcePath)
  }
  const pages = pagesWithoutResolvedLinks.map((page) => ({
    ...page,
    links: page.links.map((link) => ({
      ...link,
      path: pathById.get(`${link.type}:${link.id}`) ?? pathById.get(link.id),
    })),
  }))
  const byKind = (kind: WikiPage["kind"]) => pages.filter((page) => page.kind === kind).sort(pageSort)
  const characterPages = buildCharacterPages(pages)
  const groups = [
    { key: "adventure", title: "Adventure", pages: byKind("adventure") },
    { key: "encounter", title: "Encounters", pages: byKind("encounter") },
    { key: "characters", title: "Characters", pages: characterPages },
    { key: "other", title: "Other Pages", pages: byKind("other") },
  ].filter((group) => group.pages.length > 0)
  const moduleSections = buildModuleSections(pages)
  return {
    pages,
    pagesByPath: new Map(pages.map((page) => [page.path, page])),
    pathById,
    groups,
    moduleSections,
    linkCount: pages.reduce((sum, page) => sum + page.links.length, 0),
  }
}

function pageFromSource(file: SourceFile, encounters: Record<string, RuntimeEncounter>): WikiPage {
  const id =
    file.path
      .split("/")
      .at(-1)
      ?.replace(/\.(md|json)$/, "") ?? file.path
  if (file.path.endsWith(".json")) {
    const parsed = safeJson(file.content)
    return {
      path: file.path,
      id: String(parsed.id ?? id),
      title: String(parsed.name ?? parsed.id ?? id),
      kind: "sheet",
      summary: [parsed.race, parsed.archetype].filter(Boolean).join(" ") || "Character",
      moduleOrder: Number.MAX_SAFE_INTEGER,
      links: [],
      outgoingEncounterIds: [],
    }
  }
  const kind = markdownKind(file)
  const pageId = frontmatterValue(file.content, "id") || id
  const encounter = Object.values(encounters).find((item) => item.sourcePath === file.path)
  return {
    path: file.path,
    id: pageId,
    title: frontmatterValue(file.content, "title") || titleFromId(pageId),
    kind,
    summary: frontmatterValue(file.content, "summary") || sectionValue(file.content, "Summary") || sectionValue(file.content, "Intro").slice(0, 220),
    sectionTitle: frontmatterValue(file.content, "sectionTitle") || migrationContextValue(file.content, "Legacy section"),
    sceneTitle: frontmatterValue(file.content, "sceneTitle") || migrationContextValue(file.content, "Legacy scene"),
    moduleOrder: Number(frontmatterValue(file.content, "moduleOrder")) || encounterOrder(file.path, encounters),
    links: extractWikiLinks(file.content),
    outgoingEncounterIds: encounter?.transitions.map((transition) => transition.toEncounterId) ?? [],
  }
}

function buildModuleSections(pages: WikiPage[]): ModuleSection[] {
  const sectionMap = new Map<string, Map<string, WikiPage[]>>()
  for (const page of pages.filter((item) => item.kind === "encounter").sort((a, b) => a.moduleOrder - b.moduleOrder || pageSort(a, b))) {
    const section = page.sectionTitle || "Unsectioned Encounters"
    const scene = page.sceneTitle || "Scene"
    if (!sectionMap.has(section)) sectionMap.set(section, new Map())
    const sceneMap = sectionMap.get(section)!
    if (!sceneMap.has(scene)) sceneMap.set(scene, [])
    sceneMap.get(scene)!.push(page)
  }
  return Array.from(sectionMap.entries()).map(([title, sceneMap]) => ({
    title,
    scenes: Array.from(sceneMap.entries()).map(([title, pages]) => ({ title, pages })),
  }))
}

function sceneLocationForPath(wiki: WikiModel, path: string) {
  for (const [sectionIndex, section] of wiki.moduleSections.entries()) {
    for (const [sceneIndex, scene] of section.scenes.entries()) {
      if (scene.pages.some((page) => page.path === path)) {
        return { sectionIndex, sceneIndex }
      }
    }
  }
  return null
}

function encounterDomId(path: string) {
  return `wiki-encounter-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`
}

function encounterOrder(path: string, encounters: Record<string, RuntimeEncounter>) {
  const ordered = Object.values(encounters)
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath))
    .findIndex((encounter) => encounter.sourcePath === path)
  return ordered === -1 ? Number.MAX_SAFE_INTEGER : ordered + 1
}

function markdownKind(file: SourceFile): WikiPage["kind"] {
  const type = frontmatterValue(file.content, "type")
  if (type === "adventure" || type === "encounter" || type === "npc" || type === "premadeCharacter") return type === "premadeCharacter" ? "character" : type
  if (file.path.includes("/encounters/")) return "encounter"
  if (file.path.includes("/npcs/")) return "npc"
  if (file.path.includes("/characters/")) return "character"
  return "other"
}

function buildCharacterPages(pages: WikiPage[]): WikiPage[] {
  const byId = new Map<string, { profile?: WikiPage; sheet?: WikiPage }>()
  for (const page of pages) {
    if (page.kind !== "npc" && page.kind !== "character" && page.kind !== "sheet") continue
    const entry = byId.get(page.id) ?? {}
    if (page.kind === "sheet") entry.sheet = page
    else entry.profile = page
    byId.set(page.id, entry)
  }
  return Array.from(byId.values())
    .map((entry) => entry.profile ?? entry.sheet)
    .filter((page): page is WikiPage => Boolean(page))
    .sort(pageSort)
}

function pageKindLabel(page: WikiPage): string {
  if (page.kind === "npc" || page.kind === "character" || page.kind === "sheet") return "character"
  return page.kind
}

function extractWikiLinks(content: string): WikiLink[] {
  return Array.from(content.matchAll(/\[\[([a-zA-Z]+):([^|\]]+)(?:\|([^\]]+))?\]\]/g)).map((match) => ({
    type: match[1],
    id: match[2],
    label: match[3] ?? titleFromId(match[2]),
  }))
}

function pageSort(a: WikiPage, b: WikiPage) {
  return a.title.localeCompare(b.title)
}

function buildNpcLookup(files: SourceFile[]): Map<string, NpcLookupRecord> {
  const lookup = new Map<string, NpcLookupRecord>()
  for (const file of files) {
    if (!file.path.endsWith(".json") || !file.path.includes("/npcs/")) continue
    const parsed = safeJson(file.content)
    const fallbackId =
      file.path
        .split("/")
        .at(-1)
        ?.replace(/\.json$/, "") ?? file.path
    const id = String(parsed.id ?? fallbackId)
    lookup.set(id, {
      id,
      name: String(parsed.name ?? titleFromId(id)),
      image: String(parsed.image ?? ""),
      race: String(parsed.race ?? ""),
      archetype: String(parsed.archetype ?? ""),
      gender: String(parsed.gender ?? ""),
      summary: compactText([parsed.appearance, parsed.personality, parsed.behavior]),
      sheetPath: file.path,
    })
  }
  for (const file of files) {
    if (!file.path.endsWith(".md") || markdownKind(file) !== "npc") continue
    const fallbackId = file.path.split("/").at(-1)?.replace(/\.md$/, "") ?? file.path
    const id = frontmatterValue(file.content, "id") || fallbackId
    const existing = lookup.get(id)
    lookup.set(id, {
      id,
      name: existing?.name || frontmatterValue(file.content, "title") || titleFromId(id),
      image: existing?.image || frontmatterValue(file.content, "image"),
      race: existing?.race ?? "",
      archetype: existing?.archetype ?? "",
      gender: existing?.gender ?? "",
      summary: existing?.summary || sectionValue(file.content, "Summary"),
      sheetPath: existing?.sheetPath,
      profilePath: file.path,
    })
  }
  return lookup
}

function compactText(values: unknown[]) {
  return values
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim())
    .join(" ")
}

function characterSheetForProfile(profile: SourceFile, files: SourceFile[]) {
  const id = frontmatterValue(profile.content, "id") || profile.path.split("/").at(-1)?.replace(/\.md$/, "") || ""
  const sheetName = frontmatterValue(profile.content, "sheet")
  const siblingPath = sheetName ? `${profile.path.split("/").slice(0, -1).join("/")}/${sheetName}` : ""
  const sheetFile =
    files.find((file) => file.path === siblingPath) ??
    files.find((file) => {
      if (!file.path.endsWith(".json")) return false
      const parsed = safeJson(file.content)
      return String(parsed.id ?? "") === id
    })
  const parsed = sheetFile ? safeJson(sheetFile.content) : {}
  const attributes = typeof parsed.attributes === "object" && parsed.attributes ? (parsed.attributes as Record<string, unknown>) : undefined
  return {
    ...parsed,
    id: String(parsed.id ?? id),
    path: sheetFile?.path ?? "",
    gender: typeof parsed.gender === "string" ? parsed.gender : "",
    race: typeof parsed.race === "string" ? parsed.race : "",
    archetype: typeof parsed.archetype === "string" ? parsed.archetype : "",
    appearance: typeof parsed.appearance === "string" ? parsed.appearance : "",
    personality: typeof parsed.personality === "string" ? parsed.personality : "",
    background: typeof parsed.background === "string" ? parsed.background : "",
    motivation: typeof parsed.motivation === "string" ? parsed.motivation : "",
    behavior: typeof parsed.behavior === "string" ? parsed.behavior : "",
    skills: Array.isArray(parsed.skills) ? parsed.skills : [],
    spells: Array.isArray(parsed.spells) ? parsed.spells : [],
    equipment: Array.isArray(parsed.equipment) ? parsed.equipment : [],
    specialAbilities: Array.isArray(parsed.specialAbilities) ? parsed.specialAbilities : [],
    attributes,
  }
}

function npcImageUrl(url: string) {
  if (!url) return ""
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) return url
  return `${IMAGE_HOST}/${url.replace(/^\/+/, "")}`
}

function initials(value: string) {
  return value
    .split(/[\s-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.slice(0, 1))
    .join("")
}

function titleFromId(id: string) {
  return id
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}

function ModuleBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-muted)">{title}</h3>
      {children}
    </section>
  )
}

function useDebouncedAutoSave(path: string, content: string, persistedContent: string, disabled: boolean, onSave: (path: string, content: string) => void) {
  const lastSavedRef = React.useRef(persistedContent)
  React.useEffect(() => {
    lastSavedRef.current = persistedContent
  }, [path, persistedContent])
  React.useEffect(() => {
    if (disabled || !path || content === lastSavedRef.current) return
    const timeout = window.setTimeout(() => {
      lastSavedRef.current = content
      onSave(path, content)
    }, 1600)
    return () => window.clearTimeout(timeout)
  }, [content, disabled, onSave, path])
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="font-sans text-2xs font-semibold uppercase tracking-[0.08em] text-(--up-faint)">{label}</div>
      <div className="mt-1 truncate font-serif text-2xl font-semibold leading-tight text-(--up-strong)">{value}</div>
    </div>
  )
}

function Field({ label, value, onChange, disabled, tone = "dark" }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; tone?: "dark" | "paper" }) {
  const paper = tone === "paper"
  return (
    <Label plain className="block space-y-1">
      <span className="up-label">{label}</span>
      <Input plain value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className="up-field" />
    </Label>
  )
}

function Block({
  label,
  value,
  onChange,
  disabled,
  rows,
  tone = "dark",
  hideLabel = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
  rows: number
  tone?: "dark" | "paper"
  hideLabel?: boolean
}) {
  const paper = tone === "paper"
  return (
    <Label plain className="block space-y-1">
      {!hideLabel && <span className="up-label">{label}</span>}
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        disabled={disabled}
        plain
        className={paper ? "up-field !min-h-0 !font-serif !leading-7" : "up-field !min-h-0"}
      />
    </Label>
  )
}

function parseEditableFields(file?: SourceFile) {
  const content = file?.content ?? ""
  return {
    title: frontmatterValue(content, "title"),
    image: frontmatterValue(content, "image"),
    sectionTitle: frontmatterValue(content, "sectionTitle") || migrationContextValue(content, "Legacy section"),
    sceneTitle: frontmatterValue(content, "sceneTitle") || migrationContextValue(content, "Legacy scene"),
    summary: sectionValue(content, "Summary"),
    intro: sectionValue(content, "Intro"),
    gmNotes: sectionValue(content, "GM Notes"),
    transitions: sectionValue(content, "Transitions"),
    npcRefs: parseNpcRefs(content),
  }
}

function updateMarkdownFields(content: string, fields: { title: string; image: string; summary: string; intro: string; gmNotes: string; transitions: string }) {
  let next = updateFrontmatterValue(content, "title", fields.title)
  next = updateFrontmatterValue(next, "image", fields.image)
  next = updateSection(next, "Summary", fields.summary)
  next = updateSection(next, "Intro", fields.intro)
  next = updateSection(next, "GM Notes", fields.gmNotes)
  next = updateSection(next, "Transitions", fields.transitions)
  return next.endsWith("\n") ? next : `${next}\n`
}

function updateCharacterMarkdownFields(content: string, fields: { title: string; image: string; summary: string }) {
  let next = updateFrontmatterValue(content, "title", fields.title)
  next = updateFrontmatterValue(next, "image", fields.image)
  next = updateSection(next, "Summary", fields.summary)
  return next.endsWith("\n") ? next : `${next}\n`
}

function normalizeUploadedImageUrl(url: string) {
  if (!url) return ""
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  return `${IMAGE_HOST}/${url.replace(/^\/+/, "")}`
}

function frontmatterValue(content: string, key: string) {
  const match = content.match(new RegExp(`^${key}:\\s*(.*)$`, "m"))
  return match?.[1]?.replace(/^["']|["']$/g, "") ?? ""
}

function updateFrontmatterValue(content: string, key: string, value: string) {
  const line = `${key}: ${JSON.stringify(value)}`
  if (new RegExp(`^${key}:`, "m").test(content)) return content.replace(new RegExp(`^${key}:.*$`, "m"), line)
  if (!value.trim()) return content
  return content.replace(/^---\n/, `---\n${line}\n`)
}

function parseNpcRefs(content: string): EditableNpcRef[] {
  const block = frontmatterBlock(content)
  const lines = block.split(/\r?\n/)
  const startIndex = lines.findIndex((line) => line.trim() === "npcs:")
  if (startIndex === -1) return []
  const refs: EditableNpcRef[] = []
  let current: EditableNpcRef | null = null
  for (const line of lines.slice(startIndex + 1)) {
    if (line && !line.startsWith(" ") && /^[a-zA-Z0-9_-]+:/.test(line)) break
    const objectStart = line.match(/^\s*-\s+id:\s*(.*)$/)
    if (objectStart) {
      current = { id: unquoteYamlValue(objectStart[1]), behavior: "", initialInitiative: "" }
      refs.push(current)
      continue
    }
    const inlineObject = line.match(/^\s*-\s+(\{.*\})\s*$/)
    if (inlineObject) {
      current = parseInlineNpcRef(inlineObject[1])
      refs.push(current)
      continue
    }
    const stringItem = line.match(/^\s*-\s+(.+)$/)
    if (stringItem) {
      current = { id: unquoteYamlValue(stringItem[1]), behavior: "", initialInitiative: "" }
      refs.push(current)
      continue
    }
    const nested = line.match(/^\s{4}([a-zA-Z0-9_-]+):\s*(.*)$/)
    if (nested && current) {
      if (nested[1] === "behavior") current.behavior = unquoteYamlValue(nested[2])
      if (nested[1] === "initialInitiative") current.initialInitiative = unquoteYamlValue(nested[2])
    }
  }
  return refs.filter((ref) => ref.id && ref.id !== "{" && ref.id !== "[object Object]")
}

function frontmatterBlock(content: string) {
  return content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ""
}

function unquoteYamlValue(value: string) {
  return value.trim().replace(/^["']|["']$/g, "")
}

function parseInlineNpcRef(value: string): EditableNpcRef {
  try {
    const json = value.replace(/([{,]\s*)([a-zA-Z0-9_-]+)\s*:/g, '$1"$2":')
    const parsed = JSON.parse(json) as { id?: unknown; behavior?: unknown; initialInitiative?: unknown }
    return {
      id: String(parsed.id ?? ""),
      behavior: typeof parsed.behavior === "string" ? parsed.behavior : "",
      initialInitiative: typeof parsed.initialInitiative === "number" || typeof parsed.initialInitiative === "string" ? String(parsed.initialInitiative) : "",
    }
  } catch {
    return { id: "", behavior: "", initialInitiative: "" }
  }
}

function sectionValue(content: string, heading: string) {
  const match = content.match(new RegExp(`^## ${heading}\\n\\n([\\s\\S]*?)(?=\\n## |$)`, "m"))
  return match?.[1]?.trim() ?? ""
}

function migrationContextValue(content: string, label: string) {
  const match = content.match(new RegExp(`^${escapeRegExp(label)}:\\s*(.+)$`, "m"))
  return match?.[1]?.trim() ?? ""
}

function updateSection(content: string, heading: string, value: string) {
  if (!value.trim()) return content
  const replacement = `## ${heading}\n\n${value.trim()}\n`
  const pattern = new RegExp(`^## ${heading}\\n\\n[\\s\\S]*?(?=\\n## |$)`, "m")
  if (pattern.test(content)) return content.replace(pattern, replacement.trimEnd())
  return `${content.trimEnd()}\n\n${replacement}`
}

function safeJson(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content)
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
