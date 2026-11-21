import { Button } from "@d20/ui/button"
import ImageHeader from "@d20/ui/image-header"
import Link from "next/link"
import { DEMO_LIMIT_MESSAGE } from "@/lib/demo-limit"
import { headerImage } from "@/lib/images"
import type { AdventurePlan } from "@/types/adventure-plan"

// An adventure's public page: what it is, how to play it, and a gameplay video when it has one. It shows no cast and
// no places, which would give the story away.

export function partyLabel(party: AdventurePlan["party"]) {
  if (party[0] === 1 && party[1] === 1) return "Single Player"
  if (party[0] === party[1]) return `${party[0]} Players`
  return `${party[0]}-${party[1]} Players`
}

const heading = "font-display text-xl font-bold text-primary-200 mt-14 mb-4"

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
          <div className="flex flex-wrap justify-center gap-4 my-8">
            {!hosted && !spent && (
              <Link href={`/settings/${settingId}/${plan.id}/character-select`}>
                <Button variant="epic">Play</Button>
              </Link>
            )}
            <Link href="/playtest">
              <Button variant="epic" className="bg-violet-700 text-white">
                Host
              </Button>
            </Link>
          </div>
          {!hosted && spent && <p className="-mt-2 mb-8 text-center text-sm text-zinc-400">{DEMO_LIMIT_MESSAGE}</p>}
          {hosted && (
            <p className="-mt-2 mb-8 text-center text-sm text-zinc-400">
              One player hosts this adventure in the desktop app, and friends join in a browser.
              {demo && (
                <>
                  {" "}
                  To play in a browser now, try{" "}
                  <Link href={`/settings/${settingId}/${demo.id}`} className="text-accent-300 underline underline-offset-2 transition-colors duration-150 hover:text-accent-200">
                    {demo.title}
                  </Link>
                  .
                </>
              )}
            </p>
          )}
          <p className="text-lg text-zinc-200">{plan.teaser || plan.overview}</p>
          {plan.teaser && plan.overview && plan.overview !== plan.teaser && <p className="mt-4 text-zinc-300 whitespace-pre-line">{plan.overview}</p>}

          {video && (
            <section>
              <h3 className={heading}>Gameplay</h3>
              <div className="aspect-video overflow-hidden rounded-lg border border-accent-200/20 bg-black">
                <iframe
                  className="h-full w-full"
                  src={`https://www.youtube-nocookie.com/embed/${video}`}
                  title={`${plan.title} Gameplay`}
                  loading="lazy"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
