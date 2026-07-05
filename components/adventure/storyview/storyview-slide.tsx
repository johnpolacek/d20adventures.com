"use client"

import CharacterDiceRollResultDisplay from "@/components/adventure/character-dice-roll-result-display"
import Image from "@/components/ui/native-image"
import { cn, getImageUrl } from "@/lib/utils"
import type { StoryviewSlide } from "./use-storyview-player"

interface SpeakerInfo {
  name?: string
  image?: string
}

export default function StoryviewSlideView({ slide, segmentIndex, getSpeaker }: { slide: StoryviewSlide; segmentIndex: number; getSpeaker: (speakerId: string) => SpeakerInfo }) {
  if (slide.type === "diceroll") {
    const part = slide.part
    return (
      <div className="fade-in w-full max-w-2xl">
        <CharacterDiceRollResultDisplay character={part.character} rollType={part.rollType} difficulty={part.difficulty} result={part.result} image={part.image} modifier={part.modifier} baseRoll={part.baseRoll} />
      </div>
    )
  }

  const activeSegment = slide.segments[segmentIndex]
  const speaker = activeSegment && activeSegment.speaker !== "narrator" ? getSpeaker(activeSegment.speaker) : null

  return (
    <div className="fade-in flex w-full max-w-3xl flex-col items-center gap-8">
      <div className={cn("flex h-24 flex-col items-center justify-end gap-2 transition-opacity duration-300", speaker ? "opacity-100" : "opacity-0")}>
        {speaker?.image && <Image src={getImageUrl(speaker.image)} alt={speaker.name ?? ""} width={64} height={64} className="h-16 w-16 rounded-full border-2 border-primary-400/60 object-cover" />}
        <p className="font-display text-sm tracking-wide text-primary-200">{speaker?.name ?? activeSegment?.characterName}</p>
      </div>
      <p className="text-center font-serif text-xl leading-relaxed md:text-2xl md:leading-relaxed">
        {slide.segments.map((segment, index) => (
          <span key={`${segment.partIndex}-${index}`} className={cn("transition-colors duration-300", index === segmentIndex ? "text-white" : "text-white/35")}>
            {segment.text}
            {index < slide.segments.length - 1 ? " " : ""}
          </span>
        ))}
      </p>
    </div>
  )
}
