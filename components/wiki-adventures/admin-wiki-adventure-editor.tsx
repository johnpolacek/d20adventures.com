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
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { RuntimeEncounter, RuntimeManifest, SourceFile, ValidationReport } from "@/lib/wiki-adventures"
import { BookOpen, Check, ChevronRight, Download, FileJson, FileText, GitBranch, LinkIcon, MessageSquare, RefreshCcw, Save, Search, Upload, Wand2 } from "lucide-react"
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
  const backlinks = selectedPage ? wiki.pages.filter((page) => page.links.some((link) => link.path === selectedPage.path)) : []

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
    <div className="min-h-[calc(100vh-72px)] bg-[#0d0f0b] text-stone-100">
      <header className="border-b border-[#31401d] bg-[linear-gradient(135deg,#171b11,#0f130d_55%,#17140c)] px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,.28)]">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="border-lime-700 bg-lime-950/70 text-lime-200">
                {state.source === "s3" ? "S3 source" : "local fallback"}
              </Badge>
              <Badge variant="outline" className="border-amber-700 bg-amber-950/70 text-amber-200">
                {state.validation.status}
              </Badge>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-amber-300">{state.manifest.title}</h1>
            <p className="text-sm text-stone-400">
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

      <main className="grid min-h-[calc(100vh-172px)] grid-cols-1 xl:grid-cols-[380px_minmax(0,1fr)_420px]">
        <aside className="border-b border-[#31401d] bg-[#10150d] xl:border-r xl:border-b-0">
          <WikiNavigator wiki={wiki} selectedPath={selectedPath} onSelect={setSelectedPath} />
        </aside>

        <section className="min-w-0 border-b border-[#31401d] bg-[#0b0f0a] xl:border-r xl:border-b-0">
          <div className="grid min-h-full grid-rows-[auto_1fr]">
            <WikiPageHeader page={selectedPage} backlinks={backlinks} onSelect={setSelectedPath} />
            <div className="grid gap-0 2xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="p-5">
                <KeyFieldEditor file={selectedFile} manifest={state.manifest} encounters={state.encounters} disabled={busy} onSave={saveFile} />
              </div>
              <WikiLinkPanel page={selectedPage} backlinks={backlinks} onSelect={setSelectedPath} />
            </div>
          </div>
        </section>

        <aside className="bg-[#11150f] p-4">
          <div className="flex items-center gap-2 text-amber-200">
            <MessageSquare className="size-4" />
            <h2 className="font-mono text-xs font-bold uppercase">Chat With Wiki</h2>
          </div>
          <div className="mt-3 h-[calc(100vh-320px)] min-h-[340px] space-y-3 overflow-auto rounded-md border border-[#31401d] bg-[#080b07] p-3">
            {messages.map((message, index) => (
              <div key={index} className={message.role === "admin" ? "text-right" : "text-left"}>
                <div className={`inline-block max-w-[92%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm ${message.role === "admin" ? "bg-amber-900/60 text-amber-50" : "bg-lime-950/50 text-stone-100"}`}>
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

function KeyFieldEditor({
  file,
  manifest,
  encounters,
  disabled,
  onSave,
}: {
  file?: SourceFile
  manifest: RuntimeManifest
  encounters: Record<string, RuntimeEncounter>
  disabled: boolean
  onSave: (path: string, content: string) => void
}) {
  const fields = React.useMemo(() => parseEditableFields(file), [file])
  const [title, setTitle] = React.useState(fields.title)
  const [summary, setSummary] = React.useState(fields.summary)
  const [intro, setIntro] = React.useState(fields.intro)
  const [transitions, setTransitions] = React.useState(fields.transitions)
  const [image, setImage] = React.useState(fields.image)

  React.useEffect(() => {
    setTitle(fields.title)
    setSummary(fields.summary)
    setIntro(fields.intro)
    setTransitions(fields.transitions)
    setImage(fields.image)
  }, [fields])

  if (!file) return null
  if (file.path.endsWith(".json")) return <JsonKeyFieldEditor file={file} disabled={disabled} onSave={onSave} />

  const nextContent = updateMarkdownFields(file.content, { title, summary, intro, transitions, image })
  const isEncounter = file.path.includes("/encounters/")
  const encounter = Object.values(encounters).find((item) => item.sourcePath === file.path)

  return (
    <div className="space-y-4">
      <div>
        <h2 className="break-all font-mono text-sm font-bold text-stone-100">{file.path}</h2>
        <p className="mt-1 text-xs text-stone-500">{isEncounter ? `Encounter ${encounter?.id ?? ""}` : `Adventure ${manifest.planId}`}</p>
      </div>
      <Field label="Title" value={title} onChange={setTitle} disabled={disabled} />
      <Field label="Image URL" value={image} onChange={setImage} disabled={disabled} />
      <Block label="Summary" value={summary} onChange={setSummary} disabled={disabled} rows={5} />
      {isEncounter && <Block label="Intro" value={intro} onChange={setIntro} disabled={disabled} rows={8} />}
      {isEncounter && <Block label="Transitions" value={transitions} onChange={setTransitions} disabled={disabled} rows={6} />}
      <Button variant="outline" size="sm" onClick={() => onSave(file.path, nextContent)} disabled={disabled} className="gap-2">
        <Save className="size-4" /> Save Fields
      </Button>
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
  links: WikiLink[]
  outgoingEncounterIds: string[]
}

type WikiModel = {
  pages: WikiPage[]
  pagesByPath: Map<string, WikiPage>
  pathById: Map<string, string>
  groups: Array<{ key: string; title: string; pages: WikiPage[] }>
  linkCount: number
}

function WikiNavigator({ wiki, selectedPath, onSelect }: { wiki: WikiModel; selectedPath: string; onSelect: (path: string) => void }) {
  const [query, setQuery] = React.useState("")
  const normalizedQuery = query.trim().toLowerCase()
  return (
    <div className="grid h-full grid-rows-[auto_1fr]">
      <div className="border-b border-[#31401d] p-4">
        <div className="flex items-center gap-2 text-lime-300">
          <BookOpen className="size-4" />
          <h2 className="font-mono text-xs font-bold uppercase">Wiki Map</h2>
        </div>
        <label className="mt-3 grid grid-cols-[18px_1fr] items-center gap-2 rounded-md border border-[#31401d] bg-[#090d08] px-3 py-2">
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
        {wiki.groups.map((group) => {
          const pages = normalizedQuery ? group.pages.filter((page) => `${page.title} ${page.id} ${page.summary}`.toLowerCase().includes(normalizedQuery)) : group.pages
          if (pages.length === 0) return null
          return (
            <section key={group.key} className="mb-4">
              <h3 className="mb-2 px-2 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-stone-500">{group.title}</h3>
              <div className="space-y-1">
                {pages.map((page) => (
                  <button
                    key={page.path}
                    type="button"
                    onClick={() => onSelect(page.path)}
                    className={`grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-start gap-2 rounded-md border px-2 py-2 text-left transition-colors ${page.path === selectedPath ? "border-amber-500/70 bg-[#2a220d]" : "border-transparent hover:border-[#31401d] hover:bg-[#172011]"}`}
                  >
                    {page.path.endsWith(".json") ? <FileJson className="mt-0.5 size-4 text-sky-300" /> : <FileText className="mt-0.5 size-4 text-lime-300" />}
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-stone-100">{page.title}</span>
                      <span className="block truncate font-mono text-[10px] text-stone-500">{page.id}</span>
                      {page.outgoingEncounterIds.length > 0 && (
                        <span className="mt-1 flex items-center gap-1 truncate text-[11px] text-amber-200/75">
                          <GitBranch className="size-3 shrink-0" />
                          {page.outgoingEncounterIds.join(", ")}
                        </span>
                      )}
                    </span>
                    {page.links.length > 0 && <span className="rounded bg-lime-950/70 px-1.5 py-0.5 font-mono text-[10px] text-lime-200">{page.links.length}</span>}
                  </button>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function WikiPageHeader({ page, backlinks, onSelect }: { page?: WikiPage; backlinks: WikiPage[]; onSelect: (path: string) => void }) {
  if (!page) return null
  return (
    <header className="border-b border-[#31401d] bg-[#10140d] px-5 py-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded border border-[#31401d] bg-[#182111] px-2 py-1 font-mono text-[10px] uppercase text-lime-200">{page.kind}</span>
            <span className="font-mono text-[11px] text-stone-500">{page.id}</span>
          </div>
          <h2 className="mt-2 text-2xl font-semibold leading-tight text-stone-100">{page.title}</h2>
          <p className="mt-1 line-clamp-2 max-w-4xl text-sm text-stone-400">{page.summary || page.path}</p>
        </div>
        {backlinks.length > 0 && (
          <div className="min-w-[220px] rounded-md border border-[#31401d] bg-[#080b07] p-3">
            <div className="mb-2 font-mono text-[10px] font-bold uppercase text-amber-200">Referenced By</div>
            <div className="flex flex-wrap gap-1.5">
              {backlinks.slice(0, 5).map((linkingPage) => (
                <button key={linkingPage.path} type="button" onClick={() => onSelect(linkingPage.path)} className="rounded border border-amber-900/60 bg-amber-950/25 px-2 py-1 text-xs text-amber-100 hover:bg-amber-900/35">
                  {linkingPage.title}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </header>
  )
}

function WikiLinkPanel({ page, backlinks, onSelect }: { page?: WikiPage; backlinks: WikiPage[]; onSelect: (path: string) => void }) {
  if (!page) return null
  return (
    <aside className="border-t border-[#31401d] bg-[#0f130d] p-4 2xl:border-t-0 2xl:border-l">
      <div className="flex items-center gap-2 text-lime-300">
        <LinkIcon className="size-4" />
        <h3 className="font-mono text-xs font-bold uppercase">Page Links</h3>
      </div>
      <div className="mt-3 space-y-2">
        {page.links.length === 0 && <p className="text-sm text-stone-500">No typed wiki links on this page.</p>}
        {page.links.map((link, index) => (
          <button
            key={`${link.type}-${link.id}-${index}`}
            type="button"
            disabled={!link.path}
            onClick={() => link.path && onSelect(link.path)}
            className="grid w-full grid-cols-[18px_minmax(0,1fr)] gap-2 rounded-md border border-[#31401d] bg-[#080b07] p-2 text-left disabled:opacity-45 enabled:hover:border-amber-700/70 enabled:hover:bg-[#17140c]"
          >
            <ChevronRight className="mt-0.5 size-4 text-amber-300" />
            <span className="min-w-0">
              <span className="block truncate text-sm text-stone-100">{link.label}</span>
              <span className="block truncate font-mono text-[10px] text-stone-500">
                {link.type}:{link.id}
              </span>
            </span>
          </button>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-2 text-amber-200">
        <GitBranch className="size-4" />
        <h3 className="font-mono text-xs font-bold uppercase">Backlinks</h3>
      </div>
      <div className="mt-3 space-y-2">
        {backlinks.length === 0 && <p className="text-sm text-stone-500">No pages currently link here.</p>}
        {backlinks.map((linkingPage) => (
          <button key={linkingPage.path} type="button" onClick={() => onSelect(linkingPage.path)} className="w-full rounded-md border border-[#31401d] bg-[#080b07] p-2 text-left hover:border-amber-700/70 hover:bg-[#17140c]">
            <span className="block truncate text-sm text-stone-100">{linkingPage.title}</span>
            <span className="block truncate font-mono text-[10px] text-stone-500">{linkingPage.id}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}

function ValidationSummary({ validation }: { validation: ValidationReport }) {
  return (
    <div className="mt-4 rounded-md border border-lime-900/60 bg-black/20 p-3">
      <div className="flex items-center gap-2 text-lime-200">
        <Check className="size-4" />
        <h2 className="font-mono text-xs font-bold uppercase">Validation</h2>
      </div>
      <p className="mt-2 text-sm text-stone-300">
        {validation.summary.errorCount} errors · {validation.summary.warningCount} warnings · {validation.summary.suggestionCount} suggestions
      </p>
      <div className="mt-3 max-h-48 space-y-2 overflow-auto">
        {validation.findings.map((finding, index) => (
          <p key={`${finding.sourcePath}-${index}`} className="text-xs text-stone-400">
            <span className="text-amber-300">{finding.severity}</span> {finding.message}
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
  return {
    pages,
    pagesByPath: new Map(pages.map((page) => [page.path, page])),
    pathById,
    groups,
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
    links: extractWikiLinks(file.content),
    outgoingEncounterIds: encounter?.transitions.map((transition) => transition.toEncounterId) ?? [],
  }
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

function Field({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="font-mono text-xs uppercase text-lime-300">{label}</span>
      <Input value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} />
    </label>
  )
}

function Block({ label, value, onChange, disabled, rows }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean; rows: number }) {
  return (
    <label className="block space-y-1">
      <span className="font-mono text-xs uppercase text-lime-300">{label}</span>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} rows={rows} disabled={disabled} />
    </label>
  )
}

function parseEditableFields(file?: SourceFile) {
  const content = file?.content ?? ""
  return {
    title: frontmatterValue(content, "title"),
    image: frontmatterValue(content, "image"),
    summary: sectionValue(content, "Summary"),
    intro: sectionValue(content, "Intro"),
    transitions: sectionValue(content, "Transitions"),
  }
}

function updateMarkdownFields(content: string, fields: { title: string; image: string; summary: string; intro: string; transitions: string }) {
  let next = updateFrontmatterValue(content, "title", fields.title)
  next = updateFrontmatterValue(next, "image", fields.image)
  next = updateSection(next, "Summary", fields.summary)
  next = updateSection(next, "Intro", fields.intro)
  next = updateSection(next, "Transitions", fields.transitions)
  return next.endsWith("\n") ? next : `${next}\n`
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
