"use client"

// The stage-first turn page shell: the Stage fills the viewport and the turn UI docks over it. In landscape the panel
// docks on the right; on portrait tablets it becomes a bottom sheet. The stage is told how much of it the panel covers
// (Stage.setInsets), so shots compose in the uncovered area while the scene continues under the translucent panel.

import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { type ReactNode, type RefObject, useEffect, useState } from "react"
import type { Stage } from "@/lib/stage"
import { cn } from "@/lib/utils"

export type Dock = "right" | "bottom"

function panelSize(w: number, h: number): { dock: Dock; size: number } {
  if (w < h) return { dock: "bottom", size: Math.round(Math.min(h * 0.46, 520)) }
  if (w < 1000) return { dock: "right", size: Math.round(Math.min(360, Math.max(290, w * 0.4))) }
  return { dock: "right", size: Math.round(Math.min(460, Math.max(360, w * 0.3))) }
}

// Short landscape screens (phones on their side) get the compact panel, plate and bubble.
export function useCompact() {
  const [compact, setCompact] = useState(false)
  useEffect(() => {
    const mq = matchMedia("(max-height: 520px)")
    const sync = () => setCompact(mq.matches)
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])
  return compact
}

export function useDock() {
  const [layout, setLayout] = useState<{ dock: Dock; size: number }>({ dock: "right", size: 400 })
  useEffect(() => {
    const sync = () => setLayout(panelSize(innerWidth, innerHeight))
    sync()
    addEventListener("resize", sync)
    return () => removeEventListener("resize", sync)
  }, [])
  return layout
}

export function StageTurnLayout({
  containerRef,
  stage,
  panel,
  overlay,
  stageOverlay,
  open,
  onOpenChange,
}: {
  containerRef: RefObject<HTMLDivElement | null>
  stage: Stage | null
  panel: ReactNode
  overlay?: ReactNode
  stageOverlay?: ReactNode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { dock, size } = useDock()
  useEffect(() => {
    stage?.setInsets(open ? (dock === "right" ? { right: size } : { bottom: size }) : {})
  }, [stage, open, dock, size])

  const visible = open ? (dock === "right" ? { right: size } : { bottom: size }) : {}
  return (
    <div className="fixed inset-0 z-[100] overflow-clip bg-black text-white">
      <div ref={containerRef} className="absolute inset-0" />
      {/* Anything positioned against the part of the stage the panel leaves visible: plates, skip, the title plaque. */}
      <div className="pointer-events-none absolute top-0 left-0" style={{ right: visible.right ?? 0, bottom: visible.bottom ?? 0 }}>
        {stageOverlay}
      </div>
      <aside
        className={cn(
          "absolute z-30 flex flex-col overflow-hidden border-primary-700/70 bg-black/75 shadow-2xl backdrop-blur-md transition-transform duration-500",
          dock === "right" ? "top-0 right-0 bottom-0 border-l" : "right-0 bottom-0 left-0 rounded-t-2xl border-t"
        )}
        style={dock === "right" ? { width: size, transform: open ? "none" : `translateX(${size}px)` } : { height: size, transform: open ? "none" : `translateY(${size}px)` }}
        aria-hidden={!open}
      >
        {panel}
      </aside>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="absolute z-40 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-primary-200 ring ring-primary-700 transition-all hover:text-white"
        style={dock === "right" ? { top: 12, right: open ? size + 12 : 12 } : { right: 12, bottom: open ? size + 12 : 12 }}
        aria-label={open ? "Hide the turn panel" : "Show the turn panel"}
      >
        {open ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
      </button>
      {overlay}
    </div>
  )
}
