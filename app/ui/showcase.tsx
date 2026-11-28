"use client"

import type { CSSProperties, ReactNode } from "react"
import { useEffect, useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@d20/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@d20/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@d20/ui/avatar"
import { Badge } from "@d20/ui/badge"
import { Button, buttonClassName, type ButtonSize, type ButtonVariant, Option } from "@d20/ui/button"
import { Pill } from "@d20/ui/stage/hud"
import { Gamepad2Icon, HomeIcon, SparklesIcon, UsersIcon, XIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, cardVariants } from "@d20/ui/card"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@d20/ui/collapsible"
import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from "@d20/ui/accordion"
import { Progress, ProgressIndicator, ProgressTrack } from "@d20/ui/progress"
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle, DrawerTrigger } from "@d20/ui/drawer"
import { FileInput, FileInputItem, FileInputList, FileInputTrigger, formatFileSize } from "@d20/ui/file-input"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@d20/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@d20/ui/hover-card"
import ImageHeader from "@d20/ui/image-header"
import { Input } from "@d20/ui/input"
import { Label } from "@d20/ui/label"
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@d20/ui/menu"
import { Tip } from "@d20/ui/tooltip"
import { toast } from "@d20/ui/toast"
import LoadingAnimation from "@d20/ui/loading-animation"
import { Pagination, PaginationEllipsis, PaginationFirst, PaginationItem, PaginationLast, PaginationLink, PaginationList, PaginationNext, PaginationPrevious } from "@d20/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@d20/ui/select"
import { Chip, Rule, SectionPlate, siteLabel } from "@d20/ui/site"
import { Switch } from "@d20/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@d20/ui/table"
import { Textarea } from "@d20/ui/textarea"
import { Heading } from "@d20/ui/typography/heading"
import { Ornament } from "@d20/ui/typography/ornament"
import { dropCap, textShadow, textShadowSpread } from "@d20/ui/typography/styles"
import { cn } from "@/lib/utils"
import { LedgerShell } from "@/components/layout/ledger-page"

// The type the site sets: four families, the heading scale and the shadows that lift text off art.
const families = [
  { name: "Display", note: "Cinzel Decorative · titles, buttons", className: "font-display text-2xl" },
  { name: "Serif", note: "Literata · body and narration", className: "font-serif text-lg" },
  { name: "Sans", note: "Rethink Sans · forms and tables", className: "font-sans text-lg" },
  { name: "Mono", note: "Syne Mono · labels and tags", className: "font-mono text-lg" },
]

// The steps of the type scale, written out so Tailwind keeps the classes.
const typeScale = [
  { name: "4xs", px: "10px", className: "text-4xs" },
  { name: "3xs", px: "11px", className: "text-3xs" },
  { name: "2xs", px: "12px", className: "text-2xs" },
  { name: "xs", px: "13px", className: "text-xs" },
  { name: "sm", px: "15px", className: "text-sm" },
  { name: "base", px: "18px", className: "text-base" },
  { name: "lg", px: "20px", className: "text-lg" },
  { name: "xl", px: "24px", className: "text-xl" },
  { name: "2xl", px: "28px", className: "text-2xl" },
  { name: "3xl", px: "34px", className: "text-3xl" },
  { name: "4xl", px: "40px", className: "text-4xl" },
]

const tracking = [
  { name: "tight", className: "font-display text-2xl tracking-tight", sample: "The Sealed Door" },
  { name: "normal", className: "text-base tracking-normal", sample: "The Sealed Door" },
  { name: "wide", className: "font-display text-sm tracking-wide", sample: "Continue" },
  { name: "label", className: "font-mono text-2xs uppercase tracking-label text-accent", sample: "Level Up" },
]

const headingUse = { h1: "h1 · page", h2: "h2 · section", h3: "h3 · part", h4: "h4 · panel", h5: "h5 · small", h6: "h6 · label" }

