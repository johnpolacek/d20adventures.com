"use client"

import { RollLine } from "@d20/ui/stage/journal"
import { FeatureEntry } from "@d20/ui/stage/roll-parts"
import { featureView, rollView } from "@d20/ui/stage/roll-view"
import Image from "@d20/ui/native-image"
import { pictureAt } from "@/lib/images"
import { cn } from "@/lib/utils"
import type { StoryviewSlide } from "./use-storyview-player"

interface SpeakerInfo {
  name?: string
  image?: string
}

export default function StoryviewSlideView({
  slide,
  segmentIndex,
  getSpeaker,
  characters,
}: {
  slide: StoryviewSlide
  segmentIndex: number
  getSpeaker: (speakerId: string) => SpeakerInfo
  characters: Parameters<typeof rollView>[1]
}) {
  if (slide.type === "diceroll") {
    return (
      <div className="w-full max-w-xl">
        <RollLine roll={rollView(slide.part, characters)} />
      </div>
    )
  }
  if (slide.type === "feature") {
    return (
      <div className="w-full max-w-xl">
        <FeatureEntry feature={featureView(slide.part, characters)} />
      </div>
    )
  }

  const activeSegment = slide.segments[segmentIndex]
  const speaker = activeSegment && activeSegment.speaker !== "narrator" ? getSpeaker(activeSegment.speaker) : null

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-8">
      <div className={cn("flex h-24 flex-col items-center justify-end gap-2 transition-opacity duration-150", speaker ? "opacity-100" : "opacity-0")}>
        {speaker?.image && <Image src={pictureAt(speaker.image, 64)} alt={speaker.name ?? ""} width={64} height={64} className="h-16 w-16 rounded-full border-2 border-primary-400/60 object-cover" />}
        <p className="font-display text-sm tracking-wide text-primary-200">{speaker?.name ?? activeSegment?.characterName}</p>
      </div>
      <p className="text-center font-serif text-xl leading-relaxed md:text-2xl md:leading-relaxed">
        {slide.segments.map((segment, index) => (
          <span key={`${segment.partIndex}-${index}`} className={cn("transition-colors duration-150", index === segmentIndex ? "text-white" : "text-white/55")}>
            {segment.text}
            {index < slide.segments.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    </div>
  )
}
