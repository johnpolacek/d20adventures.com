"use client"

import { Button, Option } from "@d20/ui/button"
import { fieldClass } from "@d20/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@d20/ui/select"
import { cn } from "@d20/ui/utils"
import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react"
import { reorderQueue, saveQueueItem, syncContentQueue } from "@/app/_actions/content-queue"
import { briefFor } from "@/lib/content-queue/brief"
import type { QueueItem, QueueSection } from "@/lib/content-queue/store"

const STATUSES = ["idea", "draft", "scheduled", "posted", "shelved"]
const PLATFORMS: { name: string; limit?: number }[] = [{ name: "X/Bluesky", limit: 280 }, { name: "Reddit" }]
const NOTES = ["Point", "Hook", "Payoff", "Why it spreads", "Stories", "Facts", "John said", "Changes", "Clips"]
const REPO = "https://github.com/johnpolacek/d20adventures.com/commit/"

type Filter = "live" | "parked" | "all"
type Sort = "rank" | "score"

const parked = (item: QueueItem) => item.status === "shelved"

const statusTone: Record<string, string> = {
  idea: "bg-white/10 text-white/70",
  draft: "bg-sky-900/60 text-sky-200",
  scheduled: "bg-violet-900/60 text-violet-200",
  posted: "bg-emerald-700/60 text-white",
  shelved: "bg-white/5 text-white/40",
}

function section(item: QueueItem, name: string): string {
  return item.sections.find((s) => s.name === name)?.body ?? ""
}

