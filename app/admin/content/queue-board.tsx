"use client"

import { Button } from "@d20/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@d20/ui/select"
import { cn } from "@d20/ui/utils"
import { createPortal } from "react-dom"
import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react"
import { deleteQueueItem, reorderQueue, saveQueueItem, syncContentQueue } from "@/app/_actions/content-queue"
import { briefFor, missingHandles, socialBriefFor, tagHandle } from "@/lib/content-queue/brief"
import type { QueueItem, QueueSection } from "@/lib/content-queue/store"

const STATUSES = ["idea", "draft", "scheduled", "posted", "shelved"]
const PLATFORMS: { name: string; limit?: number }[] = [{ name: "X", limit: 280 }, { name: "Reddit" }]
const NOTES = ["Point", "Title ideas", "Intro", "Angle", "Hook", "Payoff", "Why it spreads", "Items", "Stories", "Pictures", "Links", "Questions for John", "Facts", "John said", "Changes", "Clips", "Update verdict"]
const REPO = "https://github.com/johnpolacek/d20adventures.com/commit/"

type Tab = "new" | "posted"

const isPosted = (item: QueueItem) => item.status === "posted"
const tabOf = (item: QueueItem): Tab => (isPosted(item) ? "posted" : "new")
// New holds everything not yet posted, shelved ideas last.
const newList = (items: QueueItem[]) => [...items.filter((i) => !isPosted(i) && i.status !== "shelved"), ...items.filter((i) => i.status === "shelved")]

// A status as a tag on the paper (app/admin/admin.css).
const statusTone: Record<string, string> = {
  idea: "",
  draft: "is-warn",
  scheduled: "is-accent",
  posted: "is-good",
  shelved: "is-faint",
}

// A field in a tight row, in the paper's tones.
const field = "up-field is-sm"

function section(item: QueueItem, name: string): string {
  return item.sections.find((s) => s.name === name)?.body ?? ""
}

