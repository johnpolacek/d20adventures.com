"use client"

import { Bot, Check, CircleAlert, FileJson, FileText, GitBranch, Play, RotateCcw, UploadCloud } from "lucide-react"
import * as React from "react"
import { proposeWikiAdventureAiChangeSet, validateWikiAdventureWorkbenchFiles } from "@/app/_actions/wiki-adventures/workbench-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import type { AiAuthoringProposal, AiAuthoringToolInput } from "@/lib/wiki-adventures/ai-authoring-tools"
import type { WorkbenchFile, WorkbenchInitialState, WorkbenchSummary } from "@/lib/wiki-adventures/workbench-demo"

type ChangeSetPreview = {
  id: string
  title: string
  status: "applied"
  path: string
  risk: string
  proposal?: AiAuthoringProposal
}

export function WikiAdventureWorkbench({ initialState }: { initialState: WorkbenchInitialState }) {
  const [files, setFiles] = React.useState(initialState.files)
  const [selectedPath, setSelectedPath] = React.useState(initialState.selectedPath)
  const [editorValue, setEditorValue] = React.useState(initialState.files.find((file) => file.path === initialState.selectedPath)?.content ?? "")
  const [summary, setSummary] = React.useState<WorkbenchSummary>(initialState.summary)
  const [isValidating, setIsValidating] = React.useState(false)
  const [isProposingAiChange, setIsProposingAiChange] = React.useState(false)
  const [changeSets, setChangeSets] = React.useState<ChangeSetPreview[]>([
    {
      id: "cs-expand-vala",
      title: "Expand Captain Vala motivation",
      status: "applied",
      path: "content/settings/myr/npcs/captain-vala.md",
      risk: "Profile prose only; no mechanical sheet change.",
    },
    {
      id: "cs-transition-note",
      title: "Clarify gatehouse transition condition",
      status: "applied",
      path: "content/settings/myr/adventures/the-old-road/encounters/gatehouse-entry.md",
      risk: "Touches transition wording; graph target remains unchanged.",
    },
  ])

  const selectedFile = files.find((file) => file.path === selectedPath) ?? files[0]
  const selectedFindings = summary.validationReport.findings.filter((finding) => finding.sourcePath === selectedPath)
  function selectFile(path: string) {
    const file = files.find((entry) => entry.path === path)
    if (!file) return
    setSelectedPath(path)
    setEditorValue(file.content)
  }

  async function validate(mode: "draftPreview" | "publish") {
    setIsValidating(true)
    const nextFiles = files.map((file) => (file.path === selectedPath ? { ...file, content: editorValue } : file))
    const nextSummary = await validateWikiAdventureWorkbenchFiles(nextFiles, mode)
    setSummary(nextSummary)
    setFiles(nextFiles)
    setIsValidating(false)
  }

  async function proposeAiChange(input: AiAuthoringToolInput) {
    setIsProposingAiChange(true)
    const proposal = await proposeWikiAdventureAiChangeSet(files, input)
    const nextFiles = applyProposalToFiles(files, proposal)
    setFiles(nextFiles)
    setChangeSets((current) => [
      {
        id: proposal.changeSet.id,
        title: proposal.changeSet.intent,
        status: "applied",
        path: proposal.diff[0]?.path ?? selectedPath,
        risk: proposal.changeSet.risks[0] ?? "Preview validation ran before write.",
        proposal,
      },
      ...current,
    ])
    setSummary((current) => ({ ...current, validationReport: proposal.validationAfter }))
    setIsProposingAiChange(false)
  }

  return (
    <div className="min-h-[calc(100vh-96px)] bg-[#10130f] text-stone-100">
      <header className="border-b border-lime-900/60 bg-[#151912] px-5 py-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="border-lime-700 bg-lime-950/70 font-mono text-[10px] uppercase text-lime-200" variant="outline">
                Active draft
              </Badge>
              <Badge className="border-amber-700 bg-amber-950/60 font-mono text-[10px] uppercase text-amber-200" variant="outline">
                {summary.validationReport.status}
              </Badge>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-normal text-amber-300">Wiki Adventure Workbench</h1>
            <p className="mt-1 max-w-3xl text-sm text-stone-400">
              {summary.manifest.title} uses wiki source files, paired character JSON, draft-preview validation, graph inspection, and publish readiness from compiled artifacts.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button ariaLabel="validate draft preview" variant="outline" size="sm" disabled={isValidating} onClick={() => validate("draftPreview")} className="gap-2">
              <Play className="size-4" /> Preview
            </Button>
            <Button ariaLabel="run publish validation" variant="outline" size="sm" disabled={isValidating} onClick={() => validate("publish")} className="gap-2">
              <UploadCloud className="size-4" /> Publish Check
            </Button>
          </div>
        </div>
      </header>

      <main className="grid min-h-[calc(100vh-178px)] grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
        <aside className="border-b border-lime-900/60 bg-[#12170f] xl:border-r xl:border-b-0">
          <div className="border-b border-lime-900/50 px-4 py-3">
            <h2 className="font-mono text-xs font-bold uppercase text-lime-300">Source Tree</h2>
            <p className="mt-1 text-xs text-stone-500">{files.length} source files in the active draft</p>
          </div>
          <div className="max-h-[360px] overflow-auto p-2 xl:max-h-[calc(100vh-236px)]">
            {files.map((file) => {
              const isSelected = file.path === selectedPath
              const findingCount = summary.fileFindings[file.path] ?? 0
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => selectFile(file.path)}
                  className={cn(
                    "mb-1 grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border px-2 py-2 text-left transition-colors",
                    isSelected ? "border-amber-500/70 bg-amber-950/25" : "border-transparent hover:border-lime-900/60 hover:bg-lime-950/20"
                  )}
                >
                  {file.kind === "json" ? <FileJson className="size-4 text-sky-300" /> : <FileText className="size-4 text-lime-300" />}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-stone-100">{file.title}</span>
                    <span className="block truncate font-mono text-[10px] text-stone-500">{file.path}</span>
                  </span>
                  <span className="flex gap-1">{findingCount > 0 && <CircleAlert className="size-3 text-amber-300" />}</span>
                </button>
              )
            })}
          </div>
        </aside>

        <section className="min-w-0 border-b border-lime-900/60 bg-[#0f130d] xl:border-r xl:border-b-0">
          <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-3 border-b border-lime-900/50 px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate font-mono text-sm font-bold text-stone-100">{selectedFile?.path}</h2>
              <p className="text-xs text-stone-500">{selectedFile?.contentType}</p>
            </div>
            <div className="flex items-center gap-2">
              {selectedFindings.length > 0 && (
                <Badge className="border-amber-700 bg-amber-950/60 text-amber-200" variant="outline">
                  {selectedFindings.length} finding
                </Badge>
              )}
            </div>
          </div>
          <div className="grid gap-0 lg:grid-rows-[minmax(420px,1fr)_260px]">
            <Textarea
              value={editorValue}
              onChange={(event) => {
                const nextValue = event.target.value
                setEditorValue(nextValue)
                setFiles((current) => current.map((file) => (file.path === selectedPath ? { ...file, content: nextValue } : file)))
              }}
              spellCheck={false}
              className="min-h-[420px] resize-none rounded-none border-0 bg-[#0d100c] p-4 font-mono text-xs leading-5 text-stone-200 outline-none focus-visible:ring-0"
            />
            <Tabs defaultValue="preview" className="border-t border-lime-900/50 bg-[#141811]">
              <TabsList className="m-3 mb-1 bg-lime-950/40">
                <TabsTrigger value="preview">Encounter Preview</TabsTrigger>
                <TabsTrigger value="graph">Graph</TabsTrigger>
                <TabsTrigger value="publish">Publish</TabsTrigger>
              </TabsList>
              <TabsContent value="preview" className="px-4 pb-4">
                <PreviewPanel summary={summary} selectedPath={selectedPath} />
              </TabsContent>
              <TabsContent value="graph" className="px-4 pb-4">
                <GraphPanel summary={summary} />
              </TabsContent>
              <TabsContent value="publish" className="px-4 pb-4">
                <PublishPanel summary={summary} />
              </TabsContent>
            </Tabs>
          </div>
        </section>

        <aside className="bg-[#141711]">
          <Tabs defaultValue="validation" className="h-full">
            <TabsList className="m-3 mb-1 grid w-[calc(100%-24px)] grid-cols-3 bg-lime-950/40">
              <TabsTrigger value="validation">Validation</TabsTrigger>
              <TabsTrigger value="ai">Revisions</TabsTrigger>
              <TabsTrigger value="entity">Entity</TabsTrigger>
            </TabsList>
            <TabsContent value="validation" className="px-3 pb-4">
              <ValidationDrawer summary={summary} />
            </TabsContent>
            <TabsContent value="ai" className="px-3 pb-4">
              <AiChangeSetPanel changeSets={changeSets} selectedFile={selectedFile} disabled={isProposingAiChange} onPropose={proposeAiChange} />
            </TabsContent>
            <TabsContent value="entity" className="px-3 pb-4">
              <EntityInspector file={selectedFile} warnings={initialState.migrationWarnings} />
            </TabsContent>
          </Tabs>
        </aside>
      </main>
    </div>
  )
}

