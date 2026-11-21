import ImageHeader from "@d20/ui/image-header"
import { AdventureDetails } from "@/components/views/adventure-details"
import { hostPrompt } from "@/lib/host-prompt"
import { headerImage } from "@/lib/images"
import type { AdventurePlan } from "@/types/adventure-plan"

// An adventure's public page: its cover, its badges, and a body that tells what it is or how to host it
// (adventure-details.tsx). It shows no cast and no places, which would give the story away.

export function partyLabel(party: AdventurePlan["party"]) {
  if (party[0] === 1 && party[1] === 1) return "Single Player"
  if (party[0] === party[1]) return `${party[0]} Players`
  return `${party[0]}-${party[1]} Players`
}

// `demo` is given when this adventure is not played in a browser, being hosted from the desktop app: it names the
// adventure that is, if the setting has one.
export default function AdventurePreview({
  plan,
  settingId,
  video,
  demo,
  spent,
}: {
  plan: AdventurePlan
  settingId: string
  video?: string
  demo?: { id: string; title: string } | null
  /** The site's AI budget for today is spent, so no new game starts in a browser. */
  spent?: boolean
}) {
  const hosted = demo !== undefined
  const premade = plan.premadePlayerCharacters.length > 0

  return (
    <div className="flex min-h-screen flex-col relative">
      <div className="fade-in delay-150 relative z-10">
        <ImageHeader {...headerImage(plan.image)} title={plan.title} imageAlt={plan.title} />
        <div className="max-w-3xl mx-auto -mt-32 relative z-10 px-6 pb-24">
          <div className="flex flex-wrap justify-center gap-2">
            <span className="bg-white/10 text-white text-3xs font-mono px-2 py-1 rounded">{partyLabel(plan.party)}</span>
            {premade && <span className="bg-accent-500/90 text-black text-3xs font-mono px-2 py-1 rounded font-semibold">Premade Characters</span>}
            <span className="bg-white/10 text-white text-3xs font-mono px-2 py-1 rounded">{hosted ? "Desktop App" : "Play in Browser"}</span>
          </div>
          <AdventureDetails
            settingId={settingId}
            planId={plan.id}
            title={plan.title}
            teaser={plan.teaser}
            overview={plan.overview}
            video={video}
            prompt={hostPrompt(plan.title)}
            demo={demo}
            spent={spent}
          />
        </div>
      </div>
    </div>
  )
}
