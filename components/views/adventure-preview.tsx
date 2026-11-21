import { Button } from "@d20/ui/button"
import ImageHeader from "@d20/ui/image-header"
import Link from "next/link"
import type { Character, Library, Place } from "@/asset-library/types"
import { isDev } from "@/lib/auth-utils"
import { IMAGE_HOST } from "@/lib/config"
import { headerImage } from "@/lib/images"
import type { AdventurePlan } from "@/types/adventure-plan"

// An adventure's public page: what it is, a gameplay video when it has one, and its cast and places from the asset
// library. Only what a player meets early is shown, so the page gives nothing away.

const FIGURES = "/asset-library/characters"
const CAST = 8
const PLACES = 6

export function partyLabel(party: AdventurePlan["party"]) {
  if (party[0] === 1 && party[1] === 1) return "Single Player"
  if (party[0] === party[1]) return `${party[0]} Players`
  return `${party[0]}-${party[1]} Players`
}

// The heroes, then whoever else has a 3D figure, by how much of the adventure they are in.
function castOf(plan: AdventurePlan, library: Library): Character[] {
  // The library names a character by its stage id, which is not the adventure's own, so heroes are matched by name.
  const heroes = new Set(plan.premadePlayerCharacters.map((c) => c.name))
  const hero = (c: Character) => heroes.has(c.name) || Boolean(c.figure?.party)
  const names = new Set<string>()
  return library.characters
    .filter((c) => c.group === plan.id && (c.figure || hero(c)))
    .sort((a, b) => Number(hero(b)) - Number(hero(a)) || b.scenes - a.scenes)
    .filter((c) => !names.has(c.name) && names.add(c.name))
    .slice(0, CAST)
}

// The first places the story reaches.
function placesOf(plan: AdventurePlan, library: Library): Place[] {
  const order = (p: Place) => p.story?.[plan.id]?.order ?? Number.POSITIVE_INFINITY
  return library.places
    .filter((p) => p.picture && p.story?.[plan.id])
    .sort((a, b) => order(a) - order(b))
    .slice(0, PLACES)
}

// A set's title as a heading: "Kordavos: the night lanes" reads "Kordavos: The Night Lanes".
const SMALL = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "the", "to"])
const titleCase = (title: string) =>
  title
    .split(" ")
    .map((word, i, words) => (i > 0 && !words[i - 1].endsWith(":") && SMALL.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ")

// On the site the library's pictures come straight from the bucket, not through the deploy. In development a figure
// may exist only in the workspace, so the local address is kept.
const served = (path: string) => (isDev() || !path.startsWith("/") ? path : `${IMAGE_HOST}${path}`)
const portrait = (c: Character) => served(c.figure?.thumb ? `${FIGURES}/${c.figure.id}/${c.figure.thumb}` : c.front)
const heading = "font-display text-xl font-bold text-primary-200 mt-14 mb-4"

export default function AdventurePreview({ plan, settingId, library, video }: { plan: AdventurePlan; settingId: string; library: Library | null; video?: string }) {
  const cast = library ? castOf(plan, library) : []
  const places = library ? placesOf(plan, library) : []
  const premade = plan.premadePlayerCharacters.length > 0

  return (
    <div className="flex min-h-screen flex-col relative">
      <div className="fade-in delay-150 relative z-10">
        <ImageHeader {...headerImage(plan.image)} title={plan.title} imageAlt={plan.title} />
        <div className="max-w-3xl mx-auto -mt-32 relative z-10 px-6 pb-24">
          <div className="flex flex-wrap justify-center gap-2">
            <span className="bg-white/10 text-white text-3xs font-mono px-2 py-1 rounded">{partyLabel(plan.party)}</span>
            {premade && <span className="bg-accent-500/90 text-black text-3xs font-mono px-2 py-1 rounded font-semibold">Premade Characters</span>}
          </div>
          <div className="flex flex-wrap justify-center gap-4 my-8">
            <Link href={`/settings/${settingId}/${plan.id}/character-select`}>
              <Button variant="epic">Play</Button>
            </Link>
            <Link href="/playtest">
              <Button variant="outline">Host a Game</Button>
            </Link>
          </div>
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

          {cast.length > 0 && (
            <section>
              <h3 className={heading}>Cast</h3>
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {cast.map((c) => (
                  <li key={c.id} className="rounded-lg border border-accent-200/20 bg-black/60 p-3 text-center">
                    <img src={portrait(c)} alt="" loading="lazy" className="aspect-[3/4] w-full object-contain" />
                    <div className="mt-2 font-display text-white">{c.name}</div>
                    <div className="text-sm text-zinc-400">{c.role}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {places.length > 0 && (
            <section>
              <h3 className={heading}>Places</h3>
              <ul className="grid sm:grid-cols-2 gap-4">
                {places.map((p) => (
                  <li key={p.id} className="overflow-hidden rounded-lg border border-accent-200/20 bg-black/60">
                    <img src={served(p.picture as string)} alt="" loading="lazy" className="aspect-[3/2] w-full object-cover" />
                    <div className="px-3 py-2 font-display text-white">{titleCase(p.title)}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