function applyProposalToFiles(files: WorkbenchFile[], proposal: AiAuthoringProposal): WorkbenchFile[] {
  let next = [...files]
  for (const change of proposal.diff) {
    if (change.op === "create" && change.after) {
      next.push({
        path: change.path,
        content: change.after,
        hash: change.afterHash ?? "",
        kind: change.path.endsWith(".json") ? "json" : "markdown",
        title: change.path.split("/").at(-1) ?? change.path,
        contentType: change.path.endsWith(".json") ? "Character Sheet JSON" : "Wiki Markdown",
      })
      continue
    }
    if (change.op === "update" && change.after) {
      next = next.map((file) => (file.path === change.path ? { ...file, content: change.after ?? file.content, hash: change.afterHash ?? file.hash } : file))
      continue
    }
    if (change.op === "delete") {
      next = next.filter((file) => file.path !== change.path)
    }
  }
  return next.sort((a, b) => a.path.localeCompare(b.path))
}

function PreviewPanel({ summary, selectedPath }: { summary: WorkbenchSummary; selectedPath: string }) {
  const encounter = summary.graphNodes.find((node) => selectedPath.includes(`/encounters/${node.id}.md`))
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Metric label="Start" value={summary.manifest.startEncounterId} />
      <Metric label="Encounters" value={String(summary.graphNodes.length)} />
      <Metric label="Validation" value={summary.validationReport.status} />
      <div className="md:col-span-3 rounded-md border border-lime-900/60 bg-black/20 p-3">
        <h3 className="font-mono text-xs font-bold uppercase text-lime-300">{encounter ? encounter.title : summary.manifest.title}</h3>
        <p className="mt-2 text-sm text-stone-400">
          {encounter
            ? `${encounter.outgoing.length} outgoing transition${encounter.outgoing.length === 1 ? "" : "s"} from this encounter.`
            : "Select an encounter markdown file to inspect compiled transition context."}
        </p>
      </div>
    </div>
  )
}

