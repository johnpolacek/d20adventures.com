import { useEffect, useState } from "react"
import { eyebrow, Pill, panel } from "@/components/stage/hud"
import { cn } from "@/lib/utils"

// The setting as the website describes it, snapshotted into the app by scripts/desktop-realm.ts.
export type Realm = {
  id: string
  name: string
  description: string
  technology: string
  magic: string
  image: string
  locations: { name: string; description: string; history: string; inhabitants: string; image: string }[]
}

export function useRealm(id = "realm-of-myr") {
  const [realm, setRealm] = useState<Realm | null>(null)
  useEffect(() => {
    let live = true
    fetch(`/stage/realm/${id}/realm.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => live && setRealm(data))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [id])
  return realm
}

const paragraphs = (text: string) =>
  text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)

function Prose({ text, className }: { text: string; className?: string }) {
  return (
    <div className={cn("space-y-4 font-serif text-[16px] leading-relaxed text-stage-cream/90", className)}>
      {paragraphs(text).map((p) => (
        <p key={p}>{p}</p>
      ))}
    </div>
  )
}

// The Realm page: the setting's painting and overview, how technology and magic work, then each place.
export function RealmPage({ realm, onClose }: { realm: Realm; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-40 overflow-y-auto bg-stage-ink text-stage-cream">
      <Pill className="fixed top-7 left-10 z-10" onClick={onClose}>
        Home
      </Pill>
      <header className="relative flex h-[62vh] min-h-[380px] items-end overflow-hidden">
        <img src={realm.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-b from-stage-ink/30 via-transparent to-stage-ink" />
        <div className="relative mx-auto w-full max-w-5xl px-10 pb-10">
          <div className={eyebrow}>The setting</div>
          <h1 className="mt-2 font-display text-[clamp(40px,6vw,76px)] leading-none [text-shadow:0_2px_24px_#000c]">{realm.name}</h1>
        </div>
      </header>
      <div className="mx-auto max-w-5xl space-y-16 px-10 pt-6 pb-24">
        <Prose text={realm.description} className="max-w-[68ch] text-[18px]" />
        <div className="grid gap-6 md:grid-cols-2">
          {[
            ["Technology", realm.technology],
            ["Magic", realm.magic],
          ].map(([title, text]) => (
            <section key={title} className={cn(panel, "p-7")}>
              <h2 className={cn(eyebrow, "mb-3")}>{title}</h2>
              <Prose text={text} className="text-[15px]" />
            </section>
          ))}
        </div>
        <section>
          <h2 className={cn(eyebrow, "mb-6")}>Places</h2>
          <div className="space-y-14">
            {realm.locations.map((place, i) => (
              <article key={place.name} className="grid items-start gap-8 md:grid-cols-2">
                {place.image && <img src={place.image} alt="" className={cn("aspect-[16/10] w-full rounded-[4px] object-cover shadow-[0_18px_40px_#000a]", i % 2 && "md:order-2")} />}
                <div className="min-w-0">
                  <h3 className="mb-4 font-display text-3xl">{place.name}</h3>
                  <Prose text={place.description} className="text-[15px]" />
                  {place.inhabitants && (
                    <details className="mt-5">
                      <summary className={cn(eyebrow, "cursor-pointer")}>Inhabitants</summary>
                      <Prose text={place.inhabitants} className="mt-3 text-[15px]" />
                    </details>
                  )}
                  {place.history && (
                    <details className="mt-5">
                      <summary className={cn(eyebrow, "cursor-pointer")}>History</summary>
                      <Prose text={place.history} className="mt-3 text-[15px]" />
                    </details>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