export function QueueBoard({ items: initial }: { items: QueueItem[] }) {
  const [items, setItems] = useState(initial)
  const [tab, setTab] = useState<Tab>("new")
  const [selected, setSelected] = useState(newList(initial)[0]?.slug ?? initial[0]?.slug)
  const [dragging, setDragging] = useState<string | null>(null)
  const [syncNote, setSyncNote] = useState("")
  const [pending, start] = useTransition()

  useEffect(() => setItems(initial), [initial])

  const shown = useMemo(() => (tab === "new" ? newList(items) : items.filter(isPosted)), [items, tab])

  const canDrag = tab === "new"
  const current = items.find((i) => i.slug === selected && tabOf(i) === tab) ?? shown[0]

  function move(slug: string, to: number) {
    const list = newList(items)
    const from = list.findIndex((i) => i.slug === slug)
    if (from === -1 || to < 0 || to >= list.length || from === to) return
    const next = [...list]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    const ranked = next.map((i, n) => ({ ...i, rank: n + 1 }))
    setItems([...ranked, ...items.filter(isPosted)])
    start(() => reorderQueue(ranked.map((i) => i.slug)))
  }

  function drop(target: string) {
    if (dragging && dragging !== target) move(dragging, newList(items).findIndex((i) => i.slug === target))
    setDragging(null)
  }

  function nudge(slug: string, by: number) {
    move(slug, newList(items).findIndex((i) => i.slug === slug) + by)
  }

  function sync() {
    start(async () => setSyncNote(await syncContentQueue().catch((e: Error) => e.message)))
  }

  return (
    <div>
      <div className="up-chips mb-4 items-center">
        {(["new", "posted"] as Tab[]).map((t) => (
          <Button key={t} variant="plain" className="up-chip" aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t === "new" ? "New" : "Posted"} <span className="up-small ml-1 font-mono">{t === "new" ? newList(items).length : items.filter(isPosted).length}</span>
          </Button>
        ))}
        <Button variant="plain" className="up-btn is-xs ml-auto" disabled={pending} onClick={sync}>Sync</Button>
        {syncNote && <span className="up-small">{syncNote}</span>}
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
              aria-current={item.slug === current?.slug || undefined}
              className={cn(
                "up-pick flex min-w-0 cursor-pointer items-start gap-3 px-3 py-2",
                dragging === item.slug && "opacity-40",
                canDrag && "cursor-grab active:cursor-grabbing"
              )}
              onClick={() => setSelected(item.slug)}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm" style={{ color: "var(--up-strong)" }}>{item.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span className={cn("up-tag", item.tier === 1 && "is-warn")}>T{item.tier}</span>
                  <span className="up-small font-mono !text-[11px]" title="Hook, Payoff, Spread">
                    {item.scores.hook}/{item.scores.payoff}/{item.scores.spread} = {item.score}
                  </span>
                  <span className={cn("up-tag capitalize", statusTone[item.status])}>{item.status}</span>
                  {item.audience && <span className="up-small !text-[11px]">{item.audience}</span>}
                </div>
              </div>
              {canDrag && item.slug === current?.slug && (
                <span className="flex shrink-0 flex-col">
                  <button type="button" aria-label="Move Up" className="up-small px-1 text-xs leading-none" onClick={(e) => (e.stopPropagation(), nudge(item.slug, -1))}>
                    ▲
                  </button>
                  <button type="button" aria-label="Move Down" className="up-small px-1 text-xs leading-none" onClick={(e) => (e.stopPropagation(), nudge(item.slug, 1))}>
                    ▼
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>

        {current ? (
          <Editor
            key={current.slug}
            item={current}
            onSaved={(next) => setItems((list) => list.map((i) => (i.slug === next.slug ? next : i)))}
            onDeleted={() => setItems((list) => list.filter((i) => i.slug !== current.slug))}
          />
        ) : (
          <div />
        )}
      </div>
    </div>
  )
}

function Editor({ item, onSaved, onDeleted }: { item: QueueItem; onSaved: (item: QueueItem) => void; onDeleted: () => void }) {
  const [title, setTitle] = useState(item.title)
  const [longTitle, setLongTitle] = useState(item.longTitle)
  const [status, setStatus] = useState(item.status)
  const [posted, setPosted] = useState<Record<string, string>>(item.posted)
  const [bodies, setBodies] = useState<Record<string, string>>(() => Object.fromEntries(item.sections.map((s) => [s.name, s.body])))
  const [dirty, setDirty] = useState(false)
  // Delete asks once more on the button itself before the file goes.
  const [confirming, setConfirming] = useState(false)
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
        await saveQueueItem({ slug: item.slug, title, longTitle, status, sections, posted: cleanPosted, schedule: item.schedule })
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
    <div className="up-panel up-panel-body grid content-start gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="up-field !w-auto flex-1 !py-1.5 !text-lg"
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
          <SelectTrigger className={cn(field, "!w-32")}>
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
        <Button variant="plain" className="up-btn is-primary" disabled={!dirty || pending} onClick={save}>
          {pending ? "Saving" : dirty ? "Save" : "Saved"}
        </Button>
        <Button
          variant="plain"
          className={cn("up-btn", confirming ? "is-bad" : "is-ghost")}
          disabled={pending}
          onBlur={() => setConfirming(false)}
          onClick={() => {
            if (!confirming) return setConfirming(true)
            start(async () => {
              try {
                await deleteQueueItem(item.slug)
                onDeleted()
              } catch (e) {
                setError((e as Error).message)
              }
            })
          }}
        >
          {confirming ? "Really Delete" : "Delete"}
        </Button>
      </div>
      <Field label="Long Title">
        <textarea
          className={cn(field, "is-auto")}
          value={longTitle}
          onChange={(e) => {
            setLongTitle(e.target.value)
            setDirty(true)
          }}
        />
      </Field>
      {error && <p className="up-small up-bad">{error}</p>}
      {/* The next prompt to paste into Claude: the /updates post first, then its thread and Reddit post. Gone once both exist. */}
      {(!item.post || !bodies["X"]?.trim()) && (
        <Prompt key={item.post ? "thread" : "post"} label={item.post ? "Thread Prompt" : "Post Prompt"} text={item.post ? socialBriefFor(item) : briefFor({ ...item, title, longTitle })} />
      )}

      {/* The rest waits for a drafted X thread. */}
      {section(item, "X").trim() && (
        <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {item.post && (
          <>
            <dt className="up-small !text-xs">Post</dt>
            <dd>
              <a href={`/updates/${item.post}`} target="_blank" rel="noopener noreferrer" className="up-link">
                {item.post}
              </a>
            </dd>
          </>
        )}
        {item.into && (
          <>
            <dt className="up-small !text-xs">Into</dt>
            <dd>{item.into}</dd>
          </>
        )}
        <dt className="up-small !text-xs">Asset</dt>
        <dd>{item.asset || "None"}</dd>
        <dt className="up-small !text-xs">Formats</dt>
        <dd>{item.formats.join(", ")}</dd>
        <dt className="up-small !text-xs">Commits</dt>
        <dd className="flex flex-wrap gap-x-2">
          {item.commits.map((c) => (
            <a key={c} href={REPO + c} target="_blank" rel="noopener noreferrer" className="up-link font-mono">
              {c}
            </a>
          ))}
        </dd>
        <dt className="up-small !text-xs">Sessions</dt>
        <dd className="up-small font-mono !text-xs">{item.sessions.join(", ")}</dd>
      </dl>

      <div className="grid gap-4 border-t pt-4" style={{ borderColor: "var(--up-line)" }}>
        {PLATFORMS.map(({ name, limit }) => {
          return (
            <Field
              key={name}
              label={name}
              extra={
                !limit && (
                  <Button variant="plain" className="up-btn is-ghost is-xs" disabled={!bodies[name]} onClick={() => copy(name)}>
                    {copied === name ? "Copied" : "Copy"}
                  </Button>
                )
              }
            >
              {limit ? (
                <Thread value={bodies[name] ?? ""} limit={limit} onChange={(value) => edit(name, value)} />
              ) : (
                <textarea
                  className={cn(field, "is-auto min-h-40")}
                  value={bodies[name] ?? ""}
                  onChange={(e) => edit(name, e.target.value)}
                />
              )}
              <div className="mt-1.5 flex gap-1.5">
                <input
                  className={cn(field, "flex-1")}
                  placeholder="Posted URL"
                  value={posted[name.toLowerCase()] ?? ""}
                  onChange={(e) => {
                    setPosted((p) => ({ ...p, [name.toLowerCase()]: e.target.value }))
                    setDirty(true)
                  }}
                />
              </div>
            </Field>
          )
        })}
      </div>

      {/* What the miner reasoned and gathered: for drafting, not for editing. */}
      <details className="border-t pt-3" style={{ borderColor: "var(--up-line)" }}>
        <summary className="up-label cursor-pointer">Notes</summary>
        <div className="mt-3 grid gap-4">
          {NOTES.filter((name) => section(item, name)).map((name) => (
            <Field key={name} label={name}>
              <div className="whitespace-pre-wrap text-sm">{section(item, name)}</div>
            </Field>
          ))}
        </div>
      </details>
        </>
      )}
    </div>
  )
}