function GraphPanel({ summary }: { summary: WorkbenchSummary }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      {summary.graphNodes.map((node) => (
        <div key={node.id} className="rounded-md border border-lime-900/60 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-mono text-xs font-bold text-stone-100">{node.title}</h3>
            {node.isStart && <Badge className="border-amber-700 bg-amber-950/60 text-amber-200">Start</Badge>}
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-stone-400">
            <GitBranch className="size-4 text-lime-300" />
            {node.outgoing.length ? node.outgoing.join(", ") : "No outgoing transitions"}
          </div>
        </div>
      ))}
    </div>
  )
}

function PublishPanel({ summary }: { summary: WorkbenchSummary }) {
  return (
    <div className="grid gap-3">
      <Metric label="Latest Version" value={summary.publishPreview.latestVersionId || "Not published in this session"} />
      <Metric label="Artifacts" value={String(summary.publishPreview.artifactCount)} />
      <div className="rounded-md border border-lime-900/60 bg-black/20 p-3">
        <h3 className="font-mono text-xs font-bold uppercase text-lime-300">Pointer</h3>
        <p className="mt-2 break-all font-mono text-[11px] text-stone-400">{summary.publishPreview.latestPointerKey || "Publish check has not written a pointer."}</p>
      </div>
      <Button ariaLabel="rollback latest pointer" variant="outline" size="sm" className="w-fit gap-2" disabled>
        <RotateCcw className="size-4" /> Rollback
      </Button>
    </div>
  )
}

