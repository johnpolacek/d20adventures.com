"use client"

import type { ReactNode } from "react"
import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@d20/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import ImageHeader from "@/components/ui/image-header"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import LoadingAnimation from "@/components/ui/loading-animation"
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Chip, Option, Rule, SectionPlate, siteLabel, sitePanel } from "@/components/ui/site"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

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
        <DialogTrigger asChild>
          <Button variant="outline">Open</Button>
        </DialogTrigger>
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
        <AlertDialogTrigger asChild>
          <Button variant="destructive">Delete</Button>
        </AlertDialogTrigger>
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
        <HoverCardTrigger asChild>
          <span className="cursor-default underline decoration-dotted underline-offset-4">Kordavos</span>
        </HoverCardTrigger>
        <HoverCardContent>A walled city on the edge of the Valkarr woods.</HoverCardContent>
      </HoverCard>
    ),
  },
  {
    name: "Collapsible",
    demo: (
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="ghost">Inventory</Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 text-sm text-white/80">Longsword, rope, two torches.</CollapsibleContent>
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
    wide: true,
    demo: (
      <Card>
        <CardHeader>
          <CardTitle>Welcome to Kordavos</CardTitle>
          <CardDescription>Four adventures, levels 1 to 3.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">The gates open at dawn.</CardContent>
        <CardFooter>
          <Button variant="epic" size="xs">
            Play
          </Button>
        </CardFooter>
      </Card>
    ),
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
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious href="#" />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#">1</PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationLink href="#" isActive>
              2
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <PaginationEllipsis />
          </PaginationItem>
          <PaginationItem>
            <PaginationNext href="#" />
          </PaginationItem>
        </PaginationContent>
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
            className={cn(sitePanel, "relative flex min-w-0 flex-col gap-4 overflow-hidden p-4", tile.wide && "md:col-span-2", tile.full && "md:col-span-2 lg:col-span-4")}
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