function Prompt({ label, text }: { label: string; text: string }) {
  // Edits here are for this copy only and are not saved.
  const [value, setValue] = useState(text)
  const [copied, setCopied] = useState(false)
  useEffect(() => setValue(text), [text])
  return (
    <Field
      label={label}
      extra={
        <Button
          variant="plain"
          className="up-btn is-ghost is-xs"
          onClick={async () => {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      }
    >
      <textarea className={cn(field, "h-48 resize-y font-mono !text-xs")} value={value} onChange={(e) => setValue(e.target.value)} />
    </Field>
  )
}

function Field({ label, extra, children }: { label: string; extra?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2 text-xs">
        <span className="up-label !mb-0">{label}</span>
        <span className="ml-auto flex items-center gap-2">{extra}</span>
      </div>
      {children}
    </div>
  )
}

// A thread, one card a post. Stored as posts split by a line of ---, each with optional [image: url] and [alt: text]
// lines, which is what the miner and the drafts write. Only a post's own words count toward the limit, links as 23.
type Post = { text: string; image: string; alt: string }

function parseThread(value: string): Post[] {
  if (!value.trim()) return [{ text: "", image: "", alt: "" }]
  return value.split(/\n---\n/).map((part) => {
    const lines = part.split("\n")
    const tag = (name: string) => lines.find((l) => l.startsWith(`[${name}: `))?.slice(name.length + 3, -1) ?? ""
    const text = lines.filter((l) => !/^\[(image|alt): /.test(l)).join("\n").trim()
    return { text, image: tag("image"), alt: tag("alt") }
  })
}

function serializeThread(posts: Post[]): string {
  return posts
    .map((p) => {
      const picture = p.image.trim() ? `[image: ${p.image.trim()}]${p.alt.trim() ? `\n[alt: ${p.alt.trim()}]` : ""}` : ""
      return [p.text.trim(), picture].filter(Boolean).join("\n\n")
    })
    .join("\n\n---\n\n")
}

// Copies a picture as PNG, the one image type the clipboard takes everywhere, ready to paste into X.
async function copyImage(url: string) {
  const res = await fetch(`/admin/content/image?url=${encodeURIComponent(url)}`)
  const bitmap = await createImageBitmap(await res.blob())
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0)
  const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No image"))), "image/png"))
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })])
}

