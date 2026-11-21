"use client"

import type { CSSProperties, ReactNode } from "react"
import { useState } from "react"
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
import { XIcon } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, cardVariants } from "@d20/ui/card"
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@d20/ui/collapsible"
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

// The type the site sets: four families, the heading scale and the shadows that lift text off art.
const families = [
  { name: "Display", note: "Cinzel Decorative · titles, buttons", className: "font-display text-2xl" },
  { name: "Serif", note: "Literata · body and narration", className: "font-serif text-lg" },
  { name: "Sans", note: "Rethink Sans · forms and tables", className: "font-sans text-lg" },
  { name: "Mono", note: "Syne Mono · labels and tags", className: "font-mono text-lg" },
]

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
        <div className="flex flex-col gap-1">
          <span className={siteLabel}>Sizes below xs</span>
          <span className="text-xxs font-mono">text-xxs · Premade Characters</span>
          <span className="text-xxxs font-mono">text-xxxs · 1 to 4 Players</span>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <span className={siteLabel}>Heading</span>
        {(["h1", "h2", "h3", "h4", "h5", "h6"] as const).map((v) => (
          <Heading key={v} variant={v} as="h3" className="leading-tight">
            {v.toUpperCase()} Kordavos
          </Heading>
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
        <div className="font-mono text-xs uppercase tracking-widest text-accent-400/80">Scene One</div>
        <h3 className="font-display text-3xl text-accent-300" style={textShadow}>
          The Gate
        </h3>
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
                <span className="font-mono text-xxs text-white/70">{c.label}</span>
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
                {size === "default" ? "Default" : size.toUpperCase()}
              </Button>
            ))}
            <Button variant={r.variant} disabled>
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

// The Updates pages' reading look: parchment, ink, and the same rank of buttons in its own colours. Light and dark side by side.
function ReadingSample({ theme }: { theme: "light" | "dark" }) {
  return (
    <div data-up-theme={theme} className="up-surface overflow-hidden">
      <p className="up-label">{theme === "light" ? "Light" : "Dark"}</p>
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
        <h2>
          <span className="up-num">01</span>The Gate
        </h2>
        <p>
          Rain hammers the slate roofs of Kordavos. The guard wants <a href="#reading">three silver</a> for the toll, and{" "}
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
        <a href="#reading" className="up-btn is-primary is-lg up-play">
          Play The Gate
        </a>
      </div>
    </div>
  )
}

function ReadingDemo() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ReadingSample theme="light" />
      <ReadingSample theme="dark" />
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

const tiles: Tile[] = [
  { name: "Typography", full: true, demo: <TypographyDemo /> },
  { name: "Narration", full: true, demo: <NarrationDemo /> },
  { name: "Reading", full: true, demo: <ReadingDemo /> },
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

export function Showcase() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-24 pb-12">
      <h1 className="font-mono text-2xl uppercase tracking-widest text-white">D20 / UI</h1>
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile, i) => (
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
    </div>
  )
}
