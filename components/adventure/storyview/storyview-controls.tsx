"use client"

import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export default function StoryviewControls({
  playing,
  finished,
  slideCount,
  slideIndex,
  onPlay,
  onPause,
  onPrev,
  onNext,
}: {
  playing: boolean
  finished: boolean
  slideCount: number
  slideIndex: number
  onPlay: () => void
  onPause: () => void
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex items-center gap-2">
        {Array.from({ length: slideCount }, (_, index) => (
          <span key={index} className={cn("h-1.5 w-1.5 rounded-full transition-colors", index === slideIndex ? "bg-primary-200" : index < slideIndex ? "bg-primary-200/50" : "bg-white/20")} />
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" onClick={onPrev} disabled={slideIndex === 0} aria-label="Previous">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        {playing ? (
          <Button variant="epic" size="icon" className="h-12 w-12 rounded-full" onClick={onPause} aria-label="Pause">
            <Pause className="h-6 w-6" />
          </Button>
        ) : (
          <Button variant="epic" size="icon" className="h-12 w-12 rounded-full" onClick={onPlay} aria-label={finished ? "Replay" : "Play"}>
            {finished ? <RotateCcw className="h-6 w-6" /> : <Play className="h-6 w-6" />}
          </Button>
        )}
        <Button variant="outline" size="icon" onClick={onNext} disabled={slideIndex >= slideCount - 1} aria-label="Next">
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}