const postLength = (text: string) => [...text.replace(/https?:\/\/\S+/g, "x".repeat(23))].length

function Thread({ value, limit, onChange }: { value: string; limit: number; onChange: (value: string) => void }) {
  // Posts are held here as typed, so a trailing line break survives. The file gets them tidied on each change.
  const [posts, setPosts] = useState(() => parseThread(value))
  const [copied, setCopied] = useState(-1)
  // The picture shown full size over the page, or null.
  const [zoom, setZoom] = useState<Post | null>(null)
  useEffect(() => {
    if (!zoom) return
    const close = (e: KeyboardEvent) => e.key === "Escape" && setZoom(null)
    window.addEventListener("keydown", close)
    return () => window.removeEventListener("keydown", close)
  }, [zoom])
  const update = (next: Post[]) => {
    setPosts(next)
    onChange(serializeThread(next))
  }
  const set = (i: number, patch: Partial<Post>) => update(posts.map((p, n) => (n === i ? { ...p, ...patch } : p)))
  const remove = (i: number) => update(posts.filter((_, n) => n !== i))
  const add = (i: number) => update([...posts.slice(0, i + 1), { text: "", image: "", alt: "" }, ...posts.slice(i + 1)])

  return (
    <div className="grid gap-3">
      {zoom &&
        // The whole picture, fitted to the screen, on the body so the site header can't sit over it. A click or Escape closes.
        createPortal(
        <div role="dialog" aria-label={zoom.alt || "Picture"} className="fixed inset-0 z-[100] flex cursor-zoom-out items-center justify-center bg-black/90 p-6" onClick={() => setZoom(null)}>
          <img src={zoom.image} alt={zoom.alt} className="max-h-full max-w-full object-contain" />
        </div>,
        document.body
        )}
      {posts.map((post, i) => {
        const length = postLength(post.text)
        return (
          <div key={i} className="up-well grid gap-2 p-3">
            <div className="flex items-center gap-2 text-xs">
              <span className="up-small font-mono !text-xs">{i + 1}</span>
              <span className={cn("up-small ml-auto font-mono !text-xs", length > limit && "up-bad")}>
                {length}/{limit}
              </span>
              <Button
                variant="plain"
                className="up-btn is-ghost is-xs"
                disabled={!post.text}
                onClick={async () => {
                  await navigator.clipboard.writeText(post.text)
                  setCopied(i)
                  setTimeout(() => setCopied(-1), 1200)
                }}
              >
                {copied === i ? "Copied" : "Copy"}
              </Button>
              {post.image && (
                <Button
                  variant="plain"
                  className="up-btn is-ghost is-xs"
                  onClick={async () => {
                    await copyImage(post.image)
                    setCopied(i + 1000)
                    setTimeout(() => setCopied(-1), 1200)
                  }}
                >
                  {copied === i + 1000 ? "Copied" : "Copy Image"}
                </Button>
              )}
              {posts.length > 1 && (
                <Button variant="plain" className="up-btn is-ghost is-xs" onClick={() => remove(i)}>
                  Remove
                </Button>
              )}
            </div>
            <textarea className={cn(field, "is-auto min-h-16")} value={post.text} onChange={(e) => set(i, { text: e.target.value })} />
            {missingHandles(post.text).length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {missingHandles(post.text).map((h) => (
                  <Button key={h.name} variant="plain" className="up-btn is-xs" title={`Checked: ${h.source}`} onClick={() => set(i, { text: tagHandle(post.text, h) })}>
                    {h.name} → {h.as}
                  </Button>
                ))}
              </div>
            )}
            {post.image && (
              <button type="button" aria-label="View Full Size" className="cursor-zoom-in self-start" onClick={() => setZoom(post)}>
                <img src={post.image} alt={post.alt} className="max-h-72 w-auto rounded border object-contain transition-opacity duration-150 hover:opacity-85" style={{ borderColor: "var(--up-line)" }} />
              </button>
            )}
            <input className={field} placeholder="Image URL" value={post.image} onChange={(e) => set(i, { image: e.target.value })} />
            {post.image && <input className={field} placeholder="Alt Text" value={post.alt} onChange={(e) => set(i, { alt: e.target.value })} />}
            <Button variant="plain" className="up-btn is-ghost is-xs justify-self-start" onClick={() => add(i)}>
              Add Post Below
            </Button>
          </div>
        )
      })}
    </div>
  )
}
