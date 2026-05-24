"use client"

import { Clock3, FileJson, FileText, GitBranch, ImageIcon, Menu, MessageSquare, PanelLeftClose, RotateCcw, Search, Wand2 } from "lucide-react"
import * as React from "react"
import { toast } from "sonner"
import {
  loadAdminWikiAdventureStateAction,
  restoreAdminWikiAdventureRevisionAction,
  saveAdminWikiAdventureFileAction,
  sendAdminWikiAdventureChatAction,
} from "@/app/_actions/wiki-adventures/admin-authoring-actions"
import { Button } from "@/components/ui/button"
import { ImageUpload } from "@/components/ui/image-upload"
import { Input } from "@/components/ui/input"
import Image from "@/components/ui/native-image"
import { Textarea } from "@/components/ui/textarea"
import { IMAGE_HOST } from "@/lib/config"
import type { RuntimeEncounter, RuntimeManifest, SourceFile } from "@/lib/wiki-adventures"

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
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    {
      role: "wiki",
      content: `Loaded ${initialState.manifest.title}. Ask for improvements and I will apply them to the wiki source.`,
    },
  ])
  const [prompt, setPrompt] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [sectionsSidebarOpen, setSectionsSidebarOpen] = React.useState(true)
  const selectedFile = state.files.find((file) => file.path === selectedPath) ?? state.files[0]
  const wiki = React.useMemo(() => buildWikiModel(state.files, state.encounters), [state.files, state.encounters])
  const selectedPage = wiki.pagesByPath.get(selectedFile?.path ?? "")
  const sectionCount = wiki.moduleSections.length
  const encounterCount = Object.keys(state.encounters).length
  const npcCount = Object.keys(state.characterSheets.npcs).length

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

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#141312] pt-10 text-stone-100">
      <header className="shrink-0 border-b border-[#3a3630] bg-[#1b1a18] px-6 py-2.5 shadow-[0_18px_60px_rgba(0,0,0,.22)]">
        <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="min-w-0 max-w-full truncate font-display text-2xl font-bold leading-none tracking-normal text-[#e6d6b8] md:text-3xl">{state.manifest.title}</h1>
          <div className="flex shrink-0 items-center gap-1.5">
            <HeaderCountBadge value={sectionCount} label="sections" />
            <HeaderCountBadge value={encounterCount} label="encounters" />
            <HeaderCountBadge value={npcCount} label="NPCs" />
          </div>
          <div className="hidden h-6 w-px shrink-0 bg-[#4a4237] sm:block" aria-hidden="true" />
          <RevisionPill revisions={state.revisions} />
        </div>
      </header>

      <main className={`grid min-h-0 flex-1 grid-cols-1 overflow-hidden ${sectionsSidebarOpen ? "xl:grid-cols-[420px_minmax(0,1fr)_400px]" : "xl:grid-cols-[minmax(0,1fr)_400px]"}`}>
        {sectionsSidebarOpen && (
          <aside className="min-h-0 overflow-hidden border-b border-[#3a3630] bg-[#181713] xl:border-r xl:border-b-0">
            <WikiNavigator wiki={wiki} selectedPath={selectedPath} onSelect={setSelectedPath} onCollapse={() => setSectionsSidebarOpen(false)} />
          </aside>
        )}

        <section className="min-h-0 min-w-0 overflow-hidden border-b border-[#3a3630] bg-[#201d18] xl:border-r xl:border-b-0">
          <div className="grid h-full min-h-0 grid-rows-[auto_1fr]">
            <WikiPageHeader page={selectedPage} sectionsSidebarOpen={sectionsSidebarOpen} onRestoreSectionsSidebar={() => setSectionsSidebarOpen(true)} />
            <div className="min-h-0 overflow-y-auto">
              <div className="p-6">
                <ModulePageEditor file={selectedFile} files={state.files} manifest={state.manifest} encounters={state.encounters} page={selectedPage} disabled={busy} onSave={saveFile} />
              </div>
            </div>
          </div>
        </section>

        <aside className="min-h-0 overflow-hidden bg-[radial-gradient(circle_at_25%_0%,rgba(132,91,44,.18),transparent_34%),linear-gradient(180deg,#1d1914_0%,#12110f_58%,#0d0c0b_100%)]">
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[#4a3e31] bg-[#15120f]/80 px-5">
              <MessageSquare className="size-3.5 text-[#f0d79c]" />
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[.16em] text-[#f0d79c]">Chat</h2>
            </div>

            <div className="shrink-0 px-5 pt-4">
              <div className="rounded-md border border-[#5a4d3f] bg-[#0f0e0c]/80 p-3 shadow-[0_18px_50px_rgba(0,0,0,.28)]">
                <Textarea
                  id="wiki-chat-prompt"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Tighten the opening scene, add a stronger clue, and flag any transition risks..."
                  rows={6}
                  disabled={busy}
                  className="min-h-36 resize-none rounded-md border-[#6c604f] bg-[#171512] px-4 py-3 font-serif text-base leading-6 text-[#f4ead7] shadow-[inset_0_1px_0_rgba(255,255,255,.04)] placeholder:text-stone-500 focus-visible:border-[#d8bd81] focus-visible:ring-[#d8bd81]/35"
                />
                <Button
                  size="sm"
                  onClick={sendMessage}
                  disabled={busy || !prompt.trim()}
                  className="mt-3 h-11 w-full gap-2 rounded-md border border-[#d8bd81]/50 bg-[#2d4051] px-4 py-0 font-mono text-[11px] font-bold uppercase tracking-[.16em] text-[#fff8e7] shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_12px_30px_rgba(0,0,0,.28)] hover:scale-[1.01] hover:bg-[#365166]"
                  style={{ textShadow: "0 2px 2px rgba(0,0,0,.75)" }}
                >
                  <Wand2 className="size-4" /> {busy ? "Applying..." : "Apply Change"}
                </Button>
              </div>
            </div>

            <div className="mx-5 mt-4 mb-5 flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-[#3f372e] bg-[#0b0a09] shadow-[inset_0_1px_0_rgba(255,255,255,.03)]">
              <div className="flex shrink-0 items-center justify-between border-b border-[#2d2923] px-3 py-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-stone-500">Revision Log</span>
                <span className="font-mono text-[10px] text-stone-600">{state.revisions.length} revisions</span>
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
                <RevisionHistory revisions={state.revisions} selectedPath={selectedPath} disabled={busy} onRestore={restoreRevision} />
                {messages.map((message, index) => (
                  <div key={index} className={message.role === "admin" ? "flex justify-end" : "flex justify-start"}>
                    <div
                      className={`max-w-[94%] whitespace-pre-wrap rounded-md px-3 py-2 text-sm leading-6 shadow-[0_10px_28px_rgba(0,0,0,.2)] ${
                        message.role === "admin" ? "border border-[#6f89a0]/45 bg-[#172433] text-sky-50" : "border border-[#4c4035] bg-[#2a2521] text-[#f4ead7]"
                      }`}
                    >
                      {message.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  )
}

function HeaderCountBadge({ value, label }: { value: number; label: string }) {
  return (
    <span className="inline-flex h-7 shrink-0 items-center gap-1 rounded border border-[#4a4237] bg-[#24211d] px-2 font-mono text-[10px] font-bold uppercase tracking-[.12em] text-stone-300">
      <span className="text-xs text-[#d8bd81]">{value}</span>
      {label}
    </span>
  )
}

function RevisionPill({ revisions }: { revisions: RevisionSummary[] }) {
  const latest = revisions[0]
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-stone-500 sm:flex-none">
      <Clock3 className="size-4 shrink-0 text-[#d8bd81]" />
      <div className="flex min-w-0 items-baseline gap-2">
        <div className="shrink-0 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#d8bd81]">{revisions.length} revisions</div>
        <div className="min-w-0 max-w-[340px] truncate text-xs">{latest ? latest.summary : "No saved revisions yet"}</div>
      </div>
    </div>
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
    return <div className="rounded-md border border-[#3f372e] bg-[#15120f] p-3 text-xs leading-5 text-stone-500">Revision history will appear here after chat or prose edits auto-save.</div>
  }
  return (
    <div className="space-y-2 border-b border-[#2d2923] pb-3">
      {revisions.slice(0, 8).map((revision) => {
        const includesSelectedPath = revision.changedPaths.includes(selectedPath)
        return (
          <div key={revision.id} className="rounded-md border border-[#3f372e] bg-[#15120f] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[#f4ead7]">{revision.summary}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[.14em] text-stone-600">
                  {revision.source} · {new Date(revision.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="rounded border border-[#4a3e31] px-1.5 py-0.5 font-mono text-[10px] uppercase text-stone-500">{revision.validation.status}</div>
            </div>
            <div className="mt-2 line-clamp-2 break-all font-mono text-[10px] text-stone-600">{revision.changedPaths.join(", ")}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => onRestore(revision.id)} disabled={disabled} className="h-7 gap-1 px-2 font-mono text-[10px] lowercase">
                <RotateCcw className="size-3" /> restore draft
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRestore(revision.id, selectedPath)}
                disabled={disabled || !includesSelectedPath}
                className="h-7 gap-1 px-2 font-mono text-[10px] lowercase"
              >
                <RotateCcw className="size-3" /> restore file
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
}: {
  file?: SourceFile
  files: SourceFile[]
  manifest: RuntimeManifest
  encounters: Record<string, RuntimeEncounter>
  page?: WikiPage
  disabled: boolean
  onSave: (path: string, content: string) => void
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
              <ReadonlyField label="Section" value={fields.sectionTitle || "Encounter graph"} />
              <ReadonlyField label="Scene" value={fields.sceneTitle || "Encounter file"} />
            </div>
          )}
          <p className="mt-4 text-sm leading-6 text-[#4a3822]">{page?.summary || file.path}</p>
        </div>
      </div>

      <div className="rounded-md border border-[#b9a77f] bg-[#d9caab] p-6 text-[#22180e] shadow-[0_18px_60px_rgba(0,0,0,.18)]">
        <Block label="Summary" value={summary} onChange={setSummary} disabled={disabled} rows={5} tone="paper" />
        {isEncounter && (
          <div className="mt-5 space-y-5">
            <ModuleBlock title="Read Aloud">
              <Block label="Intro" value={intro} onChange={setIntro} disabled={disabled} rows={9} tone="paper" hideLabel />
            </ModuleBlock>
            <ModuleBlock title="GM Notes">
              <Block label="GM Notes" value={gmNotes} onChange={setGmNotes} disabled={disabled} rows={6} tone="paper" hideLabel />
            </ModuleBlock>
            <ModuleBlock title="Encounter NPCs">
              <EncounterNpcEditor refs={fields.npcRefs} npcLookup={npcLookup} />
            </ModuleBlock>
            <ModuleBlock title="Exits">
              <Block label="Transitions" value={transitions} onChange={setTransitions} disabled={disabled} rows={7} tone="paper" hideLabel />
            </ModuleBlock>
          </div>
        )}
        <AutoSaveNote disabled={disabled} />
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
      <div className="overflow-hidden rounded-md border border-[#b9a77f] bg-[#d9caab] text-[#22180e] shadow-[0_24px_80px_rgba(0,0,0,.22)]">
        <div className="grid gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
          <div className="border-b border-[#b9a77f] bg-[#201b15] p-5 lg:border-r lg:border-b-0">
            <div className="overflow-hidden rounded-md border border-[#b9a77f] bg-[#14110e] shadow-[0_16px_48px_rgba(0,0,0,.28)]">
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

          <div className="p-6 lg:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded border border-[#9f8c64] bg-[#efe2bd] px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[.14em] text-[#5b4631]">Character</span>
            </div>

            <Input value={title} onChange={(event) => onTitleChange(event.target.value)} disabled={disabled} className="mt-3 border-[#b9a77f] bg-[#f1e4bf] text-3xl font-bold text-[#22180e]" />

            {(details.length > 0 || abilities.length > 0) && (
              <div className="mt-4 flex flex-wrap gap-2">
                {[...details, ...abilities].map((detail) => (
                  <span key={detail} className="rounded border border-[#b9a77f] bg-[#eee2c6] px-2.5 py-1 font-mono text-[11px] uppercase tracking-[.12em] text-[#5b4631]">
                    {detail}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-6">
              <Block label="Summary" value={summary} onChange={onSummaryChange} disabled={disabled} rows={8} tone="paper" />
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              {characterDetails.map((detail) => (
                <CharacterDetail key={detail.title} title={detail.title} value={detail.value} />
              ))}
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-2">
              <CharacterList title="Skills" values={sheet.skills} />
              <CharacterObjectList title="Equipment" values={sheet.equipment} />
              <CharacterObjectList title="Spells" values={sheet.spells} />
              <CharacterMixedList title="Special Abilities" values={sheet.specialAbilities} />
            </div>

            <AutoSaveNote disabled={disabled} />
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
    <div className="mt-4 rounded-md border border-[#4d4235] bg-[#15120f] p-3">
      <div className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#d8bd81]">Attributes</div>
      <div className="grid grid-cols-3 gap-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded border border-[#3b332a] bg-[#211c17] px-2 py-2 text-center">
            <div className="font-serif text-2xl font-bold leading-none text-[#f1e4bf]">{String(value)}</div>
            <div className="mt-1 truncate font-mono text-[9px] uppercase tracking-[.12em] text-stone-500">{key.slice(0, 3)}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CharacterDetail({ title, value }: { title: string; value: unknown }) {
  if (typeof value !== "string" || !value.trim()) return null
  return (
    <section className="rounded border border-[#b9a77f] bg-[#eee2c6] p-4">
      <h3 className="mb-2 font-mono text-[11px] font-bold uppercase tracking-[.18em] text-[#5b4631]">{title}</h3>
      <p className="text-base leading-7 text-[#3d2c1a]">{value}</p>
    </section>
  )
}

function CharacterList({ title, values }: { title: string; values: string[] }) {
  if (values.length === 0) return null
  return (
    <section className="rounded border border-[#b9a77f] bg-[#eee2c6] p-4">
      <h3 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[.18em] text-[#5b4631]">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {values.map((value) => (
          <span key={value} className="rounded border border-[#b9a77f] bg-[#f6eac9] px-2.5 py-1 text-sm text-[#3d2c1a]">
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
    <section className="rounded border border-[#b9a77f] bg-[#eee2c6] p-4">
      <h3 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[.18em] text-[#5b4631]">{title}</h3>
      <div className="space-y-3">
        {values.map((value, index) => (
          <div key={`${String(value.name ?? title)}-${index}`} className="border-b border-[#c9b891] pb-2 last:border-b-0 last:pb-0">
            <div className="font-serif text-lg font-bold leading-tight text-[#24180d]">{String(value.name ?? "Untitled")}</div>
            {typeof value.description === "string" && value.description.trim() && <p className="mt-1 text-sm leading-6 text-[#4a3822]">{value.description}</p>}
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
      {refs.length === 0 && <p className="text-sm text-[#5b4631]">No NPCs assigned to this encounter. Ask the authoring chat to add or connect an NPC.</p>}
      {refs.map((ref, index) => {
        const npc = npcLookup.get(ref.id)
        const image = npcImageUrl(npc?.image ?? "")
        const details = [npc?.gender, npc?.race, npc?.archetype].filter(Boolean).join(" ")
        return (
          <div key={index} className="rounded-md border border-[#b29d70] bg-[#f1e4bf] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.42)]">
            <div className="grid gap-5 sm:grid-cols-[176px_minmax(0,1fr)]">
              <div className="size-[176px] overflow-hidden rounded border border-[#9d8759] bg-[#d9caab] shadow-sm">
                {image ? (
                  <Image src={image} alt={npc?.name ?? "NPC"} width={176} height={176} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-[#d3c19b] font-mono text-3xl font-bold uppercase text-[#6a5635]">{initials(npc?.name ?? "NPC")}</div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate font-serif text-2xl font-bold leading-tight text-[#24180d]">{npc?.name ?? titleFromId(ref.id || "Unknown NPC")}</h4>
                    <p className="mt-1 font-mono text-[11px] uppercase tracking-[.14em] text-[#6c5738]">{details || "NPC reference"}</p>
                  </div>
                </div>
                {npc?.summary ? (
                  <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#4a3822]">{npc.summary}</p>
                ) : (
                  <p className="mt-3 text-sm italic text-[#6f5b3c]">No NPC sheet details found for this reference.</p>
                )}
              </div>
            </div>
            <div className="mt-4 rounded border border-[#c9b891] bg-[#eadbb9] p-3">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#6c5738]">Encounter Role</div>
              <p className="mt-2 text-sm leading-6 text-[#4a3822]">{ref.behavior || "No behavior note yet. Ask the authoring chat to revise this NPC's role in the encounter."}</p>
              {ref.initialInitiative && <p className="mt-2 font-mono text-[10px] uppercase tracking-[.14em] text-[#7b6948]">Initial initiative: {ref.initialInitiative}</p>}
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
      <h2 className="break-all font-mono text-sm font-bold text-stone-100">{file.path}</h2>
      <Field label="Name" value={name} onChange={setName} disabled={disabled} />
      <Field label="Race" value={race} onChange={setRace} disabled={disabled} />
      <Field label="Archetype" value={archetype} onChange={setArchetype} disabled={disabled} />
      <Block label="Appearance" value={appearance} onChange={setAppearance} disabled={disabled} rows={6} />
      <AutoSaveNote disabled={disabled} />
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

function WikiNavigator({ wiki, selectedPath, onSelect, onCollapse }: { wiki: WikiModel; selectedPath: string; onSelect: (path: string) => void; onCollapse: () => void }) {
  const [query, setQuery] = React.useState("")
  const normalizedQuery = query.trim().toLowerCase()
  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] bg-[radial-gradient(circle_at_0_0,rgba(216,189,129,.08),transparent_28%),#151410]">
      <div className="grid h-12 grid-cols-[48px_minmax(0,1fr)_56px] border-b border-[#322d26] bg-[#0e0d0b]/85">
        <div className="grid place-items-center text-[#8f877b]">
          <Search className="size-4" />
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find Encounter"
          className="min-w-0 border-x border-[#322d26] bg-transparent px-4 text-sm text-stone-200 outline-none placeholder:text-stone-600 focus:bg-[#15120f]"
        />
        <button
          type="button"
          onClick={onCollapse}
          className="hidden place-items-center bg-transparent px-2 py-0.5 text-[#d8bd81] transition-colors hover:bg-[#211b13] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d8bd81]/45 xl:grid"
          aria-label="Hide adventure sections sidebar"
          title="Hide sections"
        >
          <PanelLeftClose className="size-full" strokeWidth={0.75} />
        </button>
      </div>
      <div className="min-h-0 overflow-y-auto px-4 py-5">
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
            {wiki.groups
              .filter((group) => !["adventure", "encounter"].includes(group.key))
              .map((group) => (
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
    <section className="mb-5">
      <h3 className="mb-2 px-1 font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#bfa46f]">{title}</h3>
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
      className={`grid w-full grid-cols-[22px_minmax(0,1fr)_auto] items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors ${page.path === selectedPath ? "border-[#b9a77f] bg-[#2a2722] shadow-[0_10px_28px_rgba(0,0,0,.18)]" : "border-transparent hover:border-[#4a4237] hover:bg-[#211f1b]"}`}
    >
      {page.path.endsWith(".json") ? <FileJson className="mt-0.5 size-4 text-[#bdb6aa]" /> : <FileText className="mt-0.5 size-4 text-[#d7c8ab]" />}
      <span className="min-w-0">
        <span className="block truncate text-sm text-stone-100">{page.title}</span>
        <span className="block truncate font-mono text-[10px] text-stone-500">{page.kind === "npc" || page.kind === "character" || page.kind === "sheet" ? "character" : page.id}</span>
        {page.outgoingEncounterIds.length > 0 && (
          <span className="mt-1 flex items-center gap-1 truncate text-[11px] text-stone-400">
            <GitBranch className="size-3 shrink-0" />
            {page.outgoingEncounterIds.join(", ")}
          </span>
        )}
      </span>
    </button>
  )
}

function WikiPageHeader({ page, sectionsSidebarOpen, onRestoreSectionsSidebar }: { page?: WikiPage; sectionsSidebarOpen: boolean; onRestoreSectionsSidebar: () => void }) {
  if (!page) return null
  return (
    <header className="border-b border-[#3a3630] bg-[#181713] px-6 py-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {!sectionsSidebarOpen && (
              <button
                type="button"
                onClick={onRestoreSectionsSidebar}
                className="hidden size-7 place-items-center rounded-md border border-[#4a4237] bg-[#11100f] p-px text-[#d8bd81] shadow-[0_8px_20px_rgba(0,0,0,.2)] transition-colors hover:border-[#b9a77f] hover:bg-[#211f1b] xl:grid"
                aria-label="Show adventure sections sidebar"
                title="Show sections"
              >
                <Menu className="size-4" strokeWidth={1.35} />
              </button>
            )}
            <span className="rounded border border-[#3a3630] bg-[#24211d] px-2 py-1 font-mono text-[10px] uppercase text-stone-300">{pageKindLabel(page)}</span>
            {page.kind !== "npc" && page.kind !== "character" && page.kind !== "sheet" && <span className="font-mono text-[11px] text-stone-500">{page.id}</span>}
          </div>
          <h2 className="mt-2 text-2xl font-semibold leading-tight text-[#e6d6b8]">{page.title}</h2>
          <p className="mt-1 line-clamp-2 max-w-4xl text-sm text-stone-400">{page.summary || page.path}</p>
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
    <section className="rounded border border-[#b9a77f] bg-[#eee2c6] p-4">
      <h3 className="mb-3 border-b border-[#c9b891] pb-1 font-mono text-[11px] font-bold uppercase tracking-[.18em] text-[#5b4631]">{title}</h3>
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

function AutoSaveNote({ disabled }: { disabled: boolean }) {
  return (
    <div className="mt-5 flex justify-end">
      <span className="rounded border border-[#b9a77f] bg-[#efe2bd] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#6c5738]">
        {disabled ? "Saving revision..." : "Auto-saves as a revision"}
      </span>
    </div>
  )
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[#b9a77f] bg-[#eadbb9] px-3 py-2">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-[#6c5738]">{label}</div>
      <div className="mt-1 truncate font-serif text-base font-bold text-[#24180d]">{value}</div>
    </div>
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
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        disabled={disabled}
        className={paper ? "border-[#b9a77f] bg-[#f1e4bf] font-serif text-base leading-7 text-[#22180e]" : undefined}
      />
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
