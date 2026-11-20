"use client"

import type { ReactNode } from "react"
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
import { Button, buttonClassName } from "@d20/ui/button"
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
import { Chip, Option, Rule, SectionPlate, siteLabel } from "@d20/ui/site"
import { Switch } from "@d20/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@d20/ui/table"
import { Textarea } from "@d20/ui/textarea"
import { cn } from "@/lib/utils"

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
          <div className="font-display text-3xl font-bold text-amber-300">Choose Your Party</div>
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

function OptionDemo() {
  const [pick, setPick] = useState("str")
  return (
    <div className="flex flex-wrap gap-2">
      {["str", "dex", "con", "int", "wis", "cha"].map((a) => (
        <Option key={a} active={pick === a} onClick={() => setPick(a)} className="uppercase">
          {a}
        </Option>
      ))}
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
  {
    name: "Button",
    wide: true,
    demo: (
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="epic">Epic</Button>
        <Button variant="epic" size="xs">
          Epic xs
        </Button>
        <Button variant="brick">Brick</Button>
        <Button variant="emboss">Emboss</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="ai">AI</Button>
        <Button variant="sparkle">Sparkle</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline" disabled>
          Disabled
        </Button>
      </div>
    ),
  },
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
  { name: "Option", demo: <OptionDemo /> },
  { name: "Switch", demo: <SwitchDemo /> },
  {
    name: "Input",
    demo: (
      <div className="flex flex-col gap-2">
        <Label htmlFor="ui-name">Hero name</Label>
        <Input id="ui-name" placeholder="Tharos the Bold" />
        <Input placeholder="Disabled" disabled />
      </div>
    ),
  },
  {
    name: "Textarea",
    demo: <Textarea placeholder="What do you do?" rows={4} />,
  },
  {
    name: "Select",
    demo: (
      <Select defaultValue="fighter">
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="fighter">Fighter</SelectItem>
          <SelectItem value="rogue">Rogue</SelectItem>
          <SelectItem value="wizard">Wizard</SelectItem>
          <SelectItem value="cleric">Cleric</SelectItem>
        </SelectContent>
      </Select>
    ),
  },
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
            <Button variant="epic" size="xs">
              Continue
            </Button>
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
            <AlertDialogTitle>Delete this hero?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction>Delete</AlertDialogAction>
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
        <LoadingAnimation />
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
            className={cn(cardVariants({ variant: "quiet" }), "relative flex min-w-0 flex-col gap-4 overflow-hidden p-4", tile.wide && "md:col-span-2", tile.full && "md:col-span-2 lg:col-span-4")}
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