function TypographyDemo() {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-5">
        {families.map((f) => (
          <div key={f.name} className="flex flex-col gap-1 border-b border-white/10 pb-4">
            <span className={siteLabel}>
              {f.name} <span className="normal-case tracking-normal text-white/50">{f.note}</span>
            </span>
            <span className={f.className}>The Gates of Kordavos Open at Dawn</span>
          </div>
        ))}
        <div className="flex flex-col gap-2">
          <span className={siteLabel}>
            Scale <span className="normal-case tracking-normal text-white/50">one for site, app and stage · 10px floor</span>
          </span>
          {typeScale.map((t) => (
            <div key={t.name} className="flex items-baseline gap-4">
              <span className="w-24 shrink-0 font-mono text-2xs text-white/50">
                {t.name} · {t.px}
              </span>
              <span className={cn("truncate font-sans", t.className)}>Kordavos at Dawn</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className={siteLabel}>Letter Spacing</span>
          {tracking.map((t) => (
            <div key={t.name} className="flex items-baseline gap-4">
              <span className="w-24 shrink-0 font-mono text-2xs text-white/50">{t.name}</span>
              <span className={t.className}>{t.sample}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <span className={siteLabel}>Heading</span>
        {(["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((v) => (
          <div key={v} className="flex items-baseline gap-4">
            <span className="w-24 shrink-0 font-mono text-2xs text-white/50">{headingUse[v]}</span>
            <Heading variant={v} as="h3">
              Kordavos
            </Heading>
          </div>
        ))}
        <span className={cn(siteLabel, "mt-4")}>Shadows over art</span>
        <div className="flex flex-col items-center gap-2 rounded-lg bg-[url(/images/app/backgrounds/d20-hero.webp)] bg-cover bg-center p-6">
          <span className="font-display text-3xl font-bold text-accent-300" style={textShadow}>
            textShadow
          </span>
          <span className="font-display text-3xl font-bold text-white" style={textShadowSpread}>
            textShadowSpread
          </span>
        </div>
      </div>
    </div>
  )
}

// A scene as the game sets it: title, ornament, a drop cap on the opening line, and a closing beat.
function NarrationDemo() {
  return (
    <article className="mx-auto flex max-w-2xl flex-col gap-4 font-serif text-lg leading-relaxed text-white/90">
      <div className="text-center">
        <div className="font-mono text-xs uppercase tracking-label text-accent-400/80">Scene One</div>
        <Heading variant="h2" as="h3" style={textShadow}>
          The Gate
        </Heading>
      </div>
      <Ornament />
      <p className={dropCap}>
        Rain hammers the slate roofs of Kordavos as the gate guard squints at your papers. “Three silver for the toll,” says Sergeant Brannoc, “and
        another for the trouble.” Behind him, a cart of <em>Valkaran</em> spice waits in the mud.
      </p>
      <p>
        <strong>Roll a DC 14 Wisdom (Insight) check.</strong> On a success, you notice the seal on his orders was broken and pressed again.
      </p>
      <Ornament />
      <p className="text-center italic text-white/70">The bell in the watchtower rings once.</p>
    </article>
  )
}

// The colours in use, most used first in each row. Class names are written out so Tailwind keeps them.
const palettes: { name: string; note: string; swatches: { label: string; className: string }[] }[] = [
  {
    name: "Primary",
    note: "frames, rings, selection, labels",
    swatches: [
      { label: "50", className: "bg-primary-50" },
      { label: "100", className: "bg-primary-100" },
      { label: "200", className: "bg-primary-200" },
      { label: "300", className: "bg-primary-300" },
      { label: "400", className: "bg-primary-400" },
      { label: "500", className: "bg-primary-500" },
      { label: "600", className: "bg-primary-600" },
      { label: "700", className: "bg-primary-700" },
      { label: "800", className: "bg-primary-800" },
      { label: "900", className: "bg-primary-900" },
    ],
  },
  {
    name: "Amber",
    note: "titles, featured, premade tags",
    swatches: [
      { label: "100", className: "bg-accent-100" },
      { label: "200", className: "bg-accent-200" },
      { label: "300", className: "bg-accent-300" },
      { label: "400", className: "bg-accent-400" },
      { label: "500", className: "bg-accent-500" },
      { label: "700", className: "bg-accent-700" },
    ],
  },
  {
    name: "Status",
    note: "errors, success, the outline button",
    swatches: [
      { label: "red-300", className: "bg-red-300" },
      { label: "red-600", className: "bg-red-600" },
      { label: "red-900", className: "bg-red-900" },
      { label: "green-400", className: "bg-green-400" },
      { label: "emerald-600", className: "bg-emerald-600" },
      { label: "blue-950", className: "bg-action-950" },
    ],
  },
  {
    name: "Neutrals",
    note: "black ground, white text at strengths",
    swatches: [
      { label: "black", className: "bg-black" },
      { label: "white/10", className: "bg-white/10" },
      { label: "white/20", className: "bg-white/20" },
      { label: "white/60", className: "bg-white/60" },
      { label: "gray-300", className: "bg-zinc-300" },
      { label: "white", className: "bg-white" },
    ],
  },
  {
    name: "Stage",
    note: "the encounter HUD",
    swatches: [
      { label: "gold", className: "bg-accent" },
      { label: "brass", className: "bg-primary" },
      { label: "parchment", className: "bg-accent-soft" },
      { label: "muted", className: "bg-muted-foreground" },
      { label: "sage", className: "bg-soft-foreground" },
    ],
  },
]

function ColorsDemo() {
  return (
    <div className="flex flex-col gap-6">
      {palettes.map((p) => (
        <div key={p.name} className="flex flex-col gap-2">
          <span className={siteLabel}>
            {p.name} <span className="normal-case tracking-normal text-white/50">{p.note}</span>
          </span>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
            {p.swatches.map((c) => (
              <div key={c.label} className="flex flex-col gap-1">
                <div className={cn("h-12 rounded-md ring-1 ring-white/15 ring-inset", c.className)} />
                <span className="font-mono text-3xs text-white/70">{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Every card variant with the content it holds on the site.
function CardVariants() {
  const [picked, setPicked] = useState(0)
  return (
    // Over art, as on the site, so the black rings show.
    <div className="grid gap-8 rounded-lg bg-[url(/images/app/backgrounds/d20-hero.webp)] bg-cover bg-center p-6 md:grid-cols-2 lg:grid-cols-3">
      <div className="flex flex-col gap-2">
        <span className={siteLabel}>panel</span>
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
            <CardDescription>A form or a page section.</CardDescription>
          </CardHeader>
          <CardContent>
            <Input placeholder="Your name" />
          </CardContent>
        </Card>
      </div>
      <div className="flex flex-col gap-2">
        <span className={siteLabel}>feature</span>
        <Card variant="feature">
          <div className="font-display text-3xl font-bold text-accent-300">Choose Your Party</div>
          <p className="mt-2 text-white/70">The step a page opens with.</p>
        </Card>
      </div>
      <div className="flex flex-col gap-2">
        <span className={siteLabel}>accent</span>
        <Card variant="accent">
          <CardHeader>
            <CardTitle>Practice Adventure</CardTitle>
            <CardDescription className="text-white/70">Learn the rules in a short scene.</CardDescription>
          </CardHeader>
        </Card>
      </div>
      <div className="flex flex-col gap-2">
        <span className={siteLabel}>pick, selected</span>
        <div className="grid grid-cols-2 gap-4">
          {["The Gate", "The Line"].map((title, i) => (
            <Card key={title} variant="pick" selected={picked === i} onClick={() => setPicked(i)}>
              <div className="relative aspect-video w-full bg-[url(/images/app/backgrounds/black-paper.png)] bg-cover" />
              <div className="p-3 text-center font-display">{title}</div>
            </Card>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className={siteLabel}>portrait, interactive</span>
        <Card variant="portrait" interactive className="w-40">
          <img src="/images/app/characters/default.png" alt="" className="aspect-[4/5] w-full object-cover" />
          <div className="p-2 text-lg">Lyra</div>
        </Card>
      </div>
      <div className="flex flex-col gap-2">
        <span className={siteLabel}>frame, quiet, inset</span>
        <div className={cn(cardVariants({ variant: "frame" }), "p-4 text-sm")}>A menu or a modal step.</div>
        <div className={cn(cardVariants({ variant: "quiet" }), "mt-4 p-4 text-sm")}>A notice.</div>
        <Card variant="inset" className="mt-4 py-4">
          <CardContent className="text-sm">A box inside another.</CardContent>
        </Card>
      </div>
    </div>
  )
}

type Tile = { name: string; wide?: boolean; full?: boolean; demo: ReactNode }

// The rank of looks, top to bottom, each at every size, then its disabled state.
const ranks: { variant: ButtonVariant; use: string }[] = [
  { variant: "epic", use: "the one call of a screen" },
  { variant: "primary", use: "a panel's main action, the default" },
  { variant: "ai", use: "an AI-assisted action: generate, suggest, write" },
  { variant: "outline", use: "a secondary action" },
  { variant: "ghost", use: "back, cancel, later" },
  { variant: "destructive", use: "delete, leave, ban" },
]
const sizes: ButtonSize[] = ["xs", "sm", "default", "lg"]

function ButtonDemo() {
  return (
    <div className="flex flex-col gap-5">
      {ranks.map((r) => (
        <div key={r.variant} className="flex flex-col gap-2 border-b border-white/10 pb-4">
          <span className={siteLabel}>
            {r.variant} <span className="normal-case tracking-normal text-white/50">{r.use}</span>
          </span>
          <div className="flex flex-wrap items-center gap-4">
            {sizes.map((size) => (
              <Button key={size} variant={r.variant} size={size}>
                {r.variant === "ai" && <SparklesIcon aria-hidden="true" className="size-3.5" />}
                {size === "default" ? "Default" : size.toUpperCase()}
              </Button>
            ))}
            <Button variant={r.variant} disabled>
              {r.variant === "ai" && <SparklesIcon aria-hidden="true" className="size-3.5" />}
              Disabled
            </Button>
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-2">
        <span className={siteLabel}>
          emboss <span className="normal-case tracking-normal text-white/50">the nav's sign-in</span>
        </span>
        <div className="flex flex-wrap items-center gap-4">
          <Button variant="emboss" className="px-4 py-1 font-display text-sm normal-case tracking-normal">
            Sign In
          </Button>
          <Button variant="outline" size="icon" aria-label="Close">
            <XIcon className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function OptionDemo() {
  const [pick, setPick] = useState("str")
  const [tier, setTier] = useState("auto")
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className={siteLabel}>Option</span>
        <div className="flex flex-wrap gap-2">
          {["str", "dex", "con", "int", "wis", "cha"].map((a) => (
            <Option key={a} aria-pressed={pick === a} active={pick === a} onClick={() => setPick(a)} className="uppercase">
              {a}
            </Option>
          ))}
          <Option disabled>Taken</Option>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className={siteLabel}>Pill, on the stage</span>
        <div className="flex flex-wrap gap-2">
          {["step", "auto"].map((t) => (
            <Pill key={t} aria-pressed={tier === t} active={tier === t} onClick={() => setTier(t)} className="capitalize">
              {t}
            </Pill>
          ))}
          <Pill variant="ghost">Later</Pill>
          <Pill variant="primary">Take Level 2</Pill>
          <Pill variant="primary" disabled>
            Take Level 2
          </Pill>
        </div>
      </div>
    </div>
  )
}

function FieldsDemo() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="ui-name">Hero Name</Label>
        <Input id="ui-name" placeholder="Tharos the Bold" />
        <Input placeholder="Disabled" disabled />
        <Input placeholder="Invalid" aria-invalid />
        <Select>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fighter">Fighter</SelectItem>
            <SelectItem value="rogue">Rogue</SelectItem>
            <SelectItem value="wizard">Wizard</SelectItem>
            <SelectItem value="cleric">Cleric</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="ui-act">Your Action</Label>
        <Textarea id="ui-act" placeholder="What do you do?" rows={4} />
      </div>
    </div>
  )
}

// Ledger, the look of the Updates, Terms, Privacy, Licenses and Contact pages: parchment, ink, and the same rank of
// buttons in its own colours. Light and dark side by side.
function LedgerSample({ theme }: { theme: "light" | "dark" }) {
  return (
    <div data-up-theme={theme} className="up-surface overflow-hidden">
      <p className="up-label">{theme === "light" ? "Light" : "Dark"}</p>
      <p className="up-title">The Road to Kordavos</p>
      <div className="up-meta">
        <span className="up-author">John Polacek</span>
        <span>6 Min Read</span>
        <span className="up-meta-actions">
          <Button variant="plain" className="up-btn">
            Copy Link
          </Button>
          <Button variant="plain" className="up-btn is-ghost">
            Markdown
          </Button>
        </span>
      </div>
      <div className="up-prose">
        <Heading variant="h2">
          <span className="up-num">01</span>The Gate
        </Heading>
        <p>
          Rain hammers the slate roofs of Kordavos. The guard wants <a href="#ledger">three silver</a> for the toll, and{" "}
          <code>another</code> for the trouble.
        </p>
        <figure className="up-prompt">
          <div className="up-prompt-head">
            <strong>Scene Prompt</strong>
            <Button variant="plain" className="up-btn is-xs">
              Copy
            </Button>
          </div>
          <div className="up-prompt-body">
            <pre>
              <code>
                Paint the gate of <span className="up-slot">Kordavos</span> at dusk, in rain.
              </code>
            </pre>
          </div>
        </figure>
        <div className="up-table">
          <table>
            <thead>
              <tr>
                <th>Step</th>
                <th align="right">Cost</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Paint</td>
                <td align="right">$0.04</td>
              </tr>
              <tr>
                <td>
                  <strong>Total</strong>
                </td>
                <td align="right">
                  <strong>$0.04</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="up-form">
          <div className="up-form-row">
            <Label plain htmlFor={`ui-ledger-name-${theme}`} className="up-label">
              Name
            </Label>
            <Input plain id={`ui-ledger-name-${theme}`} defaultValue="Thalbern" className="up-field" />
          </div>
        </div>
        <a href="#ledger" className="up-btn is-primary is-lg up-play">
          Play The Gate
        </a>
      </div>
    </div>
  )
}

function LedgerDemo() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <LedgerSample theme="light" />
      <LedgerSample theme="dark" />
    </div>
  )
}

function SwitchDemo() {
  const [on, setOn] = useState(true)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Switch id="ui-sound" checked={on} onCheckedChange={setOn} />
        <Label htmlFor="ui-sound">Sound</Label>
      </div>
      <div className="flex items-center gap-3">
        <Switch id="ui-off" disabled />
        <Label htmlFor="ui-off">Disabled</Label>
      </div>
    </div>
  )
}


// Ledger at work: the desk that Admin and the Asset Library sit on, in the look the header's switch sets.
function DeskSample() {
  const [tab, setTab] = useState("Places")
  const [chip, setChip] = useState("All")
  return (
    <div className="up-desk !px-0">
      <aside className="up-side">
        <nav aria-label="Sample">
          <a href="#desk" aria-current="page">
            <HomeIcon />
            Overview
          </a>
          <p className="up-label">Play</p>
          <a href="#desk">
            <Gamepad2Icon />
            Games
          </a>
          <a href="#desk">
            <UsersIcon />
            Players
          </a>
        </nav>
      </aside>
      <div className="up-desk-main">
        <header className="up-desk-head">
          <div>
            <h1>Overview</h1>
            <p className="up-meta">Monday, November 23</p>
          </div>
          <div>
            <Button variant="plain" className="up-btn">
              Export
            </Button>
            <Button variant="plain" className="up-btn is-primary">
              New Game
            </Button>
          </div>
        </header>
        <div className="up-stats">
          <div className="up-stat">
            <p className="up-label">Games This Week</p>
            <p className="up-stat-value">12</p>
            <p className="up-stat-sub">
              <span className="up-good">+3</span> vs last week
            </p>
          </div>
          <div className="up-stat">
            <p className="up-label">Players</p>
            <p className="up-stat-value">48</p>
            <p className="up-stat-sub">
              <span className="up-bad">-2</span> this week
            </p>
          </div>
          <div className="up-stat">
            <p className="up-label">Avg Rating</p>
            <p className="up-stat-value">4.6</p>
            <p className="up-stat-sub">from 31 ratings</p>
          </div>
          <div className="up-stat">
            <p className="up-label">AI Spend Today</p>
            <p className="up-stat-value">$0.62</p>
            <div className="up-meter">
              <div style={{ width: "62%" }} />
            </div>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <section className="up-panel">
            <div className="up-panel-head">
              <h2>Recent Games</h2>
              <a href="#desk">View All</a>
            </div>
            <div className="up-table">
              <table>
                <thead>
                  <tr>
                    <th>Adventure</th>
                    <th>Status</th>
                    <th align="right">Started</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>The Road to Kordavos</td>
                    <td>
                      <span className="up-pill is-accent">Active</span>
                    </td>
                    <td align="right">2h</td>
                  </tr>
                  <tr>
                    <td>Covert Cargo</td>
                    <td>
                      <span className="up-pill is-good">Completed</span>
                    </td>
                    <td align="right">1d</td>
                  </tr>
                  <tr>
                    <td>The Midnight Summons</td>
                    <td>
                      <span className="up-pill">Waiting</span>
                    </td>
                    <td align="right">3d</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section className="up-panel">
            <div className="up-panel-head">
              <h2>Queue</h2>
              <a href="#desk">Open</a>
            </div>
            <ul className="up-list">
              <li>
                <a href="#desk">
                  <span className="min-w-0 flex-1 truncate">A Camera That Directs Itself</span>
                  <span className="up-pill is-good">Scheduled</span>
                </a>
              </li>
              <li>
                <a href="#desk">
                  <span className="min-w-0 flex-1 truncate">Rigged Figures from Hi3D</span>
                  <span className="up-pill is-warn">Draft</span>
                </a>
              </li>
              <li>
                <a href="#desk">
                  <span className="min-w-0 flex-1 truncate">Lost Saves</span>
                  <span className="up-pill is-bad">Blocked</span>
                </a>
              </li>
            </ul>
            <p className="up-empty">Nothing else waiting</p>
          </section>
        </div>
        <div className="mt-10">
          <div className="up-tabs" role="tablist">
            {["Places", "Characters", "Sounds"].map((name, i) => (
              <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => setTab(name)}>
                {name}
                <span className="up-count">{[34, 149, 39][i]}</span>
              </button>
            ))}
          </div>
          <div className="up-chips mb-5">
            {["All", "Welcome to Kordavos", "Covert Cargo"].map((name) => (
              <button key={name} type="button" className="up-chip" aria-pressed={chip === name} onClick={() => setChip(name)}>
                {name}
              </button>
            ))}
          </div>
          <div className="up-cards">
            {["The Gates of Kordavos", "The Harvest Festival", "The Dragonbone Inn"].map((name) => (
              <a key={name} href="#desk" className="up-card">
                <div className="up-card-art">
                  <img src="/images/app/backgrounds/black-paper.png" alt="" />
                </div>
                <div className="up-card-body">
                  <h3>{name}</h3>
                  <p>2 Scenes · Painted</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// The faces both looks set. Ledger reads in the serif with its forms in the sans, and the game sets its labels in Syne Mono where Ledger's prompts take JetBrains Mono.
const faces = [
  { name: "Display", note: "Cinzel Decorative · game titles and buttons, Ledger titles", className: "font-display text-2xl" },
  { name: "Serif", note: "Literata · narration, and Ledger's reading text", className: "font-serif text-lg" },
  { name: "Sans", note: "Rethink Sans · forms, tables, and all of Ledger's desk", className: "font-sans text-lg" },
]

function FacesDemo() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {faces.map((face) => (
        <div key={face.name} className="flex flex-col gap-1">
          <span className={siteLabel}>{face.name}</span>
          <span className={face.className}>The Sealed Door</span>
          <span className="text-xs text-white/50">{face.note}</span>
        </div>
      ))}
    </div>
  )
}

// The desktop app's icon, and its die cut from the tile as the site's favicon, at the sizes each is seen.
const icons = [
  { name: "App icon", note: "The desktop app, on its tile", src: "/images/app-icon.png", sizes: [128, 64, 32] },
  { name: "Favicon", note: "The same die without the tile", src: "/images/favicon.png", sizes: [128, 32, 16] },
]

function IconsDemo() {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {icons.map((icon) => (
        <div key={icon.name} className="flex flex-col gap-3">
          <span className={siteLabel}>
            {icon.name} <span className="normal-case tracking-normal text-white/50">{icon.note}</span>
          </span>
          <div className="flex items-end gap-5">
            {icon.sizes.map((size) => (
              <div key={size} className="flex flex-col items-center gap-1">
                <img src={icon.src} alt="" width={size} height={size} />
                <span className="font-mono text-3xs text-white/50">{size}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// Which tab each tile is under. A popup opens over either look, so it is shared. Everything else is the game's.
const SHARED = new Set(["Icons", "Faces","Dialog", "Alert Dialog", "Hover Card", "Toast", "Tooltip", "Menu"])

const tiles: Tile[] = [
  { name: "Icons", full: true, demo: <IconsDemo /> },
  { name: "Faces", full: true, demo: <FacesDemo /> },
  { name: "Typography", full: true, demo: <TypographyDemo /> },
  { name: "Narration", full: true, demo: <NarrationDemo /> },
  { name: "Colors", full: true, demo: <ColorsDemo /> },
  { name: "Button", full: true, demo: <ButtonDemo /> },
  {
    name: "Badge",
    demo: (
      <div className="flex flex-wrap gap-2">
        <Badge>Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="destructive">Destructive</Badge>
        <Badge variant="outline">Outline</Badge>
      </div>
    ),
  },
  {
    name: "Chip",
    demo: (
      <div className="flex flex-wrap gap-2">
        <Chip>Dark</Chip>
        <Chip tone="amber">Amber</Chip>
        <Chip tone="primary">Primary</Chip>
      </div>
    ),
  },
  { name: "Option", wide: true, demo: <OptionDemo /> },
  { name: "Switch", demo: <SwitchDemo /> },
  { name: "Fields", wide: true, demo: <FieldsDemo /> },
  {
    name: "Dialog",
    demo: (
      <Dialog>
        <DialogTrigger className={buttonClassName("outline")}>Open</DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>The Sealed Door</DialogTitle>
            <DialogDescription>Runes glow faintly across the stone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost">Leave It</Button>
            <Button>Read the Runes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),
  },
  {
    name: "Alert Dialog",
    demo: (
      <AlertDialog>
        <AlertDialogTrigger className={buttonClassName("destructive")}>Delete</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete This Hero?</AlertDialogTitle>
            <AlertDialogDescription>Runes glow faintly across the stone. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    ),
  },
  {
    name: "Hover Card",
    demo: (
      <HoverCard>
        <HoverCardTrigger href="#hover-card" className="cursor-default underline decoration-dotted underline-offset-4">Kordavos</HoverCardTrigger>
        <HoverCardContent>A walled city on the edge of the Valkarr woods.</HoverCardContent>
      </HoverCard>
    ),
  },
  {
    name: "Toast",
    demo: (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => toast.success("Hero saved")}>
          Success
        </Button>
        <Button variant="outline" onClick={() => toast.error("The roll could not be sent.")}>
          Error
        </Button>
      </div>
    ),
  },
  {
    name: "Tooltip",
    demo: (
      <Tip label="Roll initiative">
        <Button variant="outline">Hover me</Button>
      </Tip>
    ),
  },
  {
    name: "Menu",
    demo: (
      <Menu>
        <MenuTrigger className={buttonClassName("outline")}>Account</MenuTrigger>
        <MenuContent>
          <MenuItem value="heroes">My heroes</MenuItem>
          <MenuItem value="settings">Settings</MenuItem>
          <MenuSeparator />
          <MenuItem value="out">Sign out</MenuItem>
        </MenuContent>
      </Menu>
    ),
  },
  {
    name: "Drawer",
    demo: (
      <Drawer side="right">
        <DrawerTrigger className={buttonClassName("outline")}>Open</DrawerTrigger>
        <DrawerContent className="h-full w-80 gap-3 p-6">
          <DrawerTitle className="font-display text-lg">Revisions</DrawerTitle>
          <DrawerDescription className="text-sm text-white/70">Earlier saves of this page.</DrawerDescription>
          <DrawerClose className={buttonClassName("outline", undefined, "mt-auto")}>Done</DrawerClose>
        </DrawerContent>
      </Drawer>
    ),
  },
  {
    name: "File Input",
    demo: (
      <FileInput accept="image/*" multiple>
        <FileInputTrigger className={buttonClassName("outline")}>Add images</FileInputTrigger>
        <FileInputList aria-label="Images" className="mt-2 flex flex-col gap-1 text-xs text-white/70">
          <FileInputItem>
            {({ file }) => (
              <span>
                {file.name} {formatFileSize(file.size)}
              </span>
            )}
          </FileInputItem>
        </FileInputList>
      </FileInput>
    ),
  },
  {
    name: "Collapsible",
    demo: (
      <Collapsible>
        <CollapsibleTrigger className={buttonClassName("ghost")}>Inventory</CollapsibleTrigger>
        <CollapsiblePanel>
          <p className="pt-2 text-sm text-white/80">Longsword, rope, two torches.</p>
        </CollapsiblePanel>
      </Collapsible>
    ),
  },
  {
    name: "Accordion",
    demo: (
      <Accordion multiple className="flex flex-col gap-1">
        {[
          ["pack", "Pack", "Bedroll, rations, a tinderbox."],
          ["purse", "Purse", "Twelve silver and a copper ring."],
        ].map(([value, label, text]) => (
          <AccordionItem key={value} value={value}>
            <AccordionHeader className="m-0">
              <AccordionTrigger className={buttonClassName("ghost")}>{label}</AccordionTrigger>
            </AccordionHeader>
            <AccordionPanel>
              <p className="pt-1 pb-2 text-sm text-white/80">{text}</p>
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    ),
  },
  {
    name: "Progress",
    demo: (
      <Progress value={55} aria-label="Quest progress" className="flex w-48 flex-col gap-1">
        <span className="text-xs text-white/70">Quest progress, 55%</span>
        <ProgressTrack className="h-2 overflow-hidden rounded-full bg-white/15">
          <ProgressIndicator className="h-full rounded-full bg-amber-300" />
        </ProgressTrack>
      </Progress>
    ),
  },
  {
    name: "Avatar",
    demo: (
      <div className="flex gap-3">
        <Avatar>
          <AvatarImage src="/images/app/backgrounds/black-paper.png" alt="" />
          <AvatarFallback>JP</AvatarFallback>
        </Avatar>
        <Avatar>
          <AvatarFallback>AB</AvatarFallback>
        </Avatar>
      </div>
    ),
  },
  {
    name: "Alert",
    wide: true,
    demo: (
      <div className="flex flex-col gap-3">
        <Alert>
          <AlertTitle>Saved</AlertTitle>
          <AlertDescription>Your hero is ready.</AlertDescription>
        </Alert>
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>The roll could not be sent.</AlertDescription>
        </Alert>
      </div>
    ),
  },
  {
    name: "Card",
    full: true,
    demo: <CardVariants />,
  },
  {
    name: "Table",
    wide: true,
    demo: (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Hero</TableHead>
            <TableHead>Class</TableHead>
            <TableHead className="text-right">HP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Tharos</TableCell>
            <TableCell>Fighter</TableCell>
            <TableCell className="text-right">12</TableCell>
          </TableRow>
          <TableRow>
            <TableCell>Lyra</TableCell>
            <TableCell>Wizard</TableCell>
            <TableCell className="text-right">7</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    ),
  },
  {
    name: "Pagination",
    wide: true,
    demo: (
      <Pagination aria-label="Turns" pageCount={12} defaultPage={5} siblings={2}>
        <PaginationList>
          {({ items }) => (
            <>
              <PaginationItem>
                <PaginationFirst />
              </PaginationItem>
              <PaginationItem>
                <PaginationPrevious />
              </PaginationItem>
              {items.map((item) => (
                <PaginationItem key={item}>{typeof item === "number" ? <PaginationLink page={item} /> : <PaginationEllipsis />}</PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext />
              </PaginationItem>
              <PaginationItem>
                <PaginationLast />
              </PaginationItem>
            </>
          )}
        </PaginationList>
      </Pagination>
    ),
  },
  {
    name: "Section Plate",
    wide: true,
    demo: (
      <div>
        <SectionPlate>Adventures</SectionPlate>
        <Rule />
      </div>
    ),
  },
  {
    name: "Loading",
    demo: (
      <div className="relative h-32">
        <LoadingAnimation scroll={false} />
      </div>
    ),
  },
  {
    name: "Image Header",
    full: true,
    demo: <ImageHeader imageUrl="/images/app/backgrounds/black-paper.png" title="Image Header" subtitle="Subtitle" variant="compact" />,
  },
]

type Look = "game" | "ledger" | "shared"
const LOOKS: { look: Look; name: string; note: string }[] = [
  { look: "game", name: "Game", note: "The dark stage: play, the desktop app, and every screen that is played." },
  { look: "ledger", name: "Ledger", note: "Parchment, for pages that are read (Updates, About, Terms) and used (Admin, the Asset Library)." },
  { look: "shared", name: "Shared", note: "Faces and popups that both looks use." },
]

// The tab is kept in the address, as /ui?look=ledger, so a link opens on it.
function useLook(): [Look, (look: Look) => void] {
  const [look, setLook] = useState<Look>("game")
  useEffect(() => {
    const given = new URLSearchParams(window.location.search).get("look")
    if (given === "ledger" || given === "shared") setLook(given)
  }, [])
  const choose = (next: Look) => {
    setLook(next)
    const url = new URL(window.location.href)
    if (next === "game") url.searchParams.delete("look")
    else url.searchParams.set("look", next)
    window.history.replaceState(null, "", url)
  }
  return [look, choose]
}

function Tiles({ list }: { list: Tile[] }) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {list.map((tile, i) => (
        <section
          key={tile.name}
          id={tile.name.toLowerCase().replace(/\s+/g, "-")}
          className={cn(cardVariants({ variant: "quiet" }), "enter-rise relative flex min-w-0 flex-col gap-4 overflow-hidden p-4", tile.wide && "md:col-span-2", tile.full && "md:col-span-2 lg:col-span-4")}
          style={{ "--i": Math.min(i, 8) } as CSSProperties}
        >
          <h2 className={siteLabel}>
            {String(i + 1).padStart(2, "0")} {tile.name}
          </h2>
          <div className="flex-1">{tile.demo}</div>
        </section>
      ))}
    </div>
  )
}

// The page's head is the same box in every tab, set in sizes of its own rather than either look's, so the title and
// tabs hold still as the look changes under them. Only the ink changes.
function Head({ look, setLook, ledger }: { look: Look; setLook: (look: Look) => void; ledger: boolean }) {
  return (
    <div className="pt-24">
      <h1 className={cn("m-0 font-display text-[36px] leading-[44px]", ledger ? "font-normal text-[var(--up-strong)]" : "font-bold text-accent-300")} style={{ margin: 0, fontSize: 36, lineHeight: "44px" }}>
        D20 / UI
      </h1>
      <p className={cn("mt-2 font-sans text-sm leading-6", ledger ? "text-[var(--up-muted)]" : "text-white/55")}>{LOOKS.find((l) => l.look === look)?.note}</p>
      <div role="tablist" aria-label="Look" className={cn("mt-6 flex gap-6 border-b", ledger ? "border-[var(--up-line)]" : "border-white/10")}>
        {LOOKS.map((l) => (
          <button
            key={l.look}
            type="button"
            role="tab"
            aria-selected={look === l.look}
            onClick={() => setLook(l.look)}
            className={cn(
              "-mb-px border-b-2 border-transparent py-2.5 font-sans text-sm leading-5 font-medium transition-colors",
              ledger ? "text-[var(--up-muted)] hover:text-[var(--up-strong)] aria-selected:border-[var(--up-accent)] aria-selected:text-[var(--up-strong)]" : "text-white/55 hover:text-white aria-selected:border-accent aria-selected:text-white"
            )}
          >
            {l.name}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * /ui, in three tabs. Game is the dark stage's components. Ledger turns the page itself to parchment, header and all,
 * so the header's switch shows it light or dark: a reading page in both looks side by side, then the desk. Shared is
 * what both looks use.
 */
export function Showcase() {
  const [look, setLook] = useLook()

  if (look === "ledger") {
    return (
      <LedgerShell className="!pt-0">
        <div className="mx-auto max-w-6xl px-4 pb-12">
          <Head look={look} setLook={setLook} ledger />
          <p className="up-label !mt-8" id="reading">
            01 Reading
          </p>
          <LedgerDemo />
          <p className="up-label !mt-16" id="desk">
            02 Desk
          </p>
          <DeskSample />
        </div>
      </LedgerShell>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-12">
      <Head look={look} setLook={setLook} ledger={false} />
      <Tiles list={tiles.filter((tile) => (look === "shared") === SHARED.has(tile.name))} />
    </div>
  )
}