export function QueueBoard({ items: initial }: { items: QueueItem[] }) {
  const [items, setItems] = useState(initial)
  const [filter, setFilter] = useState<Filter>("live")
  const [sort, setSort] = useState<Sort>("rank")
  const [selected, setSelected] = useState(initial.find((i) => !parked(i))?.slug ?? initial[0]?.slug)
  const [dragging, setDragging] = useState<string | null>(null)
  const [syncNote, setSyncNote] = useState("")
  const [pending, start] = useTransition()

  useEffect(() => setItems(initial), [initial])

  const shown = useMemo(() => {
    const list = items.filter((i) => (filter === "all" ? true : filter === "parked" ? parked(i) : !parked(i)))
    return sort === "score" ? [...list].sort((a, b) => b.score - a.score || a.rank - b.rank) : list
  }, [items, filter, sort])

  const canDrag = filter === "live" && sort === "rank"
  const current = items.find((i) => i.slug === selected)

  function move(slug: string, to: number) {
    const live = items.filter((i) => !parked(i))
    const from = live.findIndex((i) => i.slug === slug)
    if (from === -1 || to < 0 || to >= live.length || from === to) return
    const next = [...live]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const ranked = next.map((i, n) => ({ ...i, rank: n + 1 }))
    setItems([...ranked, ...items.filter(parked)])
    start(() => reorderQueue(ranked.map((i) => i.slug)))
  }

  function drop(target: string) {
    if (dragging && dragging !== target) move(dragging, items.filter((i) => !parked(i)).findIndex((i) => i.slug === target))
    setDragging(null)
  }

  function nudge(slug: string, by: number) {
    move(slug, items.filter((i) => !parked(i)).findIndex((i) => i.slug === slug) + by)
  }

  function sync() {
    start(async () => setSyncNote(await syncContentQueue().catch((e: Error) => e.message)))
  }

  return (
    <div className="font-sans">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-auto font-display text-2xl text-white">Content Queue</h1>
        {(["live", "parked", "all"] as Filter[]).map((f) => (
          <Option key={f} size="xs" active={filter === f} onClick={() => setFilter(f)}>
            {f === "live" ? "Live" : f === "parked" ? "Shelved" : "All"}
          </Option>
        ))}
        <span className="mx-1 h-5 w-px bg-white/15" />
        <Option size="xs" active={sort === "rank"} onClick={() => setSort("rank")}>Rank</Option>
        <Option size="xs" active={sort === "score"} onClick={() => setSort("score")}>Score</Option>
        <span className="mx-1 h-5 w-px bg-white/15" />
        <Button variant="outline" size="xs" disabled={pending} onClick={sync}>Sync</Button>
        {syncNote && <span className="text-xs text-white/50">{syncNote}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <ol className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-1.5">
          {shown.map((item) => (
            <li
              key={item.slug}
              draggable={canDrag}
              onDragStart={() => setDragging(item.slug)}
              onDragOver={(e) => canDrag && e.preventDefault()}
              onDrop={() => drop(item.slug)}
              onDragEnd={() => setDragging(null)}
              className={cn(
                "flex min-w-0 cursor-pointer items-start gap-3 rounded-md border px-3 py-2 transition-[background-color,border-color,opacity] duration-150",
                item.slug === selected ? "border-primary-400/70 bg-primary-950/40" : "border-white/10 bg-white/5 hover:border-white/25",
                dragging === item.slug && "opacity-40",
                canDrag && "cursor-grab active:cursor-grabbing"
              )}
              onClick={() => setSelected(item.slug)}
            >
              <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-xs text-white/40">{item.rank < 90 ? item.rank : "·"}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-white">{item.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className={cn("rounded px-1.5 py-px", item.tier === 1 ? "bg-accent-500/25 text-accent-200" : "bg-white/10 text-white/60")}>T{item.tier}</span>
                  <span className="font-mono text-white/50" title="Hook, Payoff, Spread">
                    {item.scores.hook}/{item.scores.payoff}/{item.scores.spread} = {item.score}
                  </span>
                  <span className={cn("rounded px-1.5 py-px capitalize", statusTone[item.status])}>{item.status}</span>
                  {item.audience && <span className="text-white/40">{item.audience}</span>}
                </div>
              </div>
              {canDrag && item.slug === selected && (
                <span className="flex shrink-0 flex-col">
                  <button type="button" aria-label="Move Up" className="px-1 text-xs leading-none text-white/50 hover:text-white" onClick={(e) => (e.stopPropagation(), nudge(item.slug, -1))}>
                    ▲
                  </button>
                  <button type="button" aria-label="Move Down" className="px-1 text-xs leading-none text-white/50 hover:text-white" onClick={(e) => (e.stopPropagation(), nudge(item.slug, 1))}>
                    ▼
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>

        {current ? (
          <Editor key={current.slug} item={current} onSaved={(next) => setItems((list) => list.map((i) => (i.slug === next.slug ? next : i)))} />
        ) : (
          <div />
        )}
      </div>
    </div>
  )
}

function Editor({ item, onSaved }: { item: QueueItem; onSaved: (item: QueueItem) => void }) {
  const [title, setTitle] = useState(item.title)
  const [longTitle, setLongTitle] = useState(item.longTitle)
  const [status, setStatus] = useState(item.status)
  const [posted, setPosted] = useState<Record<string, string>>(item.posted)
  const [bodies, setBodies] = useState<Record<string, string>>(() => Object.fromEntries(item.sections.map((s) => [s.name, s.body])))
  const [dirty, setDirty] = useState(false)
  const [copied, setCopied] = useState("")
  const [error, setError] = useState("")
  const [pending, start] = useTransition()

  const edit = (name: string, value: string) => {
    setBodies((b) => ({ ...b, [name]: value }))
    setDirty(true)
  }

  function save() {
    // Known sections keep their order; platform drafts join once they have text; anything else stays.
    const known = NOTES
    const names = [
      ...item.sections.map((s) => s.name).filter((n) => !PLATFORMS.some((p) => p.name === n)),
      ...known.filter((n) => !item.sections.some((s) => s.name === n) && bodies[n]?.trim()),
      ...PLATFORMS.map((p) => p.name).filter((n) => bodies[n]?.trim()),
    ]
    const sections: QueueSection[] = names.map((name) => ({ name, body: bodies[name] ?? "" }))
    const cleanPosted = Object.fromEntries(Object.entries(posted).filter(([, url]) => url.trim()))
    start(async () => {
      try {
        await saveQueueItem({ slug: item.slug, title, longTitle, status, sections, posted: cleanPosted })
        onSaved({ ...item, title, longTitle, status, sections, posted: cleanPosted })
        setDirty(false)
        setError("")
      } catch (e) {
        setError((e as Error).message)
      }
    })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  })

  async function copy(name: string) {
    await navigator.clipboard.writeText(bodies[name] ?? "")
    setCopied(name)
    setTimeout(() => setCopied(""), 1200)
  }

  return (
    <div className="grid content-start gap-4 rounded-lg border border-white/15 bg-white/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={cn(fieldClass, "h-9 flex-1 text-lg")}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            setDirty(true)
          }}
        />
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value as QueueItem["status"])
            setDirty(true)
          }}
        >
          <SelectTrigger className="w-32 text-sm">
            <SelectValue>{status[0].toUpperCase() + status.slice(1)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s[0].toUpperCase() + s.slice(1)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(briefFor({ ...item, title, longTitle }))
            setCopied("brief")
            setTimeout(() => setCopied(""), 1200)
          }}
        >
          {copied === "brief" ? "Copied" : "Copy Brief"}
        </Button>
        <Button size="sm" disabled={!dirty || pending} onClick={save}>
          {pending ? "Saving" : dirty ? "Save" : "Saved"}
        </Button>
      </div>
      <Field label="Long Title">
        <textarea
          className={cn(fieldClass, "field-sizing-content min-h-9 py-1.5 text-sm")}
          value={longTitle}
          onChange={(e) => {
            setLongTitle(e.target.value)
            setDirty(true)
          }}
        />
      </Field>
      {error && <p className="text-sm text-red-300">{error}</p>}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {item.post && (
          <>
            <dt className="text-white/40">Post</dt>
            <dd>
              <a href={`/updates/${item.post}`} target="_blank" rel="noopener noreferrer" className="text-action-300 hover:text-action-200">
                {item.post}
              </a>
            </dd>
          </>
        )}
        {item.into && (
          <>
            <dt className="text-white/40">Into</dt>
            <dd className="text-white/80">{item.into}</dd>
          </>
        )}
        <dt className="text-white/40">Asset</dt>
        <dd className="text-white/80">{item.asset || "None"}</dd>
        <dt className="text-white/40">Formats</dt>
        <dd className="text-white/80">{item.formats.join(", ")}</dd>
        <dt className="text-white/40">Commits</dt>
        <dd className="flex flex-wrap gap-x-2">
          {item.commits.map((c) => (
            <a key={c} href={REPO + c} target="_blank" rel="noopener noreferrer" className="font-mono text-action-300 hover:text-action-200">
              {c}
            </a>
          ))}
        </dd>
        <dt className="text-white/40">Sessions</dt>
        <dd className="font-mono text-white/60">{item.sessions.join(", ")}</dd>
      </dl>

      <div className="grid gap-4 border-t border-white/10 pt-4">
        {PLATFORMS.map(({ name, limit }) => {
          // A thread's posts are split by a line of ---, and only each post's own words count: [image] and [alt] lines don't.
          const posts = (bodies[name] ?? "").split(/\n---\n/).map((p) => p.split("\n").filter((l) => !l.startsWith("[")).join("\n").trim())
          const length = Math.max(0, ...posts.map((p) => [...p.replace(/https?:\/\/\S+/g, "x".repeat(23))].length))
          return (
            <Field
              key={name}
              label={name}
              extra={
                <>
                  {limit && <span className={cn("font-mono", length > limit ? "text-red-300" : "text-white/40")}>{posts.length > 1 ? `${posts.length} posts, longest ` : ""}{length}/{limit}</span>}
                  <Button variant="ghost" size="xs" disabled={!bodies[name]} onClick={() => copy(name)}>
                    {copied === name ? "Copied" : "Copy"}
                  </Button>
                </>
              }
            >
              <textarea
                className={cn(fieldClass, "field-sizing-content py-2 text-sm", name === "Reddit" ? "min-h-40" : "min-h-20")}
                value={bodies[name] ?? ""}
                onChange={(e) => edit(name, e.target.value)}
              />
              <input
                className={cn(fieldClass, "mt-1.5 h-8 text-xs")}
                placeholder="Posted URL"
                value={posted[name.toLowerCase()] ?? ""}
                onChange={(e) => {
                  setPosted((p) => ({ ...p, [name.toLowerCase()]: e.target.value }))
                  setDirty(true)
                }}
              />
            </Field>
          )
        })}
      </div>

      {/* What the miner reasoned and gathered: for drafting, not for editing. */}
      <details className="border-t border-white/10 pt-3">
        <summary className="cursor-pointer text-xs font-medium text-white/50 hover:text-white/80">Notes</summary>
        <div className="mt-3 grid gap-4">
          {NOTES.filter((name) => section(item, name)).map((name) => (
            <Field key={name} label={name}>
              <div className="whitespace-pre-wrap text-sm text-white/70">{section(item, name)}</div>
            </Field>
          ))}
        </div>
      </details>
    </div>
  )
}

function Field({ label, extra, children }: { label: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="font-medium text-white/60">{label}</span>
        <span className="ml-auto flex items-center gap-2">{extra}</span>
      </div>
      {children}
    </div>
  )
}
