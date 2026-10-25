import { textShadowSpread, textShadowSpreadLight } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import { siteCard } from "@/components/ui/site"
import { cn } from "@/lib/utils"
import type { Save } from "../runtime/store"
import type { FigureArt } from "./figures"
import { portraitFor, sceneFor } from "./scenes"

// Home: the website's title screen, with Continue for the saved adventure under the hero's portrait and the encounter,
// or Begin, which opens the Adventures page to choose one. A finished adventure goes on into the next one when there is one, else Begin, and its ending can be
// read again. The header above it leads to the pages.
export function Home(props: { save: Save | null; art: Record<string, FigureArt>; busy: boolean; next?: string; onContinue: () => void; onNext: () => void; onBegin: () => void }) {
  const finished = props.save?.adventure.status === "completed"
  const turn = props.save?.turns.find((t) => t._id === props.save?.adventure.currentTurnId)
  const hero = turn?.characters.find((c) => c.type === "pc" && c.controlledBy !== "ai")
  const painted = Object.fromEntries((props.save?.painted ?? []).flatMap((id) => (props.art[id] ? [[id, props.art[id]]] : [])))
  const portrait = hero && portraitFor(sceneFor(turn?.encounterId), hero, props.save?.figures, painted)
  return (
    <div className="absolute inset-0 overflow-hidden bg-black text-white">
      <img src="/images/app/backgrounds/d20-hero.webp" alt="" className="fade-in absolute inset-0 h-full w-full object-cover" />
      <h1 className="fade-in relative mt-[5vh] text-center font-display text-[clamp(2.25rem,5vw,3.75rem)] delay-[400ms]" style={textShadowSpreadLight}>
        EXpeRienCe <span className="inline-block scale-90">tHe</span> Thrill
      </h1>
      <div className="absolute inset-x-0 bottom-[6vh] flex flex-col items-center text-center">
        <div className="fade-in font-display text-2xl font-bold delay-[600ms]" style={textShadowSpreadLight}>
          Of tHe
        </div>
        <div className="fade-in -mt-4 font-display text-[clamp(5rem,9vw,8rem)] leading-none delay-[800ms]" style={textShadowSpreadLight}>
          D20
        </div>
        <div className="fade-in mt-4 flex flex-col items-center gap-3 delay-[1000ms]">
          {props.save ? (
            <div className={cn(siteCard, "flex flex-col items-center gap-4 px-10 py-6 backdrop-blur-xl")}>
              <div className="flex items-center gap-4 text-left">
                {portrait && <img src={portrait} alt={hero?.name} className="h-14 w-14 shrink-0 rounded-full border-2 border-white/30 object-cover" />}
                <div>
                  <h2 className="font-display text-2xl font-bold text-amber-300" style={textShadowSpread}>
                    {props.save.adventure.title}
                  </h2>
                  {!finished && turn?.title && <p className="font-display text-sm text-white/80">{turn.title}</p>}
                </div>
              </div>
              {!finished ? (
                <Button variant="epic" size="lg" disabled={props.busy} onClick={props.onContinue}>
                  Continue
                </Button>
              ) : props.next ? (
                <Button variant="epic" size="lg" disabled={props.busy} onClick={props.onNext}>
                  Continue: {props.next}
                </Button>
              ) : (
                <Button variant="epic" size="lg" disabled={props.busy} onClick={props.onBegin}>
                  Begin
                </Button>
              )}
              {finished && (
                <button
                  type="button"
                  className="font-display text-sm underline-offset-4 hover:underline disabled:opacity-50"
                  style={textShadowSpreadLight}
                  disabled={props.busy}
                  onClick={props.onContinue}
                >
                  Read the ending
                </button>
              )}
            </div>
          ) : (
            <Button variant="epic" size="lg" disabled={props.busy} onClick={props.onBegin}>
              Begin
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
