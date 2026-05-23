"use client"

import {
  exportAdminWikiAdventureBundleAction,
  importAdminWikiAdventureBundleAction,
  loadAdminWikiAdventureStateAction,
  saveAdminWikiAdventureFileAction,
  sendAdminWikiAdventureChatAction,
} from "@/app/_actions/wiki-adventures/admin-authoring-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ImageUpload } from "@/components/ui/image-upload"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { IMAGE_HOST } from "@/lib/config"
import type { RuntimeEncounter, RuntimeManifest, SourceFile, ValidationReport } from "@/lib/wiki-adventures"
import { BookOpen, Check, Download, FileJson, FileText, GitBranch, ImageIcon, MessageSquare, RefreshCcw, Save, Search, Upload, Wand2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"

type EditorState = Awaited<ReturnType<typeof loadAdminWikiAdventureStateAction>>

type ChatMessage = {
  role: "admin" | "wiki"
  content: string
}

export function AdminWikiAdventureEditor({ initialState }: { initialState: EditorState }) {
  const [state, setState] = React.useState(initialState)
  const [selectedPath, setSelectedPath] = React.useState(initialState.files.find((file) => file.path.endsWith("/adventure.md"))?.path ?? initialState.files[0]?.path ?? "")
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      role: "wiki",
      content: `Loaded ${initialState.manifest.title}. Ask for improvements and I will apply them to the wiki source.`,
    },
  ])
  const [prompt, setPrompt] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const selectedFile = state.files.find((file) => file.path === selectedPath) ?? state.files[0]
  const wiki = React.useMemo(() => buildWikiModel(state.files, state.encounters), [state.files, state.encounters])
  const selectedPage = wiki.pagesByPath.get(selectedFile?.path ?? "")

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

  async function downloadBundle() {
    const bundle = await exportAdminWikiAdventureBundleAction(state.definition.settingId, state.definition.planId)
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${state.definition.planId}-wiki-source.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  async function restoreBundle(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const bundle = JSON.parse(await file.text()) as { files: Array<{ path: string; content: string }> }
      await importAdminWikiAdventureBundleAction({ settingId: state.definition.settingId, planId: state.definition.planId, files: bundle.files })
      await refresh()
      toast.success("Source bundle restored")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Restore failed")
    } finally {
      event.target.value = ""
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#141312] pt-10 text-stone-100">
      <header className="border-b border-[#3a3630] bg-[#1b1a18] px-6 py-6 shadow-[0_18px_60px_rgba(0,0,0,.22)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-slate-600 bg-slate-900/70 text-slate-200">
                {state.source === "s3" ? "S3 source" : "local fallback"}
              </Badge>
              <Badge variant="outline" className="border-stone-600 bg-stone-900/70 text-stone-200">
                {state.validation.status}
              </Badge>
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-normal text-[#e6d6b8]">{state.manifest.title}</h1>
            <p className="text-sm text-stone-500">
              {wiki.pages.length} wiki pages · {Object.keys(state.encounters).length} encounters · {wiki.linkCount} page links · changes apply to canonical wiki source
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={refresh} disabled={busy} className="gap-2">
              <RefreshCcw className="size-4" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={downloadBundle} disabled={busy} className="gap-2">
              <Download className="size-4" /> Export
            </Button>
            <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-3 text-sm hover:bg-accent hover:text-accent-foreground">
              <Upload className="size-4" /> Restore
              <input type="file" accept="application/json" className="hidden" onChange={restoreBundle} disabled={busy} />
            </label>
          </div>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-196px)] grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)_400px]">
        <aside className="border-b border-[#3a3630] bg-[#181713] xl:border-r xl:border-b-0">
          <WikiNavigator wiki={wiki} selectedPath={selectedPath} onSelect={setSelectedPath} />
        </aside>

        <section className="min-w-0 border-b border-[#3a3630] bg-[#201d18] xl:border-r xl:border-b-0">
          <div className="grid min-h-full grid-rows-[auto_1fr]">
            <WikiPageHeader page={selectedPage} />
            <div>
              <div className="p-6">
                <ModulePageEditor file={selectedFile} manifest={state.manifest} encounters={state.encounters} page={selectedPage} disabled={busy} onSave={saveFile} />
              </div>
            </div>
          </div>
        </section>

        <aside className="bg-[#181713] p-5">
          <div className="flex items-center gap-2 text-[#d8c9ad]">
            <MessageSquare className="size-4" />
            <h2 className="font-mono text-xs font-bold uppercase">Chat With Wiki</h2>
          </div>
          <div className="mt-3 h-[calc(100vh-340px)] min-h-[340px] space-y-3 overflow-auto rounded-md border border-[#3a3630] bg-[#11100f] p-3">
            {messages.map((message, index) => (
              <div key={index} className={message.role === "admin" ? "text-right" : "text-left"}>
                <div className={`inline-block max-w-[92%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm ${message.role === "admin" ? "bg-slate-800 text-slate-50" : "bg-stone-800 text-stone-100"}`}>
                  {message.content}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Improve the current adventure..." rows={4} disabled={busy} />
            <Button variant="epic" size="sm" onClick={sendMessage} disabled={busy || !prompt.trim()} className="w-full gap-2">
              <Wand2 className="size-4" /> Apply Change
            </Button>
          </div>
          <ValidationSummary validation={state.validation} />
        </aside>
      </main>
    </div>
  )
}

function ModulePageEditor({
  file,
  manifest,
  encounters,
  page,
  disabled,
  onSave,
}: {
  file?: SourceFile
  manifest: RuntimeManifest
  encounters: Record<string, RuntimeEncounter>
  page?: WikiPage
  disabled: boolean
  onSave: (path: string, content: string) => void
}) {
  const fields = React.useMemo(() => parseEditableFields(file), [file])
  const [title, setTitle] = React.useState(fields.title)
  const [summary, setSummary] = React.useState(fields.summary)
  const [intro, setIntro] = React.useState(fields.intro)
  const [gmNotes, setGmNotes] = React.useState(fields.gmNotes)
  const [transitions, setTransitions] = React.useState(fields.transitions)
  const [image, setImage] = React.useState(fields.image)
  const [sectionTitle, setSectionTitle] = React.useState(fields.sectionTitle)
  const [sceneTitle, setSceneTitle] = React.useState(fields.sceneTitle)

  React.useEffect(() => {
    setTitle(fields.title)
    setSummary(fields.summary)
    setIntro(fields.intro)
    setGmNotes(fields.gmNotes)
    setTransitions(fields.transitions)
    setImage(fields.image)
    setSectionTitle(fields.sectionTitle)
    setSceneTitle(fields.sceneTitle)
  }, [fields])

  if (!file) return null
  if (file.path.endsWith(".json")) return <JsonKeyFieldEditor file={file} disabled={disabled} onSave={onSave} />

  const nextContent = updateMarkdownFields(file.content, { title, summary, intro, gmNotes, transitions, image, sectionTitle, sceneTitle })
  const isEncounter = file.path.includes("/encounters/")
  const encounter = Object.values(encounters).find((item) => item.sourcePath === file.path)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="overflow-hidden rounded-md border border-[#b9a77f] bg-[#d9caab] text-[#22180e] shadow-[0_24px_80px_rgba(0,0,0,.24)]">
        <div className="relative border-b border-[#b9a77f] bg-[#231f1a]">
          <ImageUpload
            id={`wiki-image-${file.path}`}
            value={image}
            onChange={(url) => setImage(normalizeUploadedImageUrl(url))}
            onRemove={() => setImage("")}
            folder={`images/settings/${manifest.settingId}/${manifest.planId}`}
            className="aspect-[21/9] rounded-none border-0"
          />
          <div className="absolute left-4 top-4 rounded bg-black/65 px-2 py-1 font-mono text-[10px] uppercase tracking-[.16em] text-stone-100">
            <ImageIcon className="mr-1 inline size-3" />
            Module Art
          </div>
        </div>
        <div className="p-6">
          <div className="font-mono text-[11px] font-bold uppercase tracking-[.16em] text-[#5b4631]">{isEncounter ? `Encounter ${encounter?.id ?? ""}` : `Adventure ${manifest.planId}`}</div>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={disabled} className="mt-2 border-[#b9a77f] bg-[#eee2c6] text-3xl font-bold text-[#22180e]" />
          {isEncounter && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <Field label="Section" value={sectionTitle} onChange={setSectionTitle} disabled={disabled} tone="paper" />
              <Field label="Scene" value={sceneTitle} onChange={setSceneTitle} disabled={disabled} tone="paper" />
            </div>
          )}
          <p className="mt-4 text-sm leading-6 text-[#4a3822]">{page?.summary || file.path}</p>
        </div>
      </div>

      <div className="rounded-md border border-[#b9a77f] bg-[#d9caab] p-6 text-[#22180e] shadow-[0_18px_60px_rgba(0,0,0,.18)]">
        <Block label="Summary" value={summary} onChange={setSummary} disabled={disabled} rows={5} tone="paper" />
        {isEncounter && (
          <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_320px]">
            <div className="space-y-5">
              <ModuleBlock title="Read Aloud">
                <Block label="Intro" value={intro} onChange={setIntro} disabled={disabled} rows={9} tone="paper" hideLabel />
              </ModuleBlock>
              <ModuleBlock title="GM Notes">
                <Block label="GM Notes" value={gmNotes} onChange={setGmNotes} disabled={disabled} rows={6} tone="paper" hideLabel />
              </ModuleBlock>
            </div>
            <div className="space-y-5">
              <ModuleBlock title="Exits">
                <Block label="Transitions" value={transitions} onChange={setTransitions} disabled={disabled} rows={7} tone="paper" hideLabel />
              </ModuleBlock>
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => onSave(file.path, nextContent)} disabled={disabled} className="gap-2 border-[#51473a] bg-[#25211d] text-stone-100 hover:bg-[#34302a]">
            <Save className="size-4" /> Save Module Page
          </Button>
        </div>
      </div>
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
  return (
    <div className="space-y-4">
      <h2 className="break-all font-mono text-sm font-bold text-stone-100">{file.path}</h2>
      <Field label="Name" value={name} onChange={setName} disabled={disabled} />
      <Field label="Race" value={race} onChange={setRace} disabled={disabled} />
      <Field label="Archetype" value={archetype} onChange={setArchetype} disabled={disabled} />
      <Block label="Appearance" value={appearance} onChange={setAppearance} disabled={disabled} rows={6} />
      <Button variant="outline" size="sm" onClick={() => onSave(file.path, `${JSON.stringify({ ...parsed, name, race, archetype, appearance }, null, 2)}\n`)} disabled={disabled} className="gap-2">
        <Save className="size-4" /> Save Fields
      </Button>
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

function WikiNavigator({ wiki, selectedPath, onSelect }: { wiki: WikiModel; selectedPath: string; onSelect: (path: string) => void }) {
  const [query, setQuery] = React.useState("")
  const normalizedQuery = query.trim().toLowerCase()
  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <div className="border-b border-[#31401d] p-4">
        <div className="flex items-center gap-2 text-[#d8c9ad]">
          <BookOpen className="size-4" />
          <h2 className="font-mono text-xs font-bold uppercase">Wiki Map</h2>
        </div>
        <label className="mt-3 grid grid-cols-[18px_1fr] items-center gap-2 rounded-md border border-[#3a3630] bg-[#11100f] px-3 py-2">
          <Search className="size-4 text-stone-500" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a page"
            className="min-w-0 bg-transparent text-sm text-stone-200 outline-none placeholder:text-stone-600"
          />
        </label>
      </div>
      <div className="overflow-auto p-3 xl:max-h-[calc(100vh-236px)]">
        {normalizedQuery ? (
          wiki.groups.map((group) => {
            const pages = group.pages.filter((page) => `${page.title} ${page.id} ${page.summary}`.toLowerCase().includes(normalizedQuery))
            if (pages.length === 0) return null
            return <PageGroup key={group.key} title={group.title} pages={pages} selectedPath={selectedPath} onSelect={onSelect} />
          })
        ) : (
          <>
            {wiki.groups.find((group) => group.key === "adventure") && <PageGroup title="Adventure" pages={wiki.groups.find((group) => group.key === "adventure")!.pages} selectedPath={selectedPath} onSelect={onSelect} />}
            {wiki.moduleSections.map((section) => (
              <section key={section.title} className="mb-5">
                <h3 className="mb-2 border-b border-[#3a3630] px-2 pb-1 font-serif text-base font-bold text-[#e0d1b3]">{section.title}</h3>
                {section.scenes.map((scene) => (
                  <div key={`${section.title}-${scene.title}`} className="mb-3 pl-2">
                    <h4 className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-stone-400">{scene.title}</h4>
                    <div className="space-y-1 border-l border-[#3a3630] pl-2">
                      {scene.pages.map((page) => (
                        <PageButton key={page.path} page={page} selectedPath={selectedPath} onSelect={onSelect} />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            ))}
            {wiki.groups.filter((group) => !["adventure", "encounter"].includes(group.key)).map((group) => (
              <PageGroup key={group.key} title={group.title} pages={group.pages} selectedPath={selectedPath} onSelect={onSelect} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function PageGroup({ title, pages, selectedPath, onSelect }: { title: string; pages: WikiPage[]; selectedPath: string; onSelect: (path: string) => void }) {
  return (
    <section className="mb-4">
      <h3 className="mb-2 px-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-stone-500">{title}</h3>
      <div className="space-y-1">
        {pages.map((page) => (
          <PageButton key={page.path} page={page} selectedPath={selectedPath} onSelect={onSelect} />
        ))}
      </div>
    </section>
  )
}

function PageButton({ page, selectedPath, onSelect }: { page: WikiPage; selectedPath: string; onSelect: (path: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(page.path)}
      className={`grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2 rounded-md border px-2 py-2 text-left transition-colors ${page.path === selectedPath ? "border-[#b9a77f] bg-[#2a2722]" : "border-transparent hover:border-[#3a3630] hover:bg-[#211f1b]"}`}
    >
      {page.path.endsWith(".json") ? <FileJson className="mt-0.5 size-4 text-slate-300" /> : <FileText className="mt-0.5 size-4 text-stone-300" />}
      <span className="min-w-0">
        <span className="block truncate text-sm text-stone-100">{page.title}</span>
        <span className="block truncate font-mono text-[10px] text-stone-500">{page.id}</span>
        {page.outgoingEncounterIds.length > 0 && (
          <span className="mt-1 flex items-center gap-1 truncate text-[11px] text-stone-400">
            <GitBranch className="size-3 shrink-0" />
            {page.outgoingEncounterIds.join(", ")}
          </span>
        )}
      </span>
      {page.links.length > 0 && <span className="rounded bg-stone-800 px-1.5 py-0.5 font-mono text-[10px] text-stone-300">{page.links.length}</span>}
    </button>
  )
}

function WikiPageHeader({ page }: { page?: WikiPage }) {
  if (!page) return null
  return (
    <header className="border-b border-[#3a3630] bg-[#181713] px-6 py-5">
      <div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-[#3a3630] bg-[#24211d] px-2 py-1 font-mono text-[10px] uppercase text-stone-300">{page.kind}</span>
            <span className="font-mono text-[11px] text-stone-500">{page.id}</span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold leading-tight text-[#e6d6b8]">{page.title}</h2>
          <p className="mt-1 line-clamp-2 max-w-4xl text-sm text-stone-400">{page.summary || page.path}</p>
        </div>
      </div>
    </header>
  )
}

function ValidationSummary({ validation }: { validation: ValidationReport }) {
  return (
    <div className="mt-4 rounded-md border border-[#3a3630] bg-[#11100f] p-3">
      <div className="flex items-center gap-2 text-stone-300">
        <Check className="size-4" />
        <h2 className="font-mono text-xs font-bold uppercase">Validation</h2>
      </div>
      <p className="mt-2 text-sm text-stone-300">
        {validation.summary.errorCount} errors · {validation.summary.warningCount} warnings · {validation.summary.suggestionCount} suggestions
      </p>
      <div className="mt-3 max-h-48 space-y-2 overflow-auto">
        {validation.findings.map((finding, index) => (
          <p key={`${finding.sourcePath}-${index}`} className="text-xs text-stone-400">
            <span className="text-stone-200">{finding.severity}</span> {finding.message}
          </p>
        ))}
      </div>
    </div>
  )
}

function buildWikiModel(files: SourceFile[], encounters: Record<string, RuntimeEncounter>): WikiModel {
  const pagesWithoutResolvedLinks = files.map((file) => pageFromSource(file, encounters))
  const pathById = new Map<string, string>()
  for (const page of pagesWithoutResolvedLinks) {
    pathById.set(page.id, page.path)
    pathById.set(`${page.kind}:${page.id}`, page.path)
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
  const groups = [
    { key: "adventure", title: "Adventure", pages: byKind("adventure") },
    { key: "encounter", title: "Encounters", pages: byKind("encounter") },
    { key: "npc", title: "NPC Profiles", pages: byKind("npc") },
    { key: "character", title: "Premade Characters", pages: byKind("character") },
    { key: "sheet", title: "Sheets", pages: byKind("sheet") },
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
  const id = file.path.split("/").at(-1)?.replace(/\.(md|json)$/, "") ?? file.path
  if (file.path.endsWith(".json")) {
    const parsed = safeJson(file.content)
    return {
      path: file.path,
      id: String(parsed.id ?? id),
      title: String(parsed.name ?? parsed.id ?? id),
      kind: "sheet",
      summary: [parsed.race, parsed.archetype].filter(Boolean).join(" ") || "Character sheet",
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

function titleFromId(id: string) {
  return id
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ")
}

function ModuleBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-[#b9a77f] bg-[#eee2c6] p-4">
      <h3 className="mb-3 border-b border-[#c9b891] pb-1 font-mono text-[11px] font-bold uppercase tracking-[.18em] text-[#5b4631]">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, value, onChange, disabled, tone = "dark" }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; tone?: "dark" | "paper" }) {
  const paper = tone === "paper"
  return (
    <label className="block space-y-1">
      <span className={`font-mono text-xs uppercase ${paper ? "text-[#5b4631]" : "text-stone-300"}`}>{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={paper ? "border-[#b9a77f] bg-[#eee2c6] text-[#22180e]" : undefined} />
    </label>
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
    <label className="block space-y-1">
      {!hideLabel && <span className={`font-mono text-xs uppercase ${paper ? "text-[#5b4631]" : "text-stone-300"}`}>{label}</span>}
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} disabled={disabled} className={paper ? "border-[#b9a77f] bg-[#f1e4bf] font-serif text-base leading-7 text-[#22180e]" : undefined} />
    </label>
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
  }
}

function updateMarkdownFields(content: string, fields: { title: string; image: string; summary: string; intro: string; gmNotes: string; transitions: string; sectionTitle: string; sceneTitle: string }) {
  let next = updateFrontmatterValue(content, "title", fields.title)
  next = updateFrontmatterValue(next, "image", fields.image)
  next = updateFrontmatterValue(next, "sectionTitle", fields.sectionTitle)
  next = updateFrontmatterValue(next, "sceneTitle", fields.sceneTitle)
  next = updateSection(next, "Summary", fields.summary)
  next = updateSection(next, "Intro", fields.intro)
  next = updateSection(next, "GM Notes", fields.gmNotes)
  next = updateSection(next, "Transitions", fields.transitions)
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
  return content.replace(/^---\n/, `---\n${line}\n`)
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
