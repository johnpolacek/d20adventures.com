"use client"

import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function StoryviewControls({
  playing,
  finished,
  slideCount,
  slideIndex,
  speed,
  onPlay,
  onPause,
  onPrev,
  onNext,
  onCycleSpeed,
}: {
  playing: boolean
  finished: boolean
  slideCount: number
  slideIndex: number
  speed: number
  onPlay: () => void
  onPause: () => void
  onPrev: () => void
  onNext: () => void
  onCycleSpeed: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2">
        {Array.from({ length: slideCount }, (_, index) => (
          <span key={index} className={cn("h-1.5 w-1.5 rounded-full transition-colors", index === slideIndex ? "bg-primary-200" : index < slideIndex ? "bg-primary-200/50" : "bg-white/20")} />
        ))}
      </div>
      <div className="relative flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onPrev} disabled={slideIndex === 0} ariaLabel="Previous">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        {playing ? (
          <Button variant="epic" size="icon" className="h-12 w-12 p-0 rounded-full" onClick={onPause} ariaLabel="Pause">
            <Pause className="h-6 w-6" />
          </Button>
        ) : (
          <Button variant="epic" size="icon" className="h-12 w-12 p-0 rounded-full" onClick={onPlay} ariaLabel={finished ? "Replay" : "Play"}>
            {finished ? <RotateCcw className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={onNext} disabled={slideIndex >= slideCount - 1} ariaLabel="Next">
          <ChevronRight className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="sm" className="absolute left-full ml-2 w-14 font-mono text-xs text-white/70 hover:text-white" onClick={onCycleSpeed} ariaLabel={`Playback speed ${speed}x`}>
          {speed}×
        </Button>
      </div>
    </div>
  )
}
