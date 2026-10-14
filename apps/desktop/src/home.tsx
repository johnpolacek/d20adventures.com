import { textShadowSpread, textShadowSpreadLight } from "@/components/typography/styles"
import { Button } from "@/components/ui/button"
import { Chip } from "@/components/ui/site"
import type { Save } from "../runtime/store"

// Home: the website's title screen, with Continue for the saved adventure, or Begin, which opens the Adventures page
// to choose one. A finished adventure goes on into the next one when there is one, else Begin, and its ending can be
// read again. The header above it leads to the pages.
export function Home(props: { save: Save | null; busy: boolean; next?: string; onContinue: () => void; onNext: () => void; onBegin: () => void }) {
  const turn = props.save?.turns.find((t) => t._id === props.save?.adventure.currentTurnId)
  const pcs = (turn?.characters ?? []).filter((c) => c.type === "pc").map((c) => c.name.split(" ")[0])
  const finished = props.save?.adventure.status === "completed"
  return (
    <div className="absolute inset-0 overflow-hidden bg-black text-white">
      <img src="/images/app/backgrounds/d20-hero.png" alt="" className="fade-in absolute inset-0 h-full w-full object-cover" />
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
            <>
              <div className="flex flex-col items-center gap-1">
                <Chip tone="primary" className="rounded-lg px-3 font-display font-bold">
                  {finished ? "Adventure complete" : `Round ${turn?.order ?? 1} · ${turn?.title ?? ""}`}
                </Chip>
                <h2 className="font-display text-2xl font-bold text-amber-300" style={textShadowSpread}>
                  {props.save.adventure.title}
                </h2>
                {pcs.length > 0 && (
                  <p className="font-display text-sm" style={textShadowSpreadLight}>
                    {pcs.join(", ")}
                  </p>
                )}
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
            </>
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