function ValidationDrawer({ summary }: { summary: WorkbenchSummary }) {
  if (summary.validationReport.findings.length === 0) {
    return (
      <div className="rounded-md border border-lime-900/60 bg-lime-950/20 p-4">
        <div className="flex items-center gap-2 text-lime-200">
          <Check className="size-4" />
          <h2 className="font-mono text-sm font-bold">No validation findings</h2>
        </div>
        <p className="mt-2 text-sm text-stone-400">The current compiled draft has no draft-preview findings.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {summary.validationReport.findings.map((finding, index) => (
        <div key={`${finding.sourcePath}-${finding.code}-${index}`} className="rounded-md border border-amber-900/70 bg-amber-950/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <Badge className="border-amber-700 bg-amber-950/60 text-amber-200" variant="outline">
              {finding.severity}
            </Badge>
            <span className="font-mono text-[10px] text-stone-500">{finding.code}</span>
          </div>
          <p className="mt-2 text-sm text-stone-200">{finding.message}</p>
          <p className="mt-2 break-all font-mono text-[10px] text-stone-500">{finding.sourcePath}</p>
        </div>
      ))}
    </div>
  )
}

function AiChangeSetPanel({
  changeSets,
  selectedFile,
  disabled,
  onPropose,
}: {
  changeSets: ChangeSetPreview[]
  selectedFile?: WorkbenchFile
  disabled: boolean
  onPropose: (input: AiAuthoringToolInput) => void
}) {
  const selectedPath = selectedFile?.path ?? ""
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-sky-900/70 bg-black/20 p-3">
        <h2 className="font-mono text-xs font-bold uppercase text-sky-200">AI Revisions</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            ariaLabel="propose encounter expansion"
            variant="outline"
            size="sm"
            disabled={disabled || !selectedPath.endsWith(".md")}
            onClick={() => onPropose({ tool: "expandEncounter", path: selectedPath, expansion: "Add one sensory detail and one GM-facing reminder while preserving the current transition graph." })}
          >
            Expand
          </Button>
          <Button
            ariaLabel="propose transition repair"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onPropose({ tool: "repairMissingTransition", settingId: "myr", planId: "the-old-road", targetEncounterId: "roadside-stub", title: "Roadside Stub" })}
          >
            Repair
          </Button>
          <Button
            ariaLabel="propose transition"
            variant="outline"
            size="sm"
            disabled={disabled || !selectedPath.includes("/encounters/")}
            onClick={() => onPropose({ tool: "addTransition", sourcePath: selectedPath, targetEncounterId: "market-square-arrival", condition: "the party chooses to move deeper into Myr" })}
          >
            Transition
          </Button>
          <Button
            ariaLabel="propose character pair"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() =>
              onPropose({
                tool: "createCharacterPair",
                settingId: "myr",
                planId: "the-old-road",
                characterType: "npc",
                characterId: "road-warden",
                name: "Road Warden",
                image: "https://d20adventures-content.s3.us-east-1.amazonaws.com/content/settings/myr/assets/portraits/road-warden.jpg",
                archetype: "Ranger",
                race: "Human",
                appearance: "A quiet scout in weathered green with a road-token badge.",
              })
            }
          >
            Character
          </Button>
        </div>
      </div>
      {changeSets.map((changeSet) => (
        <div key={changeSet.id} className="rounded-md border border-sky-900/70 bg-sky-950/15 p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-sky-200">
                <Bot className="size-4" />
                <h2 className="text-sm font-semibold">{changeSet.title}</h2>
              </div>
              <p className="mt-2 break-all font-mono text-[10px] text-stone-500">{changeSet.path}</p>
            </div>
            <Badge className="border-sky-700 bg-sky-950/60 text-sky-200" variant="outline">
              {changeSet.status}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-stone-400">{changeSet.risk}</p>
          {changeSet.proposal && (
            <div className="mt-3 rounded border border-sky-900/50 bg-black/20 p-2">
              <p className="font-mono text-[10px] uppercase text-sky-200">
                {changeSet.proposal.diff.length} file diff{changeSet.proposal.diff.length === 1 ? "" : "s"} · validation {changeSet.proposal.validationAfter.status}
              </p>
              <ul className="mt-2 space-y-1">
                {changeSet.proposal.diff.map((diff) => (
                  <li key={`${diff.op}-${diff.path}`} className="break-all font-mono text-[10px] text-stone-500">
                    {diff.op} {diff.path}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function EntityInspector({ file, warnings }: { file?: WorkbenchFile; warnings: WorkbenchInitialState["migrationWarnings"] }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-lime-900/60 bg-black/20 p-3">
        <h2 className="font-mono text-xs font-bold uppercase text-lime-300">Selected Source</h2>
        <p className="mt-2 break-all font-mono text-[11px] text-stone-300">{file?.path}</p>
        <p className="mt-2 text-sm text-stone-500">{file?.contentType}</p>
      </div>
      <div className="rounded-md border border-amber-900/60 bg-black/20 p-3">
        <h2 className="font-mono text-xs font-bold uppercase text-amber-300">Migration Notes</h2>
        <p className="mt-2 text-sm text-stone-400">{warnings.length} asset conversion notes from the legacy JSON migration.</p>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-lime-900/60 bg-black/20 p-3">
      <h3 className="font-mono text-[10px] font-bold uppercase text-lime-300">{label}</h3>
      <p className="mt-2 truncate text-sm text-stone-100">{value}</p>
    </div>
  )
}
